// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {GARAGE_CATALOG} from '../src/garage-catalog.js';
import {GARAGE_EDITION, GARAGE_SAVE_BYTES, GARAGE_VERSION, MAX_REVISION,
  createGarage, migrateLegacyGarage, parseGarage, parseGarageImport,
  pristineVehicleCondition, serializeGarage, validateGarage,
  validateVehicleCondition} from '../src/garage.js';
import {createLegacyGarage, parseLegacyGarage, serializeLegacyGarage,
  validateLegacyGarage} from '../src/garage-legacy.js';
import {transactGarage} from '../src/garage-transactions.js';
import {compileVehicleBuild, stockVehicleBuild} from '../src/vehicle-builds.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const source='1c745a90258d0f6cb968935f773354cff702b276';
const id=n=>'car-'+String(n).padStart(6,'0');
const legacyCar=(n,modelId='cinder-two')=>({ownedVehicleId:id(n),modelId});
function legacy(bays=[legacyCar(2),null,legacyCar(7),null],activeVehicleId=id(7)) {
  return validateLegacyGarage({version:1,edition:'after-hours-v1',catalogRevision:1,
    credits:913,nextVehicleId:11,activeVehicleId,bays,revision:42});
}
function unchangedOwnership(a,b) {
  for(const key of ['credits','nextVehicleId','activeVehicleId','revision','catalogRevision']) {
    assert.equal(b[key],a[key],key+' must survive migration exactly');
  }
  assert.deepEqual(b.bays.map(car=>car && ({ownedVehicleId:car.ownedVehicleId,modelId:car.modelId})),a.bays);
}
function frozenTree(value) {
  if(value && typeof value==='object') {
    assert(Object.isFrozen(value));
    for(const child of Object.values(value))frozenTree(child);
  }
}

test('legacy admission preserves the exact published v1.3.0 registry source body',async()=>{
  const module=await readFile(new URL('../src/garage-legacy.js',import.meta.url),'utf8');
  const marker='\n// CO-014B legacy admission';
  assert.equal(module.split(marker).length,2);
  assert(module.includes(source));
  assert.equal(createHash('sha256').update(module.split(marker)[0]).digest('hex'),
    'f43baf8f34337226daa0a86a4cf8833ea8814f6bb37fe968f923ed5cc5939bae');
  assert.equal(createLegacyGarage().version,1);
  assert.deepEqual(parseLegacyGarage(serializeLegacyGarage(legacy())),legacy());
});

test('new current garages retain the initial economy with explicit schema 2 and no owned damage',()=>{
  const first=createGarage(),second=createGarage();
  assert.equal(GARAGE_VERSION,2);assert.equal(GARAGE_EDITION,'machine-shop-v1');
  assert.deepEqual(first,{version:2,edition:'machine-shop-v1',catalogRevision:1,
    credits:2400,nextVehicleId:1,activeVehicleId:null,bays:[null,null,null,null],revision:0});
  assert.notStrictEqual(first,second);assert.notStrictEqual(first.bays,second.bays);
  frozenTree(first);
  assert.deepEqual(pristineVehicleCondition(),{version:1,status:'pristine'});
  assert.notStrictEqual(pristineVehicleCondition(),pristineVehicleCondition());
});

test('legacy empty, one-car, sparse, full duplicate-model and every-active-bay states preserve ownership exactly',()=>{
  const fixtures=[createLegacyGarage(),legacy([legacyCar(2),null,null,null],id(2)),legacy()];
  const full=[legacyCar(1),legacyCar(3),legacyCar(7),legacyCar(10)];
  for(const active of full)fixtures.push(legacy(full,active.ownedVehicleId));
  for(const before of fixtures) {
    const caller=clone(before),untouched=clone(caller);
    const current=migrateLegacyGarage(caller);
    unchangedOwnership(before,current);
    assert.deepEqual(caller,untouched,'migration never mutates/freezes caller input');
    assert(!Object.isFrozen(caller));
    assert.equal(current.version,2);assert.equal(current.edition,'machine-shop-v1');
    for(const [bay,car] of current.bays.entries())if(car) {
      assert.deepEqual(car.build,stockVehicleBuild(before.bays[bay].modelId));
      assert.deepEqual(car.condition,{version:1,status:'pristine'});
      assert.deepEqual(compileVehicleBuild(car.modelId,car.build).build,car.build);
    }
    assert.deepEqual(migrateLegacyGarage(before),current,'repeating the same legacy transition is deterministic, not rewarding');
    assert.deepEqual(parseGarage(serializeGarage(current)),current);
    frozenTree(current);
  }
});

test('same-model cars own independent copied build and condition records',()=>{
  const current=migrateLegacyGarage(legacy([legacyCar(2),legacyCar(3),null,null],id(2)));
  const [a,b]=current.bays;
  assert.notEqual(a.ownedVehicleId,b.ownedVehicleId);assert.equal(a.modelId,b.modelId);
  assert.notStrictEqual(a.build,b.build);assert.notStrictEqual(a.build.parts,b.build.parts);
  assert.notStrictEqual(a.condition,b.condition);
  const proposal=clone(current),unchanged=serializeGarage(current);
  proposal.bays[0].build.parts.engine='unsupported-upgrade';
  assert.throws(()=>validateGarage(proposal));
  assert.equal(serializeGarage(current),unchanged);
  assert.equal(proposal.bays[1].build.parts.engine,'stock');
  assert.throws(()=>{a.build.parts.tyres='unsupported-upgrade';},TypeError);
  assert.equal(b.build.parts.tyres,'stock');
  // Even an intentionally shared caller build must become per-car owned copies.
  const shared=clone(current);shared.bays[1].build=shared.bays[0].build;
  const accepted=validateGarage(shared);
  assert.notStrictEqual(accepted.bays[0].build,accepted.bays[1].build);
  shared.bays[0].build.parts.paint='bad';
  assert.equal(accepted.bays[0].build.parts.paint,'factory');
  assert.equal(accepted.bays[1].build.parts.paint,'factory');
});

test('current owned-car admission rejects unsupported parts, build rules, tuning, damage and ownership fields',()=>{
  const current=migrateLegacyGarage(legacy());
  for(const change of [
    car=>{delete car.build;},car=>{delete car.condition;},car=>{car.parts={};},
    car=>{car.build.version=2;},car=>{car.build.rulesVersion=2;},
    car=>{car.build.parts.engine='unknown';},car=>{car.build.parts.gearbox={ratios:[6,1,3]};},
    car=>{car.build.parts.engine={torqueCurve:[[850,999999],[6800,-1]]};},
    car=>{car.build.parts.tyres=Infinity;},car=>{car.build.tune={spring:NaN};},
    car=>{car.build.recipe={mass:1};},car=>{car.build.parts.paint='x'.repeat(65536);},
    car=>{car.condition.version=2;},car=>{car.condition.status='damaged';},
    car=>{car.condition.damage=1;},car=>{car.condition={version:1,status:'pristine',repairCost:0};},
    car=>{car.condition=null;},car=>{car.ownedVehicleId='car-000000';},
    car=>{car.modelId='uninstalled';}
  ]) {
    const proposal=clone(current),prior=serializeGarage(current);
    change(proposal.bays[0]);
    assert.throws(()=>validateGarage(proposal));
    assert.equal(serializeGarage(current),prior);
  }
  for(const condition of [undefined,null,{},[],{version:1,status:'pristine',wear:0},
    {version:1,status:'repairable'},{version:2,status:'pristine'}]) {
    assert.throws(()=>validateVehicleCondition(condition));
  }
});

test('owned build and condition accessors are rejected without execution',()=>{
  let calls=0;
  const getter=()=>{calls++;throw Error('accessor must remain inert');};
  for(const [target,key] of [['car','build'],['car','condition'],['parts','engine'],['condition','status']]) {
    const value=clone(migrateLegacyGarage(legacy()));
    const car=value.bays[0],where=target==='car'?car:target==='parts'?car.build.parts:car.condition;
    Object.defineProperty(where,key,{enumerable:true,get:getter});
    assert.throws(()=>validateGarage(value));
  }
  assert.equal(calls,0);
});

test('legacy/current import is explicit and bounded; current admission never silently migrates',()=>{
  const old=legacy(),current=migrateLegacyGarage(old);
  assert.throws(()=>validateGarage(old));assert.throws(()=>parseGarage(JSON.stringify(old)));
  const imported=parseGarageImport(JSON.stringify(old));
  assert.equal(imported.legacy,true);assert.deepEqual(imported.state,current);frozenTree(imported);
  const roundtrip=parseGarageImport(serializeGarage(current));
  assert.equal(roundtrip.legacy,false);assert.deepEqual(roundtrip.state,current);frozenTree(roundtrip);
  for(const text of ['',null,undefined,{},'null','[]','false','{',
    JSON.stringify({...old,version:3}),JSON.stringify({...old,edition:'other'}),
    JSON.stringify({...current,version:99}),JSON.stringify({...old,bays:[{...old.bays[0],build:stockVehicleBuild('cinder-two')},null,null,null]})]) {
    assert.throws(()=>parseGarageImport(text));
  }
  const raw=serializeGarage(current),limit=raw+' '.repeat(GARAGE_SAVE_BYTES-Buffer.byteLength(raw));
  assert.deepEqual(parseGarageImport(limit).state,current);
  assert.throws(()=>parseGarageImport(limit+' '),RangeError);
  assert.throws(()=>parseGarageImport('"'+'é'.repeat(32768)+'"'),RangeError);
});

test('legacy serial/revision exhaustion and maximum credits survive without wrap, reset or reward',()=>{
  const prior={...legacy(),bays:[legacyCar(999999),null,null,null],activeVehicleId:id(999999),
    credits:99999999,nextVehicleId:1000000,revision:MAX_REVISION};
  const current=migrateLegacyGarage(prior);
  unchangedOwnership(prior,current);
  assert.deepEqual(transactGarage(current,{type:'buy',targetId:'cinder-two',expectedRevision:MAX_REVISION}),
    {accepted:false,reason:'revision-exhausted'});
  const serialOnly=validateGarage({...current,revision:0,bays:[null,null,null,null],activeVehicleId:null});
  assert.deepEqual(transactGarage(serialOnly,{type:'buy',targetId:'cinder-two',expectedRevision:0}),
    {accepted:false,reason:'vehicle-id-exhausted'});
});

test('ordinary purchases allocate one stock build and pristine condition for each stable owned identity',()=>{
  let current=createGarage();
  for(let n=1;n<=2;n++) {
    const before=serializeGarage(current);
    const result=transactGarage(current,{type:'buy',targetId:'cinder-two',expectedRevision:current.revision});
    assert(result.accepted);assert.equal(serializeGarage(current),before);
    assert.equal(result.state.bays[n-1].ownedVehicleId,id(n));
    assert.deepEqual(result.state.bays[n-1].build,stockVehicleBuild('cinder-two'));
    assert.deepEqual(result.state.bays[n-1].condition,{version:1,status:'pristine'});
    assert.equal(result.state.credits,2400-600*n);
    assert.equal(result.state.revision,n);assert.equal(result.state.nextVehicleId,n+1);
    current=result.state;
  }
  assert.notStrictEqual(current.bays[0].build,current.bays[1].build);
  const selected=transactGarage(current,{type:'select',targetId:id(2),expectedRevision:2});
  assert(selected.accepted);assert.equal(selected.state.activeVehicleId,id(2));
  assert.deepEqual(selected.state.bays,current.bays);
  const sold=transactGarage(selected.state,{type:'sell',targetId:id(1),expectedRevision:3});
  assert(sold.accepted);assert.equal(sold.state.credits,1560);
  assert.deepEqual(sold.state.bays[1],current.bays[1]);
  assert.equal(sold.state.nextVehicleId,3,'sale never changes serial allocation');
});

test('largest current supported stock save is measured within the unchanged 64 KiB bound',()=>{
  let maximum=0;
  for(const {modelId} of GARAGE_CATALOG) {
    const value={version:1,edition:'after-hours-v1',catalogRevision:1,
      credits:99999999,nextVehicleId:1000000,revision:99999999,activeVehicleId:id(999999),
      bays:[999996,999997,999998,999999].map(n=>legacyCar(n,modelId))};
    const bytes=Buffer.byteLength(serializeGarage(migrateLegacyGarage(value)));
    maximum=Math.max(maximum,bytes);
    assert(bytes<GARAGE_SAVE_BYTES);
  }
  // Longest supported model ID, four occupied bays, maximum-length integer
  // counters/credits and IDs. No input permits arbitrary strings or recipes.
  assert.equal(maximum,1604);
});
