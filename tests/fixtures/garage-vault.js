// SPDX-License-Identifier: Apache-2.0
// Development-only UI adapter around the production vault. No state override.
import {createGarageVault} from '../../src/garage-vault.js';
import {GARAGE_SAVE_BYTES} from '../../src/garage.js';

const $ = id => document.getElementById(id);
let prepared = null, fileRead = 0, reportSequence = 0;
function render(view) {
  $('status').textContent = view.status;
  $('reason').textContent = view.reason ?? '';
  $('state').textContent = JSON.stringify(view.state);
  document.body.dataset.busy = String(view.busy);
  for (const id of ['load','new','buy','sell','import','cancel']) $(id).disabled = view.busy;
  $('confirm').disabled = view.busy || !prepared?.accepted;
  $('backup').disabled = view.busy || !prepared?.backup;
}
const vault = createGarageVault({onChange:render});
function report(result) {
  document.body.dataset.report = String(++reportSequence);
  $('result').textContent = JSON.stringify(result);
  $('result').dataset.accepted = String(result.accepted);
  $('result').dataset.reason = result.reason ?? '';
}
function showProposal(result) {
  prepared = result.accepted ? result : null;
  $('preview').textContent = JSON.stringify(prepared?.preview ?? null);
  report(result.accepted ? {accepted:true,reason:'confirmation-required'} : result);
  render(vault.view);
}
function clearProposal() {
  prepared = null;
  $('preview').textContent = 'null';
}
function download(text, name='circuit-overdrive-garage.json') {
  const blob = new Blob([text], {type:'application/json'});
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
}
$('load').onclick = () => {
  fileRead++;
  clearProposal();
  render(vault.load());
};
$('new').onclick = () => { fileRead++; showProposal(vault.prepareReset()); };
for (const [button,type] of [['buy','buy'],['sell','sell']]) $(button).onclick = () => {
  fileRead++;
  const state = vault.view.state;
  showProposal(vault.prepareTransaction({type, targetId:type === 'buy' ? 'cinder-two' : state?.activeVehicleId,
    expectedRevision:state?.revision}));
};
$('confirm').onclick = async () => {
  fileRead++;
  const ticket = prepared?.ticket;
  clearProposal();
  render(vault.view);
  report(await vault.confirm(ticket));
  render(vault.view);
};
$('cancel').onclick = () => {
  fileRead++;
  clearProposal();
  vault.cancel();
  report({accepted:false,reason:'cancelled'});
  render(vault.view);
};
$('export').onclick = () => {
  const result = vault.exportSave();
  report(result.accepted ? {accepted:true,reason:'exported'} : result);
  if (result.accepted) download(result.text);
};
$('backup').onclick = () => {
  if (prepared?.backup) download(prepared.backup,'circuit-overdrive-garage-before-replacement.json');
};
$('import').onchange = async event => {
  const generation = ++fileRead, file = event.target.files[0];
  clearProposal();
  vault.cancel();
  render(vault.view);
  if (!file) return;
  // Check file size before loading it into JS memory. prepareImport owns all
  // content admission and the IMPORT REJECTED status, including oversize files.
  let text;
  try { if (file.size <= GARAGE_SAVE_BYTES) text = await file.text(); }
  catch { text = undefined; }
  if (generation !== fileRead) return;
  showProposal(vault.prepareImport(text));
};
window.addEventListener('pagehide', () => { fileRead++; vault.dispose(); }, {once:true});
render(vault.load());
document.body.dataset.ready = 'true';
