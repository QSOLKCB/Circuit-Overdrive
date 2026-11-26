// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateVehicle} from '../vendor/vanillajs/modules/vehicle3d/index.js';
import {GARAGE_CATALOG} from '../src/garage-catalog.js';
import {compileVehicleBuild,stockVehicleBuild,stockUpgradeBuild} from '../src/vehicle-builds.js';
import {CERTIFICATION_BUILDS,CERTIFICATION_TESTS,certificationBuild,independentlyMeasurePartEffects,
  measureFacilityRun,independentlyReconstruct,certifyFacilityMatrix} from '../scripts/certify-machine-physics.mjs';

const revision='b03516f6c967f7fbd0ae3f07fe81433ca279621b';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('every mechanical category produces observed pinned-solver motion in its appropriate controlled rig; paint is physically neutral',()=>{
  const actual=independentlyMeasurePartEffects();
  const slots=new Set(actual.variants.map(row=>row.slot));
  assert.deepEqual([...slots].sort(),['engine','exhaust','finalDrive','gearbox','intake','paint','steering','suspension','tyres']);
  for(const row of actual.variants){
    for(const testId of ['straight','braking','corner','steering','bump']){
      const run=row.result[testId];assert(run.diagnostics.acceptedTicks>0);
      assert.equal(run.diagnostics.minGrounded,4);assert(run.diagnostics.minUpY>.98);
      assert(run.terminal.position.every(Number.isFinite));
    }
  }
});

for(const {modelId} of GARAGE_CATALOG){
  test(modelId+' completes stock and both extreme valid build sets through all four tests with independent motion reconstruction',()=>{
    for(const kind of ['stock','responsive','soft-long'])for(const testId of CERTIFICATION_TESTS){
      const run=measureFacilityRun(modelId,kind,testId,revision),observation=independentlyReconstruct(run);
      assert.equal(observation.terminalStateSha256,hash(run.vehicle));
      assert.equal(observation.ticks,run.ticks);
      assert.equal(run.result.status,'completed');assert.equal(run.result.diagnostics.barrierContactTicks,0);
      assert.equal(run.result.diagnostics.solverTruncated,false);assert.equal(run.result.diagnostics.needsRecovery,false);
      if(testId==='slalom')assert.equal(observation.gates.length,6);
      if(testId==='handling')assert.equal(observation.gates.length,8);
      if(testId==='acceleration'){
        assert.deepEqual(run.commandsRLE,[{ticks:900,throttle:1,brake:0,steer:0}]);
        assert(observation.accelerationSeconds>0);
      }
    }
  });
}

test('maximum supported combinations complete and the over-limit Rivet combination rejects before spawning',()=>{
  assert.deepEqual(CERTIFICATION_BUILDS,['stock','responsive','soft-long','maximum']);
  assert.throws(()=>certificationBuild('rivet-eight','maximum'),/550 Nm/);
  for(const {modelId} of GARAGE_CATALOG.filter(model=>model.modelId!=='rivet-eight')){
    const compiled=compileVehicleBuild(modelId,certificationBuild(modelId,'maximum'));
    assert(Math.max(...compiled.recipe.engine.torqueCurve.map(point=>point[1]))<=550);
    for(const testId of CERTIFICATION_TESTS){
      const run=measureFacilityRun(modelId,'maximum',testId,revision);
      assert.equal(run.result.status,'completed');assert(run.vehicle.velocity.every(Number.isFinite));
    }
  }
});

test('four benchmark v7 recordings seek and restart the original build independently of live configuration',async()=>{
  const actual=await certifyFacilityMatrix(revision,{models:['cinder-two'],kinds:['stock']});
  assert.equal(actual.completed,4);assert.equal(actual.rejectedCombinations.length,0);
  for(const run of actual.runs){
    assert(run.replay);assert.equal(run.replay.terminalTick,run.acceptedTicks);
    assert.equal(run.replay.restartTick,0);assert.equal(run.replay.terminalStateDigest,run.independent.terminalStateSha256);
    assert.match(run.replay.sha256,/^[a-f0-9]{64}$/);
    assert.equal(run.replay.midpointSeek,Math.floor(run.acceptedTicks/2));
  }
});

test('invalid raw physical fields and user build forms reject without mutating a previously accepted recipe',()=>{
  const baseline=compileVehicleBuild('cinder-two',stockVehicleBuild('cinder-two'));
  const original=baseline.canonicalRecipe;
  for(const mutate of [
    recipe=>{recipe.gearbox.ratios=[3,3,1];},
    recipe=>{recipe.gearbox.ratios=[3,Infinity,1];},
    recipe=>{recipe.engine.torqueCurve[1][0]=recipe.engine.torqueCurve[0][0];},
    recipe=>{recipe.engine.torqueCurve[2][1]=1001;},
    recipe=>{recipe.tyres.grip=-.01;},
    recipe=>{recipe.suspension.spring=120001;},
    recipe=>{recipe.suspension.travel=.08;recipe.suspension.spring=5000;}
  ]){
    const recipe=structuredClone(baseline.recipe);mutate(recipe);assert.throws(()=>validateVehicle(recipe));
    assert.equal(compileVehicleBuild('cinder-two',baseline.build).canonicalRecipe,original);
  }
  for(const mutate of [
    build=>{build.rulesVersion=99;},build=>{build.parts.tyres='imaginary';},
    build=>{build.tuning.spring=NaN;},build=>{build.tuning.damper=Infinity;},
    build=>{build.tuning.steering=3;},build=>{build.execute='alert(1)';}
  ]){
    const build=structuredClone(stockUpgradeBuild('cinder-two',baseline.build));mutate(build);
    assert.throws(()=>compileVehicleBuild('cinder-two',build));assert.equal(baseline.canonicalRecipe,original);
  }
});

test('repeated extreme compilations are immutable and source-model independent',()=>{
  const before=stockVehicleBuild('cinder-two'),text=JSON.stringify(before);
  for(const {modelId} of GARAGE_CATALOG)for(const kind of ['responsive','soft-long']){
    const build=certificationBuild(modelId,kind),a=compileVehicleBuild(modelId,build),b=compileVehicleBuild(modelId,build);
    assert.deepEqual(a,b);assert(Object.isFrozen(a)&&Object.isFrozen(a.recipe)&&Object.isFrozen(a.build.parts));
    assert.equal(JSON.stringify(before),text);
    assert.throws(()=>{a.recipe.mass=500;},TypeError);
  }
});
