// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createVehicle} from '../vendor/vanillajs/modules/vehicle3d/index.js';
import {rotate} from '../vendor/vanillajs/modules/math/index.js';
import {GARAGE_CATALOG} from '../src/garage-catalog.js';
import {compileVehicleBuild,stockVehicleBuild,stockUpgradeBuild} from '../src/vehicle-builds.js';
import {PROVING_TRACK,PROVING_TESTS,PROVING_STEP,PROVING_RECEIPT_BYTES,
  createProvingRun,startProvingRun,stepProvingRun,stopProvingRun,
  referenceProvingCommand,validateProvingCommand,provingReceipt} from '../src/proving-ground.js';

const source='80343db601b53df4f42071a46c377617e450d25e';
const neutral={throttle:0,brake:0,steer:0},throttle={throttle:1,brake:0,steer:0};
const world={sampleSurface(x,z,maxY){
  const b=PROVING_TRACK.bounds;
  return x>=b.minX&&x<=b.maxX&&z>=b.minZ&&z<=b.maxZ&&maxY>=0?PROVING_TRACK.surface:null;
},barriers:PROVING_TRACK.barriers};
const fit=(slot,id,modelId='cinder-two')=>{
  const build=structuredClone(stockUpgradeBuild(modelId,stockVehicleBuild(modelId)));
  build.parts[slot]=id;build.inventory[slot].push(id);return build;
};
const cache=new Map();
function measure(modelId,testId,build=stockVehicleBuild(modelId)){
  const key=JSON.stringify([modelId,testId,build]);
  if(!cache.has(key)){
    const run=createProvingRun({modelId,build,testId,sourceRevision:source,driver:'reference',ownedVehicleId:'car-000001'});
    startProvingRun(run);
    while(run.phase==='running')stepProvingRun(run,referenceProvingCommand(run));
    cache.set(key,run);
  }
  return cache.get(key);
}
const horizontalSpeed=state=>Math.hypot(state.velocity[0],state.velocity[2]);
const allFinite=value=>{
  if(typeof value==='number')return Number.isFinite(value);
  if(value&&typeof value==='object')return Object.values(value).every(allFinite);
  return true;
};
function near(actual,expected,tolerance=1e-10){assert(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);}

// This observer calls vehicle3d directly, expands the accepted input tape and
// independently recomputes speed thresholds, braking path, heading and gates.
// It does not call the proving-ground orchestration or reference driver.
function independentObservation(receipt){
  const accepted=compileVehicleBuild(receipt.modelId,receipt.build),solver=createVehicle(accepted.recipe);
  let state=solver.spawn(receipt.startingPose),ticks=0,crossing=null,braking=null,
    pathM=0,headingChange=0,gateIndex=0;
  const gates=[];
  const direction=s=>{const forward=rotate(s.orientation,[0,0,-1]);return Math.atan2(forward[0],-forward[2]);};
  for(const block of receipt.commandsRLE)for(let i=0;i<block.ticks;i++){
    const before=state,command={throttle:block.throttle,brake:block.brake,steer:block.steer};
    state=solver.step(before,command,world,receipt.step);ticks++;
    assert.equal(state.truncated,false);assert.equal(state.needsRecovery,false);
    const distance=Math.hypot(state.position[0]-before.position[0],state.position[2]-before.position[2]);
    pathM+=distance;
    headingChange+=Math.atan2(Math.sin(direction(state)-direction(before)),Math.cos(direction(state)-direction(before)));
    const a=horizontalSpeed(before),b=horizontalSpeed(state);
    if(crossing===null&&a<100/3.6&&b>=100/3.6){
      crossing=(ticks-1+(100/3.6-a)/(b-a))*receipt.step;
      if(receipt.testId==='braking')braking={pathM:0,startTick:ticks,startSpeedMps:b};
    }else if(braking)braking.pathM+=distance;
    if(receipt.testId==='slalom'||receipt.testId==='handling'){
      const gate=PROVING_TRACK[receipt.testId].gates[gateIndex];
      if(gate){
        const a=(before.position[0]-gate.center[0])*gate.normal[0]+(before.position[2]-gate.center[1])*gate.normal[1];
        const b=(state.position[0]-gate.center[0])*gate.normal[0]+(state.position[2]-gate.center[1])*gate.normal[1];
        if(a<0&&b>=0){
          const t=-a/(b-a),x=before.position[0]+t*(state.position[0]-before.position[0]),z=before.position[2]+t*(state.position[2]-before.position[2]);
          assert(Math.abs((x-gate.center[0])*(-gate.normal[1])+(z-gate.center[1])*gate.normal[0])<=gate.halfWidth);
          gates.push({id:gate.id,tick:ticks,time:(ticks-1+t)*receipt.step});gateIndex++;
        }
      }
    }
  }
  return {state,ticks,crossing,braking,pathM,headingChange,gates};
}

test('facility data has finite original geometry, disjoint slalom apertures and bounded test rules',()=>{
  assert(Object.isFrozen(PROVING_TRACK));assert(Object.isFrozen(PROVING_TRACK.slalom.gates[0].center));
  assert(allFinite(PROVING_TRACK));assert.equal(PROVING_STEP,1/60);
  assert.deepEqual(Object.values(PROVING_TESTS).map(t=>t.limitTicks),[7200,900,1800,3600,3600]);
  for(let i=1;i<5;i++){
    const a=PROVING_TRACK.slalom.gates[i-1],b=PROVING_TRACK.slalom.gates[i];
    assert(Math.abs(a.center[0]-b.center[0])>a.halfWidth+b.halfWidth,'straight line must not satisfy alternating apertures');
  }
  assert.equal(PROVING_TRACK.barriers.length,4);
});

test('run admission rejects malformed identity, build, options and commands before accepting motion',()=>{
  const base={modelId:'cinder-two',build:stockVehicleBuild('cinder-two')};
  for(const extra of [{modelId:'missing'},{testId:'__proto__'},{seed:-1},{seed:NaN},{seed:2**32},{seed:.5},
    {ownedVehicleId:'car-000000'},{ownedVehicleId:'car-1'},{sourceRevision:'main'},{driver:'teleport'}]){
    assert.throws(()=>createProvingRun({...base,...extra}));
  }
  const invalid=structuredClone(base.build);invalid.parts.engine='street';
  assert.throws(()=>createProvingRun({...base,build:invalid}));
  let calls=0;const getter=()=>{calls++;throw Error('not admitted');};
  const badCommand={...neutral};Object.defineProperty(badCommand,'throttle',{enumerable:true,get:getter});
  for(const command of [null,{},[],{...neutral,extra:1},{...neutral,steer:NaN},{...neutral,throttle:1.01},
    {...neutral,brake:-.1},{...neutral,steer:-1.1},badCommand])assert.throws(()=>validateProvingCommand(command));
  assert.equal(calls,0);
  const run=createProvingRun(base);
  assert.equal(run.phase,'ready');assert.throws(()=>stepProvingRun(run,throttle));
  startProvingRun(run);assert.throws(()=>startProvingRun(run));
  assert.throws(()=>stepProvingRun(run,{...throttle,steer:Infinity}));assert.equal(run.ticks,0);
  stopProvingRun(run);assert.throws(()=>stepProvingRun(run,throttle));
});

test('six stock owned builds physically spawn, accelerate, brake, weave and complete the ring with finite supported chassis',()=>{
  const acceleration=[];
  for(const {modelId} of GARAGE_CATALOG)for(const testId of ['acceleration','braking','slalom','handling']){
    const run=measure(modelId,testId),d=run.result.diagnostics;
    assert.equal(run.result.status,'completed',modelId+' '+testId+' '+run.result.reason);
    assert(allFinite(run.vehicle));assert(allFinite(run.result));
    assert.equal(run.vehicle.tick,4*run.ticks,'accepted 60 Hz calls contain four actual 240 Hz solver steps');
    assert.equal(d.minGrounded,4);assert(d.minUpY>.99);assert(d.maxAngularSpeed<1);
    assert.equal(d.solverTruncated,false);assert.equal(d.needsRecovery,false);assert.equal(d.barrierContactTicks,0);
    assert(d.maxWheelLoadN>0);assert(d.maxCompressionM>0);
    if(testId==='acceleration'){
      assert.equal(run.ticks,900);assert.deepEqual(run.commandsRLE,[{ticks:900,...throttle}]);
      assert(run.metrics.accelerationSeconds>0&&run.metrics.accelerationSeconds<15);acceleration.push(run.metrics.accelerationSeconds);
      assert(run.vehicle.position[2]<-300);
    }
    if(testId==='braking'){
      assert(horizontalSpeed(run.vehicle)<=.1);assert.equal(run.braking.fullBrakeCommands,true);
      assert(run.braking.startSpeedMps>=100/3.6);assert(run.braking.startSpeedMps<28);
      assert(run.metrics.brakingDistanceM>20&&run.metrics.brakingDistanceM<60);
    }
    if(testId==='slalom'){
      assert.equal(run.gatesPassed,6);assert(run.metrics.slalomSeconds>20&&run.metrics.slalomSeconds<40);
      assert(run.gates[0].position[0]>-49);assert(run.gates[1].position[0]<-51);
    }
    if(testId==='handling'){
      assert.equal(run.gatesPassed,8);assert(run.metrics.handlingSeconds>20&&run.metrics.handlingSeconds<40);
      assert(run.metrics.headingChangeRadians>6&&run.metrics.headingChangeRadians<6.5);
      assert(run.metrics.lateralSlipIntegralM>0);assert(run.metrics.maxLateralAccelerationMps2>1);
    }
  }
  assert.equal(new Set(acceleration).size,6,'stock mechanical distinctions are observed, not badges');
});

test('independent direct solver re-expands all four accepted tapes and reproduces physical state and measurements',async()=>{
  for(const testId of ['acceleration','braking','slalom','handling']){
    const run=measure('cinder-two',testId),receipt=await provingReceipt(run),observed=independentObservation(receipt);
    assert.deepEqual(observed.state,run.vehicle);assert.equal(observed.ticks,receipt.acceptedTicks);
    near(observed.pathM,receipt.result.metrics.pathM);near(observed.headingChange,receipt.result.metrics.headingChangeRadians);
    assert.equal(observed.crossing,receipt.result.metrics.accelerationSeconds);
    if(testId==='braking'){
      near(observed.braking.pathM,receipt.result.metrics.brakingDistanceM);
      assert.equal(observed.braking.startSpeedMps,receipt.braking.startSpeedMps);
    }
    if(testId==='slalom'||testId==='handling'){
      assert.deepEqual(observed.gates.map(g=>g.id),receipt.gates.map(g=>g.id));
      near(observed.gates.at(-1).time,receipt.result.metrics[testId==='slalom'?'slalomSeconds':'handlingSeconds']);
    }
  }
});

test('engine and short gearing change measured physical acceleration under an identical accepted command tape',async()=>{
  const stock=measure('cinder-two','acceleration');
  for(const [slot,id,minDifference] of [['engine','street',.4],['gearbox','short',.1]]){
    const modified=measure('cinder-two','acceleration',fit(slot,id));
    assert.equal(modified.result.status,'completed');assert.deepEqual(modified.startingPose,stock.startingPose);
    assert.deepEqual(modified.commandsRLE,stock.commandsRLE);
    assert(stock.metrics.accelerationSeconds-modified.metrics.accelerationSeconds>minDifference);
    assert(modified.vehicle.position[2]<stock.vehicle.position[2]-1);
    const receipt=await provingReceipt(modified),independent=independentObservation(receipt);
    assert.equal(independent.crossing,modified.metrics.accelerationSeconds);assert.deepEqual(independent.state,modified.vehicle);
    assert.match(receipt.comparison,/Identical/);
  }
  const longer=measure('cinder-two','acceleration',fit('gearbox','long'));
  assert(longer.metrics.accelerationSeconds>stock.metrics.accelerationSeconds+.1);
  assert.notEqual(longer.vehicle.gear,stock.vehicle.gear,'actual shift state changes');
});

test('tyre selection changes observed lateral response, with feedback policy differences explicitly declared',async()=>{
  const stock=measure('cinder-two','handling'),performance=measure('cinder-two','handling',fit('tyres','performance')),
    economy=measure('cinder-two','handling',fit('tyres','economy'));
  for(const run of [performance,economy]){
    assert.equal(run.result.status,'completed');assert.equal(run.gatesPassed,8);
    assert.deepEqual(run.startingPose,stock.startingPose);
    assert.notDeepEqual(run.vehicle.position,stock.vehicle.position);assert.notDeepEqual(run.commandsRLE,stock.commandsRLE);
    const receipt=await provingReceipt(run);assert.match(receipt.comparison,/streams can differ/);
    assert.deepEqual(independentObservation(receipt).state,run.vehicle);
  }
  assert(performance.metrics.lateralSlipIntegralM<stock.metrics.lateralSlipIntegralM*.8);
  assert(economy.metrics.lateralSlipIntegralM>stock.metrics.lateralSlipIntegralM*1.1);
});

test('manual neutral yields honest non-completion and cannot forge the declared reference policy',()=>{
  const run=createProvingRun({modelId:'cinder-two',build:stockVehicleBuild('cinder-two'),testId:'acceleration'});
  startProvingRun(run);for(let i=0;i<900;i++)stepProvingRun(run,neutral);
  assert.equal(run.result.status,'non-completion');assert.equal(run.metrics.accelerationSeconds,null);
  assert.equal(run.metrics.pathM,0);assert.equal(run.ticks,900);
  const reference=createProvingRun({modelId:'cinder-two',build:stockVehicleBuild('cinder-two'),testId:'acceleration',driver:'reference'});
  startProvingRun(reference);assert.throws(()=>stepProvingRun(reference,neutral),/reference policy/);assert.equal(reference.ticks,0);
});

test('straight driving cannot claim a slalom and driving off the ring cannot claim a lap',()=>{
  for(const testId of ['slalom','handling']){
    const run=createProvingRun({modelId:'cinder-two',build:stockVehicleBuild('cinder-two'),testId});startProvingRun(run);
    while(run.phase==='running')stepProvingRun(run,throttle);
    assert.equal(run.result.status,'invalid');assert.equal(run.gatesPassed,0);
    assert.equal(run.result.reason,testId==='slalom'?'missed-timing-gate':'handling-boundary');
    assert.equal(run.metrics[testId==='slalom'?'slalomSeconds':'handlingSeconds'],null);
  }
});

test('a solver recovery flag is a visible physical failure, never a fabricated benchmark result',()=>{
  const run=createProvingRun({modelId:'cinder-two',build:stockVehicleBuild('cinder-two'),testId:'handling'});
  // Test-only solver-valid state exercises the fault boundary. Player commands
  // and exported receipts have no state-import path in this authority.
  run.vehicle={...run.vehicle,angularVelocity:[20,0,0]};startProvingRun(run);
  stepProvingRun(run,neutral);
  assert.equal(run.phase,'finished');assert.equal(run.result.status,'physical-failure');
  assert.equal(run.result.reason,'solver-limit-or-nonfinite');assert.equal(run.diagnostics.needsRecovery,true);
  assert.equal(run.metrics.handlingSeconds,null);assert.equal(run.gatesPassed,0);
});

test('physical enclosure receives real conservative-cube contact and no damage or money is invented',async()=>{
  const run=createProvingRun({modelId:'cinder-two',build:stockVehicleBuild('cinder-two'),sourceRevision:source});
  startProvingRun(run);
  while(run.phase==='running'&&run.diagnostics.barrierContactTicks===0)stepProvingRun(run,throttle);
  assert(run.diagnostics.barrierContactTicks>0);assert(run.vehicle.position[2]>PROVING_TRACK.bounds.minZ);
  if(run.phase==='running')stopProvingRun(run);
  const receipt=await provingReceipt(run);assert.match(receipt.damage,/No persistent owned damage/);
  for(const key of ['credits','reward','condition','damageEnergy'])assert(!Object.hasOwn(receipt,key));
});

test('source-bound inert receipts retain identity, canonical build and tick tapes while rejecting unstamped export',async()=>{
  const run=measure('cinder-two','slalom'),receipt=await provingReceipt(run),again=await provingReceipt(run);
  assert.deepEqual(receipt,again);assert(Object.isFrozen(receipt));assert(Object.isFrozen(receipt.commandsRLE[0]));
  assert.equal(receipt.sourceRevision,source);assert.equal(receipt.ownedVehicleId,'car-000001');assert.equal(receipt.modelId,'cinder-two');
  assert.equal(receipt.engineRevision,'9d95d74b355ec17add32db0b55f0f71130f9c004');
  assert.match(receipt.buildDigest,/^[a-f0-9]{64}$/);assert.match(receipt.recipeDigest,/^[a-f0-9]{64}$/);
  assert.equal(receipt.canonicalRecipe,compileVehicleBuild(receipt.modelId,receipt.build).canonicalRecipe);
  assert.equal(receipt.commandsRLE.reduce((sum,b)=>sum+b.ticks,0),receipt.acceptedTicks);
  assert.match(receipt.recording,/not a historical replay format/);
  assert(Buffer.byteLength(JSON.stringify(receipt))<PROVING_RECEIPT_BYTES);
  const unstamped=createProvingRun({modelId:'cinder-two',build:stockVehicleBuild('cinder-two')});
  await assert.rejects(provingReceipt(unstamped),/Finish/);startProvingRun(unstamped);stopProvingRun(unstamped);
  await assert.rejects(provingReceipt(unstamped),/source-stamped/);
});

test('worst-length 7200-call practice command recording remains bounded without persistence or executable data',async()=>{
  const run=createProvingRun({modelId:'cinder-two',build:stockVehicleBuild('cinder-two'),sourceRevision:source});startProvingRun(run);
  for(let i=0;i<PROVING_TESTS.practice.limitTicks;i++){
    stepProvingRun(run,{throttle:1.2345678901234568e-300,brake:1.2345678901234568e-300,steer:(i%2?1:-1)*1.2345678901234568e-300});
  }
  assert.equal(run.result.status,'completed');assert.equal(run.ticks,7200);assert.equal(run.commandsRLE.length,7200);
  const receipt=await provingReceipt(run);assert(Buffer.byteLength(JSON.stringify(receipt))<PROVING_RECEIPT_BYTES);
  assert.equal(receipt.commandsRLE.reduce((sum,b)=>sum+b.ticks,0),7200);
  const core=await readFile(new URL('../src/proving-ground.js',import.meta.url),'utf8');
  assert.doesNotMatch(core,/from ['"].*(?:sim|touring-car|nitro-physics|rocket-dynamics|derby)\.js/);
  assert.doesNotMatch(core,/localStorage|sessionStorage|document\.|window\.|eval\(|new Function/);
});
