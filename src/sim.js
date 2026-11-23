// SPDX-License-Identifier: Apache-2.0
import { createVehicle, vehiclePreset } from '../vendor/vanillajs/modules/vehicle3d/index.js';
import { rotate } from '../vendor/vanillajs/modules/math/index.js';
import { aiCommand, createDriver } from './ai.js';
import { resolveCarContacts } from './contact.js';
import { FIELD, PLAYER_ID } from './field.js';
import { track } from './track.js';

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
const world = { sampleSurface: track.sampleSurface, barriers: [] };

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

function createEntrant(driver, raceSeed) {
  const id = driver.id;
  const distance = -5 - 9 * Math.floor(id / 2) - 3 * (id % 2);
  const lateral = id % 2 === 0 ? -3.5 : 3.5;
  const road = track.sample(distance, lateral);
  const vehicle = spawnOnRoad(road);
  const current = snapshot(vehicle, road);
  const seed = (raceSeed + Math.imul(id + 1, 0x9e3779b9)) >>> 0;
  const entrant = {
    ...driver, seed, ai: id === PLAYER_ID ? null : createDriver(driver.style, seed, lateral),
    vehicle, current, previous: current, distance, extraDistance: 0,
    elapsedTicks: 0, lapStartTick: 0, lap: 1, lapTicks: [], nextGate: 1, finishTicks: null,
    safeDistance: distance, safeLateral: lateral, recoveryCooldown: 0, recoveries: 0,
    wrongWay: false, contact: false, pairContact: false, position: id + 1,
  };
  Object.defineProperty(entrant, 'id', { writable: false, configurable: false });
  return entrant;
}

export function createRace(seed = DEFAULT_SEED) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw RangeError('Invalid race seed');
  const entrants = FIELD.map(driver => createEntrant(driver, seed));
  return { phase: 'menu', pausedFrom: null, countdownTicks: 180, elapsedTicks: 0, seed,
    entrants, player: entrants[PLAYER_ID], order: entrants.slice() };
}

export function startRace(race) {
  Object.assign(race, createRace(race.seed), { phase: 'countdown' });
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
    const vx = other.vehicle.velocity?.[0] || 0, vz = other.vehicle.velocity?.[2] || 0;
    const t = clamp((dx * vx + dz * vz) / (vx * vx + vz * vz || 1), 0, 0.35);
    return Math.hypot(dx - t * vx, dz - t * vz) > clearance;
  });
}

function resetCar(entrant, field) {
  // Search only behind the last safe progress. Never jump ahead to find a gap.
  const lastSafe = Math.min(entrant.distance, entrant.safeDistance, progress(entrant) + entrant.extraDistance);
  for (let back = 0; back <= 120; back += 8) {
    for (const lateral of [entrant.safeLateral, -7, 7, 0]) {
      const distance = lastSafe - back;
      const road = track.sample(distance, lateral);
      if (!clearForRecovery(road, entrant, field)) continue;
      entrant.vehicle = spawnOnRoad(road);
      entrant.current = snapshot(entrant.vehicle, road);
      entrant.previous = entrant.current;
      entrant.distance = entrant.safeDistance = distance;
      entrant.safeLateral = lateral;
      entrant.elapsedTicks += PENALTY_TICKS;
      entrant.recoveryCooldown = 120;
      entrant.recoveries++;
      entrant.wrongWay = entrant.contact = entrant.pairContact = false;
      if (entrant.ai) entrant.ai = createDriver(entrant.style, entrant.seed, lateral);
      return true;
    }
  }
  return false;
}

export function recoverCar(race) {
  if (race.phase !== 'racing' || race.player.recoveryCooldown > 0) return false;
  const recovered = resetCar(race.player, race.entrants);
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
  if (!state.contacts.includes('guardrail')) state.contacts.push('guardrail');
  return accepted;
}

function signedStep(before, after) {
  let ds = after - before;
  if (ds > track.length / 2) ds -= track.length;
  if (ds < -track.length / 2) ds += track.length;
  return ds;
}

function gateDistance(entrant) {
  const priorLaps = entrant.nextGate === 0 ? entrant.lap : entrant.lap - 1;
  return priorLaps * track.length + track.gates[entrant.nextGate].s;
}

// An unfinished car can use only the distance it drove up to its expected gate.
// Backing up reduces that distance, including when reversing across a lap seam.
// If it overshot an unvalidated gate, its last validated gate is its authority.
function progress(entrant) {
  const next = gateDistance(entrant), travelled = entrant.distance - entrant.extraDistance;
  if (travelled > next + 2.5) {
    const previous = (entrant.nextGate + track.gates.length - 1) % track.gates.length;
    return (entrant.lap - 1) * track.length + track.gates[previous].s;
  }
  return Math.min(travelled, next);
}

export function classify(race) {
  race.order.sort((a, b) => {
    if (a.finishTicks !== null && b.finishTicks !== null) return a.finishTicks - b.finishTicks || a.id - b.id;
    if (a.finishTicks !== null) return -1;
    if (b.finishTicks !== null) return 1;
    return progress(b) - progress(a) || a.id - b.id;
  });
  race.order.forEach((entrant, index) => { entrant.position = index + 1; });
}
function score(entrant, ds) {
  if (ds <= 0 || ds > 2.5) return;
  const gate = track.gates[entrant.nextGate];
  const target = gateDistance(entrant) + entrant.extraDistance;
  // A missed gate can be taken on a later winding. Still require the entire
  // next sector on that same winding before the next gate becomes eligible.
  const missedLoops = Math.round((entrant.distance - target) / track.length);
  if (missedLoops < 0 || Math.abs(entrant.distance - target - missedLoops * track.length) > 2.5) return;
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
  if (Math.abs(offset) > track.barrierOffset) return;
  entrant.extraDistance += missedLoops * track.length;
  if (entrant.nextGate === 0) {
    entrant.lapTicks.push(entrant.elapsedTicks - entrant.lapStartTick);
    entrant.lapStartTick = entrant.elapsedTicks;
    if (entrant.lap === TOTAL_LAPS) entrant.finishTicks = entrant.elapsedTicks;
    else entrant.lap++;
  }
  entrant.nextGate = (entrant.nextGate + 1) % track.gates.length;
}

function constrainRail(entrant) {
  const state = entrant.vehicle;
  const road = track.project(state.position[0], state.position[2]);
  if (contactRail(state, road)) entrant.contact = true;
}

function drive(entrant, intent, field) {
  entrant.previous = entrant.current;
  entrant.contact = entrant.pairContact = false;
  entrant.elapsedTicks++;
  entrant.recoveryCooldown = Math.max(0, entrant.recoveryCooldown - 1);
  if (entrant.ai && intent.recover && !entrant.recoveryCooldown && resetCar(entrant, field)) return;
  try {
    entrant.vehicle = car.step(entrant.vehicle, controls(entrant.vehicle, intent), world, STEP);
  } catch (error) {
    if (!(error instanceof RangeError || error instanceof TypeError)) throw error;
    resetCar(entrant, field);
    return;
  }
  const state = entrant.vehicle;
  const road = track.project(state.position[0], state.position[2]);
  if (state.needsRecovery || state.position[1] < road.y - 3 || Math.abs(road.lateral) > track.barrierOffset + 3) {
    resetCar(entrant, field);
    return;
  }
  entrant.contact = contactRail(state, road) !== null;
}

function accept(entrant) {
  const state = entrant.vehicle;
  const road = track.project(state.position[0], state.position[2]);
  entrant.current = snapshot(state, road);
  const ds = signedStep(entrant.previous.s, road.s);
  entrant.distance += ds;
  score(entrant, ds);
  entrant.wrongWay = ds < -0.035;
  if (!entrant.contact && !entrant.wrongWay && Math.abs(road.lateral) < track.halfWidth - 1.5
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
  const active = race.entrants.filter(entrant => entrant.finishTicks === null);
  // Read one common field before integrating anyone. Never read a rival's future pose.
  const commands = active.map(entrant => entrant.ai ? aiCommand(entrant, active) : intent);
  for (let i = 0; i < active.length; i++) drive(active[i], commands[i], active);
  resolveCarContacts(active, carRecipe.chassis, constrainRail);
  for (const entrant of active) accept(entrant);
  classify(race);
  if (race.player.finishTicks !== null) race.phase = 'finished';
}
