// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import {createVehicle} from '../vendor/vanillajs/modules/vehicle3d/index.js';
import {createNitroRace,recoverNitroCar,startNitroRace,stepNitroRace} from '../src/nitro-race.js';
import {NEUTRAL_NITRO} from '../src/nitro-physics.js';
import {carRecipe,rideHeight,snapshot,STEP} from '../src/sim.js';
import {skyway} from '../src/skyway.js';

function green() {
  const race=createNitroRace(27,skyway);
  startNitroRace(race);
  while(race.phase==='countdown') stepNitroRace(race,NEUTRAL_NITRO);
  return race;
}
const car=createVehicle(carRecipe);
const world={sampleSurface:skyway.sampleSurface,barriers:[]};
function crossRamp(r,speed) {
  const p=skyway.sample(r.lip-r.run-5);
  let v=car.spawn({position:[p.x,p.y+rideHeight,p.z],yaw:p.yaw,velocity:[p.tx*speed,0,p.tz*speed]});
  let support=false,flight=0,longest=0,landed=false,maxRise=0,finish;
  for(let i=0;i<1600;i++) {
    const road=skyway.project(v.position[0],v.position[2]);
    const forward=v.velocity[0]*road.tx+v.velocity[2]*road.tz;
    v=car.step(v,{throttle:forward<speed?.6:0,brake:forward>speed+2?.1:0,steer:0},world,STEP);
    const grounded=v.wheels.some(w=>w.grounded);
    if(support && !grounded) { flight++; longest=Math.max(longest,flight); }
    if(grounded && flight) { landed=true; flight=0; }
    if(grounded) support=true;
    maxRise=Math.max(maxRise,v.position[1]-road.y-rideHeight);
    assert(v.position.every(Number.isFinite) && v.velocity.every(Number.isFinite));
    assert(Math.abs(v.velocity[1])<32);
    if(road.s>r.lip+r.run+45 && grounded){finish=road.s; break;}
  }
  assert(finish);
  return {longest,landed,maxRise};
}
test('suspension follows a slow crossing and launches faster entries into measurable flights',()=>{
  const short=crossRamp(skyway.ramps[0],23),long=crossRamp(skyway.ramps[1],40);
  const slow=crossRamp(skyway.ramps[0],5);
  assert(slow.longest<5 && slow.maxRise<.4);
  assert(short.longest>20 && short.landed && short.maxRise>1);
  assert(long.longest>short.longest && long.landed && long.maxRise>short.maxRise);
});
test('rear-first, nose-heavy, skewed and sideways drops settle on the physical catch deck',()=>{
  const p=skyway.sample(1093);
  for(const [pitch,yaw,expectedAxle] of [[.18,0,1],[-.18,0,0],[.13,.32,1],[0,1.42,null]]) {
    let v=car.spawn({position:[p.x,p.y+2,p.z],velocity:[p.tx*12,-3,p.tz*12],
      yaw:p.yaw+yaw,pitch});
    let first,loaded=false;
    for(let i=0;i<100;i++) {
      v=car.step(v,{throttle:0,brake:.25,steer:0},world,STEP);
      const support=v.wheels.map(w=>w.grounded && w.load>1);
      if(!first && support.some(Boolean)) first=support;
      loaded ||= support.filter(Boolean).length>=3;
      assert(Math.abs(v.velocity[1])<12 && !v.needsRecovery);
      assert(Math.abs(Math.hypot(...v.orientation)-1)<1e-8);
    }
    assert(loaded);
    if(expectedAxle!==null) {
      assert(first[expectedAxle*2] || first[expectedAxle*2+1]);
      assert(!first[(1-expectedAxle)*2] && !first[(1-expectedAxle)*2+1]);
    }
  }
});

function stage(e,s,{lateral=0,speed=30,sideSpeed=0,altitude=0}={}) {
  const p=skyway.sample(s,lateral);
  const v=car.spawn({position:[p.x,p.y+rideHeight+altitude,p.z],yaw:p.yaw,
    velocity:[speed*p.tx+sideSpeed*p.rx,0,speed*p.tz+sideSpeed*p.rz]});
  e.vehicle=v;
  e.current=e.previous=snapshot(v,p);
  e.distance=e.safeDistance=s;
  e.safeLateral=lateral;
}
test('a flight past a gate earns no split, recovery goes behind it, a reverse finish earns no flag',()=>{
  const r=green(),e=r.player;
  e.nextGate=1;
  stage(e,299.8,{altitude:4});
  const splits=e.splitTicks.length;
  for(let i=0;i<12;i++) stepNitroRace(r,NEUTRAL_NITRO);
  assert(e.missedGate && e.nextGate===1);
  assert.equal(e.splitTicks.length,splits);
  assert(recoverNitroCar(r));
  assert(e.distance<=skyway.gates[0].s && e.nitro.energy===0 && e.recoveries===1);
  stage(e,skyway.length+.2,{speed:-30});
  e.nextGate=skyway.gates.length-1;
  for(let i=0;i<8;i++) stepNitroRace(r,NEUTRAL_NITRO);
  assert.equal(e.finishTicks,null);
});
test('actual barrier contact and high/low rival separation use the physical chassis',()=>{
  const r=green(),e=r.player;
  stage(e,485,{lateral:13.5,speed:16,sideSpeed:11});
  let hit=false;
  for(let i=0;i<24;i++) {
    stepNitroRace(r,NEUTRAL_NITRO);
    hit ||= e.vehicle.contacts.includes('guardrail');
    assert(Number.isFinite(e.current.y) && e.current.lateral<skyway.barrierOffset);
  }
  assert(hit);
  const other=r.entrants[0];
  stage(e,424,{altitude:6}); stage(other,424);
  stepNitroRace(r,NEUTRAL_NITRO);
  assert(!e.pairContact && !other.pairContact);
  stage(e,424); stage(other,424);
  stepNitroRace(r,NEUTRAL_NITRO);
  assert(e.pairContact && other.pairContact);
});

test('a skewed physical launch can land with no award and recover safely; a clean pass pays just once',()=>{
  function launch(r,yawError) {
    const e=r.player,p=skyway.sample(499);
    const v=car.spawn({position:[p.x,p.y+rideHeight,p.z],yaw:p.yaw+yawError,pitch:.17,
      velocity:[p.tx*35,5.95,p.tz*35]});
    e.vehicle=v;e.current=e.previous=snapshot(v,p);
    e.distance=e.safeDistance=p.s;e.safeLateral=0;e.nextGate=2;
    const receipts=[];
    for(let i=0;i<280;i++) {
      stepNitroRace(r,NEUTRAL_NITRO);
      assert(e.vehicle.position.every(Number.isFinite) && e.vehicle.velocity.every(Number.isFinite));
      if(e.nitro.landed) receipts.push({flight:e.nitro.lastAirTicks,roll:e.current.roll});
    }
    assert(receipts.some(r=>r.flight>50));
    return e;
  }
  const r=green(),clean=launch(r,0);
  assert.equal(clean.nitro.stunts,1);
  const score=clean.nitro.points;
  assert(recoverNitroCar(r));
  while(clean.recoveryCooldown>0) stepNitroRace(r,NEUTRAL_NITRO);
  const duplicate=launch(r,0);
  assert.equal(duplicate.nitro.stunts,1);
  assert.equal(duplicate.nitro.points,score);
  const failedRace=green(),failed=launch(failedRace,1.55);
  assert.equal(failed.nitro.stunts,0);
  assert(failed.recoveries>0);
  assert.equal(failed.nextGate,2);
  assert(failed.current.s<skyway.gates[failed.nextGate].s);
  assert.equal(failed.nitro.energy,0);
});
