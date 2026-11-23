// SPDX-License-Identifier: Apache-2.0
import speedway from '../tracks/overdrive-speedway.json' with {type: 'json'};

const TAU = 2 * Math.PI;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrap = (v, length) => (v % length + length) % length;
const direction = (angle) => ({x: Math.sin(angle), z: -Math.cos(angle)});
const heading = (a, b) => Math.atan2(b.x - a.x, a.z - b.z);
const move = (p, axis, distance) => ({x: p.x + axis.x * distance, z: p.z + axis.z * distance});

// Between two projected stations, only a closed course can cross a seam.
export function stationDelta(course, from, to) {
  let delta = to - from;
  if (course.closed) {
    if (delta > course.length / 2) delta -= course.length;
    if (delta < -course.length / 2) delta += course.length;
  }
  return delta;
}

export function bounded(value, min, max, name) {
  if (!Number.isFinite(value) || value < min || value > max) throw RangeError('Invalid ' + name);
  return value;
}

// CAD-style circular fillets tangent to both straights. Radius is specified in
// metres, so a longer straight never tightens the neighbouring corner.
function roundedCorner(prev, p, next) {
  const incoming = heading(prev, p);
  const outgoing = heading(p, next);
  const turn = wrap(outgoing - incoming + Math.PI, TAU) - Math.PI;
  bounded(Math.abs(turn), 0.05, Math.PI * 0.85, 'corner angle');
  const sign = Math.sign(turn);
  const trim = p.radius * Math.tan(Math.abs(turn) / 2);
  const start = move(p, direction(incoming), -trim);
  const end = move(p, direction(outgoing), trim);
  const center = move(start, direction(incoming + Math.PI / 2), sign * p.radius);
  return {
    start, end, center, trim, heading: incoming, curvature: sign / p.radius,
    length: Math.abs(turn) * p.radius, bank: -sign * p.bankDegrees * Math.PI / 180
  };
}

function straight(start, end) {
  return {
    start, end, heading: heading(start, end), curvature: 0, bank: 0,
    length: Math.hypot(end.x - start.x, end.z - start.z)
  };
}

export function centerAt(piece, distance) {
  const angle = piece.heading + distance * piece.curvature;
  const tx = Math.sin(angle), tz = -Math.cos(angle);
  if (piece.curvature === 0) {
    return {x: piece.start.x + tx * distance, z: piece.start.z + tz * distance, tx, tz};
  }
  return {x: piece.center.x + tz / piece.curvature, z: piece.center.z - tx / piece.curvature, tx, tz};
}

export function closestDistance(piece, x, z) {
  if (piece.curvature === 0) {
    return clamp((x - piece.start.x) * piece.tx + (z - piece.start.z) * piece.tz, 0, piece.length);
  }
  const sign = Math.sign(piece.curvature);
  const angle = Math.atan2(sign * (piece.center.z - z), sign * (piece.center.x - x));
  const along = (wrap(angle - piece.heading + Math.PI, TAU) - Math.PI) / piece.curvature;
  if (along >= 0 && along <= piece.length) return along;
  const startSq = (x - piece.start.x) ** 2 + (z - piece.start.z) ** 2;
  const endSq = (x - piece.end.x) ** 2 + (z - piece.end.z) ** 2;
  return startSq < endSq ? 0 : piece.length;
}

export function buildTrack(data) {
  if (data?.version !== 1 || typeof data.name !== 'string' || !data.name.trim()
      || data.name.length > 64 || !Array.isArray(data.corners)) throw TypeError('Invalid circuit');
  const corners = data.corners;
  bounded(corners.length, 4, 24, 'corner count');
  const halfWidth = bounded(data.halfWidth, 5, 16, 'road width');
  const barrierOffset = bounded(data.barrierOffset, halfWidth, halfWidth + 5, 'barrier offset');
  for (const p of corners) {
    bounded(p.x, -900, 900, 'corner x');
    bounded(p.z, -900, 900, 'corner z');
    bounded(p.radius, 40, 400, 'turn radius');
    bounded(p.bankDegrees, 0, 20, 'bank');
  }
  const turns = corners.map((p, i) =>
    roundedCorner(corners[(i + corners.length - 1) % corners.length], p, corners[(i + 1) % corners.length]));
  for (let i = 0; i < corners.length; i++) {
    const j = (i + 1) % corners.length;
    const available = Math.hypot(corners[j].x - corners[i].x, corners[j].z - corners[i].z);
    bounded(available - turns[i].trim - turns[j].trim, 5, 1800, 'straight length');
  }

  const lastExit = turns.at(-1).end;
  const grid = {x: (lastExit.x + turns[0].start.x) / 2, z: (lastExit.z + turns[0].start.z) / 2};
  const pieces = [];
  let start = grid, length = 0;
  for (const turn of turns) {
    pieces.push(straight(start, turn.start), turn);
    start = turn.end;
  }
  pieces.push(straight(start, grid));
  for (const piece of pieces) {
    piece.s = length;
    piece.tx = Math.sin(piece.heading);
    piece.tz = -Math.cos(piece.heading);
    length += piece.length;
  }
  bounded(length, 300, 8000, 'course length');

  function frame(piece, along, lateral) {
    const c = centerAt(piece, along);
    const rx = -c.tz, rz = c.tx;
    const s = (piece.s + along) % length;
    const phase = s * TAU / length;
    // Smooth shoulders ease from level to full bank over up to 35 m.
    const ramp = Math.min(35, piece.length / 2);
    const progress = clamp(Math.min(along, piece.length - along) / ramp, 0, 1);
    const bank = piece.bank * progress * progress * (3 - 2 * progress);
    const bankRate = piece.bank * (along < piece.length / 2 ? 1 : -1) * 6 * progress * (1 - progress) / ramp;
    const crossSlope = Math.tan(bank);
    const centerY = 3 + 2.5 * (1 - Math.cos(phase));
    const centerGrade = 2.5 * Math.sin(phase) * TAU / length;
    const roadOffset = clamp(lateral, -barrierOffset - 2, barrierOffset + 2);
    const grade = (centerGrade + roadOffset * bankRate * (1 + crossSlope ** 2)) / (1 - piece.curvature * roadOffset);
    const nx = -grade * c.tx - crossSlope * rx, nz = -grade * c.tz - crossSlope * rz;
    const norm = Math.hypot(nx, 1, nz);
    return {
      x: c.x + rx * lateral, y: centerY + roadOffset * crossSlope, z: c.z + rz * lateral,
      s, lateral, yaw: Math.atan2(-c.tx, -c.tz), bank, tx: c.tx, tz: c.tz, rx, rz,
      normal: [nx / norm, 1 / norm, nz / norm]
    };
  }

  function sample(distance, lateral = 0) {
    bounded(distance, -1e9, 1e9, 'distance');
    bounded(lateral, -2000, 2000, 'lateral offset');
    const s = wrap(distance, length);
    const piece = pieces.find(p => s < p.s + p.length) ?? pieces.at(-1);
    return frame(piece, s - piece.s, lateral);
  }

  function project(x, z) {
    bounded(x, -4000, 4000, 'world x');
    bounded(z, -4000, 4000, 'world z');
    let best = Infinity, nearest = pieces[0], distance = 0, lateral = 0;
    for (const p of pieces) {
      const d = closestDistance(p, x, z);
      const c = centerAt(p, d);
      const dx = x - c.x, dz = z - c.z, squared = dx * dx + dz * dz;
      if (squared < best) {
        nearest = p;
        distance = d;
        lateral = -dx * c.tz + dz * c.tx;
        best = squared;
      }
    }
    return frame(nearest, distance, lateral);
  }

  function sampleSurface(x, z, maxY) {
    bounded(maxY, -4000, 4000, 'surface ceiling');
    const p = project(x, z);
    if (p.y > maxY || Math.abs(p.lateral) > barrierOffset + 2) return null;
    const paved = Math.abs(p.lateral) <= halfWidth;
    return {height: p.y, normal: p.normal, friction: paved ? 1 : 0.82, surfaceId: paved ? 'asphalt' : 'apron'};
  }

  const gates = Array.from({length: 8}, (_, i) => Object.freeze(sample(length * i / 8)));
  return Object.freeze({id: 'speedway', closed: true, name: data.name, halfWidth, barrierOffset, length, sample, project, sampleSurface,
    gates: Object.freeze(gates)});
}

export const track = buildTrack(speedway);
