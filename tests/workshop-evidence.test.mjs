// SPDX-License-Identifier: Apache-2.0
// The temporary evidence cache never participates in garage persistence.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createGarage,serializeGarage} from '../src/garage.js';
import {transactGarage} from '../src/garage-transactions.js';
import {stockVehicleBuild} from '../src/vehicle-builds.js';
import {createProvingRun,startProvingRun,stepProvingRun,stopProvingRun} from '../src/proving-ground.js';
import {createProvingRecording} from '../src/proving-replay.js';
import {WORKSHOP_EVIDENCE_SLOT,WORKSHOP_EVIDENCE_BYTES,retainWorkshopRecording} from '../src/workshop-evidence.js';

const SOURCE='57a30486fcf8674e30486d01dea972b8981bcccd';
const GARAGE_SLOT='circuit-overdrive.garage.v1';
function store(initial=[]){
  const values=new Map(initial),reads=[],writes=[];
  return {values,reads,writes,getItem(key){reads.push(key);return values.get(key)??null;},
    setItem(key,value){writes.push({key,value});values.set(key,value);}};
}
function ownedGarage(){
  const result=transactGarage(createGarage(),{type:'buy',targetId:'cinder-two',expectedRevision:0});
  assert(result.accepted);return result.state;
}
async function recording(ownedVehicleId='car-000001',ticks=1,testId='practice'){
  const run=createProvingRun({modelId:'cinder-two',build:stockVehicleBuild('cinder-two'),ownedVehicleId,
    sourceRevision:SOURCE,testId,driver:'manual'});
  startProvingRun(run);
  for(let i=0;i<ticks;i++)stepProvingRun(run,{throttle:.2,brake:0,steer:0});
  stopProvingRun(run);return createProvingRecording(run);
}
const entries=storage=>JSON.parse(storage.values.get(WORKSHOP_EVIDENCE_SLOT)).entries;

test('free unowned practice recordings are not cached and never access storage',async()=>{
  const tape=await recording(null),storage=store();
  assert.equal(retainWorkshopRecording(tape,'stock',storage),false);
  assert.deepEqual(storage.reads,[]);assert.deepEqual(storage.writes,[]);assert.equal(storage.values.size,0);
});

test('retaining a physically admitted test writes only transient evidence and preserves exact garage ownership',async()=>{
  const garage=ownedGarage(),before=serializeGarage(garage),storage=store([[GARAGE_SLOT,before]]);
  const tape=await recording();assert.equal(retainWorkshopRecording(tape,'current',storage),true);
  const saved=entries(storage);assert.equal(saved.length,1);assert.equal(saved[0].mode,'current');
  assert.equal(saved[0].recording.ownedVehicleId,'car-000001');assert.equal(saved[0].recording.version,7);
  assert.deepEqual(saved[0].recording.result,tape.result);assert.equal(saved[0].recording.ticks,1);
  assert.equal(storage.values.get(GARAGE_SLOT),before);assert.equal(serializeGarage(garage),before);
  assert(storage.reads.every(key=>key===WORKSHOP_EVIDENCE_SLOT));
  assert(storage.writes.every(write=>write.key===WORKSHOP_EVIDENCE_SLOT));
});

test('cache is bounded to the latest twelve distinct owned ID, test and mode records',async()=>{
  const storage=store();
  for(let n=1;n<=13;n++)retainWorkshopRecording(await recording('car-'+String(n).padStart(6,'0')),'current',storage);
  const saved=entries(storage);assert.equal(saved.length,12);
  assert.equal(saved[0].recording.ownedVehicleId,'car-000002');assert.equal(saved.at(-1).recording.ownedVehicleId,'car-000013');
  assert(new TextEncoder().encode(storage.values.get(WORKSHOP_EVIDENCE_SLOT)).length<=WORKSHOP_EVIDENCE_BYTES);
});

test('same owned ID/test/mode replaces its prior test while other modes, tests and cars remain independent',async()=>{
  const storage=store(),first=await recording(),newer=await recording('car-000001',2);
  retainWorkshopRecording(first,'stock',storage);retainWorkshopRecording(first,'current',storage);
  retainWorkshopRecording(await recording('car-000001',1,'acceleration'),'current',storage);
  retainWorkshopRecording(await recording('car-000002'),'current',storage);
  retainWorkshopRecording(newer,'current',storage);
  const saved=entries(storage);assert.equal(saved.length,4);
  const replacement=saved.filter(entry=>entry.mode==='current'&&entry.recording.ownedVehicleId==='car-000001'&&entry.recording.testId==='practice');
  assert.equal(replacement.length,1);assert.equal(replacement[0].recording.ticks,2);
  assert.equal(saved.find(entry=>entry.mode==='stock').recording.ticks,1);
  assert.equal(saved.find(entry=>entry.recording.testId==='acceleration').recording.result.status,'non-completion');
  assert.equal(saved.find(entry=>entry.recording.ownedVehicleId==='car-000002').recording.ticks,1);
});

test('malformed, unsupported and oversized transient cache is replaceable without reading or modifying ownership',async()=>{
  const tape=await recording(),garage=serializeGarage(ownedGarage());
  for(const corrupt of ['{broken',JSON.stringify({version:99,entries:[]}),JSON.stringify({version:1,entries:[{mode:'unknown',recording:{}}]}),'x'.repeat(WORKSHOP_EVIDENCE_BYTES+1)]){
    const storage=store([[GARAGE_SLOT,garage],[WORKSHOP_EVIDENCE_SLOT,corrupt]]);
    assert.equal(retainWorkshopRecording(tape,'current',storage),true);
    assert.equal(entries(storage).length,1);assert.equal(storage.values.get(GARAGE_SLOT),garage);
    assert(storage.reads.every(key=>key===WORKSHOP_EVIDENCE_SLOT));assert(storage.writes.every(write=>write.key===WORKSHOP_EVIDENCE_SLOT));
  }
});

test('read failure can replace temporary evidence, while quota/write failures propagate without touching ownership',async()=>{
  const tape=await recording(),garage=serializeGarage(ownedGarage()),recoverable=store([[GARAGE_SLOT,garage]]);
  recoverable.getItem=key=>{recoverable.reads.push(key);throw Error('evidence read unavailable');};
  assert.equal(retainWorkshopRecording(tape,'current',recoverable),true);
  assert.equal(entries(recoverable).length,1);assert.equal(recoverable.values.get(GARAGE_SLOT),garage);
  for(const reason of ['quota exceeded','evidence write unavailable']){
    const storage=store([[GARAGE_SLOT,garage],[WORKSHOP_EVIDENCE_SLOT,'{"version":1,"entries":[]}']]);
    const prior=storage.values.get(WORKSHOP_EVIDENCE_SLOT);
    storage.setItem=(key,value)=>{storage.writes.push({key,value});throw Error(reason);};
    assert.throws(()=>retainWorkshopRecording(tape,'current',storage),new RegExp(reason));
    assert.equal(storage.values.get(GARAGE_SLOT),garage);assert.equal(storage.values.get(WORKSHOP_EVIDENCE_SLOT),prior);
    assert(storage.writes.every(write=>write.key===WORKSHOP_EVIDENCE_SLOT));
  }
});

test('unadmitted recording copies and unknown modes cannot be retained as trusted cache inputs',async()=>{
  const tape=await recording(),storage=store();
  assert.throws(()=>retainWorkshopRecording(JSON.parse(JSON.stringify(tape)),'current',storage),/physical admission/);
  assert.throws(()=>retainWorkshopRecording({...tape,result:{status:'completed'}},'current',storage),/physical admission/);
  assert.throws(()=>retainWorkshopRecording(tape,'unknown',storage),/Unknown test configuration/);
  assert.deepEqual(storage.reads,[]);assert.deepEqual(storage.writes,[]);
});
