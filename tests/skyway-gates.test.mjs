// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import {createVehicle} from '../vendor/vanillajs/modules/vehicle3d/index.js';
import {carRecipe,rideHeight,snapshot,STEP} from '../src/sim.js';
import {createNitroRace,startNitroRace,stepNitroRace} from '../src/nitro-race.js';
import {NEUTRAL_NITRO} from '../src/nitro-physics.js';
import {skyway} from '../src/skyway.js';

function approach(air,{gate=1,lane=0,rules,nextGate=gate,backwards=false}={}) {
  const race=createNitroRace(27,skyway,rules);
  startNitroRace(race);
  while (race.phase==='countdown') stepNitroRace(race);
  const driver=race.player, plane=skyway.gates[gate].s;
  const road=skyway.sample(plane-(air ? .02 : .50),lane);
  const car=createVehicle(carRecipe);
  // At 20 m/s the falling centre crosses in 1 ms. Its suspension still has
  // 15 mm of clearance, so touchdown at 2 m/s descent occurs after crossing.
  let vehicle=car.spawn({position:[road.x,road.y+(air ? carRecipe.wheel.radius+carRecipe.suspension.restLength+.015 : rideHeight),road.z],
    yaw:road.yaw+(backwards ? Math.PI : 0),velocity:[20*road.tx,air?-2:0,20*road.tz]});
  if (!air) vehicle=car.step(vehicle,{}, {sampleSurface:skyway.sampleSurface,barriers:[]},STEP);
  const pose=skyway.project(vehicle.position[0],vehicle.position[2]);
  driver.vehicle=vehicle;
  driver.previous=driver.current=snapshot(vehicle,pose);
  driver.distance=pose.s;
  driver.safeDistance=0;
  driver.nextGate=nextGate;
  driver.nitro.hadSupport=true;
  driver.nitro.airborne=air;
  assert(pose.s<plane);
  const loaded=state=>state.wheels.filter(w=>w.grounded && w.load>150 && ['apron','asphalt'].includes(w.surfaceId)).length;
  assert.equal(loaded(vehicle)>=2,!air);
  stepNitroRace(race,NEUTRAL_NITRO);
  assert(driver.current.s>plane && loaded(driver.vehicle)>=2);
  if(lane) {
    assert(Math.abs(driver.current.lateral)>skyway.halfWidth && Math.abs(driver.current.lateral)<skyway.barrierOffset);
    if(!air) assert(vehicle.wheels.every(w=>w.surfaceId==='apron' && w.grounded && w.load>150));
  }
  return driver;
}

test('a real touchdown after crossing the timing plane cannot award it retroactively',()=>{
  const airborne=approach(true),grounded=approach(false);
  assert.equal(airborne.nextGate,1);
  assert.equal(airborne.missedGate,true);
  assert.equal(grounded.nextGate,2);
  assert.equal(grounded.missedGate,false);
});

test('both legal apron lanes count at every grounded forward gate, including the finish',()=>{
  for(const lane of [-13.94,13.94]) for(let gate=0;gate<skyway.gates.length;gate++) {
    const driver=approach(false,{gate,lane});
    assert.equal(driver.nextGate,gate+1,'gate '+gate+', lateral '+lane);
    assert.equal(driver.missedGate,false);
    assert.equal(driver.finishTicks!==null,gate===skyway.gates.length-1);
  }
});

test('the apron keeps the prior support, driving direction and gate order requirements',()=>{
  const lane=13.94,gate=skyway.gates.length-1;
  for(const driver of [approach(true,{lane,gate}),approach(false,{lane,gate,backwards:true}),
    approach(false,{lane,gate,nextGate:gate-1})]) {
    assert.equal(driver.finishTicks,null);
    assert(driver.missedGate);
  }
  const old=approach(false,{lane,gate,rules:1});
  assert.equal(old.finishTicks,null);
  assert(old.missedGate && old.nextGate===gate);
  assert.throws(()=>createNitroRace(27,skyway,3),/scoring rules/);
});
