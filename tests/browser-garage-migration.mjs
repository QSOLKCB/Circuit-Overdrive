// SPDX-License-Identifier: Apache-2.0
// Actual published-v1.3.0/current production controls share one browser origin.
// Garage state is created by old UI purchases or native validated file import.
// Synthetic missed storage notifications and storage API faults are disclosed.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {stockVehicleBuild} from '../src/vehicle-builds.js';

const base=new URL(process.argv[2] || 'http://127.0.0.1:8766/Circuit-Overdrive/');
const legacyArgument=process.argv.find(arg=>arg.startsWith('--legacy='));
assert(legacyArgument,'Pass --legacy=URL_OF_EXACT_PUBLISHED_V130_PACKAGE');
const legacy=new URL(legacyArgument.slice('--legacy='.length));
assert.equal(base.origin,legacy.origin,'Both packages must share the same real storage/lock origin');
assert.notEqual(base.pathname,legacy.pathname);
const published='1c745a90258d0f6cb968935f773354cff702b276';
const slot='circuit-overdrive.garage.v1';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN || undefined,
  args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const evidence=process.env.EVIDENCE_DIR;
if(evidence)await mkdir(evidence,{recursive:true});
const errors=[],requests=[],scenarios=[],downloads=[],captures=[],faults=[];
let source,runtime;
const control=(page,id)=>page.locator('#garage-'+id);
const raw=page=>page.evaluate(key=>localStorage.getItem(key),slot);
const stored=async page=>JSON.parse(await raw(page));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

async function context(){
  const result=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  result.on('page',page=>{
    page.on('pageerror',error=>errors.push(error.message));
    page.on('response',response=>{if(response.status()>=400)errors.push(response.status()+' '+response.url());});
  });
  await result.route('**/*',route=>{
    const url=route.request().url();requests.push(url);
    if(url.startsWith(base.href)||url.startsWith(legacy.href)||url.startsWith('blob:')||url.startsWith('data:'))return route.continue();
    errors.push('Unexpected request '+url);return route.abort();
  });
  return result;
}
async function openPage(context,url,{missStorageEvents=false,storageFaults=false}={}){
  const page=await context.newPage();
  if(missStorageEvents)await page.addInitScript(()=>{
    window.migrationSuppressedEvents=0;
    window.addEventListener('storage',event=>{
      window.migrationSuppressedEvents++;
      event.stopImmediatePropagation();
    },true);
  });
  if(storageFaults)await page.addInitScript(slot=>{
    window.migrationStorageFault='none';
    const get=Storage.prototype.getItem,set=Storage.prototype.setItem;
    let uncertainRead=false;
    Storage.prototype.getItem=function(key){
      if(key===slot&&uncertainRead){uncertainRead=false;throw new DOMException('Test interrupted read-back','SecurityError');}
      return get.call(this,key);
    };
    Storage.prototype.setItem=function(key,value){
      if(key===slot&&window.migrationStorageFault==='quota')throw new DOMException('Test full storage','QuotaExceededError');
      const result=set.call(this,key,value);
      if(key===slot&&window.migrationStorageFault==='readback')uncertainRead=true;
      return result;
    };
  },slot);
  await page.goto(url.href);
  const revision=await page.locator('meta[name="game-revision"]').getAttribute('content');
  if(url.href===legacy.href)assert.equal(revision,published,'Old package must be the exact published source');
  else{
    assert.match(revision,/^[a-f0-9]{40}$/,'Use a source-stamped current package');
    if(process.env.SOURCE_SHA)assert.equal(revision,process.env.SOURCE_SHA);
    source??=revision;assert.equal(revision,source);
  }
  await page.locator('#enter-garage:enabled').click();
  await page.waitForSelector('body[data-phase="garage"]');
  return page;
}
async function status(page,value){await page.waitForFunction(value=>document.querySelector('#garage-status').textContent===value,value);}
async function prepare(page,id){
  const before=await raw(page);
  await control(page,id).click();
  await control(page,'confirmation').waitFor({state:'visible'});
  assert.equal(await raw(page),before,'Review must not persist any proposed transition');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'garage-cancel');
}
async function confirm(page){
  await control(page,'confirm').click();
  await page.waitForFunction(()=>document.querySelector('#garage').dataset.busy==='false');
  await control(page,'confirmation').waitFor({state:'hidden'});
}
async function commit(page,id){await prepare(page,id);await confirm(page);await status(page,'SAVED');}
async function download(page,id='export'){
  const pending=page.waitForEvent('download');await control(page,id).click();
  const file=await pending;assert.equal(await file.failure(),null);
  const text=await readFile(await file.path(),'utf8');
  const name='migration-download-'+String(downloads.length+1).padStart(2,'0')+'.json';
  downloads.push({file:name,suggestedName:file.suggestedFilename(),bytes:Buffer.byteLength(text),sha256:hash(text)});
  if(evidence)await writeFile(join(evidence,name),text);
  return text;
}
async function importProposal(page,text){
  const before=await raw(page);
  await control(page,'import').setInputFiles({name:'garage.json',mimeType:'application/json',buffer:Buffer.from(text)});
  await control(page,'confirmation').waitFor({state:'visible'});
  assert.equal(await raw(page),before,'Native File admission cannot replace storage before confirmation');
}
function ownership(state){
  return {credits:state.credits,nextVehicleId:state.nextVehicleId,activeVehicleId:state.activeVehicleId,
    revision:state.revision,catalogRevision:state.catalogRevision,
    bays:state.bays.map(car=>car?{ownedVehicleId:car.ownedVehicleId,modelId:car.modelId}:null)};
}
function currentBuilds(state){
  assert.equal(state.version,2);assert.equal(state.edition,'machine-shop-v1');
  for(const car of state.bays.filter(Boolean)){
    assert.deepEqual(car.build,stockVehicleBuild(car.modelId));
    assert.deepEqual(car.condition,{version:1,status:'pristine'});
  }
}
async function capture(page,name){
  if(!evidence)return;
  const path=join(evidence,name+'.png');await page.screenshot({path,fullPage:true});
  captures.push({file:name+'.png',sha256:hash(await readFile(path))});
}

try{
  const shared=await context();
  const old=await openPage(shared,legacy,{missStorageEvents:true});
  assert.equal(await raw(old),null);
  await commit(old,'create');
  for(let index=0;index<4;index++){
    await control(old,'model-cinder-two').click();await commit(old,'buy');
  }
  await control(old,'bay-3').click();await commit(old,'select');
  const originalRaw=await raw(old),original=JSON.parse(originalRaw),originalSave=await download(old);
  assert.equal(original.version,1);assert.equal(original.garage.version,1);
  assert.equal(original.garage.credits,0);assert.equal(original.garage.nextVehicleId,5);
  assert.equal(original.garage.activeVehicleId,'car-000004');
  assert.deepEqual(original.garage.bays.map(car=>car.ownedVehicleId),['car-000001','car-000002','car-000003','car-000004']);
  await prepare(old,'sell');
  scenarios.push('Four genuine published-UI purchases and active selection; obsolete sale confirmation remains pending');

  const current=await openPage(shared,base);
  runtime=await current.evaluate(()=>{
    const gl=document.querySelector('#garage-canvas').getContext('webgl'),debug=gl.getExtension('WEBGL_debug_renderer_info');
    return {browser:navigator.userAgent,webLocks:typeof navigator.locks?.request==='function',
      secureContext:isSecureContext,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
  });
  await status(current,'MIGRATION REQUIRED');assert.equal(await raw(current),originalRaw);
  assert.equal(await current.locator('#garage').getAttribute('data-owned-count'),'4');
  await control(current,'bay-3').click();
  for(const id of ['buy','sell','new','import'])assert(await control(current,id).isDisabled(),id+' blocked until conversion');
  await prepare(current,'migrate');
  assert.deepEqual(JSON.parse(await download(current,'backup')),original.garage);
  await capture(current,'migration-confirmation');
  await control(current,'cancel').click();
  assert.equal(await raw(current),originalRaw,'Cancelled upgrade preserves exact published envelope bytes');
  await status(current,'MIGRATION REQUIRED');
  assert.deepEqual(JSON.parse(await download(current,'legacy-export')),original.garage);
  scenarios.push('Read-only migration admission, original-save download and cancelled confirmation preserve exact legacy storage');

  await commit(current,'migrate');
  const migratedRaw=await raw(current),migrated=JSON.parse(migratedRaw);
  assert.equal(migrated.version,2);assert.equal(migrated.generation,original.generation);
  assert.equal(migrated.sequence,original.sequence+1);
  assert.deepEqual(ownership(migrated.garage),ownership(original.garage));
  assert.deepEqual(migrated.legacyBackup,original.garage);currentBuilds(migrated.garage);
  assert(await control(old,'confirmation').isVisible(),'Missed storage event leaves the real old ticket available for raw-value rejection');
  await confirm(old);await status(old,'CONFLICT');
  assert.equal(await raw(old),migratedRaw,'Obsolete sale cannot overwrite migrated ownership');
  assert(await old.evaluate(()=>window.migrationSuppressedEvents)>0,'The test exercised deliberately missed notifications');
  await current.reload();await current.locator('#enter-garage:enabled').click();await status(current,'SAVED');
  assert.equal(await raw(current),migratedRaw,'Reload never remigrates or increments history');
  assert(await control(current,'migrate').isHidden());
  assert.deepEqual(JSON.parse(await download(current,'legacy-export')),original.garage);
  await capture(current,'migrated-reloaded');
  scenarios.push('Verified migration preserves all ownership/counters and backup; obsolete ticket rejects; reload is idempotent');

  const exported=await download(current);
  assert.deepEqual(JSON.parse(exported),migrated.garage);
  for(const file of [exported,originalSave]){
    const before=await stored(current);
    await importProposal(current,file);await confirm(current);await status(current,'SAVED');
    const after=await stored(current);
    assert.equal(after.sequence,before.sequence+1);assert.equal(after.generation,before.generation);
    assert.deepEqual(ownership(after.garage),ownership(original.garage));currentBuilds(after.garage);
    assert.deepEqual(after.legacyBackup,original.garage);
  }
  const malformed=JSON.parse(exported);malformed.bays[0].build.parts.engine='unreviewed-engine';
  const beforeRejected=await raw(current);
  await control(current,'import').setInputFiles({name:'invalid-build.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(malformed))});
  await status(current,'IMPORT REJECTED');
  assert.equal(await raw(current),beforeRejected);
  assert(await control(current,'confirmation').isHidden());
  assert.deepEqual(JSON.parse(await download(current)),migrated.garage);
  scenarios.push('Current and legacy native-file imports round-trip ownership without rewards; invalid build import cannot write');

  for(const fault of ['quota','readback']){
    const isolated=await context();
    const donor=await openPage(isolated,legacy);
    // Fault contexts receive a genuine old UI export through the original
    // file control, not injected localStorage or fabricated ownership.
    await importProposal(donor,originalSave);await confirm(donor);await status(donor,'SAVED');
    const beforeRaw=await raw(donor),before=JSON.parse(beforeRaw);
    const page=await openPage(isolated,base,{storageFaults:true});
    await status(page,'MIGRATION REQUIRED');await prepare(page,'migrate');
    await page.evaluate(fault=>{window.migrationStorageFault=fault;},fault);
    await confirm(page);await status(page,'STORAGE UNAVAILABLE');
    // The accepted UI export still describes the old state even if the
    // underlying write completed before a deliberately denied read-back.
    assert.deepEqual(JSON.parse(await download(page)),before.garage);
    const uncertain=await raw(page);
    if(fault==='quota')assert.equal(uncertain,beforeRaw,'Quota rejection cannot install a partial migration');
    else{
      const persisted=JSON.parse(uncertain);
      assert.equal(persisted.version,2);assert.equal(persisted.sequence,before.sequence+1);
      assert.deepEqual(ownership(persisted.garage),ownership(before.garage));
    }
    await page.evaluate(()=>{window.migrationStorageFault='none';});
    await control(page,'reload').click();
    if(fault==='quota'){
      await status(page,'MIGRATION REQUIRED');await commit(page,'migrate');
    }else await status(page,'SAVED');
    const recovered=await stored(page);currentBuilds(recovered.garage);
    assert.equal(recovered.sequence,before.sequence+1,'Explicit reload/recovery never applies migration twice');
    assert.deepEqual(ownership(recovered.garage),ownership(before.garage));
    assert.deepEqual(recovered.legacyBackup,before.garage);
    faults.push({fault,originalSequence:before.sequence,recoveredSequence:recovered.sequence,
      originalOwnership:ownership(before.garage),recoveredOwnership:ownership(recovered.garage)});
    scenarios.push(fault==='quota'?'Migration quota failure leaves original save; explicit reload and retry commits once':
      'Interrupted migration read-back retains old UI state; explicit reload discovers the complete write without retry');
    await isolated.close();
  }
  assert.deepEqual(errors,[]);
  const report={version:1,source,legacySource:published,browser:browser.version(),runtime,
    currentURL:base.href,legacyURL:legacy.href,scenarios,faults,downloads,captures,
    originalEnvelope:original,migratedEnvelope:migrated,
    requests:requests.length,externalRequests:requests.filter(url=>!url.startsWith(base.href)&&!url.startsWith(legacy.href)&&!url.startsWith('blob:')&&!url.startsWith('data:')),
    errors,limitations:['Storage-event suppression on the obsolete tab and quota/read-back API failures are synthetic service conditions; ownership and transitions use real published/current UI controls.',
      'SwiftShader browser functionality; no native GPU or new physical-facility performance claim.']};
  if(evidence)await writeFile(join(evidence,'garage-migration-browser.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
