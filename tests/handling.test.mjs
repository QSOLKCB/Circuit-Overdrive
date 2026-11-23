// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { rotate } from '../vendor/vanillajs/modules/math/index.js';
import { ridge } from '../src/ridge.js';
import { createRace, startRace, stepRace } from '../src/sim.js';
import { track } from '../src/track.js';
import { driverIntent } from './driver.mjs';

const radians = Math.PI / 180;
const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const firstBends = [
  { course: track, approach: 135, turnIn: 150, exit: 310 },
  { course: ridge, approach: 210, turnIn: 225, exit: 411 },
];

function clearGrid(course) {
  const race = createRace(27, course);
  startRace(race);
  for (let i = 0; i < 180; i++) stepRace(race);
  // Isolate cornering from pack collisions. All player motion starts at the normal grid slot.
  for (const entrant of race.entrants) {
    if (entrant !== race.player) entrant.finishTicks = 0;
  }
  return race;
}

test('lifting and tapping right at 126 km/h leaves room to accelerate out of the Speedway bank', () => {
  const race = clearGrid(track);
  const player = race.player;
  for (let tick = 0; tick < 600 && player.distance < 132; tick++) {
    stepRace(race, {throttle: Number(player.current.speed < 35)});
  }
  assert.ok(player.distance >= 132 && Math.abs(player.current.speed - 35) < 1);

  // Two coasting taps, then apply power and steer through the rest of the bank.
  for (const [ticks, command] of [
    [24, {steer: 1}], [60, {}], [54, {steer: 1}],
    [36, {throttle: 1}], [72, {throttle: 1, steer: 1}], [70, {throttle: 1}],
  ]) {
    for (let tick = 0; tick < ticks; tick++) {
      stepRace(race, command);
      assert.ok(!player.vehicle.contacts.includes('guardrail'), 'hit the rail during the coasting entry or exit');
    }
  }
  assert.equal(player.recoveries, 0);
  assert.ok(player.distance > 310 && player.current.speed > 40, 'accelerate clear of the bank');
});

test('lifting at high speed with right steering held clears the Ridge opening sweep', () => {
  const race = clearGrid(ridge);
  const player = race.player;
  let liftSpeed;
  for (let tick = 0; tick < 1500 && player.distance < 415; tick++) {
    const s = player.distance;
    const coasting = s >= 265 && s < 360;
    if (coasting) liftSpeed ??= player.current.speed;
    stepRace(race, {throttle: Number(!coasting), steer: Number(s >= 231 && s < 390)});
    assert.ok(!player.vehicle.contacts.includes('guardrail'), 'hit the rail while easing off or reapplying power');
  }
  assert.ok(liftSpeed > 47, 'lift above 169 km/h');
  assert.ok(player.distance >= 415 && player.current.speed > 43);
  assert.equal(player.recoveries, 0);
});

for (const { course, approach, turnIn, exit } of firstBends) {
  test(`${course.name} stays on its wheels through the first bend with held digital corrections`, () => {
    const race = clearGrid(course);
    const player = race.player;
    const lane = player.current.lateral;
    let command = {};
    for (let tick = 0; tick < 1200 && player.distance < exit; tick++) {
      // Hold each decision for 133 ms. A player cannot tap and release a key every physics tick.
      if (tick % 8 === 0) {
        command = player.distance < approach ? { throttle: Number(player.current.speed < 31) }
          : driverIntent(player.current, 31, lane, course);
      }
      stepRace(race, command);
      assert.equal(player.recoveries, 0, 'automatic recovery during the bend');
      assert.equal(player.contact, false, 'hit a guardrail while following the bend');
      const road = course.sample(player.current.s, player.current.lateral);
      const up = rotate(player.vehicle.orientation, [0, 1, 0]);
      const alignment = up.reduce((sum, value, i) => sum + value * road.normal[i], 0);
      assert.ok(alignment > Math.cos(20 * radians), 'chassis tilted over 20 degrees away from the road');
    }
    assert.ok(player.distance >= exit, 'failed to drive through to the corner exit');
  });

  test(`${course.name} accepts fractional steering and settles after a fast corner-entry release`, () => {
    function steerAndRelease(steer) {
      const race = clearGrid(course);
      const player = race.player;
      for (let tick = 0; tick < 900 && player.distance < turnIn; tick++) stepRace(race, { throttle: 1 });
      assert.ok(player.distance >= turnIn && player.current.speed > 40, 'reach the bend at racing speed');
      const entryYaw = player.current.yaw;
      for (let tick = 0; tick < 36; tick++) {
        stepRace(race, { throttle: 1, steer });
        assert.equal(player.contact, false);
      }
      const releaseYaw = player.current.yaw;
      for (let tick = 0; tick < 30; tick++) {
        stepRace(race, { throttle: 1, steer: 0 });
        assert.equal(player.contact, false);
      }
      assert.equal(player.recoveries, 0);
      assert.ok(Math.abs(angleDelta(player.current.yaw, releaseYaw)) < 8 * radians,
        'car kept rotating after the steering returned to centre');
      assert.ok(Math.abs(player.vehicle.angularVelocity[1]) < 8 * radians, 'yaw rate did not settle');
      return angleDelta(entryYaw, releaseYaw); // Both opening corners turn right.
    }

    const half = steerAndRelease(0.5);
    const full = steerAndRelease(1);
    assert.ok(half > 2 * radians && full > half + radians, 'stronger steering must turn the car further');
  });
}

for (const {course, entry, exit, steer} of [
  {course:track, entry:146, exit:298, steer:1},
  {course:ridge, entry:565, exit:805, steer:-1},
]) {
  test(`${course.name} can hold the accelerator and turn through a fast ${steer > 0 ? 'right' : 'left'} bend`, () => {
    const race = clearGrid(course);
    const player = race.player;
    // On Ridge, drive the preceding bend before accelerating onto the approach straight.
    for (let tick = 0; tick < 3600 && player.distance < entry; tick += 6) {
      const command = driverIntent(player.current, 35, 0, course);
      if (course === track || player.distance >= entry - 115) {
        command.throttle = 1;
        command.brake = 0;
      }
      if (course === track || player.distance >= entry - 30) command.steer = 0;
      for (let i = 0; i < 6; i++) stepRace(race, command);
    }
    assert.ok(player.distance >= entry && player.current.speed > 42, 'enter above 151 km/h');
    const entryYaw = player.current.yaw;
    for (let tick = 0; tick < 450 && player.distance < exit; tick++) {
      stepRace(race, {throttle:1, steer}); // Hold W+D or W+A from turn-in to exit.
      assert.equal(player.contact, false, 'ran wide or cut across the inside rail');
      assert.equal(player.recoveries, 0);
      assert.ok(player.current.speed > 40, 'lost racing speed in a held-key turn');
    }
    assert.ok(player.distance >= exit);
    assert.ok(steer * angleDelta(entryYaw, player.current.yaw) > 55 * radians, 'follow the bend');
  });
}
