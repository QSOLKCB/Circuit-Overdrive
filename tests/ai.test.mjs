// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDriver, aiCommand } from '../src/ai.js';
import { track } from '../src/track.js';
import { carRecipe, createRace, rideHeight, startRace, stepRace } from '../src/sim.js';
import { createVehicle } from '../vendor/vanillajs/modules/vehicle3d/index.js';

function entrant(id, s, lateral, speed, style = 'aggressor', seed = 9) {
  const p = track.sample(s, lateral);
  return {
    id, distance:s, ai:createDriver(style, seed, lateral), finishTicks:null, current:{...p, speed},
    vehicle:{velocity:[speed*p.tx, 0, speed*p.tz]}
  };
}

test('seeded drivers plan slower corner entries and rate-limit their steering commands', () => {
  const straight = entrant(0, 22, 0, 38), bend = entrant(0, 480, 0, 38);
  aiCommand(straight, [straight]);
  aiCommand(bend, [bend]);
  assert.ok(bend.ai.speedGoal < straight.ai.speedGoal - 3);
  const twin = entrant(0, 480, 0, 38);
  let previous = 0;
  for (let i = 0; i < 120; i++) {
    if (i === 60) twin.current.yaw = .5;
    const input = aiCommand(twin, [twin]);
    assert.ok(Math.abs(previous-input.steer) <= 4.6 / 60 + 1e-12);
    previous = input.steer;
  }
  const replay = entrant(0, 480, 0, 38);
  for (let i = 0; i < 120; i++) {
    if (i === 60) replay.current.yaw = .5;
    aiCommand(replay, [replay]);
  }
  assert.deepEqual(twin.ai, replay.ai);
  assert.notEqual(twin.ai.bias, createDriver('aggressor', 28).bias);
});

test('passing choices persist, blocked lanes force braking, and an alongside car keeps its space', () => {
  const us = entrant(0, 65, 0, 32);
  const slow = entrant(1, 78, 0, 19);
  const left = entrant(2, 69, -4.2, 30), right = entrant(3, 69, 4.2, 30);
  const blocked = aiCommand(us, [us, slow, left, right]);
  assert.ok(blocked.brake > 0 && blocked.throttle === 0);
  assert.equal(us.ai.passId, null);

  for (let i = 0; i < 12; i++) aiCommand(us, [us,slow,left]);
  assert.equal(us.ai.passId, slow.id);
  assert.ok(us.ai.goalLane > 4);
  const chosen = us.ai.goalLane;
  for (let i = 0; i < 120; i++) aiCommand(us, [us,slow]);
  assert.equal(us.ai.goalLane, chosen);
  slow.current = {...track.sample(55,0),speed:19};
  for (let i = 0; i < 16; i++) aiCommand(us, [us,slow]);
  assert.equal(us.ai.passId, null);
  assert.ok(us.ai.hold > 0);
  assert.equal(us.ai.goalLane, chosen);

  const near = entrant(4,65,2.5,31);
  for (let i = 0; i < 15; i++) aiCommand(us,[us,near]);
  assert.ok(us.ai.safeLane <= near.current.lateral - 3);
});

test('immobilised AI requests ordinary recovery and keeps its own state', () => {
  const us = entrant(0,60,0,0);
  let requests = 0;
  for (let tick = 1; tick <= 300; tick++) {
    if (aiCommand(us,[us]).recover) { requests++; assert.equal(tick, 240); }
  }
  assert.equal(requests,1);
});

test('a faster AI catches, changes lane and clears a slower rival under full-field physics', () => {
  const race = createRace(), vehicle = createVehicle(carRecipe);
  startRace(race);
  while (race.phase === 'countdown') stepRace(race);
  const chaser = race.entrants[1], leader = race.entrants[4];
  // Start a rolling encounter on the pit straight; only these initial states are set.
  // All subsequent displacement, steering, contacts and ranking are game ticks.
  for (const [car, s, speed] of [[chaser, 30, 35], [leader, 51, 28]]) {
    const road = track.sample(s);
    car.vehicle = vehicle.spawn({position:[road.x,road.y + rideHeight,road.z],
      yaw:road.yaw, velocity:[road.tx * speed,0,road.tz * speed]});
    car.current = {...car.current,...road,y:car.vehicle.position[1],groundY:road.y,speed};
    car.previous = car.current;
    car.distance = car.safeDistance = s;
    car.ai = createDriver(car.style,car.seed);
  }
  let committed = false, alongside = false;
  for (let tick = 0; tick < 1500; tick++) {
    stepRace(race);
    const gap = leader.distance - chaser.distance;
    if (gap > 5 && chaser.ai.passId === leader.id) committed = true;
    if (Math.abs(gap) < 2 && Math.abs(leader.current.lateral - chaser.current.lateral) > 2.4) {
      alongside = true;
    }
    if (committed && alongside && gap < -5 && chaser.position < leader.position) {
      assert.equal(chaser.recoveries + leader.recoveries,0);
      return;
    }
  }
  assert.fail('expected a physical overtake, commitment=' + committed + ', alongside=' + alongside);
});
