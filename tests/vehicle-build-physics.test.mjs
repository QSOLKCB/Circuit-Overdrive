// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import {GARAGE_CATALOG} from '../src/garage-catalog.js';
import {measureStockVehicle,STOCK_TEST_RULES} from './vehicle-build-driver.mjs';

const receipts=[];
for(const {modelId} of GARAGE_CATALOG){
  test(modelId+' independently spawns, supports its weight, accelerates, shifts, brakes and steers',()=>{
    const receipt=measureStockVehicle(modelId);
    receipts.push(receipt);
    assert.deepEqual(measureStockVehicle(modelId),receipt,'same-runtime commands reproduce all physical receipts');
    assert.equal(receipt.acceleration.completed,true,'reach 100 km/h within the declared 25 s limit');
    assert(receipt.acceleration.crossing.elapsedSeconds>1);
    assert(receipt.acceleration.crossing.previousSpeedMps<100/3.6);
    assert(receipt.acceleration.crossing.nextSpeedMps>=100/3.6);
    assert(receipt.acceleration.crossing.fraction>=0 && receipt.acceleration.crossing.fraction<=1);
    assert(receipt.acceleration.shifts.length>0,'the accepted gearbox actually shifts under load');
    assert(receipt.acceleration.terminal.position[2]<-30,'physical forward displacement accompanies acceleration');
    assert(receipt.braking.completed,'accepted brake commands stop the vehicle');
    assert(receipt.braking.distanceM>5 && receipt.braking.distanceM<150);
    assert(receipt.braking.start.speedMps>=100/3.6,'braking starts from the actual reached threshold state');
    assert(receipt.braking.terminal.speedMps<=STOCK_TEST_RULES.braking.thresholdMps);
    assert(receipt.braking.terminal.speedMps<receipt.braking.start.speedMps/100);
    assert(Math.abs(receipt.support.totalLoadN-receipt.support.weightN)<receipt.support.weightN*1e-6,
      'four accepted suspension loads support the authored vehicle mass');
    assert(receipt.support.state.grounded.every(Boolean));
    assert(receipt.support.state.compression.every(x=>x>0));
    assert(receipt.steering.terminal.steering>0,'requested steering reaches the actual wheel steering state');
    assert(receipt.steering.headingChangeRadians>.05,'chassis physically turns');
    assert(receipt.steering.lateralDisplacementM>1,'steering produces lateral motion');
    assert(receipt.diagnostics.minimumUpY>.8,'every accepted state remains upright');
    assert.equal(receipt.diagnostics.minimumGrounded,4,'the declared low-risk tests retain all four contacts');
  });
}

test('the six stock machines have independently measured acceleration and handling differences',()=>{
  assert.equal(receipts.length,6);
  assert.equal(new Set(receipts.map(r=>r.acceleration.crossing.elapsedSeconds)).size,6);
  assert.equal(new Set(receipts.map(r=>r.steering.headingChangeRadians)).size,6);
  const byId=Object.fromEntries(receipts.map(r=>[r.modelId,r]));
  assert(byId['glass-comet'].acceleration.crossing.elapsedSeconds<byId['cinder-two'].acceleration.crossing.elapsedSeconds);
  assert(byId['rivet-eight'].acceleration.crossing.elapsedSeconds<byId['yardhand'].acceleration.crossing.elapsedSeconds);
  assert(byId.lilt.steering.headingChangeRadians>byId['evening-line'].steering.headingChangeRadians);
});
