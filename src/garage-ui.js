// SPDX-License-Identifier: Apache-2.0
import {GARAGE_CATALOG, INITIAL_CREDITS, garageModel} from './garage-catalog.js';
import {GARAGE_SAVE_BYTES} from './garage.js';
import {garageResaleValue} from './garage-transactions.js';
import {createGarageVault} from './garage-vault.js';
import {createGaragePartsUI} from './garage-parts-ui.js';
import {vehiclePart, vehiclePaint} from './vehicle-parts.js';

const credits = value => value.toLocaleString('en-US') + ' credits';
const reasons = Object.freeze({
  empty:'Create a garage to receive your one-time starting balance, or import a saved garage.',
  'migration-required':'Your saved cars are ready for individual stock builds. Review the garage upgrade to keep every car, bay and credit. You can export the original save first.',
  'migration-not-required':'This garage already supports individual builds. No conversion is needed.',
  'invalid-save':'The stored garage could not be loaded. It has not been changed. Import a valid backup or confirm a new garage.',
  'locks-unavailable':'This browser cannot coordinate safe garage saves. Use a browser with Web Locks on HTTPS or the offline loopback server.',
  'read-failed':'The browser denied access to the save. Restore storage access, then reload the saved garage.',
  'write-failed':'The browser could not save this action. Ownership has not been awarded. Restore storage access or free space, then reload.',
  'verification-failed':'The write could not be verified. It may have completed. Reload the saved garage before attempting another action.',
  conflict:'Another tab changed this garage. Reload the saved garage before making another transaction.',
  'load-required':'Reload the saved garage before making another transaction.',
  'invalid-import':'Import rejected. Choose a valid garage JSON file of at most 64 KiB. Your existing save has not been replaced.',
  'no-garage':'Create or import a garage first. Catalogue inspection is always available.',
  'insufficient-credits':'You do not have enough credits for this model.',
  'garage-full':'All four bays are occupied. Sell an owned vehicle to make space.',
  'lock-busy':'Another garage action is saving. Reload and review your action again; nothing was automatically retried.',
  'stale-revision':'The reviewed state is no longer current. Reload and review your action again.',
  'confirmation-required':'That confirmation is no longer valid. Review the action again.',
  'vehicle-id-exhausted':'This garage has exhausted its vehicle identities. Export it before choosing a new garage.',
  'revision-exhausted':'This garage has reached its transaction limit. Export it before choosing a new garage.',
  'sequence-exhausted':'This save has reached its storage history limit. Export it for safekeeping.',
  'credit-overflow':'This sale would exceed the credit limit. No sale was made.',
  'generation-unavailable':'The browser could not create a save identity. Reload after restoring browser capabilities.',
  'vehicle-not-owned':'That vehicle is no longer owned by this garage.',
  'already-fitted':'That part and those settings are already fitted. No credits were spent.',
  'invalid-build':'This parts combination or setup exceeds the accepted physical limits. Nothing was fitted or charged.',
  'unrelated-tuning':'Review tuning for the selected part slot only.',
  committing:'Saving the complete garage…',
  busy:'Wait for the current save to complete.'
});
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function button(id, label, handler, className) {
  const node = element('button', label, className);
  node.id = 'garage-' + id;
  node.type = 'button';
  node.addEventListener('click', handler);
  return node;
}

// DOM presentation only. All ownership changes use the reviewed vault's
// prepare/confirm protocol; previews never become accepted inventory.
export function createGarageUI(host, {onClose = () => {}, onPreview = () => {},
  onCamera = () => {}, onBoundary = () => {}} = {}) {
  let opened = false, disposed = false, modelId = GARAGE_CATALOG[0].modelId;
  let ownedVehicleId = null, camera = 'front', prepared = null, returnFocus = null;
  let reading = false, fileRead = 0, message = '', previousState = undefined;
  let slotReason = 'not-loaded'; // Presentation of the last loaded slot, never proposed ownership.
  const held = new Set(), blocked = new Set(), downloads = new Set();
  host.classList.add('garage-panel');
  host.hidden = true;
  host.setAttribute('aria-label', 'After Hours Motor Works garage');
  const header = element('header', undefined, 'garage-header');
  const heading = element('div');
  heading.append(element('p','Street Rod · The Garage','eyebrow'),
    element('h2','After Hours Motor Works'), element('p','Buy it. Own it. Park it.','garage-tagline'));
  const closeButton = button('close','Back to menu', () => { if (!vault.view.busy) onClose(); });
  header.append(heading, closeButton);
  const balance = element('strong'); balance.id = 'garage-balance';
  const saveStatus = element('strong'); saveStatus.id = 'garage-status';
  const statusCopy = element('p'); statusCopy.id = 'garage-status-copy';
  statusCopy.setAttribute('role','status'); statusCopy.setAttribute('aria-live','polite');
  const liveMessage = element('p'); liveMessage.id = 'garage-message';
  liveMessage.setAttribute('role','status'); liveMessage.setAttribute('aria-live','polite');
  const status = element('section',undefined,'garage-status');
  status.append(balance,saveStatus,statusCopy,liveMessage);
  const introduction = element('section',undefined,'garage-introduction');
  introduction.id = 'garage-introduction'; introduction.hidden = true;
  introduction.setAttribute('aria-labelledby','garage-intro-title');
  const introTitle = element('h3'); introTitle.id = 'garage-intro-title'; introTitle.tabIndex = -1;
  const introCopy = element('p'); introCopy.id = 'garage-intro-copy';
  const create = button('create','Create garage',reviewNewGarage,'primary');
  const migrate = button('migrate','Review garage upgrade',() => {
    cancelPending(); proposal(vault.prepareMigration());
  },'primary');
  const introImport = button('intro-import','Import a backup',() => reveal(importInput));
  const introReload = button('intro-reload','Reload saved garage',reloadGarage);
  const introActions = element('div',undefined,'garage-actions');
  introActions.append(create,migrate,introImport,introReload);
  introduction.append(introTitle,introCopy,introActions);
  const cameraControls = element('div',undefined,'garage-cameras');
  cameraControls.setAttribute('aria-label','Showroom camera');
  const cameras = new Map();
  for (const [id,label] of [['front','Front quarter'],['side','Side'],['rear','Rear quarter'],['bays','Four bays']]) {
    const control = button('camera-'+id,label,() => {
      camera = id;
      for (const [key,node] of cameras) node.setAttribute('aria-pressed',String(key === camera));
      onCamera(camera); present();
    });
    control.setAttribute('aria-pressed',String(id === camera));
    cameras.set(id,control); cameraControls.append(control);
  }
  const layout = element('div',undefined,'garage-layout');
  const catalogue = element('section',undefined,'garage-catalogue');
  catalogue.append(element('h3','Original catalogue'));
  const catalogueList = element('div',undefined,'garage-models'), modelButtons = new Map();
  for (const model of GARAGE_CATALOG) {
    const control = button('model-'+model.modelId,'',() => inspect(model.modelId,null),'garage-model');
    control.style.setProperty('--paint',model.finish.body);
    control.append(element('strong',model.displayName),element('span',credits(model.purchasePrice)));
    control.setAttribute('aria-pressed','false');
    modelButtons.set(model.modelId,control); catalogueList.append(control);
  }
  catalogue.append(catalogueList);
  const detail = element('section',undefined,'garage-details');
  const modelName = element('h3'); modelName.id = 'garage-model-name';
  const modelDescription = element('p'); modelDescription.id = 'garage-description';
  const modelFinish = element('p'), ownership = element('p'), price = element('p');
  ownership.id = 'garage-ownership';
  const availability = element('p'); availability.id = 'garage-availability';
  const buy = button('buy','Review purchase',() => transaction('buy',modelId),'primary');
  const select = button('select','Make active',() => transaction('select',ownedVehicleId));
  const sell = button('sell','Review sale',() => transaction('sell',ownedVehicleId));
  const showPreview = button('show-preview','View showroom',() => onCamera(camera),'garage-show-preview');
  const testDrive = button('test-drive','Drive at the Proving Grounds',() => {
    if (testDrive.disabled) return;
    boundary(); window.location.assign(testDrive.getAttribute('href'));
  });
  const detailActions = element('div',undefined,'garage-actions'); detailActions.append(buy,select,sell,testDrive);
  detail.append(modelName,modelDescription,modelFinish,ownership,showPreview,price,availability,detailActions,
    element('p','Paint is cosmetic. Garage selection does not change any established racing vehicle or performance.','garage-physics-note'));
  const bays = element('section',undefined,'garage-bays'); bays.append(element('h3','Your four bays'));
  const bayList = element('div',undefined,'garage-bay-list'), bayButtons = [];
  for (let index = 0; index < 4; index++) {
    const control = button('bay-'+index,'',() => {
      const car = vault.view.state?.bays[index];
      if (car) inspect(car.modelId,car.ownedVehicleId);
    },'garage-bay');
    bayButtons.push(control); bayList.append(control);
  }
  bays.append(bayList); layout.append(catalogue,detail,bays);
  const tools = element('section',undefined,'garage-tools');
  const partsCounter = createGaragePartsUI(action => {
    cancelPending();proposal(vault.prepareInstallation(action));
  });
  tools.append(element('h3','Save vault'));
  const reload = button('reload','Reload saved garage',reloadGarage);
  const exportButton = button('export','Export garage JSON',() => {
    const result = vault.exportSave();
    if (result.accepted) {
      download(result.text,'circuit-overdrive-garage.json');
      message = 'Garage JSON exported. Keep this file as a local backup.';
    } else message = explanation(result.reason);
    render(vault.view);
  });
  const exportLegacy = button('legacy-export','Export original legacy backup',() => {
    const result = vault.exportLegacySave();
    if (result.accepted) {
      download(result.text,'circuit-overdrive-garage-v1-backup.json');
      message = 'Original legacy ownership exported. Importing it later replaces the whole garage after confirmation.';
    } else message = explanation(result.reason);
    render(vault.view);
  });
  const importLabel = element('label','Import garage JSON');
  importLabel.htmlFor = 'garage-import';
  const importInput = element('input');
  importInput.id = 'garage-import'; importInput.type = 'file';
  importInput.accept = '.json,application/json';
  importInput.addEventListener('change',readImport);
  const cancelRead = button('cancel-read','Cancel file read',() => {
    cancelPending(); message = 'Import cancelled. Your save has not changed.'; render(vault.view);
  });
  const reset = button('new','Create garage',reviewNewGarage);
  const vaultActions = element('div',undefined,'garage-actions');
  vaultActions.append(reload,exportButton,exportLegacy,reset);
  tools.append(vaultActions,importLabel,importInput,cancelRead,
    element('p','Local fictional credits. No race rewards or purchases with real money. Export a backup before replacing a garage.','garage-save-note'));

  const dialog = element('dialog'); dialog.id = 'garage-confirmation';
  dialog.setAttribute('aria-labelledby','garage-confirm-title');
  dialog.setAttribute('aria-describedby','garage-confirm-copy');
  const confirmTitle = element('h2'); confirmTitle.id = 'garage-confirm-title';
  const confirmCopy = element('p'); confirmCopy.id = 'garage-confirm-copy';
  const confirmInventory = element('p'); confirmInventory.id = 'garage-confirm-inventory';
  const backup = button('backup','Export current garage first',() => {
    if (prepared?.backup) download(prepared.backup,'circuit-overdrive-garage-before-replacement.json');
  });
  const cancelButton = button('cancel','Cancel',() => {
    const origin = returnFocus;
    cancelPending(); message = 'Cancelled. Your saved garage has not changed.'; render(vault.view);
    // The cancellation announcement can change panel height on narrow screens.
    if (origin && introduction.contains(origin) && !origin.hidden && !origin.disabled) reveal(origin);
  },'primary');
  const confirmButton = button('confirm','Confirm',commit);
  const confirmActions = element('div',undefined,'garage-actions');
  confirmActions.append(cancelButton,confirmButton);
  dialog.append(confirmTitle,confirmCopy,confirmInventory,backup,confirmActions);
  dialog.addEventListener('cancel',event => {
    event.preventDefault(); if (!vault.view.busy) cancelButton.click();
  });
  dialog.addEventListener('close',() => {
    // A queued close event from an earlier confirmation cannot cancel a new one.
    if (!dialog.open && prepared && !vault.view.busy) cancelPending();
  });
  host.replaceChildren(header,status,introduction,cameraControls,layout,partsCounter.host,tools,dialog);
  const vault = createGarageVault({onChange:render});

  function reveal(control) {
    control.focus({preventScroll:true});
    control.scrollIntoView({block:'nearest',behavior:'instant'});
  }
  function reviewNewGarage() {
    cancelPending(); proposal(vault.prepareReset());
  }
  function reloadGarage() {
    cancelPending(); message = 'Loaded the current local save.'; render(vault.load());
  }
  function explanation(reason) { return reasons[reason] || 'The action could not be accepted. Reload the saved garage and review it again.'; }
  function boundary() {
    for (const key of held) blocked.add(key);
    onBoundary();
  }
  function presentation() {
    return Object.freeze({state:vault.view.state,modelId,ownedVehicleId,camera});
  }
  function present() { if (opened && !disposed) onPreview(presentation()); }
  function inspect(id,owned) {
    if (vault.view.busy || reading) return;
    modelId = id; ownedVehicleId = owned;
    render(vault.view); present();
  }
  function download(text,name) {
    const url = URL.createObjectURL(new Blob([text],{type:'application/json'}));
    downloads.add(url);
    const anchor = element('a'); anchor.href = url; anchor.download = name;
    anchor.click();
    setTimeout(() => { URL.revokeObjectURL(url); downloads.delete(url); },1000);
  }
  function hideDialog() {
    prepared = null;
    if (dialog.open) { boundary(); dialog.close(); }
    if (opened && returnFocus?.isConnected && !returnFocus.disabled && !returnFocus.closest('[hidden]')) {
      if (introduction.contains(returnFocus)) reveal(returnFocus);
      else returnFocus.focus({preventScroll:true});
    }
    returnFocus = null;
  }
  function cancelPending() {
    fileRead++; reading = false; importInput.value = '';
    vault.cancel(); hideDialog();
  }
  function render(view) {
    if (disposed) return;
    if (['CONFLICT','STORAGE UNAVAILABLE'].includes(view.status) && !view.busy) {
      if (prepared || reading) { cancelPending(); message = explanation(view.reason); }
    }
    const state = view.state;
    if (state) slotReason = null;
    else if (['empty','invalid-save'].includes(view.reason)) slotReason = view.reason;
    const car = state?.bays.find(entry => entry?.ownedVehicleId === ownedVehicleId);
    if (ownedVehicleId && !car) ownedVehicleId = null;
    // A whole-state import can give the same serial a different catalogue
    // model. Reconcile the inspected car from the newly accepted snapshot.
    if (car) modelId = car.modelId;
    const model = garageModel(modelId);
    partsCounter.render(view,car);
    host.dataset.status = view.status; host.dataset.busy = String(view.busy);
    host.dataset.ownedCount = String(state?.bays.filter(Boolean).length ?? 0);
    host.dataset.revision = state ? String(state.revision) : '';
    host.dataset.modelId = modelId; host.dataset.ownedVehicleId = ownedVehicleId ?? '';
    balance.textContent = state ? credits(state.credits) : 'No saved garage';
    saveStatus.textContent = view.status;
    statusCopy.textContent = view.reason ? explanation(view.reason) : 'Saved locally in this browser. Export a backup for safekeeping.';
    liveMessage.textContent = message;
    const blockedWrite = view.busy || reading || ['CONFLICT','STORAGE UNAVAILABLE'].includes(view.status);
    const needsMigration = view.migrationRequired;
    const introMode = view.status === 'CONFLICT' ? 'conflict' :
      view.status === 'STORAGE UNAVAILABLE' ? 'unavailable' : needsMigration ? 'migration' : !state ? slotReason : null;
    introduction.hidden = !['empty','invalid-save','conflict','unavailable','migration'].includes(introMode);
    introduction.dataset.mode = introMode ?? '';
    introTitle.textContent = introMode === 'empty' ? 'Create Your Garage' :
      introMode === 'migration' ? 'Keep your cars. Add stock builds.' : introMode === 'invalid-save' ? 'Recover your garage' :
      introMode === 'conflict' ? 'Reload to continue' : 'Garage saving unavailable';
    introCopy.textContent = introMode === 'empty' ?
      'Four available bays. '+credits(INITIAL_CREDITS)+' to start. Six original vehicles to inspect. Confirm creation to unlock purchases.' :
      introMode === 'invalid-save' ? reasons['invalid-save'] : explanation(view.reason);
    create.hidden = !['empty','invalid-save'].includes(introMode);
    create.textContent = introMode === 'invalid-save' ? 'Review new garage' : 'Create garage';
    create.disabled = blockedWrite;
    migrate.hidden = introMode !== 'migration'; migrate.disabled = blockedWrite;
    introImport.hidden = introMode !== 'invalid-save'; introImport.disabled = blockedWrite;
    introReload.hidden = !['conflict','unavailable'].includes(introMode); introReload.disabled = view.busy;
    const full = state && state.bays.every(Boolean), poor = state && state.credits < model.purchasePrice;
    modelName.textContent = model.displayName;
    modelDescription.textContent = model.description;
    const finish=vehiclePaint(car?.build?.parts.paint??'factory',modelId);
    modelFinish.textContent = finish.name + ' · ' + model.bodyStyle.replaceAll('-',' ') + ' · Cosmetic finish';
    ownership.textContent = car ? car.ownedVehicleId + (state.activeVehicleId === car.ownedVehicleId ? ' · Active vehicle' : ' · Owned vehicle') : 'Catalogue preview · Not an owned vehicle';
    price.textContent = 'Purchase ' + credits(model.purchasePrice) + ' · Resale ' + credits(garageResaleValue(modelId));
    availability.textContent = needsMigration ? reasons['migration-required'] : ['CONFLICT','STORAGE UNAVAILABLE'].includes(view.status) ? explanation(view.reason) :
      !state ? slotReason === 'invalid-save' ? reasons['invalid-save'] : reasons['no-garage'] : full ? reasons['garage-full'] : poor ? reasons['insufficient-credits'] : 'Purchase uses the first empty bay. You may own more than one of this model.';
    buy.disabled = blockedWrite || needsMigration || !state || full || poor;
    select.hidden = sell.hidden = !car;
    select.disabled = blockedWrite || needsMigration || !car || state?.activeVehicleId === car?.ownedVehicleId;
    sell.disabled = blockedWrite || needsMigration || !car;
    testDrive.hidden = !car; testDrive.disabled = blockedWrite || needsMigration || !car;
    testDrive.setAttribute('href','./proving-ground.html?vehicle='+encodeURIComponent(car?.ownedVehicleId??''));
    buy.textContent = 'Buy · ' + credits(model.purchasePrice);
    sell.textContent = 'Sell · ' + credits(garageResaleValue(modelId));
    for (const [id,control] of modelButtons) {
      control.setAttribute('aria-pressed',String(id === modelId && !ownedVehicleId));
      control.disabled = view.busy || reading;
    }
    for (const [index,control] of bayButtons.entries()) {
      const occupant = state?.bays[index];
      control.replaceChildren(element('small','Bay '+(index+1)),
        element('strong',occupant ? garageModel(occupant.modelId).displayName : 'Empty bay'));
      if (occupant) control.append(element('span',occupant.ownedVehicleId),element('span',
        state.activeVehicleId === occupant.ownedVehicleId ? 'ACTIVE' : 'Inspect vehicle'));
      control.disabled = !occupant || view.busy || reading;
      control.dataset.active = String(!!occupant && state.activeVehicleId === occupant.ownedVehicleId);
      control.setAttribute('aria-pressed',String(!!occupant && occupant.ownedVehicleId === ownedVehicleId));
    }
    reload.disabled = view.busy;
    exportButton.disabled = !state || view.busy;
    exportLegacy.hidden = !view.hasLegacyBackup; exportLegacy.disabled = view.busy;
    reset.disabled = blockedWrite || needsMigration;
    reset.textContent = state ? 'Reset garage' : 'Create garage';
    importInput.disabled = blockedWrite || needsMigration;
    cancelRead.hidden = !reading;
    closeButton.disabled = view.busy;
    cancelButton.disabled = view.busy;
    confirmButton.disabled = view.busy || !prepared;
    backup.disabled = view.busy || !prepared?.backup;
    if (state !== previousState) { previousState = state; present(); }
  }
  function transaction(type,targetId) {
    cancelPending();
    const state = vault.view.state;
    proposal(vault.prepareTransaction({type,targetId,expectedRevision:state?.revision}));
  }
  function proposal(result) {
    if (!result.accepted) {
      message = explanation(result.reason); render(vault.view); return;
    }
    prepared = result; returnFocus = document.activeElement;
    const {type,state,receipt} = result.preview;
    if (type === 'buy') {
      const model = garageModel(receipt.modelId);
      confirmTitle.textContent = 'Buy '+model.displayName+'?';
      confirmCopy.textContent = 'Pay '+credits(-receipt.creditDelta)+'. '+receipt.ownedVehicleId+' will occupy bay '+(receipt.bayIndex+1)+'. Balance after purchase: '+credits(state.credits)+'.';
      confirmButton.textContent = 'Confirm purchase';
    } else if (type === 'sell') {
      confirmTitle.textContent = 'Sell '+garageModel(receipt.modelId).displayName+'?';
      confirmCopy.textContent = 'Sell '+receipt.ownedVehicleId+' for '+credits(receipt.creditDelta)+'. Bay '+(receipt.bayIndex+1)+' will be empty. Balance after sale: '+credits(state.credits)+'.';
      confirmButton.textContent = 'Confirm sale';
    } else if (type === 'select') {
      confirmTitle.textContent = 'Make '+garageModel(receipt.modelId).displayName+' active?';
      confirmCopy.textContent = 'Select '+receipt.ownedVehicleId+' as your active garage vehicle. This changes your collection selection only; racing vehicles and performance stay unchanged.';
      confirmButton.textContent = 'Confirm selection';
    } else if (type === 'install') {
      confirmTitle.textContent = 'Fit '+vehiclePart(receipt.slot,receipt.partId).name+'?';
      const setup=state.bays[receipt.bayIndex].build.tuning;
      confirmCopy.textContent = 'Fit to '+receipt.ownedVehicleId+' ('+garageModel(receipt.modelId).displayName+'). Part '+credits(receipt.partCost)+' + fitting '+credits(receipt.fittingCost)+'. Total '+credits(receipt.cost)+'. Balance after fitting: '+credits(state.credits)+'. Setup steps: final drive '+setup.finalDrive+', spring '+setup.spring+', damper '+setup.damper+', travel '+setup.travel+', steering '+setup.steering+'. This installs the reviewed build on this car only.';
      confirmButton.textContent = 'Confirm fitting';
    } else if (type === 'migrate') {
      confirmTitle.textContent = 'Keep this garage and add individual builds?';
      confirmCopy.textContent = 'Keep every owned ID, bay, credit and selection. Each car receives its own stock build and pristine condition. The original legacy save is retained as an exportable backup. Existing racing vehicles stay unchanged.';
      confirmButton.textContent = 'Confirm garage upgrade';
    } else {
      const importing = type === 'import';
      confirmTitle.textContent = importing ? 'Replace garage with this save?' : vault.view.state ? 'Start a new garage?' : 'Create your garage?';
      confirmCopy.textContent = importing ? 'The validated file will replace the entire saved garage. Credits and vehicles are never merged. Legacy files receive independent stock builds while preserving their ownership and money. Export your current garage first if you want to keep it.' :
        'Create four empty bays with '+credits(INITIAL_CREDITS)+'. This replaces the current garage, if one exists. Existing vehicles and credits will not be carried over.';
      confirmButton.textContent = importing ? 'Confirm replacement' : 'Confirm new garage';
    }
    const vehicles = state.bays.filter(Boolean);
    confirmInventory.textContent = 'After confirmation: '+credits(state.credits)+' · '+vehicles.length+' / 4 bays occupied'+
      (vehicles.length ? ' · '+vehicles.map(car => garageModel(car.modelId).displayName+' ('+car.ownedVehicleId+')').join(', ') : '')+'.';
    backup.hidden = !['reset','import','migrate'].includes(type) || !result.backup;
    message = 'Review this action before confirming.';
    render(vault.view); boundary(); dialog.showModal(); cancelButton.focus();
  }
  async function commit() {
    if (!prepared || vault.view.busy) return;
    const intent = prepared;
    const creating = intent.preview.type === 'reset' && !vault.view.state;
    // Drop the UI reference before awaiting; the vault consumes its ticket too.
    prepared = null; fileRead++; boundary();
    const result = await vault.confirm(intent.ticket);
    if (disposed) return;
    hideDialog();
    if (result.accepted) {
      const receipt = result.receipt;
      if (['buy','select','install'].includes(receipt.type)) {
        modelId = receipt.modelId; ownedVehicleId = receipt.ownedVehicleId;
      } else if (['import','reset','migrate'].includes(receipt.type)) {
        const active = result.state.bays.find(car => car?.ownedVehicleId === result.state.activeVehicleId);
        ownedVehicleId = active?.ownedVehicleId ?? null;
        if (active) modelId = active.modelId;
      }
      message = receipt.type === 'buy' ? 'Purchase saved. Your vehicle is in bay '+(receipt.bayIndex+1)+'.' :
        receipt.type === 'sell' ? 'Sale saved. '+credits(receipt.creditDelta)+' received once.' :
        receipt.type === 'select' ? 'Active vehicle selection saved.' :
        receipt.type === 'install' ? 'Part and setup fitted and saved to '+receipt.ownedVehicleId+'. '+credits(receipt.cost)+' charged once.' :
        receipt.type === 'migrate' ? 'Garage upgraded and saved. Every owned vehicle kept its identity and received an independent stock build.' :
        receipt.type === 'import' ? 'Imported garage saved. The previous garage was replaced.' : creating ? 'Garage created. You have '+credits(result.state.credits)+'. Choose your first car.' : 'New garage saved. Your starting balance is ready.';
    } else message = explanation(result.reason);
    render(vault.view); present();
    if (opened && result.accepted && creating) reveal(buy.disabled ? modelButtons.get(modelId) : buy);
    if (opened && (!document.activeElement || document.activeElement === document.body)) closeButton.focus();
  }
  async function readImport() {
    const file = importInput.files?.[0];
    cancelPending();
    if (!file) return;
    const generation = fileRead;
    reading = true; message = 'Reading garage file…'; render(vault.view);
    let text;
    try { if (file.size <= GARAGE_SAVE_BYTES) text = await file.text(); }
    catch { /* The parser owns the rejected-import status. */ }
    if (disposed || !opened || generation !== fileRead) return;
    reading = false;
    proposal(vault.prepareImport(text));
  }
  function close() {
    if (!opened || vault.view.busy) return false;
    cancelPending(); opened = false; host.hidden = true; boundary(); return true;
  }
  function back() {
    if (vault.view.busy) return true;
    if (dialog.open) cancelButton.click();
    else if (reading) cancelRead.click();
    else onClose();
    return true;
  }
  function keydown(event) {
    if (!['Enter','Space'].includes(event.code)) return;
    // A fresh press can rearm after focus loss even when its release happened
    // outside this window. A held/repeated press still cannot cross a boundary.
    if (!event.repeat && !held.has(event.code)) blocked.delete(event.code);
    held.add(event.code);
    if (opened && (event.repeat || blocked.has(event.code))) event.preventDefault();
  }
  function keyup(event) {
    held.delete(event.code);
    if (opened && blocked.has(event.code)) event.preventDefault();
    blocked.delete(event.code);
  }
  function focusin(event) {
    if (opened && host.contains(event.target)) for (const key of held) blocked.add(key);
  }
  function blur() { for (const key of held) blocked.add(key); held.clear(); }
  window.addEventListener('keydown',keydown,true);
  window.addEventListener('keyup',keyup,true);
  window.addEventListener('blur',blur);
  host.addEventListener('focusin',focusin);
  return Object.freeze({
    get visible() { return opened; },
    get presentation() { return presentation(); },
    open() {
      if (disposed) return;
      opened = true; host.hidden = false; message = ''; boundary();
      render(vault.load()); present();
      if (!introduction.hidden) {
        if (introduction.dataset.mode === 'empty') host.scrollTop = 0;
        reveal(!migrate.hidden && !migrate.disabled ? migrate : create.hidden || create.disabled ? introTitle : create);
      } else closeButton.focus({preventScroll:true});
    },
    close,back,
    navigate(action) {
      if (!opened) return false;
      if (action === 'back') return back();
      const scope = dialog.open ? dialog : host;
      const controls = [...scope.querySelectorAll('button:enabled,input:enabled,select:enabled')]
        .filter(node => node.getClientRects().length && !node.hidden);
      const active = document.activeElement;
      if (active?.tagName === 'SELECT' && controls.includes(active) && ['left','right'].includes(action)) {
        active.selectedIndex=(active.selectedIndex+(action==='right'?1:-1)+active.options.length)%active.options.length;
        active.dispatchEvent(new Event('change',{bubbles:true}));
        return true;
      }
      if (action === 'accept' || action === 'confirm') {
        if (controls.includes(active)) active.click();
      } else if (['up','down','left','right'].includes(action) && controls.length) {
        const forward = action === 'down' || action === 'right', index = controls.indexOf(active);
        controls[index < 0 ? 0 : (index + (forward ? 1 : -1) + controls.length) % controls.length].focus();
      }
      return true;
    },
    dispose() {
      if (disposed) return;
      cancelPending(); disposed = true; opened = false; host.hidden = true; vault.dispose();
      window.removeEventListener('keydown',keydown,true); window.removeEventListener('keyup',keyup,true);
      window.removeEventListener('blur',blur); host.removeEventListener('focusin',focusin);
      for (const url of downloads) URL.revokeObjectURL(url);
      downloads.clear();
    }
  });
}
