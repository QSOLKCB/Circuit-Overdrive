// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import {add,dot,length,rotate,scale,subtract} from '../vendor/vanillajs/modules/math/index.js';
import {orbital} from '../src/orbital.js';
import {createRocketBody,NEUTRAL_ROCKET,stepRocketBody} from '../src/rocket-dynamics.js';
import {createRocketRace,crossesOrbitalGate,planRocketCommand,recoverRocketCar,startRocketRace,stepRocketRace} from '../src/rocket-race.js';
import {pauseRace,resumeRace} from '../src/sim.js';
import {orbitalDrive} from './orbital-driver.mjs';

function grid(seed=27) {
  const r=createRocketRace(seed);
  startRocketRace(r);
  return r;
}
const held=NEUTRAL_ROCKET;

test('held throttle and boost carry the player through the wall and ceiling timing gates with automatic grip',()=>{
  const race=grid();
  const player=race.player;
  const roof=orbital.sections.find(section=>section.id==='inverted-spine');
  const crossings=[];
  const wall=orbital.sections.find(section=>section.id==='antenna-wall');
  let wallMetres=0,ceilingMetres=0,topSpeed=0;
  for(let tick=0;tick<1600 && player.distance<roof.end && !player.recoveries;tick++) {
    const previousGate=player.nextGate,previousStation=player.distance;
    stepRocketRace(race,{...orbitalDrive(player),throttle:1,brake:0,boost:true});
    const body=player.vehicle;
    topSpeed=Math.max(topSpeed,length(body.velocity));
    const loaded=body.wheels.filter(wheel=>wheel.contact && wheel.load>0).length;
    if(player.nextGate>previousGate) crossings.push({gate:player.nextGate,loaded});
    if(player.distance>=wall.start && player.distance<roof.end) assert(body.attached);
    const travelled=player.distance-previousStation;
    if(loaded>=2 && body.contactFrame?.id===wall.id) wallMetres+=travelled;
    if(loaded>=2 && body.contactFrame?.id===roof.id) ceilingMetres+=travelled;
  }
  assert.deepEqual(crossings.map(event=>event.gate),[1,2,3,4,5],'the boosted car must credit the Antenna Wall and Inverted Spine gates');
  assert(crossings.every(event=>event.loaded>=2));
  assert.equal(player.recoveries,0);
  assert(player.distance>=roof.end && topSpeed>64);
  assert(wallMetres>wall.end-wall.start-3 && ceilingMetres>roof.end-roof.start-3);
});

test('an ordinary throttle-and-steer drive reaches the flag with every unit of boost fuel',()=>{
  const race=grid(), p=race.player;
  const wall=orbital.sections.find(section=>section.id==='radial-elbow');
  const exit=orbital.sections.find(section=>section.id==='gravity-well');
  const gap=orbital.sections.find(section=>section.kind==='air');
  const gates=[];
  let flight=0,landed=false;
  for(let tick=0;tick<4000 && race.phase!=='finished';tick++) {
    const before=p.nextGate;
    stepRocketRace(race,{...NEUTRAL_ROCKET,throttle:1,steer:orbitalDrive(p).steer});
    const b=p.vehicle;
    if(p.nextGate!==before) gates.push(p.nextGate);
    if(p.distance>=wall.start && p.distance<=exit.end) assert(b.attached);
    if(p.distance>=gap.start && b.airTicks && !b.attached) flight++;
    if(flight && b.contactFrame?.id==='catch-deck' && b.wheels.every(w=>w.contact && w.load>0)) landed=true;
  }
  assert.equal(race.phase,'finished');
  assert.deepEqual(gates,[1,2,3,4,5,6,7,8,9]);
  assert.equal(p.recoveries,0);
  assert.equal(p.vehicle.energy,100);
  assert(flight>10 && landed);
});

test('six real bodies complete the ordered wall, inverted gate, free transfer and catch under deterministic tick inputs',()=>{
  const race=grid(),tape=[],flags=race.entrants.map(()=>({wall:0,roof:0,splits:[],air:0,dodge:0,boost:0,landed:false}));
  while(race.phase!=='finished' && tape.length<7000) {
    const cmd=orbitalDrive(race.player);
    tape.push(cmd);
    stepRocketRace(race,cmd);
    for(const e of race.entrants) {
      const f=flags[e.id],body=e.vehicle;
      if(e.nextGate!==f.splits.length) f.splits.push(e.nextGate);
      if(e.finishTicks!==null) continue;
      const face=body.contactFrame?.id;
      const up=rotate(body.orientation,[0,1,0]);
      if(body.attached && face==='antenna-wall') {
        f.wall++;
        assert(Math.abs(up[1])<.13 && body.velocity[1]>12);
      }
      if(body.attached && face==='inverted-spine') {
        f.roof++; assert(up[1]<-.97 && body.position[1]>160);
      }
      if(e.distance>1050) {
        if(body.airTicks) assert(body.wheels.every(w=>!w.contact));
        f.air=Math.max(f.air,body.airTicks);
        if(f.air>=12 && face==='catch-deck' && body.wheels.every(w=>w.contact && w.load>0)) f.landed=true;
      }
      f.dodge+=Boolean(body.dodgeApplied);
      f.boost+=body.boosting;
    }
  }
  assert.equal(race.phase,'finished');
  for(const e of race.entrants) {
    const f=flags[e.id];
    assert.deepEqual(f.splits,[1,2,3,4,5,6,7,8,9]);
    assert(f.wall>=60 && f.roof>=180 && f.air>=15 && f.landed && f.boost>0);
    assert.equal(e.splitTicks.length,7);
    assert.equal(e.recoveries,0);
    assert(e.finishTicks>e.splitTicks.at(-1));
  }
  assert.equal(flags[race.player.id].dodge,1);
  const times=race.order.map(e=>e.finishTicks);
  assert.deepEqual(times,[...times].sort((a,b)=>a-b));
  const replay=grid();
  for(let i=0;i<tape.length;i+=13) for(const cmd of tape.slice(i,i+13)) stepRocketRace(replay,cmd);
  assert.deepEqual(replay,race);
});

test('vertical checkpoint recovery rolls back to a supported grid slot with all previously credited gates retained',()=>{
  const r=grid(),targets=['antenna-wall','inverted-spine'],starting=structuredClone(r);
  pauseRace(r);stepRocketRace(r,NEUTRAL_ROCKET);assert.equal(r.countdownTicks,180);
  resumeRace(r);assert.deepEqual(r,starting);
  for(let i=0;i<8500 && r.phase!=='finished';i++) {
    stepRocketRace(r,orbitalDrive(r.player));
    const p=r.player, gate=orbital.gates[p.nextGate-1], id=targets[0];
    if(!id || p.vehicle.contactFrame?.id!==id || gate.id!==id || p.recoveryCooldown) continue;
    targets.shift();
    const {nextGate,elapsedTicks,splitTicks,vehicle}=p,before=splitTicks.slice();
    assert(recoverRocketCar(r));
    assert(p.distance<=gate.s && p.current.groundY<35);
    assert.equal(p.vehicle.tick,vehicle.tick);
    assert.equal(p.vehicle.energy,vehicle.energy);
    assert.equal(p.elapsedTicks,elapsedTicks+180);
    assert.equal(recoverRocketCar(r),false);
    assert.equal(p.nextGate,nextGate);assert.deepEqual(p.splitTicks,before);
    while(p.distance<gate.s-2 && r.elapsedTicks<8500) {
      stepRocketRace(r,orbitalDrive(p));
      assert.equal(p.nextGate,nextGate);assert.deepEqual(p.splitTicks,before);
    }
  }
  assert.deepEqual(targets,[]);
  assert.equal(r.phase,'finished');
  assert.equal(r.player.splitTicks.length,7);
  assert.equal(r.player.recoveries,2);
});

test('forward timing aperture excludes reverse, lateral, airborne and wrong-deck crossings even with realistic wheel loads',()=>{
  const g=orbital.gates[2]; // Flat apron directly below the return spine.
  function traverse(f,signedSpeed) {
    let body=createRocketBody(f);body.velocity=scale(f.tangent,signedSpeed);
    let previous=body;
    for(let i=0;i<6;i++) {
      previous=body;body=stepRocketBody(body,held,orbital.surface);
      const a=dot(subtract(previous.position,g.point),g.tangent),b=dot(subtract(body.position,g.point),g.tangent);
      if((a<0 && b>=0) || (a>0 && b<=0)) return [previous,body];
    }
    assert.fail('test body did not physically cross the portal plane');
  }
  const regular=traverse(orbital.frame(g.s-.6),22);
  assert(regular[1].wheels.every(w=>w.contact && w.load>0));
  assert(crossesOrbitalGate(g,...regular));
  assert(!crossesOrbitalGate(g,...traverse(orbital.frame(g.s+.6),-22)));
  assert(!crossesOrbitalGate(g,...traverse(orbital.frame(g.s-.6,13.85),22)));
  const airborne=orbital.frame(g.s-.6);
  assert(!crossesOrbitalGate(g,...traverse({...airborne,point:add(airborne.point,[0,3,0])},22)));
  const crown=orbital.sections.find(p=>p.kind==='ceiling');
  const start=orbital.frame(crown.start).point;
  const station=crown.start+g.point[2]+.6-start[2],roof=orbital.frame(station);
  const inverted=traverse({...roof,tangent:scale(roof.tangent,-1),lateral:scale(roof.lateral,-1)},22);
  assert(inverted[1].wheels.every(w=>w.contact && w.load>0));
  assert(inverted[1].position[1]-g.point[1]>100);
  assert(!crossesOrbitalGate(g,...inverted));
  const race=grid();
  race.phase='racing';
  race.player.vehicle=regular[0];race.player.distance=g.s-.1;
  // The entrant is physically at the third portal while still owing the grid.
  stepRocketRace(race,held);
  assert.equal(race.player.nextGate,0);assert.deepEqual(race.player.splitTicks,[]);
  assert(race.player.missedGate);
});

test('a blocked lost-car recovery waits for a clear slot and cannot re-spend cooldown or receive a gate',()=>{
  const r=grid();r.phase='racing';
  const p=r.player,s=orbital.startS+3;
  p.safeDistance=s;p.distance=s;p.safeLateral=0;p.vehicle.position=[2600,0,0];p.recoveryCooldown=2;
  for(const [i,l] of [-8,0,8,-4,4].entries()) {
    const e=r.entrants[i],f=orbital.frame(s,l);
    e.vehicle=e.previousBody=createRocketBody(f);e.distance=s;
  }
  for(let i=0;i<4;i++) {
    stepRocketRace(r,held);
    assert.equal(p.nextGate,0);assert.equal(p.recoveries,0);
    assert(p.pendingRecovery && p.vehicle.position[0]===2600);
  }
  r.entrants[0].finishTicks=1;r.entrants[3].finishTicks=1;
  stepRocketRace(r,held);
  assert(!p.pendingRecovery && p.recoveries===1 && p.recoveryCooldown===120);
  assert.equal(p.nextGate,0); assert.equal(p.elapsedTicks,185);
  assert(length(subtract(p.vehicle.position,orbital.frame(s,-8).point))<1);
});

test('a stranded Rocket resting on its roof returns behind the last credited gate once',()=>{
  const race=grid();race.phase='racing';
  const e=race.player,road=orbital.frame(37,4);
  const body=createRocketBody(road);
  body.orientation=[0,0,1,0]; // Roof down on the flat opening deck.
  body.position=add(road.point,scale(road.normal,.90));
  e.vehicle=e.previousBody=body;
  e.distance=37;e.nextGate=1;e.safeDistance=-2;
  let restingTicks=0;
  for(let i=0;i<360 && !e.recoveries;i++) {
    stepRocketRace(race,NEUTRAL_ROCKET);
    if(e.deckContact && e.overturnedTicks) {
      restingTicks++;
      assert(e.current.y>=road.point[1]);
    }
  }
  assert(restingTicks>=89);
  assert.equal(e.recoveries,1);
  assert.equal(e.elapsedTicks,race.elapsedTicks+180);
  assert(e.distance<=-2 && !e.deckContact && e.overturnedTicks===0);
  assert.equal(e.recoveryCooldown,120);
  assert.equal(e.nextGate,1);
  assert.deepEqual(e.splitTicks,[]);
});

test('an airborne rival may spend a directional dodge only into a clear landing lane',()=>{
  const gap=orbital.sections.find(s=>s.kind==='air'),r=grid();
  const ai=r.entrants[0],f=orbital.frame(gap.start-5,-3);
  let body=createRocketBody(f);body.velocity=scale(f.tangent,35);
  for(let i=0;i<90 && body.airTicks<8;i++) body=stepRocketBody(body,held,orbital.surface);
  assert.equal(body.airTicks,8);
  ai.vehicle=body;ai.distance=orbital.projectNear(body.position,gap.start).station;ai.current.lateral=-3;
  const right=rotate(body.orientation,[1,0,0]),forward=rotate(body.orientation,[0,0,-1]);
  const second={...r.entrants[1],distance:ai.distance+3,current:{lateral:-2},
    vehicle:{...body,position:add(body.position,add(scale(forward,3),right)),velocity:scale(body.velocity,.8)}};
  assert.equal(planRocketCommand(ai,[ai]).dodge,0);
  const choice=planRocketCommand(ai,[ai,second]);
  assert.equal(choice.dodge,-1);
  const moved=stepRocketBody(body,choice,orbital.surface);
  assert.equal(moved.dodgeApplied,-1);
  assert(moved.energy<body.energy && dot(subtract(moved.velocity,body.velocity),right)<-3.8);
  const blocker={...r.entrants[2],distance:ai.distance+2,current:{lateral:-7},vehicle:{...body,position:subtract(body.position,scale(right,4))}};
  assert.equal(planRocketCommand(ai,[ai,second,blocker]).dodge,0);
});
