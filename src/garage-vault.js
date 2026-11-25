// SPDX-License-Identifier: Apache-2.0
import {garageRecord} from './garage-data.js';
import {createGarage, migrateLegacyGarage, parseGarageImport, serializeGarage} from './garage.js';
import {parseLegacyGarage, serializeLegacyGarage} from './garage-legacy.js';
import {transactGarage, transactGarageInstallation, validateInstallationAction} from './garage-transactions.js';
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
  let legacyBackup = null;
  let status = 'UNSAVED', reason = 'not-loaded', epoch = 0, pending = null;
  const needsMigration = () => state?.version === 1;
  const stateText = () => needsMigration() ? serializeLegacyGarage(state) : serializeGarage(state);
  const view = () => Object.freeze({status, reason, state, busy,
    migrationRequired:needsMigration(), hasLegacyBackup:needsMigration() || legacyBackup !== null});
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
      state = null; legacyBackup = null;
      status = 'UNSAVED'; reason = 'empty';
    } else {
      try {
        const accepted = parseVault(text);
        state = accepted.garage;
        legacyBackup = accepted.version === 2 ? accepted.legacyBackup : null;
        status = needsMigration() ? 'MIGRATION REQUIRED' : 'SAVED';
        reason = needsMigration() ? 'migration-required' : null;
      }
      catch { state = null; legacyBackup = null; status = 'UNSAVED'; reason = 'invalid-save'; }
    }
    if (!locksAvailable()) { status = 'STORAGE UNAVAILABLE'; reason = 'locks-unavailable'; }
    publish();
    return view();
  }
  function prepared(type, next, receipt, action = null, importedLegacy = null) {
    const ticket = Object.freeze({});
    const preview = Object.freeze({type, state:next, receipt});
    pending = {ticket, preview, action, raw, epoch, importedLegacy};
    return Object.freeze({accepted:true, ticket, preview, backup:state ? stateText() : null});
  }
  function prepareMigration() {
    const error = accessible();
    if (error) return error;
    pending = null;
    if (!needsMigration()) return reject('migration-not-required');
    return prepared('migrate', migrateLegacyGarage(state),
      Object.freeze({type:'migrate',fromVersion:1,toVersion:2,revision:state.revision}));
  }
  function prepareTransaction(action) {
    const error = accessible();
    if (error) return error;
    pending = null;
    if (needsMigration()) return reject('migration-required');
    if (!state) return reject('no-garage');
    const result = transactGarage(state, action);
    if (!result.accepted) return result;
    const copy = Object.freeze(garageRecord(action, ['type', 'targetId', 'expectedRevision'], 'Transaction'));
    return prepared(copy.type, result.state, result.receipt, copy);
  }
  function prepareInstallation(action) {
    const error = accessible();
    if (error) return error;
    pending = null;
    if (needsMigration()) return reject('migration-required');
    if (!state) return reject('no-garage');
    const result = transactGarageInstallation(state,action);
    if (!result.accepted) return result;
    const copy = validateInstallationAction(action);
    return prepared('install',result.state,result.receipt,copy);
  }
  function prepareReset() {
    const error = accessible();
    if (error) return error;
    pending = null;
    if (needsMigration()) return reject('migration-required');
    return prepared('reset', createGarage(), Object.freeze({type:'reset'}));
  }
  function prepareImport(text) {
    const error = accessible();
    if (error) return error;
    pending = null;
    if (needsMigration()) return reject('migration-required');
    let next, importedLegacy = null;
    try {
      const admitted = parseGarageImport(text);
      next = admitted.state;
      if (admitted.legacy) importedLegacy = parseLegacyGarage(text);
    }
    catch { mark('IMPORT REJECTED', 'invalid-import'); return reject('invalid-import'); }
    return prepared('import', next, Object.freeze({type:'import',legacy:importedLegacy !== null}), null, importedLegacy);
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
        let nextBackup = current?.version === 2 ? current.legacyBackup : null;
        if (intent.preview.type === 'migrate') {
          if (!current || current.version !== 1) return reject('migration-not-required');
          next = migrateLegacyGarage(current.garage);
          nextBackup = current.garage;
        } else if (current?.version === 1) return reject('migration-required');
        if (nextBackup === null && intent.importedLegacy) nextBackup = intent.importedLegacy;
        if (intent.action) {
          if (!current || current.version !== 2) return reject('invalid-save');
          const transition = intent.action.type === 'install' ?
            transactGarageInstallation(current.garage,intent.action) : transactGarage(current.garage, intent.action);
          if (!transition.accepted) return transition;
          next = transition.state; receipt = transition.receipt;
        }
        let nextRaw;
        try {
          nextRaw = serializeVault({version:2, generation:current?.generation ?? makeGeneration(),
            sequence:current ? current.sequence + 1 : 0, garage:next, legacyBackup:nextBackup});
        } catch { return reject('generation-unavailable'); }
        try { storage.setItem(GARAGE_SLOT, nextRaw); }
        catch { return reject('write-failed'); }
        // No optimistic promotion, even when a storage shim silently drops a
        // write. Unknown completion requires an explicit reload, never rollback.
        try { if (storage.getItem(GARAGE_SLOT) !== nextRaw) return reject('verification-failed'); }
        catch { return reject('verification-failed'); }
        return {accepted:true, state:next, receipt, raw:nextRaw, legacyBackup:nextBackup};
      });
    } catch { result = reject('locks-unavailable'); }
    busy = false;
    if (result.accepted) {
      state = result.state;
      raw = result.raw;
      legacyBackup = result.legacyBackup;
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
    return Object.freeze({accepted:true, text:stateText()});
  }
  function exportLegacySave() {
    if (disposed) return reject('disposed');
    const backup = needsMigration() ? state : legacyBackup;
    if (!backup) return reject('no-legacy-backup');
    return Object.freeze({accepted:true,text:serializeLegacyGarage(backup)});
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
    load, prepareMigration, prepareTransaction, prepareInstallation, prepareReset, prepareImport, confirm, cancel, exportSave, exportLegacySave,
    dispose() {
      disposed = true;
      ready = false;
      invalidate();
      eventTarget?.removeEventListener('storage', storageChanged);
    }
  });
}
