// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stockVehicleBuild,stockUpgradeBuild,identifyVehicleBuild} from '../src/vehicle-builds.js';
import {createProvingRun,startProvingRun,stepProvingRun,stopProvingRun,referenceProvingCommand} from '../src/proving-ground.js';
import {validateTheatreReplay} from '../src/replay-theatre-core.js';
import {PROVING_REPLAY_VERSION,PROVING_REPLAY_BYTES,PROVING_SEEK_STEPS,
  createProvingRecording,admitProvingReplay,parseProvingReplay,serializeProvingReplay,createProvingPlayback} from '../src/proving-replay.js';

const revision='57a30486fcf8674e30486d01dea972b8981bcccd';
const neutral={throttle:0,brake:0,steer:0},throttle={throttle:1,brake:0,steer:0};
const clone=value=>JSON.parse(JSON.stringify(value));
function upgraded(){
  const build=structuredClone(stockUpgradeBuild('cinder-two',stockVehicleBuild('cinder-two')));
  build.parts.engine='street';build.inventory.engine.push('street');return build;
}
function reference(testId='acceleration',build=upgraded()){
  const run=createProvingRun({modelId:'cinder-two',build,sourceRevision:revision,ownedVehicleId:'car-000007',testId,driver:'reference',seed:27});
  startProvingRun(run);while(run.phase==='running')stepProvingRun(run,referenceProvingCommand(run));return run;
}
const measured=new Map(),recorded=new Map();
function measurement(testId='acceleration'){
  if(!measured.has(testId))measured.set(testId,reference(testId));return measured.get(testId);
}
async function tape(testId='acceleration'){
  if(!recorded.has(testId))recorded.set(testId,createProvingRecording(measurement(testId)));return recorded.get(testId);
}
function finish(playback,batch=PROVING_SEEK_STEPS){while(!playback.done)playback.advance(batch);return playback;}

test('v7 records and reconstructs the original accepted mechanical build with actual physical result',async()=>{
  const original=measurement(),recording=await tape(),text=serializeProvingReplay(recording);
  assert.equal(PROVING_REPLAY_VERSION,7);assert.equal(PROVING_REPLAY_BYTES,2*1024*1024);assert.equal(PROVING_SEEK_STEPS,120);
  assert.equal(recording.revision,revision);assert.equal(recording.ownedVehicleId,'car-000007');
  assert.equal(recording.build.parts.engine,'street');assert.equal(recording.buildRulesVersion,2);
  assert.equal(recording.runs.reduce((n,row)=>n+row.ticks,0),original.ticks);
  assert.equal(recording.ticks,900);assert(recording.result.metrics.accelerationSeconds<8);
  assert.match(recording.terminalStateDigest,/^[a-f0-9]{64}$/);
  assert(!Object.hasOwn(recording,'terminalState'));assert(!Object.hasOwn(recording,'canonicalRecipe'));
  assert(Object.isFrozen(recording)&&Object.isFrozen(recording.build.parts)&&Object.isFrozen(recording.runs));
  const parsed=await parseProvingReplay(text,revision),viewer=finish(createProvingPlayback(parsed));
  assert.deepEqual(viewer.run.vehicle,original.vehicle);assert.deepEqual(viewer.run.result,original.result);
  assert.equal(viewer.tick,900);assert.equal(viewer.done,true);assert.equal(viewer.advance(1),0);
});

test('all four benchmark terminal outcomes reproduce from recorded input and build',async()=>{
  for(const testId of ['acceleration','braking','slalom','handling']){
    const recording=await tape(testId),viewer=finish(createProvingPlayback(recording));
    assert.equal(recording.testId,testId);assert.equal(viewer.run.result.status,'completed');
    assert.deepEqual(viewer.run.result,measurement(testId).result);assert.deepEqual(viewer.run.vehicle,measurement(testId).vehicle);
  }
});

test('manual stopped practice and honest benchmark non-completion retain distinct accepted terminals',async()=>{
  const practice=createProvingRun({modelId:'lilt',build:stockVehicleBuild('lilt'),sourceRevision:revision,testId:'practice'});
  startProvingRun(practice);for(let i=0;i<35;i++)stepProvingRun(practice,throttle);stopProvingRun(practice);
  const recording=await createProvingRecording(practice),viewer=finish(createProvingPlayback(recording));
  assert.equal(recording.terminalStop,true);assert.equal(recording.result.reason,'stopped-by-player');
  assert.deepEqual(viewer.run.vehicle,practice.vehicle);assert.deepEqual(viewer.run.result,practice.result);
  const stopped=createProvingRun({modelId:'cinder-two',build:stockVehicleBuild('cinder-two'),sourceRevision:revision,testId:'acceleration'});
  startProvingRun(stopped);while(stopped.phase==='running')stepProvingRun(stopped,neutral);
  const noncompletion=await createProvingRecording(stopped);
  assert.equal(noncompletion.terminalStop,false);assert.equal(noncompletion.result.status,'non-completion');
  assert.equal(noncompletion.result.metrics.accelerationSeconds,null);
  assert.deepEqual(finish(createProvingPlayback(noncompletion)).run.result,stopped.result);
});

test('physically invalid manual slalom is replayed as invalid without invented gate credit',async()=>{
  const run=createProvingRun({modelId:'cinder-two',build:stockVehicleBuild('cinder-two'),sourceRevision:revision,testId:'slalom'});
  startProvingRun(run);while(run.phase==='running')stepProvingRun(run,throttle);
  assert.equal(run.result.status,'invalid');assert.equal(run.gatesPassed,0);
  const recording=await createProvingRecording(run),viewer=finish(createProvingPlayback(recording));
  assert.equal(viewer.run.gatesPassed,0);assert.equal(viewer.run.result.status,'invalid');
  assert.deepEqual(viewer.run.result,run.result);
});

test('viewer reconstruction never substitutes a newer live garage build or positions',async()=>{
  const recording=await tape(),live=upgraded();live.parts.engine='performance';live.inventory.engine.push('performance');
  const other=reference('acceleration',live);assert.notEqual(other.metrics.accelerationSeconds,recording.result.metrics.accelerationSeconds);
  const viewer=finish(createProvingPlayback(recording));
  assert.equal(viewer.run.build.parts.engine,'street');assert.equal(viewer.run.ownedVehicleId,'car-000007');
  assert.notDeepEqual(viewer.run.vehicle,other.vehicle);assert.deepEqual(viewer.run.vehicle,measurement().vehicle);
  const source=await readFile(new URL('../src/proving-replay.js',import.meta.url),'utf8');
  assert(!/from ['"].*(?:garage-vault|garage-transactions|garage-ui)/.test(source));
});

test('seek reconstructs from the recorded source/build and every work batch stays bounded',async()=>{
  const recording=await tape('handling'),viewer=createProvingPlayback(recording);
  assert.equal(viewer.seekBatch(500),120);assert.equal(viewer.tick,120);
  while(viewer.tick<500)assert(viewer.seekBatch(500)<=120);
  const state500=clone(viewer.run.vehicle);
  assert.equal(viewer.seekBatch(30),30);assert.equal(viewer.tick,30);
  while(viewer.tick<500)viewer.seekBatch(500);
  assert.deepEqual(viewer.run.vehicle,state500);
  finish(viewer);assert.deepEqual(viewer.run.vehicle,measurement('handling').vehicle);
  assert.equal(viewer.seekBatch(0),0);assert.equal(viewer.tick,0);assert.equal(viewer.run.result,null);
  assert.throws(()=>viewer.advance(121),/batch/);assert.throws(()=>viewer.advance(-1),/batch/);
  assert.throws(()=>viewer.seekBatch(recording.ticks+1),/seek/);assert.throws(()=>viewer.seekBatch(NaN),/seek/);
});

test('render-rate batching cannot alter accepted replay motion or result',async()=>{
  const recording=await tape('braking'),states=[];
  for(const batch of [1,2,17,120]){
    const viewer=finish(createProvingPlayback(recording),batch);states.push([viewer.run.vehicle,viewer.run.result]);
  }
  for(const state of states)assert.deepEqual(state,states[0]);
});

test('forged or merely deserialized tapes cannot bypass complete physical admission',async()=>{
  const recording=await tape(),raw=clone(recording);
  assert.throws(()=>createProvingPlayback(raw),/admission/);assert.throws(()=>serializeProvingReplay(raw),/admission/);
  const accepted=await admitProvingReplay(raw,revision);
  assert.doesNotThrow(()=>createProvingPlayback(accepted));
  raw.build.parts.engine='competition';assert.equal(accepted.build.parts.engine,'street');
});

test('exact revision, engine, version, rules, track, test and starting-condition admission reject mismatches',async()=>{
  const original=await tape();
  for(const [field,value] of [['revision','0'.repeat(40)],['engineRevision','1'.repeat(40)],['version',6],['format','other'],
    ['discipline','touring'],['rules',2],['trackId','other'],['testId','teleport'],['step',1/120],['seed',-1],
    ['driver','optimized'],['ownedVehicleId','car-000000'],['modelId','other'],['buildRulesVersion',3]]){
    const changed=clone(original);changed[field]=value;await assert.rejects(admitProvingReplay(changed,revision),undefined,field);
  }
  await assert.rejects(admitProvingReplay(original,null),/source-stamped/);
  await assert.rejects(admitProvingReplay(original,'bad'),/source-stamped/);
  const pose=clone(original);pose.startingPose.position[2]=1;await assert.rejects(admitProvingReplay(pose,revision),/starting pose/);
  const rules=clone(original);rules.testRules.policy='Fabricated benchmark';await assert.rejects(admitProvingReplay(rules,revision),/test rules/);
});

test('changed builds, digests, recipes and result assertions cannot impersonate the recorded machine',async()=>{
  const original=await tape();
  for(const key of ['buildDigest','recipeDigest','terminalStateDigest']){
    const changed=clone(original);changed[key]='0'.repeat(64);await assert.rejects(admitProvingReplay(changed,revision),/digest|physical state/);
  }
  const build=clone(original);build.build.parts.engine='stock';await assert.rejects(admitProvingReplay(build,revision),/digest/);
  const torque=clone(original);torque.canonicalRecipe='arbitrary vehicle';await assert.rejects(admitProvingReplay(torque,revision),/unexpected/);
  const positions=clone(original);positions.terminalState={position:[0,0,-900]};await assert.rejects(admitProvingReplay(positions,revision),/unexpected/);
  const result=clone(original);result.result.metrics.accelerationSeconds-=.1;await assert.rejects(admitProvingReplay(result,revision),/terminal result/);
  const reason=clone(original);reason.result.reason='all-timing-gates';await assert.rejects(admitProvingReplay(reason,revision),/terminal result/);
  const stop=clone(original);stop.terminalStop=true;await assert.rejects(admitProvingReplay(stop,revision),/stop/);
});

test('recorded command policy, lengths, count and complete terminal timing are enforced',async()=>{
  const original=await tape();
  for(const change of [
    value=>value.runs[0].ticks--,
    value=>value.runs[0].ticks++,
    value=>value.runs[0].throttle=.9,
    value=>value.runs[0].steer=NaN,
    value=>value.runs[0].brake=Infinity,
    value=>value.runs[0].ticks=0,
    value=>value.ticks=7201,
    value=>value.runs.push({...value.runs[0],ticks:1}),
    value=>value.runs=[{...value.runs[0],ticks:450},{...value.runs[0],ticks:450}],
    value=>{value.ticks=899;value.runs[0].ticks=899;value.result.acceptedTicks=899;value.result.elapsedSeconds=899/60;}
  ]){
    const changed=clone(original);change(changed);await assert.rejects(admitProvingReplay(changed,revision));
  }
});

test('admission yields bounded solver batches and cancellation publishes no admitted recording',async()=>{
  const original=await tape('handling');let yields=0,cancelled=false;
  await assert.rejects(admitProvingReplay(clone(original),revision,{yieldTask:async()=>{yields++;cancelled=yields===2;},cancelled:()=>cancelled}),/cancelled/);
  assert.equal(yields,2);
  assert.throws(()=>createProvingPlayback(original.runs),/admission/);
  let acceptedYields=0;
  const admitted=await admitProvingReplay(clone(original),revision,{yieldTask:async()=>{acceptedYields++;}});
  assert.equal(acceptedYields,Math.ceil(admitted.ticks/120));
  await assert.rejects(admitProvingReplay(clone(original),revision,{cancelled:()=>true}),/cancelled/);
});

test('inert schema admission rejects getters, symbols, hidden entries and toJSON without invoking them',async()=>{
  const original=await tape();let invoked=0;
  const getter=clone(original);Object.defineProperty(getter,'build',{enumerable:true,get(){invoked++;return original.build;}});
  await assert.rejects(admitProvingReplay(getter,revision),/data fields/);
  const nested=clone(original);Object.defineProperty(nested.result.metrics,'pathM',{enumerable:true,get(){invoked++;return 0;}});
  await assert.rejects(admitProvingReplay(nested,revision),/data fields/);
  const row=clone(original);Object.defineProperty(row.runs,'0',{enumerable:true,get(){invoked++;return original.runs[0];}});
  await assert.rejects(admitProvingReplay(row,revision),/accessor/);
  const json=clone(original);json.toJSON=()=>{invoked++;return original;};await assert.rejects(admitProvingReplay(json,revision),/unexpected/);
  const symbol=clone(original);symbol[Symbol('extra')]=true;await assert.rejects(admitProvingReplay(symbol,revision),/unexpected/);
  const sparse=clone(original);sparse.runs.length=2;await assert.rejects(admitProvingReplay(sparse,revision),/size|hole/);
  assert.equal(invoked,0);
});

test('UTF-8 byte size, malformed JSON and unsupported legacy contracts reject safely',async()=>{
  await assert.rejects(parseProvingReplay('x'.repeat(PROVING_REPLAY_BYTES+1),revision),/2 MiB/);
  await assert.rejects(parseProvingReplay('€'.repeat(Math.floor(PROVING_REPLAY_BYTES/3)+1),revision),/2 MiB/);
  await assert.rejects(parseProvingReplay('{broken',revision),/JSON/);
  await assert.rejects(parseProvingReplay('null',revision),/plain record/);
  await assert.rejects(parseProvingReplay('{"version":2}',revision),/fields/);
  const original=await tape();assert.throws(()=>validateTheatreReplay(clone(original),revision),/Unsupported replay version/);
});

test('unfinished, unstamped, zero-call or mutated terminal runs do not create exportable recordings',async()=>{
  const unstamped=createProvingRun({modelId:'cinder-two',build:stockVehicleBuild('cinder-two')});
  await assert.rejects(createProvingRecording(unstamped),/Finish/);
  startProvingRun(unstamped);stepProvingRun(unstamped,throttle);stopProvingRun(unstamped);
  await assert.rejects(createProvingRecording(unstamped),/source-stamped/);
  const zero=createProvingRun({modelId:'cinder-two',build:stockVehicleBuild('cinder-two'),sourceRevision:revision});
  startProvingRun(zero);stopProvingRun(zero);await assert.rejects(createProvingRecording(zero),/ticks/);
  const mutated={...measurement(),vehicle:{...measurement().vehicle,position:[0,0,-500]}};
  await assert.rejects(createProvingRecording(mutated),/physical state/);
});

test('build source identity matches the compiler independently of recorded inventory retention',async()=>{
  const original=await tape(),identity=await identifyVehicleBuild(original.modelId,original.build,revision);
  assert.equal(identity.buildDigest,original.buildDigest);assert.equal(identity.recipeDigest,original.recipeDigest);
  const extra=clone(original);extra.build.inventory.engine.push('competition');
  const admitted=await admitProvingReplay(extra,revision);
  assert.equal(admitted.buildDigest,original.buildDigest);assert.equal(admitted.recipeDigest,original.recipeDigest);
  assert.deepEqual(finish(createProvingPlayback(admitted)).run.vehicle,measurement().vehicle);
});
