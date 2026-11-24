// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrial,startTrial,stepTrial,scenarios} from '../src/crash-trial.js';
const gas={throttle:1,brake:0,steer:0};
for(const scenario of Object.keys(scenarios))test(scenario+' reaches a real target and resets exactly',()=>{
  function run(){
    const t=createTrial(scenario);startTrial(t);
    while(t.phase==='running')stepTrial(t,gas);
    assert(t.firstImpact>0);assert(!['solver limit','time limit','missed fixture'].includes(t.result));
    const hit=t.contacts[0];assert.equal(hit.sites[0].zone,scenario==='glancing'?'right':'front');
    assert.equal(hit.sites.length,scenario==='opposing'?2:1);
    assert(t.world.cars.every(car=>Object.values(car.damage).some(v=>v>0)));
    assert.throws(()=>stepTrial(t,gas));return t;
  }
  assert.deepEqual(run(),run());
});
test('a stationary no-contact trial ends at its time limit undamaged',()=>{
  const t=createTrial('wall');startTrial(t);while(!t.result)stepTrial(t,{...gas,throttle:0});
  assert.equal(t.world.tick,3600);assert.equal(t.result,'time limit');assert.deepEqual(t.contacts,[]);
});
