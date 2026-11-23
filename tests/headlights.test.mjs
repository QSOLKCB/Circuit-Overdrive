// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { BEAM, headlightSource, selectHeadlights } from '../src/headlights.js';
import { bodyTransform } from '../src/touring-car.js';

const car=Object.freeze({id:5,x:0,y:1,z:0,yaw:0,roll:0,pitch:0});
test('photometric centre and dipped axis use the chassis matrix on slopes and banks',()=>{
  for(const pose of [car,{...car,x:-92,y:15,z:700,yaw:1.25,pitch:.13,roll:-.21}]) {
    const m=bodyTransform(pose), light=headlightSource(pose);
    for(let k=0;k<3;k++) {
      assert.ok(Math.abs(light.position[k]-(m[12+k]+m[4+k]*.60-m[8+k]*2.18))<1e-10);
      assert.ok(Math.abs(light.direction[k]-(-m[8+k]-.055*m[4+k])/Math.hypot(1,.055))<1e-10);
    }
    assert.ok(Math.abs(Math.hypot(...light.direction)-1)<1e-12);
  }
  assert.ok(headlightSource(car).direction[2]<-.99);
  assert.ok(headlightSource({...car,yaw:Math.PI/2}).direction[0]<-.99);
});

test('invalid/unbounded transforms contribute no light',()=>{
  for(const key of ['x','y','z','yaw','roll','pitch']) for(const invalid of [NaN,Infinity,undefined,'0']) {
    assert.equal(headlightSource({...car,[key]:invalid}),null);
  }
  assert.deepEqual(selectHeadlights([car],{...car,x:10001},false,false),[]);
});

test('full quality selects the closest racing rival with stable field order; reduced keeps focus',()=>{
  const near={...car,id:0,x:12},equal={...near,id:1},invalid={...car,id:2,pitch:NaN};
  const far={...near,id:3,x:BEAM.rivalDistance+.1},done={...car,id:4,finished:true};
  const field=[near,equal,invalid,far,done,car];
  const expected=[headlightSource(car),headlightSource(near)];
  assert.equal(BEAM.maxSources,2);
  assert.deepEqual(selectHeadlights(field,done,false,false),[]);
  assert.deepEqual(selectHeadlights([],car,false,false),[]);
  assert.deepEqual(selectHeadlights(field,car,false,false),expected);
  for(const [reduced,menu] of [[true,false],[false,true]]) {
    assert.deepEqual(selectHeadlights(field,car,reduced,menu),expected.slice(0,1));
  }
  assert.deepEqual(selectHeadlights([car,far,done],car,false,false),expected.slice(0,1));
  assert.throws(()=>selectHeadlights([...field,car],car,false,false),/six-car/);
});

test('headlamp calibration fits the finite view range and cone',()=>{
  assert.ok(Object.isFrozen(BEAM));
  assert.ok(BEAM.range>30 && BEAM.range<=80);
  assert.ok(BEAM.outer>0 && BEAM.outer<BEAM.inner && BEAM.inner<1);
  assert.ok(BEAM.linear>0 && BEAM.quadratic>0);
});
