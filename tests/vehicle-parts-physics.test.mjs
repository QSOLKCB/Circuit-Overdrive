// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import {GARAGE_CATALOG} from '../src/garage-catalog.js';
import {measurePartsComparison,measurePartVehicle,extremePartBuild,PART_TEST_RULES} from './vehicle-parts-driver.mjs';

const comparison=measurePartsComparison();
const stock=comparison.stock;
const variant=slot=>comparison.variants.find(v=>v.slot===slot).result;
const at=(run,tick)=>run.samples.find(sample=>sample.acceptedTick===tick).state;
const movementDifference=(a,b)=>Math.hypot(...a.terminal.position.map((x,i)=>x-b.terminal.position[i]));

for(const slot of ['engine','intake','exhaust']){
  test(slot+' produces independently measured acceleration and displacement under the identical full-throttle tape',()=>{
    const actual=variant(slot);
    assert(actual.straight.crossing,'The declared threshold was physically reached');
    assert(stock.straight.crossing.elapsedSeconds-actual.straight.crossing.elapsedSeconds>.01);
    assert(at(actual.straight,120).speedMps-at(stock.straight,120).speedMps>.01,
      'Accepted physical speed changes before first shift, not merely a recipe or display field');
    assert(movementDifference(actual.straight,stock.straight)>.1);
    assert.equal(actual.straight.diagnostics.acceptedTicks,PART_TEST_RULES.straight.ticks);
    assert.deepEqual(actual.straight.start,stock.straight.start);
  });
}

for(const slot of ['gearbox','finalDrive']){
  test(slot+' changes actual road speed, accepted RPM and shift timing under the same command tape',()=>{
    const actual=variant(slot),a=at(actual.straight,120),b=at(stock.straight,120);
    assert.equal(a.gear,1);assert.equal(b.gear,1);
    assert(a.speedMps-b.speedMps>.1,'Shorter gearing increases measured early acceleration');
    assert(a.rpm>b.rpm,'Accepted engine speed reflects the changed engine/road relationship');
    assert(actual.straight.shifts[0].acceptedTick<stock.straight.shifts[0].acceptedTick-10);
    assert(movementDifference(actual.straight,stock.straight)>1);
    assert.deepEqual(actual.straight.start,stock.straight.start);
  });
}

test('performance tyres change real cornering motion, lateral slip and exact-start braking distance',()=>{
  const actual=variant('tyres');
  assert.deepEqual(actual.braking.start,stock.braking.start);
  assert.equal(actual.braking.start.speedMps,100/3.6);
  assert(actual.braking.brakeCompleted&&stock.braking.brakeCompleted);
  assert(stock.braking.pathM-actual.braking.pathM>1);
  assert(actual.corner.diagnostics.lateralSlipIntegralM<stock.corner.diagnostics.lateralSlipIntegralM-.1);
  assert(actual.corner.headingChangeRadians>stock.corner.headingChangeRadians+.05);
  assert(movementDifference(actual.corner,stock.corner)>.1);
  assert.deepEqual(actual.corner.start,stock.corner.start);
});

test('suspension changes accepted bump loads, heave and damping response from a common initial pose',()=>{
  const actual=variant('suspension');
  assert.deepEqual(actual.bump.start.position,stock.bump.start.position);
  assert.deepEqual(actual.bump.start.velocity,stock.bump.start.velocity);
  assert(Math.abs(actual.bump.diagnostics.maxWheelLoadN-stock.bump.diagnostics.maxWheelLoadN)>50);
  assert(Math.abs(actual.bump.verticalRangeM-stock.bump.verticalRangeM)>.005);
  assert(Math.abs(actual.bump.diagnostics.maxAbsVerticalSpeedMps-stock.bump.diagnostics.maxAbsVerticalSpeedMps)>.02);
  assert(Math.abs(actual.bump.terminal.position[1]-stock.bump.terminal.position[1])>.005);
  assert.equal(actual.bump.diagnostics.minGrounded,4);
});

test('quick steering changes accepted wheel response and physical yaw/trajectory at the same initial 10 m/s',()=>{
  const actual=variant('steering');
  assert.deepEqual(actual.steering.start,stock.steering.start);
  assert.equal(actual.steering.start.speedMps,10);
  assert(at(actual.steering,3).steeringRadians>at(stock.steering,3).steeringRadians);
  assert(actual.steering.headingChangeRadians>stock.steering.headingChangeRadians+.02);
  assert(movementDifference(actual.steering,stock.steering)>.1);
});

test('paint changes neither the complete accepted recipe nor any measured physical state',()=>{
  const actual=variant('paint');
  assert.notEqual(actual.build.parts.paint,stock.build.parts.paint);
  assert.deepEqual(actual.recipe,stock.recipe);
  for(const key of ['straight','braking','corner','steering','bump'])assert.deepEqual(actual[key],stock[key],key);
});

for(const partId of ['performance','competition']){
  test(partId+' engine grade independently changes early speed, 0–100 time and physical displacement',()=>{
    const actual=comparison.variants.find(v=>v.slot==='engine'&&v.partId===partId).result;
    assert(actual.straight.crossing);
    assert(actual.straight.crossing.elapsedSeconds<stock.straight.crossing.elapsedSeconds-.1);
    assert(at(actual.straight,120).speedMps>at(stock.straight,120).speedMps+.1);
    assert(movementDifference(actual.straight,stock.straight)>1);
    assert.deepEqual(actual.straight.start,stock.straight.start);
  });
}

test('long gearbox physically lowers early RPM/acceleration and delays the first automatic shift',()=>{
  const actual=comparison.variants.find(v=>v.slot==='gearbox'&&v.partId==='long').result;
  const a=at(actual.straight,120),b=at(stock.straight,120);
  assert.equal(a.gear,1);assert.equal(b.gear,1);
  assert(a.speedMps<b.speedMps-.1);assert(a.rpm<b.rpm);
  assert(actual.straight.shifts[0].acceptedTick>stock.straight.shifts[0].acceptedTick+10);
  assert(movementDifference(actual.straight,stock.straight)>1);
});

for(const [partId,direction] of [['touring',-1],['economy',1]]){
  test(partId+' tyre grade produces distinct physical slip and braking distance in its documented direction',()=>{
    const actual=comparison.variants.find(v=>v.slot==='tyres'&&v.partId===partId).result;
    assert(actual.braking.brakeCompleted);
    assert.deepEqual(actual.braking.start,stock.braking.start);
    assert((actual.braking.pathM-stock.braking.pathM)*direction>.25);
    assert((actual.corner.diagnostics.lateralSlipIntegralM-stock.corner.diagnostics.lateralSlipIntegralM)*direction>.05);
    assert(movementDifference(actual.corner,stock.corner)>.1);
  });
}

test('all controlled before/after receipts reproduce exactly in the same runtime',()=>{
  assert.deepEqual(measurePartsComparison(),comparison);
  for(const result of [stock,...comparison.variants.map(v=>v.result)]){
    for(const key of ['straight','braking','corner','steering','bump']){
      assert(result[key].diagnostics.minUpY>.98);
      assert.equal(result[key].diagnostics.minGrounded,4);
    }
  }
});

for(const {modelId} of GARAGE_CATALOG){
  test(modelId+' retains finite supported steering and bump motion with responsive and soft/long extreme valid builds',()=>{
    for(const kind of ['responsive','soft-long']){
      const result=measurePartVehicle(modelId,extremePartBuild(modelId,kind),{short:true});
      for(const key of ['corner','steering','bump']){
        const diagnostics=result[key].diagnostics;
        assert.equal(diagnostics.acceptedTicks,PART_TEST_RULES[key].ticks);
        assert(diagnostics.minUpY>.98);
        assert.equal(diagnostics.minGrounded,4);
        assert(diagnostics.maxAngularSpeed<12);
      }
    }
  });
}
