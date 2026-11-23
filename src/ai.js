// SPDX-License-Identifier: Apache-2.0
import { seededRandom } from '../vendor/vanillajs/modules/math/index.js';
import { track } from './track.js';

const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
const approach = (a, b, amount) => a + clamp(b - a, -amount, amount);
const laneLimit = track.halfWidth - 3;
const passingSpace = 4.4;

// Cruise in m/s; lateral is the driver's lateral acceleration budget on level asphalt.
// Each driver leaves a margin below the tyres' theoretical grip limit.
const profiles = {
  leader:     { cruise:39.5, lateral:8.2, braking:5.5, range:26, reaction:6, turnRate:4.0, launch:.94 },
  aggressor:  { cruise:42.0, lateral:8.8, braking:6.8, range:34, reaction:5, turnRate:4.6, launch:1.0 },
  technician: { cruise:39.0, lateral:9.3, braking:5.0, range:29, reaction:6, turnRate:3.6, launch:.96 },
  defender:   { cruise:38.5, lateral:8.4, braking:5.8, range:25, reaction:7, turnRate:4.2, launch:.92 },
  rookie:     { cruise:33.0, lateral:7.3, braking:4.8, range:20, reaction:10, turnRate:3.7, launch:.84 },
};

export function createDriver(style, seed, lateral = 0) {
  if (!Object.hasOwn(profiles, style) || !Number.isInteger(seed) || !Number.isFinite(lateral)) {
    throw RangeError('Invalid racing driver');
  }
  const random = seededRandom(seed);
  return {
    style, pace: .985 + random() * .03, bias: random() * 2.4 - 1.2,
    passSide: random() < .5 ? -1 : 1,
    steer:0, lane:lateral, goalLane:lateral, safeLane:lateral, passId:null, hold:0,
    speedGoal:0, thinkIn:0, stalled:0, lastProgress:null
  };
}

// Signed shortest distance along the circuit, also when being lapped.
function ahead(a, b) {
  let gap = b.s - a.s;
  if (gap > track.length / 2) gap -= track.length;
  if (gap < -track.length / 2) gap += track.length;
  return gap;
}

function planCorner(p, driver, profile) {
  const horizon = 36 + p.speed * 1.8;
  const segment = horizon / 4;
  let start = track.sample(p.s), speed = profile.cruise * driver.pace, bend = 0;
  for (let i = 0; i < 4; i++) {
    const end = track.sample(p.s + (i + 1) * segment);
    const curvature = Math.atan2(end.tx * start.rx + end.tz * start.rz,
      end.tx * start.tx + end.tz * start.tz) / segment;
    if (i === 0) bend = curvature;
    if (Math.abs(curvature) > .001) {
      const bankAssist = -Math.sign(curvature) * 9.81 * Math.sin((start.bank + end.bank) / 2);
      const lateralBudget = profile.lateral * driver.pace + bankAssist;
      // v² = corner speed² + 2 * available deceleration * distance to this segment.
      speed = Math.min(speed, Math.sqrt(lateralBudget / Math.abs(curvature)
        + 2 * profile.braking * i * segment));
    }
    start = end;
  }
  return { speed, home: clamp(driver.bias + bend * 145, -3.2, 3.2) };
}

function nearby(entrant, entrants) {
  const neighbours = [];
  for (const other of entrants) {
    if (other.id === entrant.id || other.finishTicks != null) continue;
    const gap = ahead(entrant.current, other.current);
    if (Math.abs(gap) >= 72) continue;
    const velocity = other.vehicle.velocity;
    // Ignore a damaged drivetrain until the simulation has recovered that entrant.
    if (!Number.isFinite(velocity?.[0]) || !Number.isFinite(velocity[2])) continue;
    const [vx,,vz] = velocity;
    const road = track.sample(other.current.s);
    neighbours.push({id:other.id, gap, lateral:other.current.lateral, speed:vx*road.tx + vz*road.tz});
  }
  return neighbours;
}

// Check the destination and the swept lane change. A car abreast owns its space.
function clearLane(p, lane, traffic) {
  for (const car of traffic) {
    // Disallow cutting across a neighbouring car, but allow peeling away
    // from a slow car once its nose and ours have longitudinal clearance.
    if (Math.abs(car.gap) < 9 && (car.lateral-p.lateral)*(car.lateral-lane) < 0
        && Math.abs(car.lateral - p.lateral) > .6) return false;
    const rearMargin = 9 + Math.max(0, car.speed - p.speed) * 1.1;
    if (Math.abs(car.lateral - lane) < 3 && car.gap > -rearMargin && car.gap < 18) return false;
  }
  return true;
}

function chooseLine(entrant, traffic, home, speed, profile) {
  const d = entrant.ai, p = entrant.current;
  const passing = traffic.find(car => car.id === d.passId);
  if (d.passId !== null && (!passing || passing.gap < -9 || passing.gap > 54)) {
    d.passId = null;
    d.hold = 45;
  }
  if (d.passId !== null || d.hold > 0) return;

  let blocker;
  for (const car of traffic) {
    if (car.gap <= 0 || car.gap > profile.range + Math.max(0, p.speed - car.speed) * 1.4) continue;
    if (Math.abs(car.lateral - p.lateral) > 3.2 && Math.abs(car.lateral - home) > 3.2) continue;
    if (speed < car.speed + .8 || (blocker && blocker.gap <= car.gap)) continue;
    blocker = car;
  }
  if (blocker) {
    // Prefer the side requiring the smaller lane change. Seed breaks equal gaps.
    const side = Math.abs(p.lateral - blocker.lateral) < .5 ? d.passSide : Math.sign(p.lateral - blocker.lateral);
    for (const direction of [side, -side]) {
      const lane = blocker.lateral + direction * passingSpace;
      if (Math.abs(lane) <= laneLimit && clearLane(p, lane, traffic)) {
        d.goalLane = lane;
        d.passId = blocker.id;
        return;
      }
    }
    // Both passing corridors occupied. Stay behind and reduce the target speed.
    d.goalLane = p.lateral;
    return;
  }

  const challenger = d.style === 'defender' && traffic.find(car => car.gap < -6 && car.gap > -18 && car.speed > p.speed);
  if (challenger) {
    // A single defensive choice before the challenger draws alongside.
    const cover = approach(p.lateral, challenger.lateral, 1.5);
    if (clearLane(p, cover, traffic)) {
      d.goalLane = clamp(cover, -laneLimit, laneLimit);
      d.hold = 95;
    }
  } else if (clearLane(p, home, traffic)) {
    d.goalLane = home;
  }
}

export function aiCommand(entrant, entrants) {
  const d = entrant.ai, p = entrant.current, profile = profiles[d.style];
  if (d.hold > 0) d.hold--;
  if (--d.thinkIn <= 0) {
    d.thinkIn = profile.reaction;
    const { speed, home } = planCorner(p, d, profile);
    const traffic = nearby(entrant, entrants);
    chooseLine(entrant, traffic, home, speed, profile);
    let cap = speed, left = -laneLimit, right = laneLimit;
    for (const car of traffic) {
      if (Math.abs(car.gap) < 6.5 && Math.abs(car.lateral - p.lateral) > .5) {
        if (car.lateral < p.lateral) left = Math.max(left,car.lateral + 3.3);
        else right = Math.min(right,car.lateral - 3.3);
      }
      // Keep a physical gap until the car has actually cleared the other lane.
      if (car.gap > 0 && Math.abs(p.lateral - car.lateral) < 2.9) {
        const headway = car.gap - 5.3;
        const closingCap = car.speed + headway * .65;
        cap = Math.min(cap, Math.max(0, closingCap));
      }
    }
    d.safeLane = left <= right ? clamp(d.goalLane,left,right) : p.lateral;
    d.speedGoal = cap;
  }
  d.lane = approach(d.lane, d.safeLane, .085);
  const look = 8.5 + .48 * p.speed;
  const target = track.sample(p.s + look, d.lane);
  const angle = Math.atan2(target.x - p.x, p.z - target.z) + p.yaw;
  const headingError = Math.atan2(Math.sin(angle), Math.cos(angle));
  const desiredSteer = clamp(headingError * (4.5 + p.speed * .14), -1, 1);
  d.steer = approach(d.steer, desiredSteer, profile.turnRate / 60);
  const error = d.speedGoal - p.speed;
  // Judge a stall by forward progress, including a car sliding or facing backwards.
  // Give a stopped queue twice the time to clear before asking the common recovery path.
  if (d.lastProgress === null) d.lastProgress = entrant.distance;
  if (entrant.distance >= d.lastProgress + 1.5) {
    d.lastProgress = entrant.distance;
    d.stalled = 0;
  } else {
    d.stalled++;
  }
  const recover = d.stalled >= (d.speedGoal > 3 ? 240 : 480);
  if (recover) {
    d.lastProgress = entrant.distance;
    d.stalled = 0;
  }
  return {
    throttle: clamp(error * .38 + .13, 0, profile.launch),
    brake: p.speed > 1 ? clamp((-error - .8) * .3, 0, 1) : 0,
    steer: d.steer, recover
  };
}
