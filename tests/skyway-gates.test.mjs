// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import {createVehicle} from '../vendor/vanillajs/modules/vehicle3d/index.js';
import {carRecipe,rideHeight,snapshot,STEP} from '../src/sim.js';
import {createNitroRace,startNitroRace,stepNitroRace} from '../src/nitro-race.js';
import {asphaltSupport,NEUTRAL_NITRO} from '../src/nitro-physics.js';
import {skyway} from '../src/skyway.js';

function approach(air) {
  const race=createNitroRace(27,skyway);
  startNitroRace(race);
  while (race.phase==='countdown') stepNitroRace(race);
  const driver=race.player, plane=skyway.gates[1].s;
  const road=skyway.sample(plane-(air ? .02 : .50));
  const car=createVehicle(carRecipe);
  // At 20 m/s the falling centre crosses in 1 ms. Its suspension still has
  // 15 mm of clearance, so touchdown at 2 m/s descent occurs after crossing.
  let vehicle=car.spawn({position:[road.x,road.y+(air ? carRecipe.wheel.radius+carRecipe.suspension.restLength+.015 : rideHeight),road.z],
    yaw:road.yaw,velocity:[20*road.tx,air?-2:0,20*road.tz]});
  if (!air) vehicle=car.step(vehicle,{}, {sampleSurface:skyway.sampleSurface,barriers:[]},STEP);
  const pose=skyway.project(vehicle.position[0],vehicle.position[2]);
  driver.vehicle=vehicle;
  driver.previous=driver.current=snapshot(vehicle,pose);
  driver.distance=pose.s;
  driver.safeDistance=0;
  driver.nextGate=1;
  driver.nitro.hadSupport=true;
  driver.nitro.airborne=air;
  assert(pose.s<plane);
  assert.equal(asphaltSupport(vehicle)>=2,!air);
  stepNitroRace(race,NEUTRAL_NITRO);
  assert(driver.current.s>plane && asphaltSupport(driver.vehicle)>=2);
  return driver;
}

test('a real touchdown after crossing the timing plane cannot award it retroactively',()=>{
  const airborne=approach(true),grounded=approach(false);
  assert.equal(airborne.nextGate,1);
  assert.equal(airborne.missedGate,true);
  assert.equal(grounded.nextGate,2);
  assert.equal(grounded.missedGate,false);
});
