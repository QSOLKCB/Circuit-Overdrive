// SPDX-License-Identifier: Apache-2.0
// The old runtime below is an immutable closure copied from published v1.3.0,
// not a rewritten mock of its validation, transaction or confirmation behavior.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createGarage, migrateLegacyGarage, parseGarage, parseGarageImport,
  pristineVehicleCondition, serializeGarage, validateGarage} from '../src/garage.js';
import {stockVehicleBuild} from '../src/vehicle-builds.js';
import {createGarageVault, GARAGE_SLOT} from '../src/garage-vault.js';
import {MAX_VAULT_SEQUENCE, parseVault, serializeVault, VAULT_BYTES} from '../src/garage-vault-format.js';
import {createGarage as oldCreate, parseGarage as oldParse, serializeGarage as oldSerialize,
  validateGarage as oldValidate} from './fixtures/garage-v1/garage.js';
import {createGarageVault as oldVault} from './fixtures/garage-v1/garage-vault.js';
import {serializeVault as oldSerializeVault} from './fixtures/garage-v1/garage-vault-format.js';

const root=new URL('./fixtures/garage-v1/',import.meta.url);
const fixtureData=JSON.parse(await readFile(new URL('states.json',root),'utf8'));
const fixtures=fixtureData.fixtures;
const byName=name=>fixtures.find(f=>f.name===name).garage;
const generation='0123456789abcdef0123456789abcdef';
const legacyRaw=(garage=byName('one-cinder-two'),sequence=23)=>oldSerializeVault({version:1,generation,sequence,garage});
const copy=value=>JSON.parse(JSON.stringify(value));

function storage(raw=null){
  let value=raw,readbackFault=false;
  return {
    writes:0, attempts:0, fault:null,
    getItem(key){
      assert.equal(key,GARAGE_SLOT);
      if(readbackFault){readbackFault=false;throw new DOMException('Interrupted verification','SecurityError');}
      return value;
    },
    setItem(key,next){
      assert.equal(key,GARAGE_SLOT);this.attempts++;
      if(this.fault==='quota')throw new DOMException('Full','QuotaExceededError');
      if(this.fault!=='drop'){value=next;this.writes++;}
      if(this.fault==='readback')readbackFault=true;
      if(this.fault==='throw-after-write')throw new DOMException('Unknown completion','SecurityError');
    },
    peek:()=>value,
    replace:next=>{value=next;}
  };
}
function locks(){
  return {held:false,async request(name,options,callback){
    assert.equal(name,GARAGE_SLOT);assert.deepEqual(options,{mode:'exclusive',ifAvailable:true});
    if(this.held)return callback(null);
    this.held=true;
    try{return await callback({name,mode:'exclusive'});}finally{this.held=false;}
  }};
}
function session(store=storage(),coordinator=locks(),factory=createGarageVault){
  const listeners=new Set(),changes=[];
  const target={addEventListener(type,fn){assert.equal(type,'storage');listeners.add(fn);},
    removeEventListener(type,fn){assert.equal(type,'storage');listeners.delete(fn);}};
  const vault=factory({getStorage:()=>store,getLocks:()=>coordinator,makeGeneration:()=>generation,
    eventTarget:target,onChange:view=>changes.push(view)});
  return {vault,changes,emit:()=>{for(const fn of [...listeners])fn({key:GARAGE_SLOT,storageArea:store});}};
}
const action=(state,type='buy',targetId='cinder-two')=>({type,targetId,expectedRevision:state.revision});
async function migrate(vault){
  const p=vault.prepareMigration();assert.equal(p.accepted,true,JSON.stringify(p));
  const r=await vault.confirm(p.ticket);assert.equal(r.accepted,true,JSON.stringify(r));
  return r;
}
function preserved(legacy,current){
  assert.equal(current.version,2);assert.equal(current.edition,'machine-shop-v1');
  for(const field of ['credits','nextVehicleId','activeVehicleId','revision','catalogRevision']){
    assert.equal(current[field],legacy[field],field+' must survive migration exactly');
  }
  assert.equal(current.bays.length,4);
  for(let i=0;i<4;i++){
    const a=legacy.bays[i],b=current.bays[i];
    if(a===null){assert.equal(b,null);continue;}
    assert.equal(b.ownedVehicleId,a.ownedVehicleId);
    assert.equal(b.modelId,a.modelId);
    assert.deepEqual(b.build,stockVehicleBuild(a.modelId));
    assert.deepEqual(b.condition,pristineVehicleCondition());
  }
}

test('immutable v1.3.0 validation/transaction/vault closure retains its exact source hashes',async()=>{
  const manifest=JSON.parse(await readFile(new URL('provenance.json',root),'utf8'));
  assert.equal(manifest.commit,'1c745a90258d0f6cb968935f773354cff702b276');
  assert.deepEqual(manifest.localChanges,[]);
  assert.deepEqual(Object.keys(manifest.sha256).sort(),['garage-catalog.js','garage-data.js','garage-transactions.js',
    'garage-vault-format.js','garage-vault.js','garage.js']);
  for(const [name,digest] of Object.entries(manifest.sha256)){
    assert.equal(createHash('sha256').update(await readFile(new URL(name,root))).digest('hex'),digest,name);
  }
  assert.equal(createHash('sha256').update(await readFile(new URL('states.json',root))).digest('hex'),
    manifest.fixturesSha256['states.json'],'immutable generated ownership fixtures');
  assert.equal(fixtureData.source,manifest.commit);
  assert(fixtures.some(f=>f.name==='four-full-bays'&&!f.synthetic));
  assert(fixtures.some(f=>f.name==='two-duplicate-models'&&!f.synthetic));
  for(const fixture of fixtures){
    assert.deepEqual(oldValidate(fixture.garage),fixture.garage,fixture.name);
    assert.deepEqual(oldParse(oldSerialize(fixture.garage)),fixture.garage,fixture.name);
  }
});

for(const fixture of fixtures){
  test('explicit migration preserves exact published ownership: '+fixture.name,async()=>{
    const original=copy(fixture.garage),raw=legacyRaw(original),store=storage(raw);
    const {vault,changes}=session(store);
    const loaded=vault.load();
    assert.equal(loaded.status,'MIGRATION REQUIRED');assert.equal(loaded.migrationRequired,true);
    assert.deepEqual(loaded.state,original,'the actual legacy ownership remains visible before migration');
    assert.equal(store.writes,0);assert.equal(store.peek(),raw);
    const p=vault.prepareMigration();
    assert.equal(p.accepted,true);assert.equal(p.preview.type,'migrate');
    assert.equal(p.backup,oldSerialize(original));
    preserved(original,p.preview.state);
    assert.deepEqual(vault.view.state,original,'a v2 proposal is not accepted state');
    assert.equal(vault.exportSave().text,oldSerialize(original));
    assert.equal(store.writes,0);
    const result=await vault.confirm(p.ticket);
    assert.equal(result.accepted,true,JSON.stringify(result));
    preserved(original,result.state);assert.deepEqual(fixture.garage,original);
    const envelope=parseVault(store.peek());
    assert.equal(envelope.version,2);assert.equal(envelope.generation,generation);
    assert.equal(envelope.sequence,24);assert.deepEqual(envelope.legacyBackup,original);
    assert.equal(store.writes,1);assert.equal(vault.view.status,'SAVED');
    assert.equal(vault.view.migrationRequired,false);assert.equal(vault.view.hasLegacyBackup,true);
    assert.equal(vault.exportLegacySave().text,oldSerialize(original));
    assert.deepEqual(parseGarage(vault.exportSave().text),result.state);
    assert.equal((await vault.confirm(p.ticket)).accepted,false,'single-use migration confirmation');
    assert.equal(vault.prepareMigration().reason,'migration-not-required');
    assert.equal(store.writes,1,'idempotent admission does not repeat a committed migration');
    const reloaded=session(store).vault;reloaded.load();
    assert.deepEqual(reloaded.view.state,result.state);
    assert.equal(reloaded.prepareMigration().reason,'migration-not-required');
    assert.deepEqual(changes.filter(v=>v.status==='SAVED').at(-1).state,result.state);
  });
}

test('legacy migration blocks ordinary mutations and cancellation performs no write',()=>{
  const store=storage(legacyRaw()),{vault}=session(store);vault.load();
  for(const result of [vault.prepareTransaction(action(vault.view.state)),vault.prepareReset(),
    vault.prepareImport(serializeGarage(createGarage()))]){
    assert.deepEqual(result,{accepted:false,reason:'migration-required'});
  }
  const p=vault.prepareMigration();vault.cancel();
  assert.equal(store.writes,0);assert.equal(vault.view.state.version,1);
  return vault.confirm(p.ticket).then(r=>assert.equal(r.accepted,false));
});

for(const kind of ['buy','reset','import']){
  test('actual published v1.3.0 '+kind+' confirmation cannot overwrite a newer schema',async()=>{
    const store=storage(legacyRaw()),coordinator=locks();
    const old=session(store,coordinator,oldVault).vault;old.load();
    const pending=kind==='buy'?old.prepareTransaction(action(old.view.state)):
      kind==='reset'?old.prepareReset():old.prepareImport(oldSerialize(oldCreate()));
    assert.equal(pending.accepted,true);
    const current=session(store,coordinator).vault;current.load();await migrate(current);
    const accepted=store.peek();
    const stale=await old.confirm(pending.ticket);
    assert.deepEqual(stale,{accepted:false,reason:'conflict'});
    assert.equal(store.peek(),accepted);assert.equal(store.writes,1);
  });
}

test('two migration attempts and a delayed old storage event cannot silently replace accepted ownership',async()=>{
  const store=storage(legacyRaw()),coordinator=locks();
  const a=session(store,coordinator),b=session(store,coordinator);
  a.vault.load();b.vault.load();
  const pa=a.vault.prepareMigration(),pb=b.vault.prepareMigration();
  assert.equal((await a.vault.confirm(pa.ticket)).accepted,true);
  const accepted=store.peek();
  assert.deepEqual(await b.vault.confirm(pb.ticket),{accepted:false,reason:'conflict'});
  assert.equal(store.peek(),accepted);assert.equal(store.writes,1);
  b.vault.load();b.emit();assert.equal(b.vault.view.status,'SAVED');
  assert.equal(b.vault.prepareMigration().reason,'migration-not-required');
});

test('a published old-tab purchase made after migration review is preserved through conflict and fresh review',async()=>{
  const store=storage(legacyRaw()),coordinator=locks();
  const current=session(store,coordinator).vault;current.load();
  const migration=current.prepareMigration();
  const old=session(store,coordinator,oldVault).vault;old.load();
  const purchase=old.prepareTransaction(action(old.view.state));
  const bought=await old.confirm(purchase.ticket);assert.equal(bought.accepted,true);
  const newLegacy=store.peek();
  assert.equal(bought.state.bays.filter(Boolean).length,2);
  assert.deepEqual(await current.confirm(migration.ticket),{accepted:false,reason:'conflict'});
  assert.equal(store.peek(),newLegacy);assert.equal(store.writes,1);
  current.load();const accepted=await migrate(current);
  preserved(bought.state,accepted.state);
  assert.equal(accepted.state.credits,1200);assert.equal(accepted.state.nextVehicleId,3);
  assert.equal(accepted.state.bays[1].ownedVehicleId,'car-000002');
  assert.equal(parseVault(store.peek()).sequence,25);
  assert.equal(store.writes,2);
});

for(const fault of ['quota','drop','readback','throw-after-write']){
  test('migration '+fault+' persistence failure needs explicit rollback-free reconciliation',async()=>{
    const raw=legacyRaw(),store=storage(raw),{vault}=session(store);vault.load();
    const p=vault.prepareMigration();store.fault=fault;
    const result=await vault.confirm(p.ticket);
    assert.equal(result.accepted,false);
    assert.equal(result.reason,['quota','throw-after-write'].includes(fault)?'write-failed':'verification-failed');
    assert.equal(vault.view.state.version,1,'unverified v2 proposal is not published');
    assert.equal(vault.prepareMigration().accepted,false,'failure requires explicit reload');
    store.fault=null;
    const writesBeforeReload=store.writes;vault.load();
    assert.equal(store.writes,writesBeforeReload,'load never rolls back or repeats persistence');
    if(['readback','throw-after-write'].includes(fault)){
      assert.equal(vault.view.state.version,2,'reload discovers a whole committed migration');
      assert.equal(vault.prepareMigration().reason,'migration-not-required');
      assert.equal(vault.exportLegacySave().text,oldSerialize(byName('one-cinder-two')));
    }else{
      assert.equal(store.peek(),raw);assert.equal(vault.view.state.version,1);
      await migrate(vault);assert.equal(store.writes,1);
    }
  });
}

test('migration keeps exhausted garage counters but cannot wrap the storage sequence',async()=>{
  const legacy=byName('revision-and-serial-exhausted'),store=storage(legacyRaw(legacy,MAX_VAULT_SEQUENCE));
  const {vault}=session(store);vault.load();
  const p=vault.prepareMigration();assert.equal(p.accepted,true);
  assert.deepEqual(await vault.confirm(p.ticket),{accepted:false,reason:'sequence-exhausted'});
  assert.equal(store.writes,0);assert.equal(vault.exportSave().text,oldSerialize(legacy));
  store.replace(legacyRaw(legacy,MAX_VAULT_SEQUENCE-1));vault.load();
  const r=await migrate(vault);preserved(legacy,r.state);
  assert.equal(parseVault(store.peek()).sequence,MAX_VAULT_SEQUENCE);
  assert.equal(r.state.revision,99999999);assert.equal(r.state.nextVehicleId,1000000);
});

test('bounded current state plus a canonical legacy backup fits the unchanged 64KiB envelope limit',async()=>{
  const legacy=byName('worst-case-valid-fields'),raw=legacyRaw(legacy,MAX_VAULT_SEQUENCE-1);
  const padded=raw+' '.repeat(VAULT_BYTES-Buffer.byteLength(raw));
  assert.equal(Buffer.byteLength(padded),VAULT_BYTES);
  const store=storage(padded),{vault}=session(store);vault.load();await migrate(vault);
  assert.equal(Buffer.byteLength(store.peek()),2102,'measured largest B state plus matching canonical legacy backup');
  assert.equal(VAULT_BYTES,65536);
  assert.deepEqual(parseVault(store.peek()).legacyBackup,legacy);
});

test('current envelope rejects malformed legacy backups and unsupported versions without mutating accepted ownership',async()=>{
  const store=storage(legacyRaw()),{vault}=session(store);vault.load();await migrate(vault);
  const accepted=store.peek(),state=vault.view.state,base=parseVault(accepted);
  for(const change of [
    d=>{delete d.legacyBackup;},d=>{d.version=3;},
    d=>{d.legacyBackup={...d.legacyBackup,version:2};},
    d=>{d.legacyBackup.credits=-1;},
    d=>{d.legacyBackup.bays[0].build=stockVehicleBuild('cinder-two');},
    d=>{d.legacyBackup.bays[0].modelId='unknown-model';},
    d=>{d.legacyBackup.nextVehicleId=1;},
    d=>{d.legacyBackup.activeVehicleId='car-999999';},
    d=>{d.legacyBackup={};}
  ]){
    const invalid=copy(base);change(invalid);
    assert.throws(()=>serializeVault(invalid));
    assert.throws(()=>parseVault(JSON.stringify(invalid)));
    assert.deepEqual(vault.prepareImport(JSON.stringify(invalid)),{accepted:false,reason:'invalid-import'});
    assert.equal(store.peek(),accepted);assert.deepEqual(vault.view.state,state);
    assert.equal(vault.exportLegacySave().text,oldSerialize(base.legacyBackup));
  }
});

test('unsupported or corrupt legacy saves are never automatically migrated or erased',()=>{
  for(const raw of ['{','null',JSON.stringify({version:3}),legacyRaw().replace('after-hours-v1','unsupported')]){
    const store=storage(raw),{vault}=session(store);vault.load();
    assert.equal(vault.prepareMigration().accepted,false);
    assert.equal(store.writes,0);assert.equal(store.peek(),raw);
  }
  const malformed=copy(byName('one-cinder-two'));malformed.bays[0].ownedVehicleId='car-000000';
  assert.throws(()=>migrateLegacyGarage(malformed));
  assert.throws(()=>migrateLegacyGarage({...byName('empty'),version:2}));
});

test('legacy and current imports are explicit whole-state proposals and preserve recoverable legacy provenance',async()=>{
  const store=storage(),{vault}=session(store);vault.load();
  const legacy=byName('four-full-bays'),raw=oldSerialize(legacy);
  const admitted=parseGarageImport(raw);assert.equal(admitted.legacy,true);preserved(legacy,admitted.state);
  const p=vault.prepareImport(raw);assert.equal(p.accepted,true);assert.equal(store.writes,0);
  assert.equal(vault.view.state,null);
  const r=await vault.confirm(p.ticket);assert.equal(r.accepted,true);preserved(legacy,r.state);
  assert.equal(vault.exportLegacySave().text,raw);
  const current=vault.exportSave().text;
  assert.equal(parseGarageImport(current).legacy,false);
  const imported=vault.prepareImport(current);assert.equal(imported.accepted,true);
  assert.equal((await vault.confirm(imported.ticket)).accepted,true);
  assert.equal(vault.exportSave().text,current);
  assert.equal(vault.exportLegacySave().text,raw,'ordinary import does not erase first retained legacy backup');
  const reset=vault.prepareReset();assert.equal((await vault.confirm(reset.ticket)).accepted,true);
  assert.deepEqual(vault.view.state,createGarage());
  assert.equal(vault.exportLegacySave().text,raw,'explicit reset remains recoverable through the separately retained backup');
  assert.equal(parseVault(store.peek()).sequence,2);
});

test('duplicate-model owned cars receive independent deeply immutable build/condition records',()=>{
  const state=migrateLegacyGarage(byName('two-duplicate-models'));
  const [a,b]=state.bays;
  assert.notEqual(a.ownedVehicleId,b.ownedVehicleId);assert.equal(a.modelId,b.modelId);
  assert.notEqual(a.build,b.build);assert.notEqual(a.build.parts,b.build.parts);assert.notEqual(a.condition,b.condition);
  assert.throws(()=>{a.build.parts.engine='forged';},TypeError);
  assert.equal(b.build.parts.engine,'stock');
  assert.deepEqual(validateGarage(state),state);
  assert.throws(()=>validateGarage({...state,bays:[{...a,condition:{version:1,status:'damaged'}},b,null,null]}));
});
