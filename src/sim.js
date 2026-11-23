// SPDX-License-Identifier: Apache-2.0
import { createVehicle, vehiclePreset } from '../vendor/vanillajs/modules/vehicle3d/index.js';
import { rotate } from '../vendor/vanillajs/modules/math/index.js';
import { track } from './track.js';

export const STEP = 1 / 60;
export const TOTAL_LAPS = 3;
export const PENALTY_TICKS = 180;
const GRID = -6;
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
const world = { sampleSurface: track.sampleSurface, barriers: [] };

function gridPose(s) {
  const p = track.sample(s);
  return { position: [p.x, p.y + rideHeight, p.z], yaw: p.yaw, roll: p.bank };
}

function snapshot(state, road) {
  const forward = rotate(state.orientation, [0, 0, -1]);
  const right = rotate(state.orientation, [1, 0, 0]);
  const up = rotate(state.orientation, [0, 1, 0]);
  return {
    x: state.position[0], y: state.position[1], z: state.position[2],
    yaw: Math.atan2(-forward[0], -forward[2]), pitch: Math.asin(clamp(forward[1], -1, 1)),
    roll: Math.atan2(right[1], up[1]), speed: Math.hypot(state.velocity[0], state.velocity[2]),
    steering: state.steering, brake: state.brake, wheelSpin: state.wheelSpin, rpm: state.rpm, gear: state.gear,
    s: road.s, lateral: road.lateral, groundY: road.y,
  };
}

export function createRace() {
  const vehicle = car.spawn(gridPose(GRID));
  const current = snapshot(vehicle, track.sample(GRID));
  return {
    phase: 'menu', pausedFrom: null, vehicle, current, previous: current, countdownTicks: 180,
    elapsedTicks: 0, lapStartTick: 0, lap: 1, lapTicks: [], nextGate: 1, distance: GRID, extraDistance: 0,
    safeDistance: GRID, recoveryCooldown: 0, recoveries: 0, wrongWay: false, contact: false,
  };
}

export function startRace(race) {
  Object.assign(race, createRace(), { phase: 'countdown' });
}

export function pauseRace(race) {
  if (race.phase !== 'racing' && race.phase !== 'countdown') return;
  race.pausedFrom = race.phase;
  race.phase = 'paused';
  race.previous = race.current;
}

export function resumeRace(race) {
  if (race.phase !== 'paused') return;
  race.phase = race.pausedFrom;
  race.pausedFrom = null;
}

function resetCar(race) {
  // Clamp to already travelled ground when reversing away from a safe point.
  race.distance = Math.min(race.distance, race.safeDistance);
  race.safeDistance = race.distance;
  const pose = gridPose(race.distance);
  // A fresh spawn also handles a damaged/non-finite old state that recover() rejects.
  race.vehicle = car.spawn(pose);
  race.current = snapshot(race.vehicle, track.sample(race.distance));
  race.previous = race.current;
  race.elapsedTicks += PENALTY_TICKS;
  race.recoveryCooldown = 120;
  race.recoveries++;
  race.wrongWay = false;
  race.contact = false;
}

export function recoverCar(race) {
  if (race.phase !== 'racing' || race.recoveryCooldown > 0) return false;
  resetCar(race);
  return true;
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
  if (gear !== -1) throttle *= clamp((59 - speed) / 3, 0, 1);
  // Shorten the digital wheel's reach at highway speed. The tyre solver still
  // owns grip and slip; a held key remains steerable in both directions.
  const steer = (intent.steer ?? 0) / (1 + 0.0007 * speed * speed);
  return { throttle, brake, steer, ...(gear === undefined ? {} : { gear }) };
}

// The rails are curved strips. The upstream AABB solver cannot represent these
// boundaries. Project the oriented body's support onto the road normal in XZ,
// retain tangent motion and remove outward momentum before accepting this tick.
// A legal vehicle3d step travels <= 2 m, well below the separated rail spacing.
function contactRail(state, road) {
  const right = rotate(state.orientation, [1, 0, 0]);
  const forward = rotate(state.orientation, [0, 0, -1]);
  const extent = (Math.abs(right[0] * road.rx + right[2] * road.rz) * touring.chassis.width
    + Math.abs(forward[0] * road.rx + forward[2] * road.rz) * touring.chassis.length) / 2;
  const penetration = Math.abs(road.lateral) + extent + 0.08 - track.barrierOffset;
  if (penetration <= 0) return null;
  const side = Math.sign(road.lateral);
  const nx = road.rx * side;
  const nz = road.rz * side;
  state.position[0] -= penetration * nx;
  state.position[2] -= penetration * nz;
  const accepted = track.project(state.position[0], state.position[2]);
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
  state.contacts.push('guardrail');
  return accepted;
}

function signedStep(before, after) {
  let ds = after - before;
  if (ds > track.length / 2) ds -= track.length;
  if (ds < -track.length / 2) ds += track.length;
  return ds;
}

function score(race, ds) {
  if (ds <= 0 || ds > 2.5) return;
  const gate = track.gates[race.nextGate];
  const target = (race.lap - (race.nextGate === 0 ? 0 : 1)) * track.length + gate.s + race.extraDistance;
  // A missed gate can be taken on a later winding. Still require the entire
  // next sector on that same winding before the next gate becomes eligible.
  const missedLoops = Math.round((race.distance - target) / track.length);
  if (missedLoops < 0 || Math.abs(race.distance - target - missedLoops * track.length) > 2.5) return;
  const forward = rotate(race.vehicle.orientation, [0, 0, -1]);
  if (forward[0] * gate.tx + forward[2] * gate.tz <= 0) return;
  // The swept center must intersect this particular finite gate in its forward
  // direction. Unwrapped travel also prevents earning gates one reverse lap away.
  const a = race.previous, b = race.current;
  const before = (a.x - gate.x) * gate.tx + (a.z - gate.z) * gate.tz;
  const after = (b.x - gate.x) * gate.tx + (b.z - gate.z) * gate.tz;
  if (before >= 0 || after < 0) return;
  const t = -before / (after - before);
  const offset = (a.x + (b.x - a.x) * t - gate.x) * gate.rx
    + (a.z + (b.z - a.z) * t - gate.z) * gate.rz;
  if (Math.abs(offset) > track.barrierOffset) return;
  race.extraDistance += missedLoops * track.length;
  if (race.nextGate === 0) {
    race.lapTicks.push(race.elapsedTicks - race.lapStartTick);
    race.lapStartTick = race.elapsedTicks;
    if (race.lap === TOTAL_LAPS) race.phase = 'finished';
    else race.lap++;
  }
  race.nextGate = (race.nextGate + 1) % track.gates.length;
}

export function stepRace(race, intent = {}) {
  if (race.phase === 'countdown') {
    if (--race.countdownTicks === 0) race.phase = 'racing';
    return;
  }
  if (race.phase !== 'racing') return;
  checkIntent(intent);
  race.elapsedTicks++;
  race.recoveryCooldown = Math.max(0, race.recoveryCooldown - 1);
  let next;
  try {
    next = car.step(race.vehicle, controls(race.vehicle, intent), world, STEP);
  } catch (error) {
    if (!(error instanceof RangeError || error instanceof TypeError)) throw error;
    resetCar(race);
    return;
  }
  const road = track.project(next.position[0], next.position[2]);
  if (next.needsRecovery || next.position[1] < road.y - 3 || Math.abs(road.lateral) > track.barrierOffset + 3) {
    resetCar(race);
    return;
  }
  const contactRoad = contactRail(next, road);
  race.contact = contactRoad !== null;
  const acceptedRoad = contactRoad ?? road;
  race.vehicle = next;
  race.previous = race.current;
  race.current = snapshot(next, acceptedRoad);
  const ds = signedStep(race.previous.s, acceptedRoad.s);
  race.distance += ds;
  score(race, ds);
  race.wrongWay = ds < -0.035;
  if (!race.contact && !race.wrongWay && Math.abs(acceptedRoad.lateral) < track.halfWidth - 1.5
      && next.wheels.every(wheel => wheel.grounded)) {
    race.safeDistance = race.distance;
  }
}
