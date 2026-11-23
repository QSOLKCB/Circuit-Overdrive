// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { driverIntent } from './driver.mjs';
import { FixedClock } from '../vendor/vanillajs/modules/time/index.js';
import { createVehicle } from '../vendor/vanillajs/modules/vehicle3d/index.js';
import { track } from '../src/track.js';
import {
  carRecipe, createRace, pauseRace, recoverCar, resumeRace, startRace, stepRace, STEP,
} from '../src/sim.js';

function begin() {
  const race = createRace();
  startRace(race);
  for (let tick = 0; tick < 180; tick++) stepRace(race, { throttle: 1 });
  assert.equal(race.phase, 'racing');
  assert.equal(race.current.speed, 0);
  return race;
}

function advance(race, ticks, intent) {
  for (let tick = 0; tick < ticks; tick++) stepRace(race, intent);
}

// Inject an accepted approach pose for boundary cases difficult to hit by hand.
// Scoring, controls, contact and integration still use the production tick.
function approach(race, s, speed, lateral = 0, headingOffset = 0) {
  const p = track.sample(s, lateral);
  const { tx, tz, x, z, y, yaw, bank } = p;
  race.vehicle = createVehicle(carRecipe).spawn({
    position: [x, y + 0.51, z], velocity: [tx * speed, 0, tz * speed],
    yaw: yaw + headingOffset, roll: bank,
  });
  race.current = { ...race.current, x, y: y + 0.51, z, s: p.s };
  race.distance = s;
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
  assert.equal(race.elapsedTicks, 42);
  resumeRace(race);
  stepRace(race);
  assert.equal(race.elapsedTicks, 43);
  startRace(race);
  assert.equal(race.phase, 'countdown');
  assert.equal(race.elapsedTicks, 0);
  assert.equal(race.lap, 1);
  assert.equal(race.nextGate, 1);
  assert.equal(race.current.speed, 0);
});

test('accelerates, brakes, then reverses with held brake and re-engages first gear', () => {
  const race = begin();
  advance(race, 160, { throttle: 1 });
  const speed = race.current.speed;
  assert.ok(speed > 12);
  advance(race, 27, { brake: 1 });
  assert.ok(race.current.speed < speed - 2);
  advance(race, 220, { brake: 1 });
  assert.equal(race.current.gear, -1);
  const reverseAt = race.distance;
  advance(race, 12, { brake: 1 });
  assert.ok(race.distance < reverseAt);
  advance(race, 165, { throttle: 1 });
  assert.ok(race.current.gear >= 1);
  assert.equal(race.recoveries, 0);
});

test('same fixed-tick commands produce identical vehicle and progress at 30/60/144 Hz', () => {
  function drive(hz) {
    const race = begin();
    const clock = new FixedClock({ step: STEP });
    for (let frame = 0; frame < hz * 3; frame++) {
      clock.advance(1 / hz, () => stepRace(race, { throttle: 1, steer: clock.ticks > 120 ? 0.25 : 0 }));
    }
    assert.equal(clock.ticks, 180);
    return race;
  }
  const expected = drive(60);
  assert.deepEqual(drive(30), expected);
  assert.deepEqual(drive(144), expected);
});

test('rejects skipped gates, reverse crossings, backing across the line and wrong winding', () => {
  const race = begin();
  approach(race, track.length - 0.1, 25);
  stepRace(race);
  assert.equal(race.lap, 1);
  race.nextGate = 0;
  approach(race, track.length + 0.1, -25);
  stepRace(race);
  assert.equal(race.lap, 1);
  approach(race, track.length - 0.1, 25, 0, Math.PI);
  stepRace(race);
  assert.equal(race.lap, 1);
  approach(race, -0.1, 25);
  stepRace(race);
  assert.equal(race.lap, 1);
  approach(race, track.length - 0.1, 25);
  stepRace(race);
  assert.equal(race.lap, 2);
  assert.equal(race.nextGate, 1);
});

test('a missed gate can be taken next time around, with all remaining sectors still due', () => {
  const race = begin();
  const s = track.gates[1].s + track.length - 0.15;
  approach(race, s, 22);
  stepRace(race);
  assert.equal(race.nextGate, 2);
  approach(race, track.gates[2].s - 0.15, 22);
  stepRace(race);
  assert.equal(race.nextGate, 2);
  approach(race, track.gates[2].s + track.length - 0.15, 22);
  stepRace(race);
  assert.equal(race.nextGate, 3);
});

test('invalid numeric controls reject before state mutation', () => {
  const race = begin();
  for (const intent of [{ throttle: NaN }, { steer: Infinity }, { brake: -1 }]) {
    assert.throws(() => stepRace(race, intent), RangeError);
  }
  assert.equal(race.elapsedTicks, 0);
});

test('recovery resets speed, adds penalty and cooldown, preserves gate and cannot advance distance', () => {
  const race = begin();
  advance(race, 60, { throttle: 1 });
  assert.ok(race.current.speed > 1);
  const before = race.distance;
  assert.equal(recoverCar(race), true);
  assert.equal(race.elapsedTicks, 240);
  assert.equal(race.current.speed, 0);
  assert.ok(race.distance <= before);
  assert.equal(race.nextGate, 1);
  assert.equal(recoverCar(race), false);
  advance(race, 120);
  race.vehicle.position[1] = NaN;
  stepRace(race);
  assert.equal(race.recoveries, 2);
  assert.ok(race.vehicle.position.every(Number.isFinite));
  race.vehicle.velocity = null;
  stepRace(race);
  assert.equal(race.recoveries, 3);
  assert.equal(race.nextGate, 1);
});

test('both rails accept glancing and head-on high-speed impacts without pass-through', () => {
  for (const side of [-1, 1]) {
    for (const along of [0, 40]) {
      const race = begin();
      const s = 6;
      const p = track.sample(s);
      approach(race, s, along, side * (track.barrierOffset - 1.1));
      race.vehicle.velocity[0] += p.rx * 54 * side;
      race.vehicle.velocity[2] += p.rz * 54 * side;
      stepRace(race);
      assert.equal(race.contact, true);
      const outward = (p.rx * race.vehicle.velocity[0] + p.rz * race.vehicle.velocity[2]) * side;
      assert.ok(outward < 0.01);
      assert.ok(race.current.speed < Math.hypot(along, 54) * 0.8);
      advance(race, 90);
      assert.ok(Math.abs(race.current.lateral) < track.barrierOffset - 0.8);
      assert.equal(race.recoveries, 0);
    }
  }
});

test('drives three timed laps through all gates using only throttle, braking and steering', () => {
  const race = begin();
  let gateChanges = 0;
  for (let i = 0; i < 30000 && race.phase === 'racing'; i++) {
    const p = race.current;
    const oldGate = race.nextGate;
    stepRace(race, driverIntent(p));
    if (oldGate !== race.nextGate) gateChanges++;
    assert.ok(Number.isFinite(race.current.speed));
  }
  assert.equal(race.phase, 'finished', JSON.stringify([race.distance, race.nextGate, race.recoveries]));
  assert.equal(gateChanges, track.gates.length * 3);
  assert.equal(race.recoveries, 0);
  assert.equal(race.lapTicks.reduce((a, b) => a + b), race.elapsedTicks);
  assert.ok(race.lapTicks.every(ticks => ticks > 0));
  const result = race.elapsedTicks;
  advance(race, 60, { throttle: 1 });
  assert.equal(race.elapsedTicks, result);
  startRace(race);
  assert.deepEqual(race.lapTicks, []);
});
