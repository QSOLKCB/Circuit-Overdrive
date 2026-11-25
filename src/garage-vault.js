// SPDX-License-Identifier: Apache-2.0
import {garageRecord} from './garage-data.js';
import {createGarage, parseGarage, serializeGarage} from './garage.js';
import {transactGarage} from './garage-transactions.js';
import {MAX_VAULT_SEQUENCE, parseVault, serializeVault} from './garage-vault-format.js';

export const GARAGE_SLOT = 'circuit-overdrive.garage.v1';
const reject = reason => Object.freeze({accepted:false, reason});
function generation() {
  // A storage lifetime nonce, never an owned-car ID or simulation input.
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function createGarageVault({
  getStorage = () => globalThis.localStorage,
  getLocks = () => globalThis.navigator?.locks,
  makeGeneration = generation,
  eventTarget = globalThis.window,
  onChange = () => {}
} = {}) {
  let state = null, raw = null, ready = false, busy = false, disposed = false;
  let status = 'UNSAVED', reason = 'not-loaded', epoch = 0, pending = null;
  const view = () => Object.freeze({status, reason, state, busy});
  function publish() {
    if (!disposed) { try { onChange(view()); } catch { /* Observers cannot undo a commit. */ } }
  }
  function mark(nextStatus, nextReason) {
    status = nextStatus; reason = nextReason;
    publish();
  }
  function invalidate() { epoch++; pending = null; }
  function unavailable(why) {
    ready = false;
    invalidate();
    mark('STORAGE UNAVAILABLE', why);
    return reject(why);
  }
  function conflict() {
    ready = false;
    invalidate();
    mark('CONFLICT', 'conflict');
    return reject('conflict');
  }
  function locksAvailable() {
    try { return typeof getLocks()?.request === 'function'; }
    catch { return false; }
  }
  function accessible() {
    if (disposed) return reject('disposed');
    if (busy) return reject('busy');
    if (!ready) return reject(status === 'CONFLICT' ? 'conflict' : 'load-required');
    if (!locksAvailable()) return unavailable('locks-unavailable');
    return null;
  }
  function load() {
    if (disposed || busy) return view();
    invalidate();
    let text;
    try { text = getStorage().getItem(GARAGE_SLOT); }
    catch { unavailable('read-failed'); return view(); }
    raw = text;
    ready = true;
    if (text === null) {
      state = null;
      status = 'UNSAVED'; reason = 'empty';
    } else {
      try { state = parseVault(text).garage; status = 'SAVED'; reason = null; }
      catch { state = null; status = 'UNSAVED'; reason = 'invalid-save'; }
    }
    if (!locksAvailable()) { status = 'STORAGE UNAVAILABLE'; reason = 'locks-unavailable'; }
    publish();
    return view();
  }
  function prepared(type, next, receipt, action = null) {
    const ticket = Object.freeze({});
    const preview = Object.freeze({type, state:next, receipt});
    pending = {ticket, preview, action, raw, epoch};
    return Object.freeze({accepted:true, ticket, preview, backup:state ? serializeGarage(state) : null});
  }
  function prepareTransaction(action) {
    const error = accessible();
    if (error) return error;
    pending = null;
    if (!state) return reject('no-garage');
    const result = transactGarage(state, action);
    if (!result.accepted) return result;
    const copy = Object.freeze(garageRecord(action, ['type', 'targetId', 'expectedRevision'], 'Transaction'));
    return prepared(copy.type, result.state, result.receipt, copy);
  }
  function prepareReset() {
    const error = accessible();
    if (error) return error;
    pending = null;
    return prepared('reset', createGarage(), Object.freeze({type:'reset'}));
  }
  function prepareImport(text) {
    const error = accessible();
    if (error) return error;
    pending = null;
    let next;
    try { next = parseGarage(text); }
    catch { mark('IMPORT REJECTED', 'invalid-import'); return reject('invalid-import'); }
    return prepared('import', next, Object.freeze({type:'import'}));
  }
  function cancel() {
    pending = null;
  }
  async function confirm(ticket) {
    if (disposed) return reject('disposed');
    if (busy) return reject('busy');
    if (!pending || pending.ticket !== ticket) return reject('confirmation-required');
    const intent = pending;
    pending = null; // A confirmation is single-use, even when acquisition fails.
    const error = accessible();
    if (error) return error;
    busy = true;
    mark('UNSAVED', 'committing');
    let result;
    try {
      result = await getLocks().request(GARAGE_SLOT, {mode:'exclusive', ifAvailable:true}, lock => {
        if (disposed) return reject('disposed');
        if (!lock) return reject('lock-busy');
        if (lock.name !== GARAGE_SLOT || lock.mode !== 'exclusive') return reject('locks-unavailable');
        if (!ready || epoch !== intent.epoch || raw !== intent.raw) return reject('conflict');
        let storage, observed;
        try { storage = getStorage(); observed = storage.getItem(GARAGE_SLOT); }
        catch { return reject('read-failed'); }
        if (observed !== intent.raw) return reject('conflict');
        let current = null;
        if (observed !== null) {
          try { current = parseVault(observed); }
          catch { if (intent.action) return reject('invalid-save'); }
        }
        if (current?.sequence === MAX_VAULT_SEQUENCE) return reject('sequence-exhausted');
        let next = intent.preview.state, receipt = intent.preview.receipt;
        if (intent.action) {
          if (!current) return reject('invalid-save');
          const transition = transactGarage(current.garage, intent.action);
          if (!transition.accepted) return transition;
          next = transition.state; receipt = transition.receipt;
        }
        let nextRaw;
        try {
          nextRaw = serializeVault({version:1, generation:current?.generation ?? makeGeneration(),
            sequence:current ? current.sequence + 1 : 0, garage:next});
        } catch { return reject('generation-unavailable'); }
        try { storage.setItem(GARAGE_SLOT, nextRaw); }
        catch { return reject('write-failed'); }
        // No optimistic promotion, even when a storage shim silently drops a
        // write. Unknown completion requires an explicit reload, never rollback.
        try { if (storage.getItem(GARAGE_SLOT) !== nextRaw) return reject('verification-failed'); }
        catch { return reject('verification-failed'); }
        return {accepted:true, state:next, receipt, raw:nextRaw};
      });
    } catch { result = reject('locks-unavailable'); }
    busy = false;
    if (result.accepted) {
      state = result.state;
      raw = result.raw;
      ready = !disposed;
      invalidate();
      mark('SAVED', null);
      return Object.freeze({accepted:true, state:result.state, receipt:result.receipt});
    }
    if (result.reason === 'conflict') return conflict();
    if (['read-failed', 'write-failed', 'verification-failed', 'locks-unavailable', 'invalid-save'].includes(result.reason)) {
      return unavailable(result.reason);
    }
    mark('UNSAVED', result.reason);
    return result;
  }
  function exportSave() {
    if (disposed) return reject('disposed');
    if (!state) return reject('no-garage');
    return Object.freeze({accepted:true, text:serializeGarage(state)});
  }
  function storageChanged(event) {
    if (disposed || !ready || (event.key !== GARAGE_SLOT && event.key !== null)) return;
    try {
      const storage = getStorage();
      if (event.storageArea && event.storageArea !== storage) return;
      // Events are hints. A delayed event from before reload must not invalidate
      // the newly observed state merely because its event.newValue is old.
      if (storage.getItem(GARAGE_SLOT) !== raw) conflict();
    } catch { unavailable('read-failed'); }
  }
  eventTarget?.addEventListener('storage', storageChanged);
  return Object.freeze({
    get view() { return view(); },
    load, prepareTransaction, prepareReset, prepareImport, confirm, cancel, exportSave,
    dispose() {
      disposed = true;
      ready = false;
      invalidate();
      eventTarget?.removeEventListener('storage', storageChanged);
    }
  });
}
