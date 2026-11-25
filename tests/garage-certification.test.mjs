// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import {createGarageVault, GARAGE_SLOT} from '../src/garage-vault.js';
import {parseVault, serializeVault} from '../src/garage-vault-format.js';

// Explicit storage/lifetime fault fixtures. Accepted garages are constructed
// through confirmed production actions; no fixture grants a car or sale credit.
function origin() {
  let raw = null, writes = 0, generations = 0;
  const store = {
    getItem(key) { assert.equal(key,GARAGE_SLOT); return raw; },
    setItem(key,value) { assert.equal(key,GARAGE_SLOT); raw=value; writes++; }
  };
  const locks = {async request(name,options,callback) {
    assert.equal(name,GARAGE_SLOT);
    assert.deepEqual(options,{mode:'exclusive',ifAvailable:true});
    return callback({name,mode:'exclusive'});
  }};
  return {
    session() { return createGarageVault({getStorage:()=>store,getLocks:()=>locks,
      makeGeneration:()=>String(++generations).padStart(32,'0'),eventTarget:null}); },
    get raw() { return raw; }, get writes() { return writes; },
    replaceStorage(value) { raw=value; }
  };
}
async function reset(vault) {
  vault.load();
  const proposal=vault.prepareReset();
  assert.equal(proposal.accepted,true);
  const result=await vault.confirm(proposal.ticket);
  assert.equal(result.accepted,true);
  return result.state;
}
function buy(vault) {
  const proposal=vault.prepareTransaction({type:'buy',targetId:'cinder-two',
    expectedRevision:vault.view.state.revision});
  assert.equal(proposal.accepted,true);
  return proposal;
}

test('recreated identical garage histories cannot revive tickets after cleared or corrupt storage',async () => {
  const shared=origin(),writer=shared.session(),stale=shared.session();
  await reset(writer);
  const expected=writer.exportSave().text;
  // Miss the storage event deliberately: the comparison inside the lock is
  // still responsible for detecting a different storage lifetime.
  for(const outsideValue of [null,'{']) {
    stale.load();
    const oldGeneration=parseVault(shared.raw).generation;
    const pending=buy(stale);
    shared.replaceStorage(outsideValue);
    writer.load();
    assert.equal(writer.view.state,null);
    assert.equal(shared.raw,outsideValue,'observation never repairs storage');
    await reset(writer);
    assert.equal(writer.exportSave().text,expected,'garage data is exactly the old snapshot');
    assert.equal(parseVault(shared.raw).sequence,0);
    assert.notEqual(parseVault(shared.raw).generation,oldGeneration);
    const committed=shared.raw,writes=shared.writes;
    assert.deepEqual(await stale.confirm(pending.ticket),{accepted:false,reason:'conflict'});
    assert.equal(shared.raw,committed);
    assert.equal(shared.writes,writes,'old history cannot allocate another vehicle');
    stale.load();
    assert.equal(stale.view.state.credits,2400);
    assert.equal(stale.view.state.nextVehicleId,1);
    assert.deepEqual(stale.view.state.bays,[null,null,null,null]);
  }
  writer.dispose(); stale.dispose();
});

test('the final storage sequence commits once and exhaustion preserves exportable ownership',async () => {
  const shared=origin(),vault=shared.session();
  await reset(vault);
  // Synthetic finite-counter boundary; the valid empty garage is unchanged.
  shared.replaceStorage(serializeVault({...parseVault(shared.raw),sequence:99999998}));
  vault.load();
  const pending=buy(vault),result=await vault.confirm(pending.ticket);
  assert.equal(result.accepted,true);
  assert.equal(parseVault(shared.raw).sequence,99999999);
  assert.equal(result.state.credits,1800);
  assert.equal(result.state.nextVehicleId,2);
  assert.deepEqual(result.state.bays,[{ownedVehicleId:'car-000001',modelId:'cinder-two'},null,null,null]);
  const committed=shared.raw,writes=shared.writes,exported=vault.exportSave().text;
  assert.deepEqual(await vault.confirm(pending.ticket),{accepted:false,reason:'confirmation-required'});
  for(const prepare of [()=>buy(vault),()=>vault.prepareReset(),()=>vault.prepareImport(exported)]) {
    const next=prepare(); assert.equal(next.accepted,true);
    assert.deepEqual(await vault.confirm(next.ticket),{accepted:false,reason:'sequence-exhausted'});
    assert.equal(shared.raw,committed);
    assert.equal(shared.writes,writes);
    assert.equal(vault.exportSave().text,exported);
  }
  vault.load();
  assert.deepEqual(vault.view.state,result.state);
  vault.dispose();
});
