// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {crashBarrier,crashCar} from '../src/crash-impact.js';
import {damageWorld,driveLabCar,newDamage,resolveLabTick,labCondition,neutralLab} from '../src/crash-damage.js';

const fixture=crashBarrier(9,-12,0,12,0,.1);
function strike(speed=30,yaw=0) {
  const car=crashCar(0,{z:2.30,vz:-speed,yaw});
  const world=damageWorld([car],[fixture]);
  return {car,world,contacts:resolveLabTick(world).contacts};
}
test('damage ledger equals accepted per-site changes and gentle contact costs zero',()=>{
  const low=strike(.1);assert.equal(low.contacts.length,1);assert.deepEqual(low.car.damage,newDamage());
  const {car,contacts,world}=strike();const [hit]=contacts;
  assert.equal(hit.sites[0].zone,'front');assert(car.damage.engine>0);
  assert.deepEqual(car.damage,{...newDamage(),...hit.sites[0].damage});
  const before={...car.damage};
  for(let i=0;i<20;i++) {driveLabCar(car,neutralLab);resolveLabTick(world);}
  assert.deepEqual(car.damage,before);
  const rear=strike(30,Math.PI);
  assert(rear.car.damage.rear>0);assert.equal(rear.car.damage.steering,0);
  assert.deepEqual(strike().car.damage,before);
});
test('continuing physical constraint cannot charge again before separation',()=>{
  const {car,world}=strike(),first={...car.damage};
  car.vz=-12; car.z=2.305;
  const {contacts}=resolveLabTick(world);
  assert(contacts.length);assert.equal(contacts[0].newImpact,false);
  assert.deepEqual(contacts[0].sites[0].damage,{});assert.deepEqual(car.damage,first);
  car.z+=.5;car.vz=0;resolveLabTick(world);
  car.vz=-60;assert(resolveLabTick(world).contacts[0].newImpact);
  assert(car.damage.front>first.front);assert(car.damage.front<=1000);
});
test('engine, steering, tyre grip and damping each change a measured driving state',()=>{
  function drive(part) {
    const car=crashCar(0,{vx:6,vz:-12,spin:.2});car.damage=newDamage();
    if(part)car.damage[part]=700;
    driveLabCar(car,{throttle:1,brake:0,steer:1});return car;
  }
  const base=drive();
  assert(drive('engine').vz>base.vz);assert(drive('steering').spin>base.spin);
  assert(drive('tyres').vx>base.vx);assert(drive('suspension').spin>base.spin);
  const hit=strike().car, pristine=crashCar(1);
  pristine.damage=newDamage();Object.assign(hit,{vx:0,vz:0,spin:0});
  const gas={...neutralLab,throttle:1};
  for(let i=0;i<60;i++){driveLabCar(hit,gas);driveLabCar(pristine,gas);}
  assert(-hit.vz < -pristine.vz*.9);assert.deepEqual(pristine.damage,newDamage());
});
test('bounded state rejects invalid values and fresh runs are pristine',()=>{
  for(const v of [NaN,1001,-1,.5])assert.throws(()=>labCondition({...newDamage(),tyres:v}));
  assert.throws(()=>labCondition({...newDamage(),extra:1}));
  assert(labCondition({...newDamage(),engine:1000}).disabled);
  const w=damageWorld([crashCar(0)],[]);
  for(let i=0;i<60;i++){driveLabCar(w.cars[0],neutralLab);assert.equal(resolveLabTick(w).contacts.length,0);}
  assert.deepEqual(w.cars[0].damage,newDamage());
});
