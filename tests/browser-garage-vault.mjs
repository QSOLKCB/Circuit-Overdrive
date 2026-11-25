// SPDX-License-Identifier: Apache-2.0
// Optional CO-013C development test. This uses the real vault module through a
// plainly labelled fixture, not the future production garage showroom.
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = new URL(process.argv[2] || 'http://127.0.0.1:8000/');
const fixture = new URL('tests/fixtures/garage-vault.html',base).href;
const slot = 'circuit-overdrive.garage.v1';
const browser = await chromium.launch({executablePath:process.env.CHROME_BIN || undefined});
const errors = [], requests = [], scenarios = [];
const evidence = process.env.EVIDENCE_DIR;
if (evidence) await mkdir(evidence,{recursive:true});

async function context(options={}) {
  const context = await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true});
  // Fault injection changes browser services only, never garage state/results.
  await context.addInitScript(({slot,initialFault,missingLocks}) => {
    window.vaultTestFault = initialFault;
    let verifyRead = false;
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
    Storage.prototype.getItem = function(key) {
      if (key === slot) {
        if (window.vaultTestFault === 'read-denied') throw new DOMException('Test denied read','SecurityError');
        if (verifyRead) { verifyRead=false; throw new DOMException('Test interrupted read-back','SecurityError'); }
      }
      return get.call(this,key);
    };
    Storage.prototype.setItem = function(key,value) {
      if (key === slot) {
        if (window.vaultTestFault === 'quota') throw new DOMException('Test quota','QuotaExceededError');
        if (window.vaultTestFault === 'write-denied') throw new DOMException('Test denied write','SecurityError');
      }
      set.call(this,key,value);
      if (key === slot && window.vaultTestFault === 'readback-denied') verifyRead=true;
    };
    if (missingLocks) Object.defineProperty(navigator,'locks',{configurable:true,value:undefined});
  },{slot,initialFault:options.fault??'none',missingLocks:options.missingLocks??false});
  context.on('page',page => {
    page.on('pageerror',error=>errors.push(error.message));
    page.on('response',response=>{if(response.status()>=400)errors.push(response.status()+' '+response.url());});
  });
  await context.route('**/*',route => {
    const url=route.request().url();
    requests.push(url);
    if (url.startsWith(base.href) || url.startsWith('blob:') || url.startsWith('data:')) return route.continue();
    errors.push('Unexpected network request '+url);
    return route.abort();
  });
  return context;
}
async function pageIn(context) {
  const page=await context.newPage();
  await page.goto(fixture);
  await page.waitForSelector('body[data-ready="true"]');
  return page;
}
const text = (page,id) => page.locator('#'+id).textContent();
const state = async page => JSON.parse(await text(page,'state'));
const raw = page => page.evaluate(key=>localStorage.getItem(key),slot);
const envelope = async page => JSON.parse(await raw(page));
const outcome = async page => JSON.parse(await text(page,'result'));
async function waitStatus(page,status) {
  await page.waitForFunction(status=>document.querySelector('#status').textContent===status,status);
}
async function prepare(page,id) {
  const before=await state(page);
  await page.locator('#'+id).click();
  assert.equal((await outcome(page)).accepted,true,'action should prepare for confirmation');
  assert.deepEqual(await state(page),before,'preparation cannot promote a proposed state');
}
async function confirm(page,accepted=true) {
  await page.locator('#confirm').click();
  await page.waitForFunction(()=>document.body.dataset.busy==='false');
  const result=await outcome(page);
  assert.equal(result.accepted,accepted,JSON.stringify(result));
  return result;
}
async function commit(page,id) {
  await prepare(page,id);
  const result=await confirm(page);
  await waitStatus(page,'SAVED');
  return result;
}
async function importText(page,source) {
  const report=await page.locator('body').getAttribute('data-report');
  await page.locator('#import').setInputFiles({name:'garage.json',mimeType:'application/json',buffer:Buffer.from(source)});
  await page.waitForFunction(previous=>(document.body.dataset.report??null)!==previous,report);
  return outcome(page);
}
async function download(page,button='export') {
  const pending=page.waitForEvent('download');
  await page.locator('#'+button).click();
  const file=await pending;
  assert.equal(await file.failure(),null);
  return readFile(await file.path(),'utf8');
}
async function capture(page,name) {
  if (evidence) await page.screenshot({path:join(evidence,name+'.png'),fullPage:true});
}

try {
  const main=await context(), a=await pageIn(main), b=await pageIn(main);
  assert.equal(await state(a),null);
  assert.equal(await raw(a),null,'opening does not create a funded save');
  await waitStatus(a,'UNSAVED');
  const support=await a.evaluate(()=>({secureContext:isSecureContext,webLocks:typeof navigator.locks?.request==='function',
    cryptoRandom:typeof crypto.getRandomValues==='function',userAgent:navigator.userAgent}));
  assert(support.secureContext && support.webLocks && support.cryptoRandom,'real origin must provide the supported vault APIs');
  // Separate keys must survive every reset, transaction and import.
  await a.evaluate(()=>{
    localStorage.setItem('circuit-overdrive.woc.v1','championship-sentinel');
    localStorage.setItem('circuit-overdrive.settings','settings-sentinel');
    localStorage.setItem('circuit-overdrive.controller-profiles','profiles-sentinel');
  });
  await prepare(a,'new');
  assert.equal(await raw(a),null,'reset proposal is not a commit');
  await a.locator('#cancel').click();
  assert.equal(await raw(a),null,'cancel cannot allocate starting cash');
  await commit(a,'new');
  assert.equal((await state(a)).credits,2400);
  assert.equal((await envelope(a)).sequence,0);
  await b.locator('#load').click();
  assert.deepEqual(await state(b),await state(a));
  await capture(a,'empty-saved-garage');

  // Both tabs prepare against the same state. A commits, while B must preserve
  // its old display and reject its stale confirmation instead of overwriting A.
  await prepare(b,'buy');
  const bBefore=await state(b);
  await commit(a,'buy');
  const first=await state(a), firstRaw=await raw(a);
  assert.equal(first.credits,1800);
  assert.deepEqual(first.bays,[{ownedVehicleId:'car-000001',modelId:'cinder-two'},null,null,null]);
  await waitStatus(b,'CONFLICT');
  assert.deepEqual(await state(b),bBefore);
  assert(['confirmation-required','conflict'].includes((await confirm(b,false)).reason));
  assert.equal(await raw(b),firstRaw,'stale tab cannot replace accepted purchase');
  await capture(b,'stale-tab-conflict');
  await b.locator('#load').click();
  assert.deepEqual(await state(b),first);
  await b.reload();
  await b.waitForSelector('body[data-ready="true"]');
  assert.deepEqual(await state(b),first,'ownership survives a real page reload');
  await commit(b,'sell');
  await waitStatus(a,'CONFLICT');
  assert.equal((await state(a)).credits,1800,'other-tab update is not silently rebased');
  await a.locator('#load').click();
  assert.deepEqual(await state(a),await state(b));
  assert.equal((await state(a)).credits,2160);
  assert.equal((await state(a)).nextVehicleId,2);
  scenarios.push('two-tab purchase conflict, reload reconciliation and sale visibility');

  await commit(a,'buy');
  const owned=await state(a), exported=await download(a);
  assert.deepEqual(JSON.parse(exported),owned);
  assert.equal(owned.bays[0].ownedVehicleId,'car-000002');
  assert(!Object.hasOwn(JSON.parse(exported),'generation'),'public export contains garage data only');
  const beforeReset=await raw(a);
  await prepare(a,'new');
  assert.equal(await download(a,'backup'),exported,'replacement offers the current canonical export');
  assert.equal(await raw(a),beforeReset);
  await confirm(a);
  assert.equal((await state(a)).credits,2400);
  assert.deepEqual((await state(a)).bays,[null,null,null,null]);
  const resetRaw=await raw(a);
  assert.equal((await importText(a,exported)).accepted,true);
  assert.equal(await raw(a),resetRaw,'file admission and preview cannot overwrite storage');
  await confirm(a);
  assert.equal(await download(a),exported,'confirmed import re-exports identical canonical data');
  assert.deepEqual(await state(a),owned);
  await capture(a,'confirmed-import');

  const invalidFiles=[['malformed','{'],['oversized',' '.repeat(65537)],
    ['version',JSON.stringify({...owned,version:99})],
    ['duplicate-ID',JSON.stringify({...owned,bays:[owned.bays[0],owned.bays[0],null,null]})],
    ['extra-field',JSON.stringify({...owned,resale:999999})],
    ['prototype-field',exported.replace('"version":1','"version":1,"__proto__":{"polluted":true}')]];
  for (const [name,file] of invalidFiles) {
    const priorRaw=await raw(a), priorState=await state(a);
    assert.deepEqual(await importText(a,file),{accepted:false,reason:'invalid-import'},name);
    await waitStatus(a,'IMPORT REJECTED');
    assert.equal(await raw(a),priorRaw,name+' cannot write');
    assert.deepEqual(await state(a),priorState,name+' cannot alter displayed ownership');
  }
  await capture(a,'rejected-import');
  assert.equal((await importText(a,exported)).accepted,true);
  await a.locator('#cancel').click();
  assert.deepEqual(await state(a),owned);
  scenarios.push('download/file import, backup, whole-state replacement, canonical round-trip and invalid-file recovery');

  // Importing identical garage JSON changes the storage sequence, so another
  // tab's confirmation cannot survive an ABA-looking replacement.
  await a.locator('#load').click();
  await b.locator('#load').click();
  await prepare(b,'buy');
  const beforeIdentical=await envelope(a);
  assert.equal((await importText(a,exported)).accepted,true);
  await confirm(a);
  const afterIdentical=await envelope(a);
  assert.deepEqual(afterIdentical.garage,beforeIdentical.garage);
  assert.equal(afterIdentical.sequence,beforeIdentical.sequence+1);
  assert.equal(afterIdentical.generation,beforeIdentical.generation);
  await waitStatus(b,'CONFLICT');
  await confirm(b,false);
  assert.deepEqual(await envelope(a),afterIdentical);
  await b.locator('#load').click();
  assert.deepEqual(await state(a),await state(b));
  scenarios.push('identical-import storage generation/sequence invalidates stale confirmation');

  // A stale file replacement is just as dangerous as a stale purchase. Its
  // confirmed candidate must not restore money or inventory from before A's buy.
  assert.equal((await importText(b,exported)).accepted,true);
  await commit(a,'buy');
  const afterCompetingBuy=await raw(a);
  await waitStatus(b,'CONFLICT');
  await confirm(b,false);
  assert.equal(await raw(b),afterCompetingBuy);
  await b.locator('#load').click();
  assert.deepEqual(await state(b),await state(a));
  assert.equal((await state(a)).credits,960);
  assert.equal((await state(a)).bays.filter(Boolean).length,2);
  scenarios.push('stale-tab import cannot undo a newer committed purchase');

  // Delay a real file read, cancel its dialog, then deliver its contents. The
  // adapter must not open a new confirmation after the player's cancellation.
  await a.evaluate(()=>{
    const read=File.prototype.text;
    File.prototype.text=function() {
      return new Promise(resolve=>{window.releaseVaultFile=async()=>{resolve(await read.call(this));};});
    };
    window.restoreVaultFile=()=>{File.prototype.text=read;};
  });
  await a.locator('#import').setInputFiles({name:'delayed.json',mimeType:'application/json',buffer:Buffer.from(exported)});
  await a.waitForFunction(()=>typeof window.releaseVaultFile==='function');
  await a.locator('#cancel').click();
  await a.evaluate(async()=>{await window.releaseVaultFile();window.restoreVaultFile();await new Promise(resolve=>setTimeout(resolve,0));});
  assert.equal(await text(a,'preview'),'null');
  assert(await a.locator('#confirm').isDisabled());
  assert.equal(await raw(a),afterCompetingBuy);
  scenarios.push('cancelled asynchronous file read cannot revive a replacement confirmation');
  assert.deepEqual(await a.evaluate(()=>[
    localStorage.getItem('circuit-overdrive.woc.v1'),localStorage.getItem('circuit-overdrive.settings'),
    localStorage.getItem('circuit-overdrive.controller-profiles')]),
  ['championship-sentinel','settings-sentinel','profiles-sentinel']);

  // API faults occur at the storage boundary. Every proposed purchase still
  // passes through real request validation and the browser's real Web Lock.
  const failuresContext=await context(), failurePage=await pageIn(failuresContext);
  await commit(failurePage,'new');
  for (const fault of ['quota','write-denied']) {
    const before=await state(failurePage), previousRaw=await raw(failurePage);
    await failurePage.evaluate(fault=>{window.vaultTestFault=fault;},fault);
    await prepare(failurePage,'buy');
    assert.equal((await confirm(failurePage,false)).reason,'write-failed');
    await waitStatus(failurePage,'STORAGE UNAVAILABLE');
    assert.deepEqual(await state(failurePage),before);
    assert.equal(await raw(failurePage),previousRaw);
    await failurePage.evaluate(()=>{window.vaultTestFault='none';});
    await failurePage.locator('#buy').click();
    assert.equal((await outcome(failurePage)).accepted,false,'write failure requires explicit reload');
    await failurePage.locator('#load').click();
    assert.deepEqual(await state(failurePage),before);
  }
  await commit(failurePage,'buy');
  assert.equal((await state(failurePage)).credits,1800);
  assert.equal((await state(failurePage)).bays.filter(Boolean).length,1);
  scenarios.push('QuotaExceededError and SecurityError writes preserve ownership and recover without free cars');

  const beforeUnknown=await state(failurePage);
  await failurePage.evaluate(()=>{window.vaultTestFault='readback-denied';});
  await prepare(failurePage,'buy');
  assert.equal((await confirm(failurePage,false)).reason,'verification-failed');
  await waitStatus(failurePage,'STORAGE UNAVAILABLE');
  assert.deepEqual(await state(failurePage),beforeUnknown,'uncertain write cannot optimistically promote');
  await failurePage.evaluate(()=>{window.vaultTestFault='none';});
  await failurePage.locator('#buy').click();
  assert.equal((await outcome(failurePage)).accepted,false,'unknown completion cannot be retried without reload');
  await failurePage.locator('#load').click();
  assert.equal((await state(failurePage)).credits,1200);
  assert.equal((await state(failurePage)).bays.filter(Boolean).length,2,'reload discovers the single actual write');
  scenarios.push('interrupted read-back blocks mutation until reload discovers committed result');

  const deniedContext=await context({fault:'read-denied'}), denied=await pageIn(deniedContext);
  await waitStatus(denied,'STORAGE UNAVAILABLE');
  assert.equal(await state(denied),null);
  await denied.locator('#new').click();
  assert.equal((await outcome(denied)).accepted,false);
  await denied.evaluate(()=>{window.vaultTestFault='none';});
  await denied.locator('#load').click();
  assert.equal(await state(denied),null);
  assert.equal(await raw(denied),null);
  await commit(denied,'new');
  assert.equal((await state(denied)).credits,2400);
  const noLocksContext=await context({missingLocks:true}), noLocks=await pageIn(noLocksContext);
  await waitStatus(noLocks,'STORAGE UNAVAILABLE');
  await noLocks.locator('#new').click();
  assert.equal((await outcome(noLocks)).accepted,false);
  assert.equal(await raw(noLocks),null,'unavailable coordination fails closed');
  scenarios.push('denied reads and unavailable Web Locks fail closed without funding a garage');

  const corruptContext=await context(), corrupt=await pageIn(corruptContext);
  for (const broken of ['{invalid',JSON.stringify({version:99,garage:{}})]) {
    await corrupt.evaluate(({slot,broken})=>localStorage.setItem(slot,broken),{slot,broken});
    await corrupt.locator('#load').click();
    await waitStatus(corrupt,'UNSAVED');
    assert.equal(await text(corrupt,'reason'),'invalid-save');
    assert.equal(await state(corrupt),null);
    assert.equal(await raw(corrupt),broken,'load cannot replace corrupt storage with free cash');
    assert.equal((await importText(corrupt,exported)).accepted,true);
    assert.equal(await raw(corrupt),broken,'validated import still requires confirmation');
    await confirm(corrupt);
    assert.equal(await download(corrupt),exported,'explicit import recovers the real previously exported ownership');
  }
  scenarios.push('malformed and unsupported stored saves recover only through confirmed validated replacement');

  assert.deepEqual(errors,[]);
  const receipt={source:process.env.SOURCE_SHA??null,url:fixture,browser:browser.version(),support,
    requests:requests.length,errors,scenarios,finalGarage:await state(a),
    storageSequence:(await envelope(a)).sequence,scope:'development fixture using production vault; no showroom or native GPU claim'};
  if (evidence) await writeFile(join(evidence,'garage-vault-browser.json'),JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify(receipt,null,2));
} finally {
  await browser.close();
}
