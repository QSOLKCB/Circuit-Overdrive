// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {rotate} from '../vendor/vanillajs/modules/math/index.js';
import {orbital} from '../src/orbital.js';
import {createRocketBody, stepRocketBody, validateRocketCommand, NEUTRAL_ROCKET, ROCKET_LIMITS} from '../src/rocket-dynamics.js';

const dt = 1 / 60;
const gravity = 9.81;
const speed = vector => Math.hypot(...vector);
const dot = (a,b) => a.reduce((sum, value, i) => sum + value*b[i], 0);
const difference = (a,b) => a.map((value,i) => value-b[i]);
const emptySpace = {probe:() => null};
const floor = {id:'floor',point:[0,0,0],normal:[0,1,0],tangent:[0,0,-1],lateral:[1,0,0]};
const wall = {id:'wall',point:[3,0,0],normal:[1,0,0],tangent:[0,0,-1],lateral:[0,-1,0]};
const ceiling = {id:'ceiling',point:[0,18,0],normal:[0,-1,0],tangent:[0,0,-1],lateral:[-1,0,0]};

// Finite, one-sided ray/plane intersection. The test planes have no dependency
// on the route fixture's curved segments, station search or physics admission.
function plane(frame, {end=200, material='magnetic'}={}) {
  const spawn = {...frame, station:0, offset:0, material};
  return {spawn,probe(origin,direction,reach) {
    const alongNormal = dot(direction,frame.normal);
    if (alongNormal >= -1e-9) return null;
    const distance = dot(difference(frame.point,origin),frame.normal) / alongNormal;
    if (distance < 0 || distance > reach) return null;
    const point = origin.map((value,i) => value + direction[i]*distance);
    const delta = difference(point,frame.point);
    const station = dot(delta,frame.tangent), offset = dot(delta,frame.lateral);
    if (station < -80 || station > end || Math.abs(offset)>30) return null;
    return {...spawn, point, distance, station, offset};
  }};
}

function moving(surface, velocity=22) {
  const state = createRocketBody(surface.spawn);
  state.velocity = surface.spawn.tangent.map(component => component*velocity);
  return state;
}
function advance(state, surface, ticks, change={}) {
  const command = {...NEUTRAL_ROCKET,...change};
  for (let i=0; i<ticks; i++) state=stepRocketBody(state,command,surface);
  return state;
}
function near(actual,expected,tolerance=1e-8) {
  assert.ok(Math.abs(actual-expected)<=tolerance,`expected ${actual} within ${tolerance} of ${expected}`);
}
function normalClearance(body,frame) {
  return dot(difference(body.position,frame.point),frame.normal);
}
function speedBounds(state) {
  assert(state.position.every(Number.isFinite));
  assert(state.velocity.every(Number.isFinite));
  assert(state.angularVelocity.every(Number.isFinite));
  assert(speed(state.velocity)<=75+1e-8);
  assert(speed(state.angularVelocity)<=6+1e-8);
  near(speed(state.orientation),1);
  assert(state.energy>=0 && state.energy<=100);
}

test('invalid commands, contact normals and handedness fail without advancing the previous body',()=>{
  const surface=plane(floor), body=moving(surface), before=structuredClone(body);
  for (const command of [null,{}, {...NEUTRAL_ROCKET,throttle:NaN}, {...NEUTRAL_ROCKET,brake:-1},
    {...NEUTRAL_ROCKET,steer:Infinity}, {...NEUTRAL_ROCKET,boost:1}, {...NEUTRAL_ROCKET,assist:1},
    {...NEUTRAL_ROCKET,dodge:2}, {...NEUTRAL_ROCKET,dodge:-.5}, {...NEUTRAL_ROCKET,extra:0}]) {
    assert.throws(()=>validateRocketCommand(command));
    assert.throws(()=>stepRocketBody(body,command,surface));
    assert.deepEqual(body,before);
  }
  let getterCalls=0;
  const accessor={...NEUTRAL_ROCKET};
  Object.defineProperty(accessor,'steer',{get(){getterCalls++; return 1;}});
  assert.throws(()=>stepRocketBody(body,accessor,surface));
  assert.equal(getterCalls,0);
  for (const changes of [{normal:[0,2,0]},{normal:[0,0,0]},{lateral:[-1,0,0]},
    {tangent:[0,1,0]}, {point:[NaN,0,0]}]) {
    assert.throws(()=>createRocketBody({...surface.spawn,...changes}));
    let rays=0;
    const corrupt={probe(...args){const hit=surface.probe(...args); return hit && ++rays===3 ? {...hit,...changes} : hit;}};
    assert.throws(()=>stepRocketBody(body,NEUTRAL_ROCKET,corrupt));
    assert.deepEqual(body,before);
  }
});

test('a flat suspension bears weight and steering changes the actual travel direction',()=>{
  const surface=plane(floor), parked=advance(moving(surface,0),surface,120);
  assert(!parked.attached);
  assert(parked.grounded && parked.wheels.every(w=>w.contact && w.load>0));
  assert(normalClearance(parked,floor)>.2 && normalClearance(parked,floor)<1.2);
  assert(speed(parked.velocity)<.1);
  const before=moving(surface), acceleration={throttle:.5};
  const straight=advance(before,surface,30,acceleration);
  const right=advance(before,surface,30,{...acceleration,steer:1});
  const left=advance(before,surface,30,{...acceleration,steer:-1});
  assert(right.position[0]>straight.position[0]+.04 && left.position[0]<straight.position[0]-.04);
  assert(right.velocity[0]>.15 && left.velocity[0]<-.15);
  assert(right.angularVelocity[1]<0 && left.angularVelocity[1]>0);
  const stopped=advance(before,surface,30,{brake:1});
  assert(speed(stopped.velocity)<speed(straight.velocity)-1);
});

test('a full-lock start correction stays on its tyres and settles after release with either assist setting',()=>{
  const surface=plane(floor);
  for(const assist of [false,true]) for(const direction of [-1,1]) {
    let body=moving(surface,0);
    for(let tick=1;tick<=150;tick++) {
      const steer=tick>=60 && tick<100 ? direction : 0;
      body=advance(body,surface,1,{throttle:1,steer,assist});
      assert(body.wheels.every(w=>w.contact && w.load>0),'inside and outside tyres must stay loaded');
      assert(dot(rotate(body.orientation,[0,1,0]),floor.normal)>.95,'sustained steering must not roll the chassis over');
      if(tick===99) {
        assert(body.position[0]*direction>2,'the correction must change lanes under power');
        assert(body.angularVelocity[1]*direction<-.3,'the car must actually turn');
      }
    }
    assert(Math.abs(body.angularVelocity[1])<.1,'residual yaw must decay when the driver centres steering');
    assert(dot(rotate(body.orientation,[0,0,-1]),floor.tangent)>.5,'the car still faces down the road');
    assert(body.velocity[2]<-18);
  }
});

test('wall and ceiling magnetism exert an inward force only while the surface is supported',()=>{
  for(const frame of [wall,ceiling]) {
    const surface=plane(frame), start=moving(surface), held={assist:true,throttle:.35};
    let body=start;
    for(let i=0;i<60;i++) {
      const previous=body;
      body=advance(body,surface,1,held);
      speedBounds(body);
      assert(speed(difference(body.position,previous.position))<=Math.max(speed(body.velocity),speed(previous.velocity))*dt+.015);
      if(i<6) continue;
      const loaded=body.wheels.filter(w=>w.contact && w.load>0);
      assert(loaded.length>=2 && body.attached);
      assert(normalClearance(body,frame)>.2 && normalClearance(body,frame)<1.2);
      for(const wheel of loaded) {
        assert.equal(wheel.frame.id,frame.id);
        near(dot(difference(wheel.frame.point,frame.point),frame.normal),0,1e-6);
      }
      const [x,y,z,w]=body.orientation;
      const bodyUp=[2*(x*y-z*w),1-2*(x*x+z*z),2*(y*z+x*w)];
      assert(dot(bodyUp,frame.normal)>.92);
      assert(dot(body.adhesionAcceleration,frame.normal)<-gravity);
    }
    const released=advance(body,surface,1);
    assert(!released.attached);
    near(speed(released.adhesionAcceleration),0);
    if(frame===ceiling) {
      const off=advance(body,surface,45), on=advance(body,surface,45,held);
      assert(!off.grounded && !off.attached);
      assert(off.position[1]<on.position[1]-1.7 && off.velocity[1]<-4);
      assert(on.grounded && on.attached);
      const tooSlow=advance(moving(surface,2),surface,20,{assist:true});
      assert(!tooSlow.attached);
    }
  }
});

test('crossing the end of the ceiling removes support and free flight accelerates downward',()=>{
  const finite=plane(ceiling,{end:10}), held={assist:true};
  let body=moving(finite), wasAttached=false, flight=0;
  for(let i=0;i<110;i++) {
    const previous=body;
    body=advance(body,finite,1,held);
    wasAttached ||= body.attached;
    if(body.position[2]>-13 || previous.wheels.some(w=>w.contact)) continue;
    assert(body.wheels.every(w=>!w.contact));
    assert(!body.attached && !body.grounded);
    near(speed(body.adhesionAcceleration),0);
    assert(body.velocity[1]<previous.velocity[1]-.11);
    flight++;
  }
  assert(wasAttached && flight>=12);
  assert(normalClearance(body,ceiling)>2);
});

test('distant, ineligible and back-facing deck surfaces cannot provide magnetic support',()=>{
  const ordinary=plane(ceiling,{material:'ordinary'});
  const held={assist:true};
  let body=moving(ordinary), contact=false;
  for(let i=0;i<40;i++) {
    body=advance(body,ordinary,1,held);
    contact ||= body.wheels.some(w=>w.contact);
    assert(!body.attached);
    near(speed(body.adhesionAcceleration),0);
  }
  assert(contact && normalClearance(body,ceiling)>1.2);
  const floorSurface=plane(floor), remote=moving(floorSurface,22);
  remote.position[1]+=15;
  const nearby=advance(remote,floorSurface,1,held), absent=advance(remote,emptySpace,1,held);
  assert.deepEqual(nearby,absent);
  const backFacing=plane({...ceiling,point:[0,-1,0]});
  assert.deepEqual(advance(moving(floorSurface),backFacing,1,held),advance(moving(floorSurface),emptySpace,1,held));
  const outsideReach={probe(origin,dir,reach){
    const distance=reach+3;
    return {...floorSurface.spawn,distance,point:origin.map((x,i)=>x+distance*dir[i])};
  }};
  assert.throws(()=>advance(remote,outsideReach,1,held));
});

test('dodge applies one signed body-relative velocity impulse per released, eligible edge',()=>{
  for(const frame of [floor,ceiling]) {
    const surface=plane(frame);
    const flight=advance(moving(surface,0),emptySpace,5), before=structuredClone(flight);
    const coast=advance(flight,emptySpace,1);
    for(const direction of [-1,1]) {
      const hit=advance(flight,emptySpace,1,{dodge:direction});
      assert.deepEqual(flight,before);
      assert.equal(hit.dodgeApplied,direction);
      const impulse=difference(hit.velocity,coast.velocity);
      assert(direction*dot(impulse,frame.lateral)>3.9);
      assert(speed(impulse)<=4.000001);
      assert(speed(difference(hit.position,coast.position))<=4*dt+1e-6);
      assert(hit.position[1]<flight.position[1]);
      near(hit.energy,coast.energy-12);
      const release=advance(hit,emptySpace,1), early=advance(release,emptySpace,1,{dodge:-direction});
      assert.equal(early.dodgeApplied,0);
      let held=early;
      for(let i=0;i<75;i++) {
        held=advance(held,emptySpace,1,{dodge:-direction});
        assert.equal(held.dodgeApplied,0);
        near(held.energy,hit.energy);
      }
      const rearmed=advance(held,emptySpace,1), second=advance(rearmed,emptySpace,1,{dodge:-direction});
      assert.equal(second.dodgeApplied,-direction);
      near(second.energy,hit.energy-12);
      const empty={...flight,energy:0};
      const denied=advance(empty,emptySpace,1,{dodge:direction});
      assert.equal(denied.dodgeApplied,0);
      near(denied.energy,0);
    }
  }
  const flat=plane(floor), grounded=advance(moving(flat),flat,6);
  assert(grounded.grounded);
  const denied=advance(grounded,flat,1,{dodge:1});
  assert.equal(denied.dodgeApplied,0);
});

test('unsupported steering with assistance changes angular momentum while gravity still governs flight',()=>{
  const surface=plane(floor), start=advance(moving(surface,0),emptySpace,5);
  const left=advance(start,emptySpace,20,{assist:true,steer:-1});
  const right=advance(start,emptySpace,20,{assist:true,steer:1});
  const coast=advance(start,emptySpace,20);
  assert(speed(difference(right.angularVelocity,left.angularVelocity))>.25);
  assert(Math.abs(dot(right.orientation,coast.orientation))<.99999);
  for(const state of [left,right,coast]) {
    speedBounds(state);
    near(speed(difference(state.velocity,coast.velocity)),0,1e-7);
    assert(state.velocity[1]<-3.7 && state.position[1]<start.position[1]-.6);
    assert(!state.attached && !state.grounded);
  }
});

test('a hard landing settles without penetration, unbounded energy or a velocity spike',()=>{
  const surface=plane(floor), body=moving(surface,0);
  body.position[1]+=1.25;
  body.velocity=[2,-10,-8];
  const startHeight=body.position[1], startMechanical=.5*dot(body.velocity,body.velocity)+gravity*startHeight;
  let state=body, supported=false;
  for(let i=0;i<210;i++) {
    state=advance(state,surface,1);
    speedBounds(state);
    // Project the four physical mounts onto world Y from the integrated
    // quaternion. Every mount must remain outside the 0.24 m tyre end stop.
    const [x,y,z,w]=state.orientation;
    const rightY=2*(x*y+z*w), upY=1-2*(x*x+z*z), rearY=2*(y*z-x*w);
    const lowestMount=state.position[1]-.79*Math.abs(rightY)-.14*upY-1.29*Math.abs(rearY);
    assert(lowestMount>=(.24-.003)*upY);
    assert(state.wheels.every(w=>w.load>=0 && w.load<=1100*145/4 && w.compression>=0));
    assert(.5*dot(state.velocity,state.velocity)+gravity*state.position[1]<startMechanical+2);
    supported ||= state.wheels.filter(w=>w.contact && w.load>0).length>=2;
  }
  assert(supported && state.grounded);
  assert(Math.abs(state.velocity[1])<.08);
  assert(normalClearance(state,floor)>.2 && normalClearance(state,floor)<1.2);
  assert.equal(ROCKET_LIMITS.maxSpeed,75);
  assert.equal(ROCKET_LIMITS.maxAngularSpeed,6);
});

test('the Crown exit keeps bounded magnetic pull through unloaded suspension at racing speed',()=>{
  let station=460, unloadedTicks=0;
  const opening=orbital.frame(station,4);
  const spine=orbital.sections.find(section=>section.id==='inverted-spine');
  let body=createRocketBody(opening);
  body.velocity=opening.tangent.map(component=>component*74);
  for(let tick=0; tick<170 && station<spine.start+100; tick++) {
    body=advance(body,orbital.surface,1,{assist:true,throttle:1});
    const road=orbital.projectNear(body.position,station);
    station=road.station;
    speedBounds(body);
    if(road.id!==spine.id) continue;
    assert(body.attached, `Assist lost at ${station} m with a continuous deck`);
    assert(normalClearance(body,road)<.9);
    if(body.wheels.every(wheel=>wheel.load===0)) {
      unloadedTicks++;
      assert(body.wheels.filter(wheel=>wheel.distance!==null).length>=2);
      near(speed(body.adhesionAcceleration),ROCKET_LIMITS.adhesion);
    }
  }
  assert(station>=spine.start+100);
  assert(unloadedTicks>=2, 'exercise the spring unload that dropped adhesion');
  assert(body.wheels.every(wheel=>wheel.contact && wheel.load>0));
});

test('a short magnetic gap cannot sustain a prior attached state or reacquire a distant face',()=>{
  const deck=plane(ceiling), attached=advance(moving(deck),deck,12,{assist:true});
  assert(attached.attached);
  // A change in the deck level puts every ray just beyond suspension travel,
  // but within the probe band. Wheel frames from the prior tick are still present.
  const away=.68-attached.wheels[0].distance;
  const recessed=plane({...ceiling,point:ceiling.point.map((p,i)=>p-away*ceiling.normal[i])});
  const released=advance(attached,recessed,1,{assist:true});
  assert(released.wheels.every(w=>!w.contact && w.load===0));
  assert(!released.attached && !released.grounded);
  near(speed(released.adhesionAcceleration),0);
  near(released.velocity[1]-attached.velocity[1],-gravity*dt,1e-7);
  const narrow={probe(...args){
    const hit=deck.probe(...args);
    if(!hit) return null;
    const relative=difference(hit.point,attached.position);
    return dot(relative,ceiling.lateral)>0 && dot(relative,ceiling.tangent)>.6 ? hit : null;
  }};
  const one=advance(attached,narrow,1,{assist:true});
  assert.equal(one.wheels.filter(w=>w.contact).length,1);
  assert(!one.attached);
  near(speed(one.adhesionAcceleration),0);
});

test('vacuum gravity is invariant to upside-down orientation and a gap leaves horizontal momentum intact',()=>{
  for (const frame of [floor,wall,ceiling]) {
    const start=moving(plane(frame)), initialVelocity=[2,-1,-12];
    start.position=[3,102,5];
    start.velocity=initialVelocity.slice();
    const t=.5, state=advance(start,emptySpace,30,{assist:true});
    near(state.velocity[0],2); near(state.velocity[1],-1-gravity*t); near(state.velocity[2],-12);
    near(state.position[0],start.position[0]+2*t); near(state.position[2],start.position[2]-12*t);
    near(state.position[1],start.position[1]-t-.5*gravity*t*t,.015);
    assert.equal(state.airTicks,30);
    assert(!state.attached && !state.grounded);
  }
});

test('boost adds finite forward thrust, pays for partial delivery and stops at depletion and cut-off',()=>{
  const start=moving(plane(floor),10), off=advance(start,emptySpace,1);
  const boost={boost:true};
  for (const fuel of [100,.12,0]) {
    const boosted=advance({...start,energy:fuel},emptySpace,1,boost);
    const spent=Math.min(fuel,18*dt);
    near(fuel-boosted.energy,spent);
    near(off.velocity[2]-boosted.velocity[2],13*spent/18);
    near(boosted.velocity[1],off.velocity[1]);
    assert(boosted.energy>=0 && boosted.energy<=100);
    const braking=advance({...start,energy:fuel},emptySpace,1,{...boost,brake:1});
    near(braking.energy,fuel);
    assert.deepEqual(braking.velocity,off.velocity);
  }
  const fast={...start,velocity:[0,0,-66]};
  const rejected=advance(fast,emptySpace,1,boost);
  assert.equal(rejected.energy,fast.energy);
  assert.deepEqual(rejected.velocity,advance(fast,emptySpace,1).velocity);
});

test('assisted pitch trim and angular damping change physical spin without any translational lift',()=>{
  const start=moving(plane(floor),0);
  const noseUp=advance(start,emptySpace,24,{assist:true,throttle:1});
  const noseDown=advance(start,emptySpace,24,{assist:true,brake:1});
  assert(noseUp.angularVelocity[0]>.05 && noseDown.angularVelocity[0]<-.05);
  assert(Math.abs(dot(noseUp.orientation,noseDown.orientation))<.99995);
  assert.deepEqual(noseUp.velocity,noseDown.velocity);
  near(noseUp.velocity[1],-gravity*24*dt);
  const rotating={...start,angularVelocity:[1,-.4,.8]};
  const damped=advance(rotating,emptySpace,30,{assist:true}), unassisted=advance(rotating,emptySpace,30);
  assert(speed(damped.angularVelocity)<speed(unassisted.angularVelocity)-.05);
  assert.deepEqual(damped.velocity,unassisted.velocity);
});

test('gravity and commanded torque reach the hard limits without overshoot or orientation drift',()=>{
  const surface=plane(floor), start=moving(surface), command={assist:true,steer:1};
  let state={...start,position:[0,250,0],velocity:[0,-74.8,0],angularVelocity:[0,-6,0]};
  let reachedSpeed=false;
  for(let tick=0;tick<120;tick++) {
    const previous=state;
    state=advance(state,emptySpace,1,command);
    speedBounds(state);
    reachedSpeed ||= speed(state.velocity)>74.999;
    assert(speed(difference(state.position,previous.position))<=75*dt+1e-8);
    const angle=2*Math.acos(Math.min(1,Math.abs(dot(previous.orientation,state.orientation))));
    assert(angle<=6*dt+1e-7);
  }
  assert(reachedSpeed);
  for(const change of [{orientation:[0,0,0,0]}, {velocity:[75,.01,0]}, {angularVelocity:[6,0,.01]},
    {position:[NaN,0,0]}, {energy:-.01},{energy:100.01}]) {
    const bad={...start,...change}, before=structuredClone(bad);
    assert.throws(()=>advance(bad,emptySpace,1));
    assert.deepEqual(bad,before);
  }
});

test('approach assist levels a tilted vehicle only near a closing surface, through torque',()=>{
  const deck=plane(floor), start=moving(deck,0), roll=.025;
  start.orientation=[0,0,Math.sin(roll/2),Math.cos(roll/2)];
  start.position=[0,.82,0];
  start.velocity=[0,-.35,-2];
  const command={assist:true};
  const approach=advance(start,deck,1,command), vacuum=advance(start,emptySpace,1,command);
  const escaping=advance({...start,velocity:[0,1,-2]},deck,1,command);
  assert(!approach.grounded && !approach.attached);
  assert(approach.wheels.some(w=>w.distance!==null) && approach.wheels.every(w=>w.load===0));
  assert(approach.angularVelocity[2]<-.0001);
  near(speed(vacuum.angularVelocity),0);
  near(speed(escaping.angularVelocity),0);
  assert.deepEqual(approach.velocity,vacuum.velocity);
  assert.deepEqual(approach.position,vacuum.position);
});

test('wheel contacts own their solver evidence when a surface reuses its result and point storage',()=>{
  const deck=plane(floor), body=moving(deck);
  const scratch={...deck.spawn,point:[0,0,0]};
  let calls=0;
  const reuse={probe(...args){
    calls++;
    const hit=deck.probe(...args);
    if(!hit) return null;
    for(let i=0;i<3;i++) scratch.point[i]=hit.point[i];
    scratch.distance=hit.distance;
    scratch.station=hit.station;
    scratch.offset=hit.offset;
    return scratch;
  }};
  const measured=advance(body,reuse,1), expected=advance(body,deck,1);
  assert.equal(calls,16);
  scratch.point.fill(100);
  scratch.id='changed';
  assert.deepEqual(measured,expected);
  assert.equal(new Set(measured.wheels.map(w=>w.frame.point.join(','))).size,4);
});

test('75 m/s level and rolled flat-plane landings respect the measured end-stop tolerance',()=>{
  const deck=plane(floor);
  for(const [degrees,tolerance] of [[0,1e-8],[5,.010]]) {
    const roll=degrees*Math.PI/180, start=moving(deck,0);
    start.orientation=[0,0,Math.sin(roll/2),Math.cos(roll/2)];
    // Start with the lowest mount 0.96 m along its downward ray from the
    // plane. The roll changes the mount height across the 1.58 m axle.
    start.position[1]=(.96+.14)*Math.cos(roll)+.79*Math.abs(Math.sin(roll));
    start.velocity=[0,-75,0];
    let probes=0, shortestRay=Infinity;
    const measured={probe(origin,direction,reach,hint){
      // Observe all four mount positions immediately before each 1/240 s step.
      assert(-direction[1]>.4 && origin[1]>0,'a mount crossed the plane or left its front face');
      shortestRay=Math.min(shortestRay,origin[1]/-direction[1]);
      probes++;
      return deck.probe(origin,direction,reach,hint);
    }};
    const settled=advance(start,measured,120);
    assert.equal(probes,120*4*4);
    assert(shortestRay<.25,'the landing must exercise the physical end stop');
    assert(shortestRay>=.24-tolerance,`${degrees}° landing exceeded its ${tolerance} m tolerance`);
    assert(settled.wheels.every(w=>w.contact && w.load>0));
    assert(speed(settled.velocity)<.010);
  }
});
