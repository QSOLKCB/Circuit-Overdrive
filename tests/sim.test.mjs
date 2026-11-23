// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { driverIntent } from './driver.mjs';
import { FixedClock } from '../vendor/vanillajs/modules/time/index.js';
import { createVehicle } from '../vendor/vanillajs/modules/vehicle3d/index.js';
import { track } from '../src/track.js';
import {
  carRecipe, classify, createRace, pauseRace, recoverCar, resumeRace, rideHeight, startRace, stepRace, STEP,
} from '../src/sim.js';

function begin() {
  const race = createRace();
  startRace(race);
  for (let tick = 0; tick < 180; tick++) stepRace(race, { throttle: 1 });
  assert.equal(race.phase, 'racing');
  assert.equal(race.player.current.speed, 0);
  return race;
}

function clearTrack(race) {
  for (const entrant of race.entrants) {
    if (entrant !== race.player) entrant.finishTicks = 0;
  }
}

function advance(race, ticks, intent) {
  for (let tick = 0; tick < ticks; tick++) stepRace(race, intent);
}

// Inject an accepted approach pose for boundary cases difficult to hit by hand.
// Scoring, controls, contact and integration still use the production tick.
function approach(race, s, speed, lateral = 0, headingOffset = 0) {
  const p = track.sample(s, lateral);
  const { tx, tz, x, z, y, yaw, bank } = p;
  race.player.vehicle = createVehicle(carRecipe).spawn({
    position: [x, y + 0.51, z], velocity: [tx * speed, 0, tz * speed],
    yaw: yaw + headingOffset, roll: bank,
  });
  race.player.current = { ...race.player.current, x, y: y + 0.51, z, s: p.s };
  race.player.distance = s;
}

test('menu and countdown await start, pause freezes both clocks, restart clears race state', () => {
  const race = createRace();
  advance(race, 5, { throttle: 1 });
  assert.equal(race.phase, 'menu');
  startRace(race);
  advance(race, 119);
  pauseRace(race);
  advance(race, 90);
  assert.equal(race.countdownTicks, 61);
  resumeRace(race);
  advance(race, 61);
  advance(race, 42, { throttle: 1 });
  pauseRace(race);
  advance(race, 200, { throttle: 1 });
  assert.equal(race.player.elapsedTicks, 42);
  resumeRace(race);
  stepRace(race);
  assert.equal(race.player.elapsedTicks, 43);
  startRace(race);
  assert.equal(race.phase, 'countdown');
  assert.equal(race.player.elapsedTicks, 0);
  assert.equal(race.player.lap, 1);
  assert.equal(race.player.nextGate, 1);
  assert.equal(race.player.current.speed, 0);
});

test('accelerates, brakes, then reverses with held brake and re-engages first gear', () => {
  const race = begin();
  advance(race, 160, { throttle: 1 });
  const speed = race.player.current.speed;
  assert.ok(speed > 12);
  advance(race, 27, { brake: 1 });
  assert.ok(race.player.current.speed < speed - 2);
  advance(race, 220, { brake: 1 });
  assert.equal(race.player.current.gear, -1);
  const reverseAt = race.player.distance;
  advance(race, 12, { brake: 1 });
  assert.ok(race.player.distance < reverseAt);
  advance(race, 165, { throttle: 1 });
  assert.ok(race.player.current.gear >= 1);
  assert.equal(race.player.recoveries, 0);
});

test('full throttle runs level from the grid and follows the first right-hand bank', () => {
  const race = begin();
  clearTrack(race);
  const gridLane = race.player.current.lateral;
  for (let tick = 0; tick < 600; tick++) {
    stepRace(race, { throttle: 1 });
    const p = race.player.current;
    if (race.player.distance <= 140) {
      assert.ok(Math.abs(p.lateral - gridLane) < 0.01, 'left the grid lane on the opening straight');
      assert.ok(Math.abs(p.roll) < 0.001, 'unexpected roll on the opening straight');
    }
    const bank = track.sample(p.s).bank;
    if (bank < -0.10) {
      assert.ok(Math.abs(p.roll - bank) < 0.05, 'chassis should lean with the road');
      assert.equal(race.player.contact, false);
      return;
    }
  }
  assert.fail('did not reach the first bank');
});

test('grounded contact with the first banked outer rail keeps the car on the road', () => {
  const race = begin();
  clearTrack(race);
  let firstContact = null;
  for (let tick = 0; tick < 650; tick++) {
    stepRace(race, { throttle: 1 });
    if (firstContact === null) {
      if (!race.player.contact) continue;
      firstContact = tick;
      assert.ok(race.player.current.lateral < -track.halfWidth);
    }
    const lift = race.player.current.y - race.player.current.groundY - rideHeight;
    assert.ok(lift < 0.12, 'banked contact launched the chassis above its suspension');
    assert.ok(race.player.vehicle.wheels.some(wheel => wheel.grounded));
    assert.equal(race.player.recoveries, 0);
    if (tick - firstContact === 90) return;
  }
  assert.fail('did not observe the banked rail collision');
});

test('rail response preserves vertical speed for airborne and separating cars', () => {
  const vehicle = createVehicle(carRecipe);
  for (const airborne of [false, true]) {
    const race = begin();
    clearTrack(race);
    const s = 188;
    const p = track.sample(s, 0.1 - track.barrierOffset);
    approach(race, s, 20, p.lateral);
    const lateralSpeed = airborne ? -4 : 4;
    race.player.vehicle.velocity[0] += lateralSpeed * p.rx;
    race.player.vehicle.velocity[2] += lateralSpeed * p.rz;
    if (airborne) race.player.vehicle.position[1] += 2;
    const free = vehicle.step(race.player.vehicle, {}, { sampleSurface: track.sampleSurface, barriers: [] }, STEP);
    stepRace(race);
    assert.equal(race.player.contact, true);
    assert.equal(race.player.vehicle.velocity[1], free.velocity[1]);
    if (airborne) assert.equal(race.player.vehicle.position[1], free.position[1]);
  }
});

test('same fixed-tick commands produce identical vehicle and progress at 30/60/144 Hz', () => {
  function drive(hz) {
    const race = begin();
    // Catch the second grid sitter from behind to include an actual pair impact.
    approach(race, -13, 22, 3.5);
    let touches = 0;
    const clock = new FixedClock({ step: STEP });
    for (let frame = 0; frame < hz * 3; frame++) {
      clock.advance(1 / hz, () => {
        stepRace(race, { throttle: 1, steer: clock.ticks > 120 ? 0.25 : 0 });
        if (race.player.pairContact) touches++;
      });
    }
    assert.equal(clock.ticks, 180);
    assert.ok(touches > 0);
    return race;
  }
  const expected = drive(60);
  assert.deepEqual(drive(30), expected);
  assert.deepEqual(drive(144), expected);
});

test('rejects skipped gates, reverse crossings, backing across the line and wrong winding', () => {
  const race = begin();
  clearTrack(race);
  approach(race, track.length - 0.1, 25);
  stepRace(race);
  assert.equal(race.player.lap, 1);
  race.player.nextGate = 0;
  approach(race, track.length + 0.1, -25);
  stepRace(race);
  assert.equal(race.player.lap, 1);
  approach(race, track.length - 0.1, 25, 0, Math.PI);
  stepRace(race);
  assert.equal(race.player.lap, 1);
  approach(race, -0.1, 25);
  stepRace(race);
  assert.equal(race.player.lap, 1);
  approach(race, track.length - 0.1, 25);
  stepRace(race);
  assert.equal(race.player.lap, 2);
  assert.equal(race.player.nextGate, 1);
});

test('a missed gate can be taken next time around, with all remaining sectors still due', () => {
  const race = begin();
  clearTrack(race);
  const s = track.gates[1].s + track.length - 0.15;
  approach(race, s, 22);
  stepRace(race);
  assert.equal(race.player.nextGate, 2);
  approach(race, track.gates[2].s - 0.15, 22);
  stepRace(race);
  assert.equal(race.player.nextGate, 2);
  approach(race, track.gates[2].s + track.length - 0.15, 22);
  stepRace(race);
  assert.equal(race.player.nextGate, 3);
});

test('invalid numeric controls reject before state mutation', () => {
  const race = begin();
  for (const intent of [{ throttle: NaN }, { steer: Infinity }, { brake: -1 }]) {
    assert.throws(() => stepRace(race, intent), RangeError);
  }
  assert.equal(race.player.elapsedTicks, 0);
});

test('recovery resets speed, adds penalty and cooldown, preserves gate and cannot advance distance', () => {
  const race = begin();
  advance(race, 60, { throttle: 1 });
  assert.ok(race.player.current.speed > 1);
  const before = race.player.distance;
  assert.equal(recoverCar(race), true);
  assert.equal(race.player.elapsedTicks, 240);
  assert.equal(race.player.current.speed, 0);
  assert.ok(race.player.distance <= before);
  assert.equal(race.player.nextGate, 1);
  assert.equal(recoverCar(race), false);
  advance(race, 120);
  race.player.vehicle.position[1] = NaN;
  stepRace(race);
  assert.equal(race.player.recoveries, 2);
  assert.ok(race.player.vehicle.position.every(Number.isFinite));
  race.player.vehicle.velocity = null;
  stepRace(race);
  assert.equal(race.player.recoveries, 3);
  assert.equal(race.player.nextGate, 1);
});

test('both rails accept glancing and head-on high-speed impacts without pass-through', () => {
  for (const side of [-1, 1]) {
    for (const along of [0, 40]) {
      const race = begin();
      clearTrack(race);
      const s = 6;
      const p = track.sample(s);
      approach(race, s, along, side * (track.barrierOffset - 1.1));
      race.player.vehicle.velocity[0] += p.rx * 54 * side;
      race.player.vehicle.velocity[2] += p.rz * 54 * side;
      stepRace(race);
      assert.equal(race.player.contact, true);
      const outward = (p.rx * race.player.vehicle.velocity[0] + p.rz * race.player.vehicle.velocity[2]) * side;
      assert.ok(outward < 0.01);
      assert.ok(race.player.current.speed < Math.hypot(along, 54) * 0.8);
      advance(race, 90);
      assert.ok(Math.abs(race.player.current.lateral) < track.barrierOffset - 0.8);
      assert.equal(race.player.recoveries, 0);
    }
  }
});

test('all six entrants complete three timed laps with ordered gate passages', () => {
  const race = begin();
  const gateChanges = race.entrants.map(() => 0);
  for (let i = 0; i < 30000 && race.phase === 'racing'; i++) {
    const oldGates = race.entrants.map(e => e.nextGate);
    stepRace(race, driverIntent(race.player.current));
    for (const e of race.entrants) {
      if (e.nextGate !== oldGates[e.id]) gateChanges[e.id]++;
      assert.ok(Number.isFinite(e.current.speed));
    }
  }
  assert.equal(race.phase, 'finished');
  for (const e of race.entrants) {
    assert.equal(gateChanges[e.id], track.gates.length * 3);
    assert.equal(e.recoveries, 0);
    assert.equal(e.finishTicks, e.elapsedTicks);
    assert.equal(e.lapTicks.reduce((a, b) => a + b), e.finishTicks);
    assert.ok(e.lapTicks.every(ticks => ticks > 0));
  }
  const result = race.player.elapsedTicks;
  advance(race, 60, { throttle: 1 });
  assert.equal(race.player.elapsedTicks, result);
  startRace(race);
  assert.deepEqual(race.player.lapTicks, []);
});

test('six seeded grid poses have independent vehicles, barrier clearance and a shared green', () => {
  const race = createRace(1234);
  const initial = structuredClone(race.entrants);
  assert.deepEqual(race.entrants.map(e => e.id), [0, 1, 2, 3, 4, 5]);
  assert.equal(race.player.position, 6);
  const radius = Math.hypot(carRecipe.chassis.length, carRecipe.chassis.width) / 2;
  for (const a of race.entrants) {
    const p = a.current, road = track.sample(a.distance, p.lateral);
    assert.ok(Math.abs(p.lateral) + radius < track.barrierOffset);
    assert.equal(p.groundY, road.y);
    assert.equal(p.yaw, road.yaw);
    for (const b of race.entrants.slice(a.id + 1)) {
      assert.ok(Math.hypot(p.x - b.current.x, p.z - b.current.z) > 2 * radius);
      assert.notEqual(a.vehicle.wheels, b.vehicle.wheels);
      assert.notEqual(a.lapTicks, b.lapTicks);
      assert.notEqual(a.current, b.current);
    }
  }
  startRace(race);
  advance(race, 179, { throttle: 1 });
  pauseRace(race);
  advance(race, 45);
  assert.deepEqual(race.entrants, initial);
  resumeRace(race);
  stepRace(race);
  assert.equal(race.phase, 'racing');
  assert.deepEqual(race.entrants, initial);
  advance(race, 60, { throttle: 1 });
  assert.ok(race.entrants.every(e => e.current.speed > 0));
  pauseRace(race);
  const paused = structuredClone(race.entrants);
  advance(race, 100, { brake: 1 });
  assert.deepEqual(race.entrants, paused);
  startRace(race);
  assert.deepEqual(race.entrants, initial);
});

test('ranking uses validated progress across the line, reverse travel and missed gates', () => {
  const race = begin();
  const [a, b] = race.entrants;
  a.distance = b.distance = -2;
  classify(race);
  assert.ok(a.position < b.position, 'grid ID breaks a tie');
  b.distance = .3;
  classify(race);
  assert.ok(b.position < a.position, 'first forward line crossing orders unfinished cars');
  b.distance = -3;
  classify(race);
  assert.ok(b.position > a.position, 'reversing through the line costs track position');
  a.distance = track.gates[2].s + 1;
  b.distance = track.gates[1].s - 10;
  classify(race);
  assert.ok(a.position > b.position, 'skipping a gate cannot jump a valid approach');
  a.lap = b.lap = 2;
  a.nextGate = b.nextGate = 1;
  a.distance = track.length + .6;
  b.distance = track.length - .4;
  classify(race);
  assert.ok(a.position < b.position);
});

test('recovery from a missed gate or an occupied safe slot cannot gain position', () => {
  const race = begin(), player = race.player;
  player.distance = track.gates[1].s + 6;
  player.safeDistance = track.gates[1].s - 2;
  race.entrants[0].distance = 42;
  classify(race);
  // The missed-gate fallback is on the start line. A rival occupies that lane.
  const blocker = race.entrants[1];
  blocker.current = { ...blocker.current, ...track.sample(0, player.safeLateral) };
  const initialPosition = player.position;
  assert.equal(recoverCar(race), true);
  assert.ok(player.distance <= 0);
  assert.ok(player.position >= initialPosition);
  assert.equal(player.nextGate, 1);
  for (const other of race.entrants.slice(0, 5)) {
    assert.ok(Math.hypot(player.current.x-other.current.x, player.current.z-other.current.z) >
      Math.hypot(carRecipe.chassis.width, carRecipe.chassis.length));
  }
});

test('finish classification includes penalties, stable ties and unfinished runners', () => {
  const race = begin(), player = race.player;
  assert.equal(recoverCar(race), true);
  race.elapsedTicks = 9000;
  player.elapsedTicks = 9180;
  player.lap = 3;
  player.lapTicks = [3000, 3000];
  player.lapStartTick = 6000;
  player.nextGate = 0;
  approach(race, track.length * 3 - .15, 20);
  const [first, second, third] = race.entrants;
  first.finishTicks = 9100;
  second.finishTicks = 9181;
  third.finishTicks = 9300;
  stepRace(race);
  assert.equal(player.finishTicks, 9181);
  assert.deepEqual(player.lapTicks, [3000, 3000, 3181]);
  assert.deepEqual(race.order.map(e => e.id), [0, 1, 5, 2, 3, 4]);
  assert.equal(race.phase, 'finished');
  const result = structuredClone(race);
  stepRace(race, { throttle: 1 });
  assert.deepEqual(race, result);
});

test('the keyboard-driven player can pass a live rival on the opening lap', () => {
  const race = begin(), player = race.player;
  const rookie = race.entrants[4];
  assert.ok(player.distance < rookie.distance);
  for (let i = 0; i < 1500; i++) {
    stepRace(race, driverIntent(player.current, 40, 5));
    assert.equal(player.recoveries + rookie.recoveries, 0);
    if (player.distance - rookie.distance > carRecipe.chassis.length) {
      assert.ok(player.position < rookie.position);
      assert.ok(rookie.current.speed > 20);
      return;
    }
  }
  assert.fail('the player did not clear the moving opponent');
});
