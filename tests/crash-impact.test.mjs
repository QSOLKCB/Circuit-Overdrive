// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {crashCar,crashBarrier,impactWorld,stepImpacts,kinetic,labRecipe} from '../src/crash-impact.js';

const wall=crashBarrier(80,-8,0,8,0,.01);
const close=(actual,expected,tolerance=1e-7)=>assert(Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`);
test('central wall impulse has the analytic SI response and a source-bound witness',()=>{
  const car=crashCar(1,{z:3,vz:-100}), w=impactWorld([car],[wall],'a'.repeat(40));
  const {contacts,stats}=stepImpacts(w);
  assert.equal(stats.limited,false); assert.equal(contacts.length,1);
  const [hit]=contacts;
  close(hit.closing,100); close(hit.normalImpulse,136800); close(hit.normalEnergy,6000000);
  close(hit.postKinetic,117600); close(car.vz,14); close(hit.point[1],.01);
  assert.deepEqual(hit.sites.map(s=>s.zone),['front']); assert.equal(hit.revision,w.revision);
  assert.deepEqual(hit.participants,[1,80]); assert.equal(hit.rules,1); close(hit.tangentialImpulse,0);
  assert.equal(stepImpacts(w).contacts.length,0);
});
test('a complete sideways crossing of a 10 mm plate in one free tick is intercepted',()=>{
  const car=crashCar(2,{x:1,vx:-120});
  const plate=crashBarrier(81,0,-10,0,10,.005,'steel');
  const {contacts}=stepImpacts(impactWorld([car],[plate]));
  assert(1-120/60 < -(.975+.005)); assert(contacts.length>0); assert(car.x>0);
  for(const hit of contacts) assert(hit.preKinetic+1e-7>=hit.postKinetic);
});
test('moving chassis share equal and opposite impulses in stable ID order',()=>{
  function run(reverse){
    const cars=[crashCar(3,{z:2.7,vz:-60}),crashCar(7,{z:-2.7,yaw:Math.PI,vz:55})];
    const w=impactWorld(reverse ? cars.reverse() : cars);
    const rows=stepImpacts(w).contacts;
    close(rows[0].effectiveMass,labRecipe.mass/2); close(rows[0].closing,115);
    close(w.cars[0].vz+w.cars[1].vz,-5);
    assert(w.cars[0].vz>w.cars[1].vz); assert.equal(rows.length,1);
    return [w.cars,rows];
  }
  assert.deepEqual(run(true),run(false));
});
test('rest, separation, co-motion and ambiguous initial overlap do not create impacts',()=>{
  for(const vz of [0,1,1e-9]){
    const a=crashCar(0,{z:2.21,vz});
    assert.deepEqual(stepImpacts(impactWorld([a],[wall])).contacts,[]);
  }
  const cars=[crashCar(0,{vz:40}),crashCar(1,{z:5,vz:40})];
  assert.deepEqual(stepImpacts(impactWorld(cars)).contacts,[]);
  const a=crashCar(0,{z:2.01}); const w=impactWorld([a],[wall]);
  assert.equal(stepImpacts(w).stats.limited,false); assert(a.z>=2.21); assert.equal(kinetic(a),0);
});
test('oblique and rotating contact account for friction and yaw inertia',()=>{
  const a=crashCar(0,{x:0,z:2.4,vx:23,vz:-40,yaw:.37,spin:.8});
  const w=impactWorld([a],[wall]),initial=kinetic(a);
  const hits=stepImpacts(w).contacts;
  assert(hits.length && hits[0].effectiveMass<labRecipe.mass);
  assert(Math.abs(hits[0].tangentialImpulse)>0); assert(kinetic(a)<=initial); assert.notEqual(a.spin,.8);
  close(hits[0].dissipated,hits[0].preKinetic-hits[0].postKinetic);
});
test('fixture identities, finite launches and field size are bounded',()=>{
  assert.throws(()=>impactWorld([crashCar(80)],[wall])); assert.throws(()=>crashCar(1,{vx:Infinity}));
  assert.throws(()=>crashCar(1,{spin:13})); assert.throws(()=>crashBarrier(1,0,0,0,0,.2));
});
