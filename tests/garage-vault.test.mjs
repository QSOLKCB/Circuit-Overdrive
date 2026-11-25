// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import {createGarage, serializeGarage} from '../src/garage.js';
import {createGarageVault, GARAGE_SLOT} from '../src/garage-vault.js';
import {VAULT_BYTES, MAX_VAULT_SEQUENCE, parseVault, serializeVault} from '../src/garage-vault-format.js';

const generation = '0123456789abcdef'.repeat(2);
const clone = value => structuredClone(value);
const envelope = (garage=createGarage(), sequence=0) => ({version:1,generation,sequence,garage});
function events() {
  const listeners = new Set();
  return {
    addEventListener(type, fn) { assert.equal(type,'storage'); listeners.add(fn); },
    removeEventListener(type, fn) { assert.equal(type,'storage'); listeners.delete(fn); },
    emit(event) { for (const fn of [...listeners]) fn(event); },
    get count() { return listeners.size; }
  };
}
function storage(initial=null) {
  const values = new Map(initial===null ? [] : [[GARAGE_SLOT,initial]]);
  const result = {
    values, writes:0, reads:0, failRead:false, failWrite:false, afterWrite:null,
    getItem(key) {
      this.reads++;
      if (this.failRead) throw new DOMException('Denied','SecurityError');
      return values.get(key) ?? null;
    },
    setItem(key, text) {
      assert.equal(typeof text,'string');
      if (this.failWrite) throw new DOMException('Full','QuotaExceededError');
      this.writes++;
      values.set(key,text);
      this.afterWrite?.(key,text);
    }
  };
  return result;
}
function locks() {
  return {
    held:false, calls:0,
    async request(name, options, callback) {
      assert.equal(name,GARAGE_SLOT);
      assert.deepEqual(options,{mode:'exclusive',ifAvailable:true});
      this.calls++;
      if (this.held) return callback(null);
      this.held=true;
      try { return await callback({name,mode:'exclusive'}); }
      finally { this.held=false; }
    }
  };
}
function session(store=storage(), coordinator=locks(), overrides={}) {
  const eventTarget=events(), changes=[];
  const vault=createGarageVault({getStorage:()=>store,getLocks:()=>coordinator,
    makeGeneration:()=>generation,eventTarget,onChange:view=>changes.push(view),...overrides});
  return {vault,store,coordinator,eventTarget,changes};
}
const action = (vault,type='buy',targetId='cinder-two') => ({type,targetId,expectedRevision:vault.view.state.revision});
async function initialize(vault) {
  vault.load();
  const prepared=vault.prepareReset();
  assert.equal(prepared.accepted,true);
  const result=await vault.confirm(prepared.ticket);
  assert.equal(result.accepted,true,JSON.stringify(result));
  return result.state;
}
async function transact(vault,type='buy',targetId='cinder-two') {
  const prepared=vault.prepareTransaction(action(vault,type,targetId));
  assert.equal(prepared.accepted,true,JSON.stringify(prepared));
  const result=await vault.confirm(prepared.ticket);
  assert.equal(result.accepted,true,JSON.stringify(result));
  return result;
}
function frozenTree(value) {
  if (value && typeof value==='object') {
    assert(Object.isFrozen(value));
    for (const child of Object.values(value)) frozenTree(child);
  }
}

test('vault envelopes have a strict bounded format independent of exported garage state', () => {
  assert.equal(GARAGE_SLOT,'circuit-overdrive.garage.v1');
  assert.equal(VAULT_BYTES,65536);
  assert.equal(MAX_VAULT_SEQUENCE,99999999);
  const input=envelope(), text=JSON.stringify(input), accepted=parseVault(text);
  assert.deepEqual(accepted,input);
  frozenTree(accepted);
  assert.equal(serializeVault(Object.fromEntries(Object.entries(input).reverse())),text);
  for (const change of [
    d=>{d.version=2;}, d=>{d.generation='bad';}, d=>{d.generation=generation.toUpperCase();},
    d=>{d.sequence=-1;}, d=>{d.sequence=-0;}, d=>{d.sequence=0.5;},
    d=>{d.sequence=100000000;}, d=>{d.extra=true;}, d=>{delete d.generation;},
    d=>{d.garage.credits=-1;}, d=>{d.garage.bays.push(null);}
  ]) {
    const data=clone(input); change(data);
    assert.throws(()=>serializeVault(data));
    if (!Object.is(data.sequence,-0)) assert.throws(()=>parseVault(JSON.stringify(data)));
  }
  assert.equal(parseVault(serializeVault(envelope(createGarage(),99999999))).sequence,99999999);
  const limit=text+' '.repeat(65536-Buffer.byteLength(text));
  assert.deepEqual(parseVault(limit),input);
  for (const raw of [limit+' ','"'+'é'.repeat(32768)+'"','{','null','[]',serializeGarage(createGarage())]) {
    assert.throws(()=>parseVault(raw));
  }
  let calls=0;
  const getter=()=>{calls++;throw Error('Do not execute');};
  for (const modify of [
    d=>Object.defineProperty(d,'sequence',{get:getter,enumerable:true}),
    d=>Object.defineProperty(d,'sequence',{value:0,enumerable:false}),
    d=>{d[Symbol('extra')]=1;}, d=>{d.toJSON=getter;},
    d=>Object.setPrototypeOf(d,{sequence:0}),
    d=>Object.defineProperty(d.garage,'credits',{get:getter,enumerable:true})
  ]) {
    const data=clone(input); modify(data); assert.throws(()=>serializeVault(data));
  }
  assert.equal(calls,0);
});

test('empty storage stays empty until explicit confirmation and existing unrelated saves remain untouched', async () => {
  const {vault,store}=session();
  store.values.set('circuit-overdrive.woc.v1','championship sentinel');
  store.values.set('circuit-overdrive.settings','settings sentinel');
  assert.equal(vault.view.state,null);
  assert.equal(vault.view.status,'UNSAVED');
  vault.load();
  assert.equal(vault.view.reason,'empty');
  assert.equal(store.writes,0);
  assert.deepEqual(vault.exportSave(),{accepted:false,reason:'no-garage'});
  const prepared=vault.prepareReset();
  assert.equal(prepared.accepted,true);
  assert.deepEqual(prepared.preview.state,createGarage());
  assert.equal(prepared.backup,null);
  assert.equal(vault.view.state,null);
  assert.equal(store.writes,0);
  const result=await vault.confirm(prepared.ticket);
  assert.equal(result.accepted,true);
  assert.equal(vault.view.status,'SAVED');
  assert.deepEqual(vault.view.state,createGarage());
  assert.deepEqual(parseVault(store.getItem(GARAGE_SLOT)),envelope());
  assert.equal(store.writes,1);
  assert.equal(store.values.get('circuit-overdrive.woc.v1'),'championship sentinel');
  assert.equal(store.values.get('circuit-overdrive.settings'),'settings sentinel');
  frozenTree(vault.view);
  vault.dispose();
});

test('confirmed purchases persist complete state before publication and reload restores ownership', async () => {
  const {vault,store,changes}=session();
  await initialize(vault);
  const before=vault.view.state, intent=action(vault), prepared=vault.prepareTransaction(intent);
  assert.equal(prepared.accepted,true);
  assert.equal(prepared.backup,serializeGarage(before));
  assert.equal(prepared.preview.state.credits,1800);
  assert.strictEqual(vault.view.state,before,'preview does not award ownership');
  intent.targetId='glass-comet';
  const result=await vault.confirm(prepared.ticket);
  assert.equal(result.accepted,true);
  assert.equal(result.state.credits,1800,'prepared action is owned, not rebound to a mutable request');
  assert.equal(result.state.bays[0].modelId,'cinder-two');
  assert.equal(result.receipt.creditDelta,-600);
  assert.equal(parseVault(store.getItem(GARAGE_SLOT)).sequence,1);
  assert.deepEqual(parseVault(store.getItem(GARAGE_SLOT)).garage,result.state);
  assert(changes.some(view=>view.status==='SAVED' && view.state?.credits===1800));
  const reopened=session(store).vault;
  reopened.load();
  assert.deepEqual(reopened.view.state,result.state);
  assert.deepEqual(reopened.exportSave(),{accepted:true,text:serializeGarage(result.state)});
  assert(!reopened.exportSave().text.includes('generation'));
  vault.dispose(); reopened.dispose();
});

test('confirmation tickets are owner-bound, single-use and invalidated by a new prepare or reload', async () => {
  const {vault,store}=session(); await initialize(vault);
  const other=session(store).vault; other.load();
  const first=vault.prepareTransaction(action(vault));
  assert.deepEqual(await other.confirm(first.ticket),{accepted:false,reason:'confirmation-required'});
  const second=vault.prepareTransaction(action(vault,'buy','lilt'));
  assert.deepEqual(await vault.confirm(first.ticket),{accepted:false,reason:'confirmation-required'});
  const [confirmed,duplicate]=await Promise.all([vault.confirm(second.ticket),vault.confirm(second.ticket)]);
  assert.equal(confirmed.accepted,true);
  assert.deepEqual(duplicate,{accepted:false,reason:'busy'});
  assert.deepEqual(await vault.confirm(second.ticket),{accepted:false,reason:'confirmation-required'});
  const before=store.getItem(GARAGE_SLOT), pending=vault.prepareReset();
  vault.load();
  assert.equal((await vault.confirm(pending.ticket)).accepted,false);
  assert.equal(store.getItem(GARAGE_SLOT),before);
  assert.equal(vault.view.state.credits,1500);
  const cancelled=vault.prepareReset();
  vault.cancel();
  assert.deepEqual(await vault.confirm(cancelled.ticket),{accepted:false,reason:'confirmation-required'});
  assert.equal(store.getItem(GARAGE_SLOT),before);
  vault.dispose(); other.dispose();
});

test('stale tabs cannot overwrite purchases or resurrect a sold car', async () => {
  const store=storage(), coordinator=locks();
  const a=session(store,coordinator).vault, b=session(store,coordinator).vault;
  await initialize(a); b.load();
  const pendingB=b.prepareTransaction(action(b,'buy','glass-comet'));
  await transact(a);
  const afterBuy=store.getItem(GARAGE_SLOT);
  assert.deepEqual(await b.confirm(pendingB.ticket),{accepted:false,reason:'conflict'});
  assert.equal(b.view.status,'CONFLICT');
  assert.equal(b.view.state.credits,2400,'stale displayed snapshot is not silently replaced');
  assert.equal(store.getItem(GARAGE_SLOT),afterBuy);
  b.load();
  assert.deepEqual(b.view.state,a.view.state);
  const staleSale=b.prepareTransaction(action(b,'sell','car-000001'));
  await transact(a,'sell','car-000001');
  assert.deepEqual(await b.confirm(staleSale.ticket),{accepted:false,reason:'conflict'});
  b.load();
  assert.equal(b.view.state.credits,2160);
  assert.deepEqual(b.view.state.bays,[null,null,null,null]);
  assert.equal(b.view.state.nextVehicleId,2);
  a.dispose(); b.dispose();
});

test('identical import and reset preserve storage history and reject ABA-stale confirmations', async () => {
  const store=storage(), coordinator=locks();
  const a=session(store,coordinator).vault, b=session(store,coordinator).vault;
  await initialize(a); b.load();
  const original=a.exportSave().text, oldText=store.getItem(GARAGE_SLOT);
  const stale=b.prepareTransaction(action(b));
  const replacement=a.prepareImport(original);
  assert.equal((await a.confirm(replacement.ticket)).accepted,true);
  assert.equal(a.exportSave().text,original,'import preserves canonical exported garage state');
  assert.notEqual(store.getItem(GARAGE_SLOT),oldText,'storage sequence records even identical replacement');
  assert.equal(parseVault(store.getItem(GARAGE_SLOT)).sequence,1);
  assert.deepEqual(await b.confirm(stale.ticket),{accepted:false,reason:'conflict'});
  b.load();
  const staleReset=b.prepareReset();
  assert.equal((await a.confirm(a.prepareReset().ticket)).accepted,true);
  assert.equal(parseVault(store.getItem(GARAGE_SLOT)).sequence,2);
  assert.equal(parseVault(store.getItem(GARAGE_SLOT)).generation,generation);
  assert.deepEqual(await b.confirm(staleReset.ticket),{accepted:false,reason:'conflict'});
  a.dispose(); b.dispose();
});

test('whole-state import keeps identities, allocator and revision without merging balances', async () => {
  const donor=session().vault; await initialize(donor);
  await transact(donor,'buy','lilt');
  await transact(donor,'buy','cinder-two');
  await transact(donor,'sell','car-000001');
  const exported=donor.exportSave().text;
  const {vault,store}=session(); await initialize(vault);
  const backup=vault.exportSave().text, before=store.getItem(GARAGE_SLOT);
  const prepared=vault.prepareImport(exported);
  assert.equal(prepared.backup,backup);
  assert.equal(store.getItem(GARAGE_SLOT),before);
  assert.equal(vault.view.state.credits,2400);
  const result=await vault.confirm(prepared.ticket);
  assert.equal(result.accepted,true);
  assert.equal(vault.exportSave().text,exported);
  assert.equal(result.state.credits,1440);
  assert.equal(result.state.nextVehicleId,3);
  assert.equal(result.state.revision,3);
  assert.equal(result.state.activeVehicleId,'car-000002');
  assert.equal(result.state.bays[0],null);
  assert.equal(result.state.bays[1].ownedVehicleId,'car-000002');
  donor.dispose(); vault.dispose();
});

test('invalid imports preserve accepted ownership and invalidate any prior confirmation', async () => {
  const {vault,store}=session(); await initialize(vault); await transact(vault);
  const before=store.getItem(GARAGE_SLOT), state=vault.view.state;
  const texts=['{','null',' '.repeat(65537),serializeGarage(state).replace('"version":1','"version":2'),
    serializeGarage(state).replace('"credits":1800','"credits":-1'),
    serializeGarage(state).replace('"revision":1','"revision":1,"__proto__":{"bad":true}')];
  for (const alter of [
    value=>{value.bays[1]=clone(value.bays[0]);},
    value=>{value.bays[0].modelId='missing';},
    value=>{value.activeVehicleId='car-000009';},
    value=>{value.nextVehicleId=1;},
    value=>{value.bays[0].resaleValue=99999999;}
  ]) {
    const value=clone(state); alter(value); texts.push(JSON.stringify(value));
  }
  for (const text of texts) {
    const pending=vault.prepareReset();
    const result=vault.prepareImport(text);
    assert.deepEqual(result,{accepted:false,reason:'invalid-import'});
    assert.equal(vault.view.status,'IMPORT REJECTED');
    assert.deepEqual(vault.view.state,state);
    assert.equal(store.getItem(GARAGE_SLOT),before);
    assert.equal((await vault.confirm(pending.ticket)).accepted,false);
    assert.equal(vault.exportSave().text,serializeGarage(state));
    vault.load();
  }
  assert.equal({}.bad,undefined);
  vault.dispose();
});

test('quota failure never awards a purchase and writes remain blocked until explicit reload', async () => {
  const {vault,store}=session(); await initialize(vault);
  const before=store.getItem(GARAGE_SLOT), state=vault.view.state;
  const pending=vault.prepareTransaction(action(vault));
  store.failWrite=true;
  assert.deepEqual(await vault.confirm(pending.ticket),{accepted:false,reason:'write-failed'});
  assert.deepEqual(vault.view.state,state);
  assert.equal(vault.view.state.credits,2400);
  assert.equal(store.getItem(GARAGE_SLOT),before);
  store.failWrite=false;
  assert.equal(vault.prepareTransaction(action(vault)).accepted,false);
  vault.load();
  await transact(vault);
  assert.equal(vault.view.state.credits,1800);
  assert.equal(vault.view.state.nextVehicleId,2);
  vault.dispose();
});

test('unconfirmed write verification fails closed and reload reconciles without paying twice', async () => {
  for (const fault of ['read-denied','mismatch','throw-after-write']) {
    const {vault,store}=session(); await initialize(vault);
    const previous=vault.view.state;
    store.afterWrite=()=>{
      if (fault==='read-denied') store.failRead=true;
      else if (fault==='mismatch') store.values.set(GARAGE_SLOT,'interrupted');
      else throw Error('Storage wrapper failed after committing');
    };
    const pending=vault.prepareTransaction(action(vault));
    const result=await vault.confirm(pending.ticket);
    assert.deepEqual(result,{accepted:false,reason:fault==='throw-after-write'?'write-failed':'verification-failed'});
    assert.deepEqual(vault.view.state,previous);
    assert.equal(vault.prepareReset().accepted,false);
    store.afterWrite=null; store.failRead=false;
    vault.load();
    if (fault!=='mismatch') {
      assert.equal(vault.view.state.credits,1800,'read-back failure may leave an already committed purchase');
      assert.equal(vault.view.state.nextVehicleId,2);
      assert.equal((await vault.confirm(pending.ticket)).accepted,false);
    } else assert.equal(vault.view.reason,'invalid-save');
    vault.dispose();
  }
});

test('unavailable storage, locks, crypto and exhausted storage sequence cannot silently downgrade writes', async () => {
  const denied=session(undefined,undefined,{getStorage:()=>{throw new DOMException('Denied','SecurityError');}});
  denied.vault.load();
  assert.equal(denied.vault.view.status,'STORAGE UNAVAILABLE');
  assert.equal(denied.vault.view.state,null);
  assert.equal(denied.vault.prepareReset().accepted,false);
  denied.vault.dispose();
  for (const missing of [undefined,{}]) {
    const {vault,store}=session(storage(),missing,{getLocks:()=>missing});
    vault.load();
    const prepared=vault.prepareReset();
    const result=prepared.accepted ? await vault.confirm(prepared.ticket) : prepared;
    assert.equal(result.accepted,false);
    assert.equal(result.reason,'locks-unavailable');
    assert.equal(store.writes,0);
    vault.dispose();
  }
  for (const makeGeneration of [()=>{throw Error('crypto denied');},()=>'',()=>generation.toUpperCase()]) {
    const {vault,store}=session(undefined,undefined,{makeGeneration});
    vault.load();
    const result=await vault.confirm(vault.prepareReset().ticket);
    assert.deepEqual(result,{accepted:false,reason:'generation-unavailable'});
    assert.equal(store.writes,0);
    assert.equal(vault.view.state,null);
    vault.dispose();
  }
  const {vault,store}=session(storage(serializeVault(envelope(createGarage(),99999999))));
  vault.load();
  const before=store.getItem(GARAGE_SLOT);
  for (const prepare of [()=>vault.prepareReset(),()=>vault.prepareImport(serializeGarage(createGarage())),
    ()=>vault.prepareTransaction(action(vault))]) {
    const prepared=prepare();
    const result=prepared.accepted ? await vault.confirm(prepared.ticket) : prepared;
    assert.deepEqual(result,{accepted:false,reason:'sequence-exhausted'});
  }
  assert.equal(store.getItem(GARAGE_SLOT),before);
  assert.equal(store.writes,0);
  vault.dispose();
});

test('observers see only confirmed saved state and cannot undo a successful commit by throwing', async () => {
  const store=storage(), observed=[];
  const {vault}=session(store,undefined,{onChange:view=>{
    if (view.status==='SAVED') {
      assert.deepEqual(parseVault(store.getItem(GARAGE_SLOT)).garage,view.state);
      observed.push(view.state);
      throw Error('UI observer failed');
    }
  }});
  await initialize(vault);
  const result=await transact(vault);
  assert.equal(result.state.credits,1800);
  assert.equal(store.writes,2);
  assert.equal(observed.length,2);
  assert.equal(vault.view.status,'SAVED');
  assert.deepEqual(parseVault(store.getItem(GARAGE_SLOT)).garage,result.state);
  vault.dispose();
});

test('reentrant observers cannot change the accepted state attached to a transaction receipt', async () => {
  const store=storage();
  let vault;
  ({vault}=session(store,undefined,{onChange:view=>{
    if (view.status==='SAVED' && view.state?.revision===1) {
      store.values.set(GARAGE_SLOT,serializeVault(envelope(createGarage(),9)));
      vault.load();
    }
  }}));
  await initialize(vault);
  const result=await transact(vault);
  assert.equal(result.state.credits,1800,'result retains the transaction snapshot despite observer reload');
  assert.equal(result.state.bays[0].ownedVehicleId,'car-000001');
  assert.equal(result.receipt.creditsAfter,1800);
  assert.equal(result.receipt.toRevision,result.state.revision);
  assert.equal(vault.view.state.credits,2400,'observer really loaded a different complete state');
  assert.equal(parseVault(store.getItem(GARAGE_SLOT)).sequence,9);
  vault.dispose();
});

test('disposal after the write suppresses observers while preserving the completed commit acknowledgement', async () => {
  const {vault,store,coordinator,changes}=session();
  await initialize(vault);
  let resolveCommitted;
  coordinator.request=(name,options,callback)=>new Promise(resolve=>{
    const result=callback({name,mode:'exclusive'});
    resolveCommitted=()=>resolve(result);
  });
  const prepared=vault.prepareTransaction(action(vault));
  const completion=vault.confirm(prepared.ticket);
  assert.equal(parseVault(store.getItem(GARAGE_SLOT)).garage.credits,1800);
  vault.dispose();
  const publications=changes.length;
  resolveCommitted();
  const result=await completion;
  assert.equal(result.accepted,true);
  assert.equal(result.state.credits,1800);
  assert.equal(result.receipt.creditsAfter,1800);
  assert.equal(changes.length,publications,'disposed vault never publishes another view');
  assert.equal(vault.prepareReset().accepted,false);
});

test('corrupt stored data is preserved until a confirmed complete replacement', async () => {
  for (const raw of ['{','',serializeGarage(createGarage()),' '.repeat(65537)]) {
    const {vault,store}=session(storage(raw));
    vault.load();
    assert.equal(vault.view.status,'UNSAVED');
    assert.equal(vault.view.reason,'invalid-save');
    assert.equal(vault.view.state,null);
    assert.equal(store.getItem(GARAGE_SLOT),raw);
    const prepared=vault.prepareReset();
    assert.equal(prepared.accepted,true);
    assert.equal(store.getItem(GARAGE_SLOT),raw);
    assert.equal((await vault.confirm(prepared.ticket)).accepted,true);
    assert.deepEqual(parseVault(store.getItem(GARAGE_SLOT)),envelope());
    vault.dispose();
  }
});

test('storage notifications invalidate stale views, ignore unrelated areas and tolerate delayed old events', async () => {
  const store=storage(), coordinator=locks();
  const a=session(store,coordinator), b=session(store,coordinator);
  await initialize(a.vault); b.vault.load();
  const old=store.getItem(GARAGE_SLOT), pending=b.vault.prepareTransaction(action(b.vault));
  await transact(a.vault);
  b.eventTarget.emit({key:'circuit-overdrive.woc.v1',storageArea:store});
  b.eventTarget.emit({key:GARAGE_SLOT,storageArea:storage()});
  assert.equal(b.vault.view.status,'SAVED');
  b.eventTarget.emit({key:GARAGE_SLOT,storageArea:store,oldValue:old,newValue:store.getItem(GARAGE_SLOT)});
  assert.equal(b.vault.view.status,'CONFLICT');
  assert.equal(b.vault.view.state.credits,2400);
  assert.equal((await b.vault.confirm(pending.ticket)).accepted,false);
  b.vault.load();
  assert.equal(b.vault.view.state.credits,1800);
  b.eventTarget.emit({key:GARAGE_SLOT,storageArea:store,oldValue:null,newValue:old});
  assert.equal(b.vault.view.status,'SAVED','actual current value defeats a delayed stale event');
  b.vault.dispose();
  assert.equal(b.eventTarget.count,0);
  a.vault.dispose();
});

test('busy locks reject without writes and pending acquisition rechecks lifecycle invalidation', async () => {
  const {vault,store,coordinator,eventTarget}=session(); await initialize(vault);
  coordinator.held=true;
  const pending=vault.prepareTransaction(action(vault));
  const before=store.getItem(GARAGE_SLOT);
  assert.deepEqual(await vault.confirm(pending.ticket),{accepted:false,reason:'lock-busy'});
  assert.equal(store.getItem(GARAGE_SLOT),before);
  coordinator.held=false;
  vault.load();
  let grant;
  coordinator.request=(name,options,callback)=>new Promise(resolve=>{
    assert.deepEqual(options,{mode:'exclusive',ifAvailable:true});
    grant=()=>resolve(callback({name,mode:'exclusive'}));
  });
  const old=vault.prepareTransaction(action(vault)), confirmation=vault.confirm(old.ticket);
  assert.equal(vault.view.busy,true);
  store.values.set(GARAGE_SLOT,serializeVault(envelope(createGarage(),8)));
  eventTarget.emit({key:GARAGE_SLOT,storageArea:store});
  const newer=store.getItem(GARAGE_SLOT);
  grant();
  assert.equal((await confirmation).accepted,false);
  assert.equal(store.getItem(GARAGE_SLOT),newer);
  assert.equal(vault.view.state.credits,2400);
  vault.load();
  const another=vault.prepareTransaction(action(vault)), waiting=vault.confirm(another.ticket);
  vault.dispose();
  grant();
  assert.equal((await waiting).accepted,false);
  assert.equal(store.getItem(GARAGE_SLOT),newer);
  assert.equal(eventTarget.count,0);
});
