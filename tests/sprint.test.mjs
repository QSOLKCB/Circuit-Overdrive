// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { FixedClock } from '../vendor/vanillajs/modules/time/index.js';
import { createVehicle } from '../vendor/vanillajs/modules/vehicle3d/index.js';
import { aiCommand, createDriver } from '../src/ai.js';
import { ridge } from '../src/ridge.js';
import {
  carRecipe, classify, createRace, pauseRace, PENALTY_TICKS, progress, recoverCar, resumeRace,
  rideHeight, startRace, stepRace, STEP
} from '../src/sim.js';
import { track } from '../src/track.js';
import { driverIntent } from './driver.mjs';

function green(course = ridge) {
  const race = createRace(27, course);
  startRace(race);
  for (let i = 0; i < 180; i++) stepRace(race);
  return race;
}

const car = createVehicle(carRecipe);
// Set up difficult crossing/contact cases, then exercise the actual vehicle and scoring tick.
function place(entrant, s, along, lateral = 0, drift = 0, altitude = 0) {
  const p = ridge.sample(s, lateral);
  const [nx, ny, nz] = p.normal;
  const grade = -(p.tx * nx + p.tz * nz) / ny;
  const vx = p.tx * along + p.rx * drift, vz = p.tz * along + p.rz * drift;
  const vy = -(vx * nx + vz * nz) / ny;
  const y = p.y + rideHeight + altitude;
  entrant.vehicle = car.spawn({ position: [p.x, y, p.z], velocity: [vx, vy, vz],
    yaw: p.yaw, pitch: Math.atan(grade), roll: p.bank });
  entrant.current = { ...entrant.current, x: p.x, y, z: p.z, s: p.s, lateral, yaw: p.yaw,
    pitch: Math.atan(grade), roll: p.bank, speed: Math.hypot(vx, vz), groundY: p.y };
  entrant.previous = entrant.current;
  entrant.distance = entrant.safeDistance = p.s;
  entrant.safeLateral = lateral;
}

test('course selection isolates six grid cars, countdown, pause and restart', () => {
  const circuit = green(track), sprint = createRace(27, ridge);
  assert.equal(circuit.player.nextGate, 1);
  assert.equal(sprint.course, ridge);
  assert.equal(sprint.player.nextGate, 0);
  assert.throws(() => { sprint.course = track; }, TypeError);
  const grid = structuredClone(sprint.entrants);
  for (const e of grid) {
    assert.ok(e.distance < 0 && e.distance > ridge.startS);
    assert.ok(Math.abs(e.current.lateral) + carRecipe.chassis.width / 2 < ridge.barrierOffset);
    for (const rival of grid.slice(e.id + 1)) {
      assert.ok(Math.hypot(e.current.x - rival.current.x, e.current.z - rival.current.z) >
        Math.hypot(carRecipe.chassis.length, carRecipe.chassis.width));
    }
  }
  startRace(sprint);
  for (let tick = 0; tick < 179; tick++) stepRace(sprint, { throttle: 1 });
  pauseRace(sprint);
  stepRace(sprint);
  assert.equal(sprint.countdownTicks, 1);
  assert.deepEqual(sprint.entrants, grid);
  resumeRace(sprint);
  stepRace(sprint);
  for (let tick = 0; tick < 180; tick++) stepRace(sprint, { throttle: 1 });
  assert.ok(sprint.entrants.every(e => e.current.speed > 5));
  assert.equal(circuit.elapsedTicks, 0);
  assert.equal(circuit.course, track);
  startRace(sprint);
  assert.deepEqual(sprint.entrants, grid);
});

test('the finite route rejects out-of-order, reverse and vertically separated gate crossings', () => {
  const race = green(), e = race.player;
  const goal = ridge.gates.at(-1);
  place(e, goal.s - .12, 24);
  stepRace(race);
  assert.equal(e.nextGate, 0);
  assert.equal(e.finishTicks, null);
  assert.equal(e.splitTicks.length, 0);
  assert.ok(e.distance > ridge.length);
  assert.ok(progress(e, ridge) < 0);
  // Deliberately miss all intermediate gates after legally crossing the actual start.
  place(e, -.12, 24);
  stepRace(race);
  assert.equal(e.nextGate, 1);
  place(e, goal.s - .12, 24);
  stepRace(race);
  assert.equal(e.finishTicks, null);
  assert.equal(e.nextGate, 1);
  // Allow the finish to be the expected gate, but cross backwards or above the road deck.
  e.nextGate = ridge.gates.length - 1;
  place(e, goal.s + .12, -24);
  stepRace(race);
  assert.ok(e.wrongWay);
  assert.equal(e.finishTicks, null);
  place(e, goal.s - .12, 24, 0, 0, 6);
  stepRace(race);
  assert.equal(e.finishTicks, null);
  assert.equal(race.phase, 'racing');
});

test('reversing back towards a missed gate never promotes the entrant', () => {
  const race = green(), e = race.player;
  const checkpoint = ridge.gates[1].s;
  e.nextGate = 1;
  place(e, checkpoint - .1, 22, 0, 0, 5);
  stepRace(race);
  assert.equal(e.missedGate, true);
  const credited = progress(e, ridge);
  place(e, checkpoint + .1, -22);
  stepRace(race);
  assert.ok(e.wrongWay);
  assert.equal(e.nextGate, 1);
  assert.ok(progress(e, ridge) <= credited);
  place(e, checkpoint - .1, 22);
  stepRace(race);
  assert.equal(e.nextGate, 2);
  assert.ok(progress(e, ridge) >= checkpoint);
});

test('a discontinuous jump inside the next sector recovers without ranking or checkpoint credit', () => {
  const race = green(), e = race.player;
  e.nextGate = 1;
  place(e, 100, 20);
  const original = e.current;
  place(e, 480, 20);
  e.current = original;
  e.distance = e.safeDistance = 100;
  stepRace(race);
  assert.equal(e.recoveries, 1);
  assert.equal(e.elapsedTicks, PENALTY_TICKS + 1);
  assert.equal(e.nextGate, 1);
  assert.ok(progress(e, ridge) <= 100);
  assert.deepEqual(e.splitTicks, []);
});

test('guardrails at both physical road ends retain the car on supported pavement', () => {
  for (const rear of [true, false]) {
    const race = green(), e = race.player;
    const wall = rear ? ridge.startS : ridge.endS;
    place(e, wall + (rear ? 3 : -3), rear ? -12 : 48);
    let contacts = 0;
    for (let tick = 0; tick < 120; tick++) {
      stepRace(race, rear ? {brake: 1} : {throttle: 1});
      if (e.vehicle.contacts.includes('guardrail')) contacts++;
      assert.ok(Math.abs(e.current.s - wall) >= carRecipe.chassis.length / 2 - .015);
      assert.equal(e.recoveries, 0);
      assert.ok(e.vehicle.wheels.every(w => w.grounded));
    }
    assert.ok(contacts > 0);
    assert.equal(e.nextGate, 0);
    if (rear) {
      const before = progress(e, ridge);
      assert.ok(recoverCar(race));
      assert.ok(progress(e, ridge) <= before + 1e-8);
      for (let i = 0; i < 360; i++) stepRace(race, {throttle: 1});
      assert.equal(e.nextGate, 1);
      assert.equal(e.recoveries, 1);
    }
  }
});

test('a full rear runway can repair a damaged car in its own footprint', () => {
  const race = green(), e = race.player;
  const first = ridge.startS + carRecipe.chassis.length / 2 + .081;
  for (const rival of race.entrants.slice(0, 5)) place(rival, first, 0, (rival.id - 2) * 4);
  place(e, first + 4.5, 0);
  const old = e.current;
  assert.equal(recoverCar(race), false);
  e.vehicle.velocity = null;
  stepRace(race);
  assert.equal(e.recoveries, 1);
  assert.equal(e.elapsedTicks, PENALTY_TICKS + 1);
  assert.equal(e.nextGate, 0);
  assert.equal(e.current.x, old.x);
  assert.equal(e.current.z, old.z);
  assert.ok(e.vehicle.velocity.every(Number.isFinite));
});

test('sprint recovery and reversing cannot gain a checkpoint, split or classification position', () => {
  const race = green(), e = race.player, rival = race.entrants[0];
  e.nextGate = rival.nextGate = 1;
  const mid = ridge.gates[1].s;
  place(e, mid + 12, 20);
  place(rival, mid - 5, 20);
  classify(race);
  assert.ok(rival.position < e.position);
  const before = progress(e, ridge), placeBefore = e.position;
  assert.ok(recoverCar(race));
  assert.ok(progress(e, ridge) <= before);
  assert.ok(e.position >= placeBefore);
  assert.equal(e.elapsedTicks, PENALTY_TICKS);
  assert.equal(e.nextGate, 1);
  assert.deepEqual(e.splitTicks, []);
  place(e, mid + .1, -20);
  stepRace(race);
  assert.ok(e.wrongWay);
  assert.equal(e.nextGate, 1);
  assert.deepEqual(e.splitTicks, []);
  place(e, mid - .1, 20);
  stepRace(race);
  assert.equal(e.nextGate, 2);
  assert.deepEqual(e.splitTicks, [PENALTY_TICKS + 2]);
  for (let i = 2; i < ridge.gates.length; i++) {
    place(e, ridge.gates[i].s - .1, 20);
    stepRace(race);
    assert.equal(e.nextGate, i + 1);
  }
  assert.equal(e.finishTicks, race.elapsedTicks + PENALTY_TICKS);
  assert.equal(race.phase, 'finished');
  rival.finishTicks = e.finishTicks - 1;
  classify(race);
  assert.deepEqual(race.order.slice(0, 2).map(car => car.id), [rival.id, e.id]);
});

test('AI at the sprint finish uses runout tangents and never sees the grid as traffic ahead', () => {
  const race = green(), behind = race.entrants[0], grid = race.entrants[4];
  place(behind, ridge.length - 3, 24);
  place(grid, 1, 0);
  behind.ai = createDriver(behind.style, behind.seed);
  const alone = structuredClone(behind);
  assert.deepEqual(aiCommand(behind, [behind, grid], ridge), aiCommand(alone, [alone], ridge));
  assert.ok(behind.ai.speedGoal > 25);
  assert.equal(behind.ai.passId, null);
  assert.ok(Math.abs(behind.ai.steer) < .06);
});

test('grade-aware door contact preserves the road surface and the outer guardrail', () => {
  const race = green();
  let s = 100, steepest = 0;
  for (let d = 100; d < ridge.length - 100; d += 10) {
    const p = ridge.sample(d);
    const grade = Math.abs((p.normal[0] * p.tx + p.normal[2] * p.tz) / p.normal[1]);
    if (grade > steepest) { steepest = grade; s = d; }
  }
  assert.ok(steepest > .035);
  const outer = race.entrants[0], inner = race.player;
  place(outer, s, 25, 1.06 - ridge.barrierOffset);
  place(inner, s, 25, 2.91 - ridge.barrierOffset, -12);
  stepRace(race);
  assert.ok(outer.vehicle.contacts.includes('guardrail'));
  assert.ok(outer.pairContact && inner.pairContact);
  for (let tick = 0; tick < 32; tick++) {
    for (const e of [outer, inner]) {
      assert.ok(Math.abs(e.current.lateral) < ridge.barrierOffset - .9);
      assert.ok(Math.abs(e.current.y - e.current.groundY - rideHeight) < .15);
      assert.ok(e.vehicle.wheels.some(w => w.grounded));
      assert.ok(e.vehicle.velocity.every(Number.isFinite));
      assert.equal(e.recoveries, 0);
    }
    stepRace(race);
  }
});

test('the six-car ridge field repeats its accepted ticks at 30, 60 and 144 Hz', () => {
  function run(hz) {
    const race = green(), clock = new FixedClock({ step: STEP });
    for (let frame = 0; frame < hz * 5; frame++) {
      clock.advance(1 / hz, () => stepRace(race, driverIntent(race.player.current, 30, 0, ridge)));
    }
    assert.equal(clock.ticks, 300);
    assert.ok(race.entrants.every(e => e.nextGate === 1));
    return race.entrants;
  }
  const reference = run(60);
  assert.deepEqual(run(30), reference);
  assert.deepEqual(run(144), reference);
});

test('a complete six-car sprint records ordered intermediate splits and retires each finisher', () => {
  const race = green(), retired = new Map();
  for (let tick = 0; tick < 24000 && race.phase === 'racing'; tick++) {
    const previous = race.entrants.map(e => e.nextGate);
    stepRace(race, driverIntent(race.player.current, 30, 0, ridge));
    for (const e of race.entrants) {
      assert.ok(e.nextGate === previous[e.id] || e.nextGate === previous[e.id] + 1);
      assert.ok(e.vehicle.position.every(Number.isFinite) && e.vehicle.velocity.every(Number.isFinite));
      if (retired.has(e.id)) assert.equal(e.vehicle, retired.get(e.id));
      else if (e.finishTicks !== null) retired.set(e.id, e.vehicle);
    }
  }
  assert.equal(race.phase, 'finished');
  assert.equal(retired.size, 6);
  for (const e of race.entrants) {
    assert.equal(e.recoveries, 0);
    assert.equal(e.finishTicks, e.elapsedTicks);
    assert.equal(e.nextGate, ridge.gates.length);
    assert.equal(e.splitTicks.length, ridge.gates.length - 2);
    assert.ok(e.splitTicks.every((t, i) => t > (e.splitTicks[i - 1] ?? 0) && t < e.finishTicks));
    assert.deepEqual(e.lapTicks, []);
    assert.ok(e.current.s >= ridge.length - .1 && e.current.s < ridge.length + 2);
  }
  assert.deepEqual(race.order.map(e => e.finishTicks),
    race.entrants.map(e => e.finishTicks).sort((a, b) => a - b));
});
