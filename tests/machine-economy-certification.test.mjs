// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {certifyGeneratedEconomy,auditPublishedOwnership,measureOwnershipBounds} from '../scripts/certify-machine-economy.mjs';
import {createGarage,validateGarage,serializeGarage} from '../src/garage.js';
import {transactGarage,transactGarageInstallation} from '../src/garage-transactions.js';
import {createGarageVault,GARAGE_SLOT} from '../src/garage-vault.js';
import {serializeVault,parseVault} from '../src/garage-vault-format.js';

const zero={finalDrive:0,spring:0,damper:0,travel:0,steering:0};
const generation='1234567890abcdef1234567890abcdef';
const buy=(state,model='cinder-two')=>{
  const result=transactGarage(state,{type:'buy',targetId:model,expectedRevision:state.revision});assert(result.accepted);return result.state;
};
function installAction(state,ownedVehicleId='car-000001',slot='engine',partId='street'){
  const car=state.bays.find(car=>car?.ownedVehicleId===ownedVehicleId);
  return {type:'install',ownedVehicleId,slot,partId,tuning:{...(car?.build.tuning??zero)},expectedRevision:state.revision};
}
function storeFor(state){
  let text=serializeVault({version:2,generation,sequence:7,garage:state,legacyBackup:null});
  return {writes:0,fault:null,peek:()=>text,getItem(key){assert.equal(key,GARAGE_SLOT);return text;},
    setItem(key,next){assert.equal(key,GARAGE_SLOT);text=next;this.writes++;
      if(this.fault==='throw-after-write')throw new DOMException('Unknown write completion','SecurityError');}};
}
function session(store,locks={async request(name,options,callback){return callback({name,mode:options.mode});}}){
  return createGarageVault({getStorage:()=>store,getLocks:()=>locks,makeGeneration:()=>generation,
    eventTarget:{addEventListener(){},removeEventListener(){}}});
}

test('mixed-model generated ownership and inventory operations agree with an independent journal for every owned car',()=>{
  const report=certifyGeneratedEconomy(48);
  assert.equal(report.operations,48*24);assert.equal(report.publishedOpeningSequences,24);
  assert.equal(report.syntheticOpeningSequences,24);assert.equal(report.duplicateModelSequences,24);
  assert.equal(report.sameIntentRetries,report.installs);assert.equal(report.unchangedDuplicateFits,report.installs);
  assert(report.refits>0&&report.setupChanges>0&&report.rejected>0);
  assert.equal(Object.keys(report.modelInstalls).length,6);
  for(const slots of Object.values(report.modelInstalls))assert(Object.values(slots).every(count=>count>0));
  assert.match(report.journalSha256,/^[a-f0-9]{64}$/);
});

test('legacy closure matches actual published Git blobs and all eighteen ownership fixtures preserve every field',()=>{
  const report=auditPublishedOwnership();
  assert.equal(report.published,'1c745a90258d0f6cb968935f773354cff702b276');
  assert.equal(Object.keys(report.sourceClosureSha256).length,6);assert.equal(report.fixtures.length,18);
  assert(report.fixtures.some(f=>f.name==='two-duplicate-models'&&!f.synthetic));
  assert(report.fixtures.some(f=>f.name==='revision-and-serial-exhausted'&&f.synthetic));
  assert(report.fixtures.some(f=>f.ownedIds.filter(Boolean).length===4));
});

test('full inventories, signed bounds and recoverable legacy backup fit the unchanged 64 KiB envelope',()=>{
  assert.deepEqual(measureOwnershipBounds(),{
    buildBytes:708,garageBytes:3444,vaultBytes:3942,limits:{buildBytes:2048,garageBytes:65536,vaultBytes:65536},
    policy:'Complete finite inventories, longest compatible fitted IDs, signed maximum-width tuning, four longest-model identities, maximum counters/credits and recoverable legacy backup. Synthetic admission boundaries, not earned funds.'});
});

test('unsupported mixed torque cannot charge either same-model owner and upgrades have no resale refund',()=>{
  // Explicit synthetic admission budget exercises parts unaffordable in the
  // ordinary 2400-credit opening. No production reward or live save is created.
  let state=validateGarage({...createGarage(),credits:10000});state=buy(buy(state,'rivet-eight'),'rivet-eight');
  const second=state.bays[1];
  for(const [slot,partId] of [['engine','competition'],['intake','duct']]){
    const result=transactGarageInstallation(state,installAction(state,'car-000001',slot,partId));assert(result.accepted);state=result.state;
  }
  assert.equal(state.credits,5330);const before=serializeGarage(state);
  assert.deepEqual(transactGarageInstallation(state,installAction(state,'car-000001','exhaust','flow')),{accepted:false,reason:'invalid-build'});
  assert.equal(serializeGarage(state),before);assert.deepEqual(state.bays[1],second);
  assert.deepEqual(state.bays[0].build.inventory.exhaust,['stock']);
  const sold=transactGarage(state,{type:'sell',targetId:'car-000001',expectedRevision:state.revision});assert(sold.accepted);
  assert.equal(sold.receipt.creditDelta,1080);assert.equal(sold.state.credits,6410);
  assert.equal(sold.state.bays[0],null);assert.deepEqual(sold.state.bays[1],second);
  assert.equal(sold.state.activeVehicleId,'car-000002');assert.equal(sold.state.nextVehicleId,3);
  assert.deepEqual(transactGarage(sold.state,{type:'repair',targetId:'car-000002',expectedRevision:sold.state.revision}),{accepted:false,reason:'invalid-request'});
  assert.deepEqual(sold.state.bays[1].condition,{version:1,status:'pristine'});
});

test('concurrent fittings to different owned cars reject stale whole-state commits, then settle independently once',async()=>{
  const initial=buy(buy(createGarage())),store=storeFor(initial),locks={held:false,async request(name,options,callback){
    assert(!this.held);this.held=true;try{return await callback({name,mode:options.mode});}finally{this.held=false;}}};
  const a=session(store,locks),b=session(store,locks);a.load();b.load();
  const first=a.prepareInstallation(installAction(a.view.state));assert(first.accepted);
  const stale=b.prepareInstallation(installAction(b.view.state,'car-000002','tyres','performance'));assert(stale.accepted);
  assert((await a.confirm(first.ticket)).accepted);const afterFirst=store.peek();
  assert.deepEqual(await b.confirm(stale.ticket),{accepted:false,reason:'conflict'});assert.equal(store.peek(),afterFirst);
  b.load();const second=b.prepareInstallation(installAction(b.view.state,'car-000002','tyres','performance'));
  assert(second.accepted);assert((await b.confirm(second.ticket)).accepted);a.load();
  assert.equal(a.view.state.credits,690);assert.equal(a.view.state.bays[0].build.parts.engine,'street');
  assert.equal(a.view.state.bays[0].build.parts.tyres,'stock');assert.equal(a.view.state.bays[1].build.parts.engine,'stock');
  assert.equal(a.view.state.bays[1].build.parts.tyres,'performance');assert.equal(store.writes,2);
  assert.equal((await a.confirm(first.ticket)).accepted,false);assert.equal((await b.confirm(second.ticket)).accepted,false);
  assert.equal(b.prepareInstallation(installAction(b.view.state,'car-000002','tyres','performance')).reason,'already-fitted');
  assert.equal(store.writes,2);a.dispose();b.dispose();
});

test('an installation that writes then throws reconciles without rollback, free parts or duplicate payment',async()=>{
  const before=buy(createGarage()),store=storeFor(before),vault=session(store);vault.load();
  const request=installAction(before),pending=vault.prepareInstallation(request);assert(pending.accepted);
  store.fault='throw-after-write';assert.deepEqual(await vault.confirm(pending.ticket),{accepted:false,reason:'write-failed'});
  assert.deepEqual(vault.view.state,before);assert.equal(vault.view.status,'STORAGE UNAVAILABLE');assert.equal(store.writes,1);
  const committed=parseVault(store.peek()).garage;assert.equal(committed.credits,1530);
  assert.equal(committed.bays[0].build.parts.engine,'street');assert.equal(committed.revision,before.revision+1);
  store.fault=null;vault.load();assert.deepEqual(vault.view.state,committed);
  assert.equal((await vault.confirm(pending.ticket)).accepted,false);
  assert.equal(vault.prepareInstallation(installAction(vault.view.state)).reason,'already-fitted');
  assert.equal(store.writes,1);vault.dispose();
});
