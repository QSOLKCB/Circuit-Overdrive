// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import {dot,rotate} from '../vendor/vanillajs/modules/math/index.js';
import {pauseRace,resumeRace,STEP} from '../src/sim.js';
import {NEUTRAL_NITRO,NITRO_CAPACITY,advanceNitroVehicle,validateNitroCommand} from '../src/nitro-physics.js';
import {createNitroRace,recoverNitroCar,startNitroRace,stepNitroRace} from '../src/nitro-race.js';

// An analytic suspension test bed. Every wheel query uses the same surface as
// the station frame. The ramp has a quadratic rise and a descending back.
function sample(s,x=0) {
  let y=0, grade=0;
  if (s>=250 && s<280) {
    const t=(s-250)/30;
    y=4*t*t;
    grade=8*t/30;
  } else if (s>=280 && s<320) {
    y=4*(1-(s-280)/40);
    grade=-.1;
  }
  const length=Math.hypot(1,grade);
  return {s,lateral:x,x,y,z:-s,tx:0,tz:-1,rx:1,rz:0,yaw:0,bank:0,normal:[0,1/length,grade/length]};
}
const bed={discipline:'nitro',closed:false,halfWidth:150,barrierOffset:152,railHeight:.94,
  length:1480,startS:-60,endS:1500,sample,project:(x,z)=>sample(-z,x),
  gates:[sample(0),sample(800),sample(1480)],sampleSurface(x,z,maxY) {
    const road=sample(-z,x);
    return road.y<=maxY ? {height:road.y,normal:road.normal,friction:1,surfaceId:'asphalt'} : null;
  }};
const world={sampleSurface:bed.sampleSurface,barriers:[]};
const throttle={...NEUTRAL_NITRO,throttle:1};
function grid(course=bed) {
  const race=createNitroRace(19,course);
  startNitroRace(race);
  while (race.phase==='countdown') stepNitroRace(race);
  return race;
}
function repeat(race,command,ticks) {
  for (let i=0;i<ticks;i++) stepNitroRace(race,command);
}

test('admit all five exact controls before modifying countdown, field, or physics',()=>{
  const race=createNitroRace(7,bed);
  startNitroRace(race);
  for (const phase of ['countdown','racing','paused']) {
    race.phase=phase;
    const before=structuredClone(race);
    const accessor={...NEUTRAL_NITRO};
    Object.defineProperty(accessor,'boost',{get(){throw Error('Getter must remain inert');},enumerable:true});
    for (const command of [null,{},[],{...NEUTRAL_NITRO,drift:1},{...NEUTRAL_NITRO,boost:'yes'},
      {...NEUTRAL_NITRO,throttle:Infinity},{...NEUTRAL_NITRO,brake:-.1},{...NEUTRAL_NITRO,steer:NaN},
      {...NEUTRAL_NITRO,extra:true},accessor]) {
      assert.throws(()=>stepNitroRace(race,command),error=>error instanceof RangeError || error instanceof TypeError);
      assert.deepEqual(structuredClone(race),before);
    }
  }
  assert.equal(validateNitroCommand(throttle),throttle);
});

test('actual sideslip earns bounded energy; the thrust is measured in chassis velocity',()=>{
  const race=grid(), player=race.player;
  repeat(race,throttle,190);
  assert.equal(player.nitro.energy,0);
  let chargeTicks=0;
  for (let i=0;i<50;i++) {
    stepNitroRace(race,{...throttle,drift:true,steer:.65});
    if (player.nitro.charging) {
      chargeTicks++;
      const v=player.vehicle;
      assert(v.wheels.filter(w=>w.grounded && w.load>150).length>=3);
      assert(Math.abs(dot(v.velocity,rotate(v.orientation,[1,0,0])))>.3);
      assert(v.wheels.some(w=>Math.abs(w.lateralSpeed)>=.65));
    }
  }
  assert(chargeTicks>12);
  const earned=player.nitro.energy;
  assert(earned>1000 && earned<NITRO_CAPACITY);
  const coast=structuredClone(player), powered=structuredClone(player);
  const normal=advanceNitroVehicle(coast,throttle,bed,world);
  const boosted=advanceNitroVehicle(powered,{...throttle,boost:true},bed,world);
  const forward=rotate(player.vehicle.orientation,[0,0,-1]);
  const delta=dot(boosted.velocity,forward)-dot(normal.velocity,forward);
  assert(delta>.1 && delta<11*STEP+.03);
  assert.equal(earned-powered.nitro.energy,440);
  const braking=structuredClone(player);
  const slower=advanceNitroVehicle(braking,{...throttle,brake:1,boost:true},bed,world);
  assert(dot(slower.velocity,forward)<dot(normal.velocity,forward));
  assert.equal(braking.nitro.energy,earned);
  for (let i=0;i<40;i++) stepNitroRace(race,{...throttle,boost:true,steer:Math.max(-1,player.current.yaw*7)});
  assert.equal(player.nitro.energy,0);
  assert.equal(player.nitro.spentTotal,earned);
  assert.equal(player.nitro.boosting,false);
});

test('straight, reversing, low speed, stationary, rocking and parked pause cannot farm',()=>{
  for (const command of [NEUTRAL_NITRO,{...NEUTRAL_NITRO,brake:1,steer:.6},throttle]) {
    const race=grid();
    repeat(race,{...command,drift:true},215);
    assert.equal(race.player.nitro.energy,0);
  }
  const race=grid();
  repeat(race,throttle,190);
  for (let i=0;i<80;i++) stepNitroRace(race,{...throttle,drift:true,steer:i%2 ? 1 : -1});
  assert.equal(race.player.nitro.energy,0);
  pauseRace(race);
  const before=structuredClone(race);
  repeat(race,{...throttle,drift:true,steer:.8,boost:true},80);
  assert.deepEqual(structuredClone(race),before);
  resumeRace(race);
  repeat(race,{...throttle,drift:true,steer:.7},70);
  assert(race.player.nitro.energy>0);
  assert(recoverNitroCar(race));
  assert.equal(race.player.nitro.energy,0);
  assert.equal(race.player.nitro.chargeLock,0);
  assert(!recoverNitroCar(race));
  startNitroRace(race);
  assert(race.entrants.every(e=>!e.nitro.energy && !e.nitro.spentTotal));
});

test('real ramp flight follows gravity, accepts body-axis control and settles on its suspension',()=>{
  const race=grid(), player=race.player;
  let liftY=0, firstY=0, gravityTicks=0, rising=false, falling=false;
  let inspectedAir=false;
  for (let i=0;i<950;i++) {
    const previouslyAir=player.nitro.airborne, previousVY=player.vehicle.velocity[1];
    stepNitroRace(race,throttle);
    const n=player.nitro,v=player.vehicle;
    assert(Math.hypot(...v.velocity)<90 && Math.hypot(...v.angularVelocity)<12);
    assert(Math.abs(Math.hypot(...v.orientation)-1)<1e-8);
    assert.equal(player.recoveries,0);
    if (n.launch) {
      assert.equal(v.wheels.filter(w=>w.grounded).length,0);
      assert(player.current.s>278 && player.current.s<290);
      liftY=v.velocity[1]; firstY=v.position[1];
      assert(liftY>2);
    }
    if (n.airborne && previouslyAir) {
      assert(v.velocity[1]<previousVY-.12 && v.velocity[1]>previousVY-.21);
      assert.equal(n.charging,false);
      assert.equal(n.boosting,false);
      gravityTicks++;
      if (v.position[1]>firstY+1) rising=true;
      if (v.velocity[1]<-3) falling=true;
      if (!inspectedAir) {
        const off=advanceNitroVehicle(structuredClone(player),throttle,bed,world);
        const control={...throttle,drift:true,boost:true,steer:1};
        const probe=structuredClone(player);
        probe.nitro.energy=1000;
        const on=advanceNitroVehicle(probe,control,bed,world);
        assert.notDeepEqual(on.angularVelocity,off.angularVelocity);
        assert.deepEqual(on.velocity,off.velocity);
        assert.equal(probe.nitro.energy,1000);
        inspectedAir=true;
      }
    }
    if (n.landed) {
      assert(n.lastAirTicks>30 && n.peakHeight>2);
      assert(v.wheels.filter(w=>w.grounded && w.load>150).length>=2);
      assert(n.landSpeedY<0);
      assert(inspectedAir && rising && falling && gravityTicks>30);
      assert.equal(player.nitro.landings,1);
      return;
    }
  }
  assert.fail('failed to reach a supported landing');
});

test('thrust tapers to the available energy and remaining headroom below the 120 m/s engine guard',()=>{
  const race=grid();
  repeat(race,throttle,120);
  const e=race.player;
  for (const [speed,budget,expected] of [[10,1,true],[67.98,440,true],[68,440,false],[90,440,false]]) {
    const probe=structuredClone(e);
    probe.vehicle.velocity=[0,0,-speed];
    probe.nitro.energy=budget;
    const result=advanceNitroVehicle(probe,{...throttle,boost:true},bed,world);
    assert.equal(probe.nitro.boosting,expected);
    assert(probe.nitro.energy>=0 && probe.nitro.energy<=budget);
    assert.equal(probe.nitro.spentTotal,budget-probe.nitro.energy);
    assert(!result.needsRecovery && Math.hypot(...result.velocity)<119);
  }
});

test('barrier scrubbing and apron travel suppress charging; legitimate charging saturates exactly at capacity',()=>{
  const course={...bed,halfWidth:12,barrierOffset:14,
    sampleSurface(x,z,maxY) {
      const hit=bed.sampleSurface(x,z,maxY);
      return hit && {...hit,surfaceId:Math.abs(x)<=12 ? 'asphalt' : 'apron'};
    }};
  const race=grid(course), e=race.player;
  repeat(race,throttle,190);
  let contactTicks=0, saturated=false;
  for (let i=0;i<170;i++) {
    if (e.nitro.charging && !saturated) e.nitro.energy=NITRO_CAPACITY-1;
    const before=e.nitro.energy;
    stepNitroRace(race,{...throttle,drift:true,steer:.7});
    if (e.contact || Math.abs(e.current.lateral)>=course.halfWidth) {
      contactTicks++;
      assert(!e.nitro.charging && e.nitro.energy<=before);
    }
    if (e.nitro.energy===NITRO_CAPACITY) saturated=true;
    assert(e.nitro.energy<=NITRO_CAPACITY && e.nitro.energy>=0);
  }
  assert(saturated && contactTicks>10);
});

test('jumping through a timing plane cannot claim the gate or a recovery ahead of it',()=>{
  const course={...bed,gates:[sample(0),sample(310),sample(800)]};
  const race=grid(course), e=race.player;
  repeat(race,throttle,850);
  assert(e.current.s>400 && e.nitro.landings>0);
  assert(e.missedGate && e.nextGate===1 && e.finishTicks===null);
  assert(recoverNitroCar(race));
  assert(e.current.s<=course.gates[0].s && e.nextGate===1);
  assert.equal(e.nitro.energy,0);
});
