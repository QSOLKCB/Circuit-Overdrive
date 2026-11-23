// SPDX-License-Identifier: Apache-2.0
import { createVehicle, vehiclePreset } from '../vendor/vanillajs/modules/vehicle3d/index.js';
import { rotate } from '../vendor/vanillajs/modules/math/index.js';
import { aiCommand, createDriver } from './ai.js';
import { resolveCarContacts } from './contact.js';
import { FIELD, PLAYER_ID } from './field.js';
import { stationDelta, track } from './track.js';

export const STEP = 1 / 60;
export const TOTAL_LAPS = 3;
export const PENALTY_TICKS = 180;
const DEFAULT_SEED = 27;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const touring = vehiclePreset('arcade');
touring.name = 'Overdrive Touring';
touring.drive = 'all';
touring.tyres.grip = 1.55;
touring.tyres.corneringStiffness = 5000;
touring.engine.torqueCurve = [[850, 330], [2200, 510], [4200, 560], [5800, 475], [6800, 350]];
touring.gearbox.shiftTime = 0.12;
touring.steering = { maxAngle: 0.47, rate: 1.55, speedReduction: 0.048 };
touring.suspension = { restLength: 0.22, travel: 0.19, spring: 52000, damper: 4700 };
const car = createVehicle(touring);
export const carRecipe = car.recipe;
export const rideHeight = touring.wheel.radius + touring.suspension.restLength
  - touring.mass * 9.81 / (4 * touring.suspension.spring);
const staticCompression = touring.wheel.radius + touring.suspension.restLength - rideHeight;
const railClearance = .08;
const precisionSpeedSquared = 36 ** 2;
const fullAeroSpeedSquared = 45 ** 2;
const maxStationStep = 2.5; // 120 m/s × 1/60 s plus the inside-corner projection margin.
const gridClearance = touring.chassis.length / 2 + railClearance;


function spawnOnRoad(road) {
  const [nx, ny, nz] = road.normal;
  const pitch = Math.atan(-(nx * road.tx + nz * road.tz) / ny);
  return car.spawn({ position: [road.x, road.y + rideHeight, road.z],
    yaw: road.yaw, pitch, roll: road.bank });
}

function snapshot(state, road) {
  const forward = rotate(state.orientation, [0, 0, -1]);
  const right = rotate(state.orientation, [1, 0, 0]);
  const up = rotate(state.orientation, [0, 1, 0]);
  return {
    x: state.position[0], y: state.position[1], z: state.position[2],
    yaw: Math.atan2(-forward[0], -forward[2]), pitch: Math.asin(clamp(forward[1], -1, 1)),
    roll: Math.atan2(right[1], up[1]), speed: Math.hypot(state.velocity[0], state.velocity[2]),
    compression: state.wheels.map(wheel => state.tick === 0 ? staticCompression : wheel.compression),
    steering: state.steering, brake: state.brake, wheelSpin: state.wheelSpin, rpm: state.rpm, gear: state.gear,
    s: road.s, lateral: road.lateral, groundY: road.y,
  };
}

function createEntrant(driver, raceSeed, course) {
  const id = driver.id;
  const distance = -5 - 9 * Math.floor(id / 2) - 3 * (id % 2);
  const lateral = id % 2 === 0 ? -3.5 : 3.5;
  const road = course.sample(distance, lateral);
  const vehicle = spawnOnRoad(road);
  const current = snapshot(vehicle, road);
  const seed = (raceSeed + Math.imul(id + 1, 0x9e3779b9)) >>> 0;
  const entrant = {
    ...driver, seed, ai: id === PLAYER_ID ? null : createDriver(driver.style, seed, lateral),
    vehicle, current, previous: current, distance, extraDistance: 0,
    elapsedTicks: 0, lapStartTick: 0, lap: 1, lapTicks: [], splitTicks: [], nextGate: course.closed ? 1 : 0, finishTicks: null,
    missedGate: false, safeDistance: distance, safeLateral: lateral, recoveryCooldown: 0, recoveries: 0,
    wrongWay: false, contact: false, pairContact: false, position: id + 1,
  };
  Object.defineProperty(entrant, 'id', { writable: false, configurable: false });
  return entrant;
}

export function createRace(seed = DEFAULT_SEED, course = track) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw RangeError('Invalid race seed');
  const entrants = FIELD.map(driver => createEntrant(driver, seed, course));
  const race = { phase: 'menu', pausedFrom: null, countdownTicks: 180, elapsedTicks: 0, seed,
    entrants, player: entrants[PLAYER_ID], order: entrants.slice() };
  // Immutable runtime geometry is intentionally outside the serializable race state.
  return Object.defineProperty(race, 'course', { value: course });
}

export function startRace(race) {
  Object.assign(race, createRace(race.seed, race.course), { phase: 'countdown' });
}

export function pauseRace(race) {
  if (race.phase !== 'racing' && race.phase !== 'countdown') return;
  race.pausedFrom = race.phase;
  race.phase = 'paused';
  for (const entrant of race.entrants) entrant.previous = entrant.current;
}

export function resumeRace(race) {
  if (race.phase !== 'paused') return;
  race.phase = race.pausedFrom;
  race.pausedFrom = null;
}

// Keep a recovering chassis clear of every other chassis and its immediate path.
// Each capsule encloses the four corners of both cars, independent of heading.
function clearForRecovery(road, entrant, field) {
  const clearance = Math.hypot(touring.chassis.length, touring.chassis.width) + 1;
  return field.every(other => {
    if (other.id === entrant.id || other.finishTicks !== null) return true;
    const p = other.current, dx = road.x - p.x, dz = road.z - p.z;
    const vx = other.vehicle?.velocity?.[0] || 0, vz = other.vehicle?.velocity?.[2] || 0;
    const t = clamp((dx * vx + dz * vz) / (vx * vx + vz * vz || 1), 0, 0.35);
    return Math.hypot(dx - t * vx, dz - t * vz) > clearance;
  });
}

function finishRecovery(entrant, vehicle, road) {
  entrant.vehicle = vehicle;
  entrant.previous = entrant.current = snapshot(vehicle, road);
  entrant.elapsedTicks += PENALTY_TICKS;
  entrant.recoveryCooldown = 120;
  entrant.recoveries++;
  entrant.wrongWay = entrant.contact = entrant.pairContact = false;
  if (entrant.ai) entrant.ai = createDriver(entrant.style, entrant.seed, road.lateral);
}

function resetCar(entrant, field, course, repairInPlace = false) {
  // Search only behind the last safe progress. Never jump ahead to find a gap.
  const lastSafe = Math.min(entrant.distance, entrant.safeDistance, progress(entrant, course) + entrant.extraDistance);
  for (let back = 0; back <= 120; back += 8) {
    for (const lateral of [entrant.safeLateral, -7, 7, 0]) {
      // Leave room for the re-aligned chassis behind the finite starting gate.
      const distance = course.closed ? lastSafe - back : Math.max(course.startS + gridClearance, lastSafe - back);
      const road = course.sample(distance, lateral);
      if (!clearForRecovery(road, entrant, field)) continue;
      entrant.distance = entrant.safeDistance = distance;
      entrant.safeLateral = lateral;
      entrant.missedGate = false;
      finishRecovery(entrant, spawnOnRoad(road), road);
      return true;
    }
    if (!course.closed && lastSafe - back <= course.startS + gridClearance) break;
  }
  if (!repairInPlace) return false;
  // A pack can occupy every aligned slot at the rear rail. Rebuild a damaged
  // state at its last accepted pose, which already owned this footprint.
  const p = entrant.current;
  const vehicle = car.spawn({ position: [p.x, p.y, p.z], yaw: p.yaw, pitch: p.pitch, roll: p.roll });
  finishRecovery(entrant, vehicle, course.project(p.x, p.z));
  return true;
}

export function recoverCar(race) {
  if (race.phase !== 'racing' || race.player.recoveryCooldown > 0) return false;
  const recovered = resetCar(race.player, race.entrants, race.course);
  classify(race);
  return recovered;
}

function checkIntent(intent) {
  if (!intent || typeof intent !== 'object') throw TypeError('Expected a driving command');
  for (const [key, min] of [['throttle', 0], ['brake', 0], ['steer', -1]]) {
    const value = intent[key] ?? 0;
    if (!Number.isFinite(value) || value < min || value > 1) throw RangeError('Invalid ' + key);
  }
}

function controls(state, intent) {
  const forward = rotate(state.orientation, [0, 0, -1]);
  const speed = state.velocity.reduce((sum, v, i) => sum + v * forward[i], 0);
  let throttle = intent.throttle ?? 0;
  let brake = intent.brake ?? 0;
  let gear;
  if (brake > 0 && throttle === 0 && speed < 0.6) {
    gear = -1;
    throttle = brake * clamp((9 + speed) / 2, 0, 1);
    brake = 0;
  } else if (throttle > 0 && state.gear === -1) {
    if (speed > -0.6) gear = 1;
    else { brake = throttle; throttle = 0; }
  }
  const requestedSteer = intent.steer ?? 0;
  // Progressively lift power at high lock so a held accelerator leaves the
  // tyres room to turn. Small corrections retain almost all straight-line power.
  const powerCutoff = 59 - 11 * requestedSteer * requestedSteer;
  if (gear !== -1) throttle *= clamp((powerCutoff - speed) / 3, 0, 1);
  // Bicycle-model radius = wheelbase / tan(lock). Limit the requested lock
  // before the tyres saturate, keeping the entire stick or wheel range usable.
  const [vx, vy, vz] = state.velocity;
  const speedSquared = vx * vx + vy * vy + vz * vz;
  // Keep coasting taps precise at ordinary entry speeds. Blending in v²
  // keeps the maximum wheel angle decreasing even as the acceleration target rises.
  const highSpeedBlend = clamp((speedSquared - precisionSpeedSquared) / (fullAeroSpeedSquared - precisionSpeedSquared), 0, 1);
  const corneringAcceleration = 13.5 + 4.5 * highSpeedBlend;
  const gripAngle = Math.atan2(touring.wheel.wheelbase * corneringAcceleration, speedSquared);
  const engineLock = touring.steering.maxAngle / (1 + Math.abs(speed) * touring.steering.speedReduction);
  const steer = requestedSteer * Math.min(1, gripAngle / engineLock);
  return { throttle, brake, steer, ...(gear === undefined ? {} : { gear }) };
}

// Model aero load on grounded tyres. It rises with horizontal speed squared
// to 4 m/s² at 45 m/s, then the suspension and tyre solver carry that load.
function loadSuspension(state) {
  if (!state.wheels.some(wheel => wheel.grounded && wheel.load > 0)) return state;
  const [vx, vy, vz] = state.velocity;
  const downforce = 4 * Math.min(1, (vx * vx + vz * vz) / fullAeroSpeedSquared);
  return {...state, velocity: [vx, vy - downforce * STEP, vz]};
}

// Push out the oriented chassis along a horizontal guardrail normal. Both
// kinds of rail preserve grounded suspension motion on grades/crossfall.
function railResponse(state, road, course, nx, nz, penetration) {
  state.position[0] -= penetration * nx;
  state.position[2] -= penetration * nz;
  const accepted = course.project(state.position[0], state.position[2]);
  const [vx,,vz] = state.velocity;
  const out = Math.max(0, vx * nx + vz * nz);
  const scrub = 1 - Math.min(0.35, out * 0.018);
  state.velocity[0] = (vx - 1.08 * out * nx) * scrub;
  state.velocity[2] = (vz - 1.08 * out * nz) * scrub;
  if (state.wheels.some(wheel => wheel.grounded)) {
    state.position[1] += accepted.y - road.y;
    // On a bank, speed toward the outer rail includes a climb. When the rail
    // removes that motion, preserve the suspension's speed relative to the road.
    const [normalX, normalY, normalZ] = road.normal;
    state.velocity[1] -= ((state.velocity[0] - vx) * normalX
      + (state.velocity[2] - vz) * normalZ) / normalY;
  }
  state.angularVelocity[1] *= 0.88;
  if (!state.contacts.includes('guardrail')) state.contacts.push('guardrail');
  return accepted;
}

function contactRail(state, road, course) {
  const right = rotate(state.orientation, [1, 0, 0]);
  const forward = rotate(state.orientation, [0, 0, -1]);
  const extent = (nx, nz) => (Math.abs(right[0] * nx + right[2] * nz) * touring.chassis.width
    + Math.abs(forward[0] * nx + forward[2] * nz) * touring.chassis.length) / 2;
  const side = Math.sign(road.lateral);
  const penetration = Math.abs(road.lateral) + extent(road.rx, road.rz) + railClearance - course.barrierOffset;
  let accepted = null;
  if (penetration > 0) {
    accepted = railResponse(state, road, course, road.rx * side, road.rz * side, penetration);
    road = accepted;
  }
  // The finite course has a transverse rail at each end of its paved runoff.
  // The start and finish timing gates sit inside those rails and remain open.
  if (!course.closed && (road.s < course.startS + touring.chassis.length ||
                         road.s > course.endS - touring.chassis.length)) {
    const rear = road.s < 0;
    const edge = course.sample(rear ? course.startS : course.endS);
    const nx = rear ? -edge.tx : edge.tx, nz = rear ? -edge.tz : edge.tz;
    const room = (edge.x - state.position[0]) * nx + (edge.z - state.position[2]) * nz;
    const overlap = extent(nx, nz) + railClearance - room;
    if (overlap > 0) accepted = railResponse(state, road, course, nx, nz, overlap);
  }
  return accepted;
}

function gateDistance(entrant, course) {
  const gate = course.gates[entrant.nextGate].s;
  if (!course.closed) return gate;
  const priorLaps = entrant.nextGate === 0 ? entrant.lap : entrant.lap - 1;
  return priorLaps * course.length + gate;
}

// A missed gate limits classification and recovery to the last validated gate.
// Reversing reduces progress, even back through the starting grid.
export function progress(entrant, course) {
  if (entrant.finishTicks !== null) return course.closed ? TOTAL_LAPS * course.length : course.length;
  const next = gateDistance(entrant, course), travelled = entrant.distance - entrant.extraDistance;
  if (!course.closed && (entrant.missedGate || travelled > next + maxStationStep)) {
    const previous = entrant.nextGate > 0 ? course.gates[entrant.nextGate - 1].s : course.startS + gridClearance;
    return Math.max(course.startS + gridClearance, Math.min(travelled, previous));
  }
  if (course.closed && travelled > next + maxStationStep) {
    const previous = (entrant.nextGate + course.gates.length - 1) % course.gates.length;
    return (entrant.lap - 1) * course.length + course.gates[previous].s;
  }
  const withinSector = Math.min(travelled, next);
  // A yawed car can back closer to the dead-end rail than an aligned spawn.
  // Reserve that footprint outside ranking so realigning never grants credit.
  return course.closed ? withinSector : Math.max(course.startS + gridClearance, withinSector);
}

export function classify(race) {
  race.order.sort((a, b) => {
    if (a.finishTicks !== null && b.finishTicks !== null) return a.finishTicks - b.finishTicks || a.id - b.id;
    if (a.finishTicks !== null) return -1;
    if (b.finishTicks !== null) return 1;
    return progress(b, race.course) - progress(a, race.course) || a.id - b.id;
  });
  race.order.forEach((entrant, index) => { entrant.position = index + 1; });
}
function score(entrant, ds, course) {
  if (ds <= 0 || ds > maxStationStep) return;
  const gate = course.gates[entrant.nextGate];
  const target = gateDistance(entrant, course) + entrant.extraDistance;
  // A missed gate can be taken on a later winding. Still require the entire
  // next sector on that same winding before the next gate becomes eligible.
  const missedLoops = course.closed ? Math.round((entrant.distance - target) / course.length) : 0;
  if (missedLoops < 0 || Math.abs(entrant.distance - target - missedLoops * course.length) > maxStationStep) return;
  const forward = rotate(entrant.vehicle.orientation, [0, 0, -1]);
  if (forward[0] * gate.tx + forward[2] * gate.tz <= 0) return;
  // The swept center must intersect this particular finite gate in its forward
  // direction. Unwrapped travel also prevents earning gates one reverse lap away.
  const a = entrant.previous, b = entrant.current;
  const before = (a.x - gate.x) * gate.tx + (a.z - gate.z) * gate.tz;
  const after = (b.x - gate.x) * gate.tx + (b.z - gate.z) * gate.tz;
  if (before >= 0 || after < 0) return;
  const t = -before / (after - before);
  const offset = (a.x + (b.x - a.x) * t - gate.x) * gate.rx
    + (a.z + (b.z - a.z) * t - gate.z) * gate.rz;
  if (Math.abs(offset) > course.barrierOffset) return;
  if (!course.closed) {
    // Reject crossings of a horizontally overlapping but vertically distinct road.
    const height = a.y + (b.y - a.y) * t;
    if (Math.abs(height - course.sample(gate.s, offset).y - rideHeight) > 2) return;
    if (entrant.nextGate === course.gates.length - 1) entrant.finishTicks = entrant.elapsedTicks;
    else if (entrant.nextGate > 0) entrant.splitTicks.push(entrant.elapsedTicks);
    entrant.nextGate++;
    entrant.missedGate = false;
    return;
  }
  entrant.extraDistance += missedLoops * course.length;
  if (entrant.nextGate === 0) {
    entrant.lapTicks.push(entrant.elapsedTicks - entrant.lapStartTick);
    entrant.lapStartTick = entrant.elapsedTicks;
    if (entrant.lap === TOTAL_LAPS) entrant.finishTicks = entrant.elapsedTicks;
    else entrant.lap++;
  }
  entrant.nextGate = (entrant.nextGate + 1) % course.gates.length;
}

function constrainRail(entrant, course) {
  const state = entrant.vehicle;
  const road = course.project(state.position[0], state.position[2]);
  if (contactRail(state, road, course)) entrant.contact = true;
}

function drive(entrant, intent, field, course, world) {
  entrant.previous = entrant.current;
  entrant.contact = entrant.pairContact = false;
  entrant.elapsedTicks++;
  entrant.recoveryCooldown = Math.max(0, entrant.recoveryCooldown - 1);
  if (entrant.ai && intent.recover && !entrant.recoveryCooldown && resetCar(entrant, field, course)) return;
  try {
    const state = loadSuspension(entrant.vehicle);
    entrant.vehicle = car.step(state, controls(state, intent), world, STEP);
  } catch (error) {
    if (!(error instanceof RangeError || error instanceof TypeError)) throw error;
    resetCar(entrant, field, course, true);
    return;
  }
  const state = entrant.vehicle;
  const road = course.project(state.position[0], state.position[2]);
  const jumped = !course.closed && Math.abs(road.s - entrant.previous.s) > maxStationStep;
  if (jumped || state.needsRecovery || state.position[1] < road.y - 3 || Math.abs(road.lateral) > course.barrierOffset + 3) {
    resetCar(entrant, field, course, true);
    return;
  }
  entrant.contact = contactRail(state, road, course) !== null;
}

function accept(entrant, field, course) {
  const state = entrant.vehicle;
  const road = course.project(state.position[0], state.position[2]);
  if (state.tick === 0) {
    // A recovery spawned this tick. Show its resolved pose without scoring
    // any displacement from the reset or a simultaneous pair correction.
    entrant.previous = entrant.current = snapshot(state, road);
    return;
  }
  const ds = stationDelta(course, entrant.previous.s, road.s);
  // Nearby roads can have very different stations. An impossible one-tick
  // jump must not become sector progress, even when both ends project to asphalt.
  if (!course.closed && Math.abs(ds) > maxStationStep) {
    resetCar(entrant, field, course, true);
    return;
  }
  entrant.current = snapshot(state, road);
  entrant.distance = course.closed ? entrant.distance + ds : road.s;
  score(entrant, ds, course);
  // Reversing back up to a missed sprint gate cannot promote a driver.
  // Only a valid crossing or a recovery to already credited ground clears it.
  if (!course.closed && entrant.finishTicks === null && road.s > course.gates[entrant.nextGate].s + .001) {
    entrant.missedGate = true;
  }
  entrant.wrongWay = ds < -0.035;
  if (!entrant.contact && !entrant.wrongWay && Math.abs(road.lateral) < course.halfWidth - 1.5
      && state.wheels.every(wheel => wheel.grounded)) {
    entrant.safeDistance = entrant.distance;
    entrant.safeLateral = road.lateral;
  }
}

export function stepRace(race, intent = {}) {
  if (race.phase === 'countdown') {
    if (--race.countdownTicks === 0) race.phase = 'racing';
    return;
  }
  if (race.phase !== 'racing') return;
  checkIntent(intent);
  race.elapsedTicks++;
  const { course } = race;
  const world = { sampleSurface: course.sampleSurface, barriers: [] };
  const active = race.entrants.filter(entrant => entrant.finishTicks === null);
  // Read one common field before integrating anyone. Never read a rival's future pose.
  const commands = active.map(entrant => entrant.ai ? aiCommand(entrant, active, course) : intent);
  for (let i = 0; i < active.length; i++) drive(active[i], commands[i], active, course, world);
  resolveCarContacts(active, carRecipe.chassis, constrainRail, course);
  for (const entrant of active) accept(entrant, active, course);
  classify(race);
  if (race.player.finishTicks !== null) race.phase = 'finished';
}
