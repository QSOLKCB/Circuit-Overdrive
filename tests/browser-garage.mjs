// SPDX-License-Identifier: Apache-2.0
// Actual packaged garage UI, native browser storage/downloads/Web Locks and
// WebGL. Gamepad reports and storage service faults are explicitly synthetic;
// inventory, balances and transaction outcomes are never injected.
import assert from 'node:assert/strict';
import {stockVehicleBuild} from '../src/vehicle-builds.js';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=new URL(process.argv[2] || 'http://127.0.0.1:8000/');
const evidence=process.env.EVIDENCE_DIR;
if(evidence)await mkdir(evidence,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN || undefined,
  headless:process.env.GARAGE_HEADFUL!=='1',
  args:process.env.GARAGE_NATIVE==='1'?[]:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const slot='circuit-overdrive.garage.v1';
const models=['cinder-two','lilt','evening-line','rivet-eight','yardhand','glass-comet'];
const errors=[],requests=[],scenarios=[],captures=[],resources={},exports=[],onboardingLayouts=[];
let revision,runtime;

async function makeContext(options={}){
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true,...options});
  context.on('page',page=>{
    page.on('pageerror',error=>errors.push(error.message));
    page.on('response',response=>{if(response.status()>=400)errors.push(response.status()+' '+response.url());});
  });
  await context.route('**/*',route=>{
    const url=route.request().url();requests.push(url);
    if(url.startsWith(base.href)||url.startsWith('blob:')||url.startsWith('data:'))return route.continue();
    errors.push('Unexpected request '+url);return route.abort();
  });
  await context.addInitScript(slot=>{
    // Observe actual retained GL operations without replacing their results.
    const stats=()=>({created:0,deleted:0,invalidated:0,live:0,uploads:0,uploadBytes:0,draws:0});
    const liveByContext=new WeakMap();
    window.garageGL={};
    for(const type of [globalThis.WebGLRenderingContext,globalThis.WebGL2RenderingContext].filter(Boolean)){
      const proto=type.prototype;
      for(const name of ['createBuffer','deleteBuffer','bufferData','bufferSubData','drawArrays','drawElements']){
        const original=proto[name];
        proto[name]=function(...args){
          const id=this.canvas.id||'unnamed',s=window.garageGL[id]??=stats();
          let live=liveByContext.get(this);
          if(!live){
            live=new Set();liveByContext.set(this,live);
            this.canvas.addEventListener('webglcontextlost',()=>{s.invalidated+=live.size;live.clear();s.live=0;});
          }
          if(name==='createBuffer')s.created++;
          else if(name==='deleteBuffer'&&args[0]){s.deleted++;live.delete(args[0]);}
          else if(name==='bufferData'||name==='bufferSubData'){
            s.uploads++;const data=args[name==='bufferData'?1:2];
            s.uploadBytes+=typeof data==='number'?data:data?.byteLength??0;
          }else if(name.startsWith('draw'))s.draws++;
          const result=original.apply(this,args);
          if(name==='createBuffer'&&result)live.add(result);
          s.live=live.size;return result;
        };
      }
    }
    window.garageStorageFault='none';
    let uncertainRead=false;
    const get=Storage.prototype.getItem,set=Storage.prototype.setItem;
    Storage.prototype.getItem=function(key){
      if(key===slot){
        if(window.garageStorageFault==='read-denied')throw new DOMException('Denied by acceptance fixture','SecurityError');
        if(uncertainRead){uncertainRead=false;throw new DOMException('Interrupted readback by acceptance fixture','SecurityError');}
      }
      return get.call(this,key);
    };
    Storage.prototype.setItem=function(key,value){
      if(key===slot&&window.garageStorageFault==='quota')throw new DOMException('Full by acceptance fixture','QuotaExceededError');
      if(key===slot&&window.garageStorageFault==='write-denied')throw new DOMException('Denied by acceptance fixture','SecurityError');
      const result=set.call(this,key,value);
      if(key===slot&&window.garageStorageFault==='readback-denied')uncertainRead=true;
      return result;
    };
  },slot);
  return context;
}
async function openPage(context){
  const page=await context.newPage();await page.goto(base.href);
  await page.waitForSelector('#enter-garage:enabled');
  await page.locator('#enter-garage').click();await page.waitForSelector('body[data-phase="garage"]');
  return page;
}
const el=(page,id)=>page.locator('#'+id);
const raw=page=>page.evaluate(key=>localStorage.getItem(key),slot);
const saved=async page=>{const text=await raw(page);return text===null?null:JSON.parse(text).garage;};
const selected=async(page,id)=>el(page,'garage-model-'+id).click();
async function waitStatus(page,status){await page.waitForFunction(status=>document.querySelector('#garage-status').textContent===status,status);}
async function prepare(page,id){
  const before=await raw(page);await el(page,id).click();await el(page,'garage-confirmation').waitFor({state:'visible'});
  assert.equal(await raw(page),before,'preview cannot commit credits or ownership');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'garage-cancel','confirmation defaults to safe Cancel');
}
async function confirm(page){
  await el(page,'garage-confirm').click();
  await page.waitForFunction(()=>document.querySelector('#garage').dataset.busy==='false');
  await el(page,'garage-confirmation').waitFor({state:'hidden'});
}
async function commit(page,id){await prepare(page,id);await confirm(page);await waitStatus(page,'SAVED');}
async function buy(page,id='cinder-two'){await selected(page,id);await commit(page,'garage-buy');}
async function download(page,id='garage-export'){
  const pending=page.waitForEvent('download');await el(page,id).click();const item=await pending;
  assert.equal(await item.failure(),null);
  const text=await readFile(await item.path(),'utf8');
  const name='download-'+String(exports.length+1).padStart(2,'0')+'.json';
  exports.push({file:name,suggestedName:item.suggestedFilename(),bytes:Buffer.byteLength(text),sha256:createHash('sha256').update(text).digest('hex')});
  if(evidence)await writeFile(join(evidence,name),text);
  return text;
}
async function importText(page,text){
  await el(page,'garage-import').setInputFiles({name:'garage.json',mimeType:'application/json',buffer:Buffer.from(text)});
  await page.waitForFunction(()=>document.querySelector('#garage-cancel-read').hidden);
}
async function capture(page,name){
  if(!evidence)return;
  const path=join(evidence,name+'.png');await page.screenshot({path,fullPage:true});
  captures.push({file:name+'.png',sha256:createHash('sha256').update(await readFile(path)).digest('hex')});
}
const glStats=page=>page.evaluate(()=>structuredClone(window.garageGL['garage-canvas']));
async function settleDraw(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function expectUnchanged(page,before,label){assert.equal(await raw(page),before,label);}
async function inView(page,id){
  assert(await el(page,id).isVisible(),id+' is displayed');
  assert(await el(page,id).evaluate(node=>{
    const r=node.getBoundingClientRect(),panel=document.querySelector('#garage').getBoundingClientRect();
    const main=document.querySelector('main').getBoundingClientRect();
    return r.width>0&&r.top>=Math.max(0,main.top,panel.top)-1&&r.bottom<=Math.min(innerHeight,main.bottom,panel.bottom)+1&&r.left>=0&&r.right<=innerWidth;
  }),id+' is in the visible scrollport without test scrolling');
}
async function firstVisit(page){
  assert.equal(await raw(page),null,'first visit does not allocate funds or inventory');
  assert.equal(await el(page,'garage-introduction').getAttribute('data-mode'),'empty');
  assert.match(await el(page,'garage-intro-copy').textContent(),/Four available bays.*2,400 credits/);
  await inView(page,'garage-create');assert(await el(page,'garage-create').isEnabled());
  assert.equal(await page.evaluate(()=>document.activeElement.id),'garage-create');
  assert(await el(page,'garage-buy').isDisabled());
}
async function created(page){
  await waitStatus(page,'SAVED');assert.equal(await el(page,'garage-balance').textContent(),'2,400 credits');
  assert.deepEqual((await saved(page)).bays,[null,null,null,null]);
  assert(await el(page,'garage-introduction').isHidden());
  assert(await el(page,'garage-buy').isEnabled());await inView(page,'garage-buy');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'garage-buy');
  assert.match(await el(page,'garage-message').textContent(),/Garage created.*2,400 credits.*first car/);
}

try{
  const context=await makeContext(),a=await openPage(context);
  revision=await a.locator('meta[name="game-revision"]').getAttribute('content');
  if(process.env.SOURCE_SHA)assert.equal(revision,process.env.SOURCE_SHA,'source-bound package');
  runtime=await a.evaluate(()=>{
    const gl=document.querySelector('#garage-canvas').getContext('webgl'),debug=gl.getExtension('WEBGL_debug_renderer_info');
    return {browser:navigator.userAgent,webLocks:typeof navigator.locks?.request==='function',secureContext:isSecureContext,
      renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
  });
  assert(runtime.webLocks&&runtime.secureContext,'real supported vault APIs');
  await firstVisit(a);await capture(a,'first-visit-cta');
  // Create an actual independent championship through its normal UI before
  // garage transactions; preserving an empty key would not prove save isolation.
  await el(a,'garage-close').click();await el(a,'enter-woc').click();await el(a,'woc-new').click();
  await a.waitForFunction(()=>localStorage.getItem('circuit-overdrive.woc.v1')!==null);
  await el(a,'woc-back').click();await el(a,'woc-leave').click();await el(a,'enter-garage').click();
  const otherKeys=await a.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(key=>key!=='circuit-overdrive.garage.v1').map(key=>[key,localStorage.getItem(key)])));
  await firstVisit(a);
  await prepare(a,'garage-create');await capture(a,'create-confirmation');
  await el(a,'garage-cancel').click();await firstVisit(a);
  await selected(a,'cinder-two');
  await commit(a,'garage-create');await created(a);await capture(a,'created-buy-enabled');assert.deepEqual(await saved(a),{version:2,edition:'machine-shop-v1',catalogRevision:1,credits:2400,nextVehicleId:1,activeVehicleId:null,bays:[null,null,null,null],revision:0});
  await capture(a,'empty-garage');
  await selected(a,'cinder-two');await capture(a,'catalogue-starter');
  await prepare(a,'garage-buy');await capture(a,'purchase-confirmation');await confirm(a);await waitStatus(a,'SAVED');
  assert.deepEqual((await saved(a)).bays,[{ownedVehicleId:'car-000001',modelId:'cinder-two',build:stockVehicleBuild('cinder-two'),condition:{version:1,status:'pristine'}},null,null,null]);
  assert.equal((await saved(a)).credits,1800);await capture(a,'first-owned-bay');
  const owned=await saved(a);await a.reload();await el(a,'enter-garage').click();await waitStatus(a,'SAVED');
  assert.deepEqual(await saved(a),owned,'saved purchase survives real reload');
  assert(await el(a,'garage-introduction').isHidden());await capture(a,'reloaded-first-car');
  scenarios.push('first visit, cancelled creation, saved setup with focus on enabled Buy, first Cinder Two purchase and reload');
  await selected(a,'glass-comet');assert(await el(a,'garage-buy').isDisabled(),'unaffordable purchase not offered');
  assert.match(await el(a,'garage-availability').textContent(),/credit|afford|fund/i);await capture(a,'insufficient-credits');
  for(let i=0;i<3;i++)await buy(a);
  const full=await saved(a);assert.equal(full.credits,0);assert.equal(full.nextVehicleId,5);
  assert.deepEqual(full.bays.map(car=>car.ownedVehicleId),['car-000001','car-000002','car-000003','car-000004']);
  assert(await el(a,'garage-buy').isDisabled(),'fifth vehicle is rejected by capacity');await capture(a,'four-bays-front');
  await el(a,'garage-camera-bays').click();await el(a,'garage-bay-3').scrollIntoViewIfNeeded();await capture(a,'four-bays-full');
  await el(a,'garage-bay-1').click();await commit(a,'garage-select');assert.equal((await saved(a)).activeVehicleId,'car-000002');
  await commit(a,'garage-sell');const sold=await saved(a);
  assert.equal(sold.credits,360);assert.equal(sold.bays[1],null);assert.equal(sold.activeVehicleId,'car-000001');assert.equal(sold.nextVehicleId,5);
  await capture(a,'successful-sale');
  const exported=await download(a);assert.deepEqual(JSON.parse(exported),sold);await capture(a,'save-export');
  await prepare(a,'garage-new');assert.equal(await download(a,'garage-backup'),exported);await confirm(a);
  await importText(a,exported);await el(a,'garage-confirmation').waitFor({state:'visible'});assert.equal((await saved(a)).credits,2400,'file preview does not replace state');
  await confirm(a);assert.equal(await download(a),exported,'canonical export/import round-trip');await capture(a,'recovered-save');
  const prior=await raw(a);
  const invalidFiles=[['malformed','{'],['oversized',' '.repeat(65537)],
    ['schema',JSON.stringify({...sold,version:99})],['catalogue',JSON.stringify({...sold,catalogRevision:99})],
    ['edition',JSON.stringify({...sold,edition:'unknown'})],['extra-field',JSON.stringify({...sold,resale:999999})],
    ['missing-field',JSON.stringify({...sold,revision:undefined})],['negative-credit',JSON.stringify({...sold,credits:-1})],
    ['fractional-credit',JSON.stringify({...sold,credits:.5})],['unsafe-credit',JSON.stringify({...sold,credits:Number.MAX_SAFE_INTEGER+1})],
    ['unsafe-allocator',JSON.stringify({...sold,nextVehicleId:Number.MAX_SAFE_INTEGER+1})],
    ['active-ID',JSON.stringify({...sold,activeVehicleId:'car-999999'})],
    ['duplicate-ID',JSON.stringify({...sold,bays:[sold.bays[0],sold.bays[0],null,null]})],
    ['extra-bay',JSON.stringify({...sold,bays:[...sold.bays,null]})],
    ['unknown-model',JSON.stringify({...sold,bays:[{...sold.bays[0],modelId:'not-catalogued'},...sold.bays.slice(1)]})],
    ['nested-field',JSON.stringify({...sold,bays:[{...sold.bays[0],data:{script:'ignored'}},...sold.bays.slice(1)]})],
    ['prototype-key',exported.replace('"version":2','"version":2,"__proto__":{"garagePollution":true}')]];
  for(const [name,text] of invalidFiles){
    await importText(a,text);await waitStatus(a,'IMPORT REJECTED');await expectUnchanged(a,prior,name+' import preserves accepted save');
    assert(!(await el(a,'garage-confirmation').isVisible()));
  }
  assert.equal(await a.evaluate(()=>({}).garagePollution),undefined,'inert import cannot alter object prototypes');
  await capture(a,'invalid-import');await el(a,'garage-reload').click();await waitStatus(a,'SAVED');
  scenarios.push('actual catalogue, confirmed purchases, four bays, selection, sale, reload, export, backup, valid import and rejected files');

  // A genuinely asynchronous File read must not revive an intent after Cancel
  // or closing the garage. This delays only the browser file service response.
  await a.evaluate(()=>{
    window.originalGarageFileText=File.prototype.text;
    File.prototype.text=function(){return new Promise((resolve,reject)=>{
      window.finishGarageFileRead=()=>window.originalGarageFileText.call(this).then(resolve,reject);
    });};
  });
  for(const close of [false,true]){
    const beforeRead=await raw(a);
    await el(a,'garage-import').setInputFiles({name:'garage.json',mimeType:'application/json',buffer:Buffer.from(exported)});
    await el(a,'garage-cancel-read').waitFor({state:'visible'});
    await el(a,close?'garage-close':'garage-cancel-read').click();
    await a.evaluate(async()=>{await window.finishGarageFileRead();});await a.waitForTimeout(100);
    assert(!(await el(a,'garage-confirmation').isVisible()),'cancelled file read cannot reopen confirmation');
    await expectUnchanged(a,beforeRead,'cancelled file read cannot replace accepted ownership');
    if(close){await el(a,'enter-garage').click();await waitStatus(a,'SAVED');}
  }
  await a.evaluate(()=>{File.prototype.text=window.originalGarageFileText;});
  scenarios.push('delayed native File.text cannot revive an import after explicit cancellation or leaving the garage');

  // Retained rendering: every catalogue body and camera, repeated switches,
  // idle frames, and explicit close/open/context lifecycle with unchanged save.
  await settleDraw(a);const initialGL=await glStats(a);assert(initialGL.created>0&&initialGL.draws>0,'actual WebGL showroom rendered');
  for(let cycle=0;cycle<8;cycle++)for(const model of models){
    await selected(a,model);
    for(const camera of ['front','side','rear','bays']){
      await el(a,'garage-camera-'+camera).click();
      if(cycle===0&&camera==='front')await capture(a,'showroom-'+model);
    }
  }
  await settleDraw(a);const afterSwitch=await glStats(a);
  assert.equal(afterSwitch.created,initialGL.created,'48 catalogue selections allocate no new retained buffers');
  assert.equal(afterSwitch.uploads,initialGL.uploads,'camera/model switches reuse uploaded geometry');
  await a.waitForTimeout(600);const idleGL=await glStats(a);
  assert.equal(idleGL.created,afterSwitch.created);assert.equal(idleGL.uploads,afterSwitch.uploads);
  assert.equal(idleGL.draws,afterSwitch.draws,'stationary showroom draws on demand');
  resources.catalogueCycles=8;resources.afterSwitch=afterSwitch;resources.idle=idleGL;
  const beforeContext=await raw(a);
  await a.evaluate(()=>{window.garageLostContext=document.querySelector('#garage-canvas').getContext('webgl').getExtension('WEBGL_lose_context');window.garageLostContext.loseContext();});
  await a.waitForFunction(()=>/lost|restor/i.test(document.querySelector('#garage-graphics-status').textContent));
  await expectUnchanged(a,beforeContext,'context loss cannot change ownership');
  await a.evaluate(()=>window.garageLostContext.restoreContext());
  await a.waitForFunction(()=>!/lost|restor|unavailable/i.test(document.querySelector('#garage-graphics-status').textContent));
  await selected(a,'lilt');await settleDraw(a);await expectUnchanged(a,beforeContext,'restoration preserves save');
  const openGL=await glStats(a);await el(a,'garage-close').click();await a.waitForSelector('body[data-phase="menu"]');
  const closedGL=await glStats(a);assert(closedGL.deleted>openGL.deleted,'closing disposes owned buffers');assert.equal(closedGL.live,0,'closing leaves no live showroom buffers');
  for(let i=0;i<3;i++){await el(a,'enter-garage').click();await settleDraw(a);await el(a,'garage-close').click();}
  const cycleGL=await glStats(a);assert.equal(cycleGL.live,0,'three reopen/dispose cycles leave no live showroom buffers');
  await el(a,'enter-garage').click();await waitStatus(a,'SAVED');
  resources.afterLifecycle=cycleGL;
  scenarios.push('eight full catalogue cycles, four cameras, no idle uploads/draws, WebGL loss/restoration and repeated resource disposal');

  // Two pages act on an actual shared committed save. A stale confirmation may
  // be invalidated visibly or rejected on use; it may never overwrite A.
  await commit(a,'garage-new');const b=await openPage(context);await prepare(b,'garage-buy');
  await a.bringToFront();await buy(a);const purchased=await raw(a);await waitStatus(b,'CONFLICT');
  if(await el(b,'garage-confirmation').isVisible()){
    if(await el(b,'garage-confirm').isEnabled())await confirm(b);else await el(b,'garage-cancel').click();
  }
  await expectUnchanged(b,purchased,'stale confirmation must not overwrite purchase');
  assert.equal(await el(b,'garage-introduction').getAttribute('data-mode'),'conflict');assert(await el(b,'garage-create').isHidden());
  await capture(b,'stale-tab-conflict');await el(b,'garage-reload').click();await waitStatus(b,'SAVED');
  assert.equal(await el(b,'garage-balance').textContent(),await el(a,'garage-balance').textContent());
  await el(b,'garage-bay-0').click();await commit(b,'garage-sell');await waitStatus(a,'CONFLICT');
  assert.equal((await saved(a)).credits,2160);await el(a,'garage-reload').click();await waitStatus(a,'SAVED');
  await b.close();scenarios.push('simultaneous pages reject stale purchase, reconcile explicitly and observe a real sale');

  // Held keyboard input across the native confirmation/focus boundary cannot
  // consume a second intent. The player must release and freshly confirm.
  await selected(a,'cinder-two');await el(a,'garage-buy').focus();
  const heldRaw=await raw(a);await a.keyboard.down('Enter');await el(a,'garage-confirmation').waitFor({state:'visible'});
  await el(a,'garage-confirm').focus();await a.keyboard.down('Enter');await a.waitForTimeout(120);
  await expectUnchanged(a,heldRaw,'held Enter across confirmation cannot commit');
  await a.keyboard.up('Enter');await a.keyboard.press('Enter');await waitStatus(a,'SAVED');
  assert.equal((await saved(a)).credits,1560);
  await prepare(a,'garage-buy');await el(a,'garage-confirm').focus();const spaceBefore=await raw(a);
  await a.keyboard.down('Space');await a.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await a.bringToFront();await a.keyboard.up('Space');await a.waitForTimeout(100);
  await expectUnchanged(a,spaceBefore,'Space release after blur must not activate a transaction');
  await a.keyboard.press('Space');await waitStatus(a,'SAVED');assert.equal((await saved(a)).credits,960);
  const focusBefore=await raw(a);await prepare(a,'garage-buy');await a.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await a.bringToFront();await a.keyboard.press('Escape');await expectUnchanged(a,focusBefore,'focus change cannot buy');
  scenarios.push('fresh-key confirmation, held Enter suppression, Space release after blur and safe focus/cancel');

  const quotaBefore=await raw(a);await a.evaluate(()=>{window.garageStorageFault='quota';});
  await prepare(a,'garage-buy');await confirm(a);await waitStatus(a,'STORAGE UNAVAILABLE');
  await expectUnchanged(a,quotaBefore,'quota failure cannot award an unsaved car');
  await a.evaluate(()=>{window.garageStorageFault='none';});await el(a,'garage-reload').click();await waitStatus(a,'SAVED');
  assert.deepEqual(await a.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(key=>key!=='circuit-overdrive.garage.v1').map(key=>[key,localStorage.getItem(key)]))),otherKeys,'garage keeps unrelated saves/settings separate');
  scenarios.push('failed quota write preserves inventory and explicit reload recovers');

  // Instance serials belong to their complete saved garage history. A replaced
  // history may use the same serial for another model; reconcile the detail
  // panel from accepted ownership after explicit conflict reload.
  await commit(a,'garage-new');await buy(a,'yardhand');const yardhandExport=await download(a);
  await commit(a,'garage-new');await buy(a,'cinder-two');
  const alias=await openPage(context);await el(alias,'garage-bay-0').click();
  assert.equal(await el(alias,'garage-model-name').textContent(),'Cinder Two');
  await importText(a,yardhandExport);await confirm(a);await waitStatus(alias,'CONFLICT');
  await el(alias,'garage-reload').click();await waitStatus(alias,'SAVED');
  assert.equal(await el(alias,'garage-model-name').textContent(),'Yardhand');
  assert.match(await el(alias,'garage-ownership').textContent(),/car-000001/);
  assert.equal((await saved(alias)).credits,1200);await alias.close();
  scenarios.push('whole-save replacement with a reused serial reconciles displayed model and valuation from accepted ownership');

  // A fresh actual garage buys the premium model, then exercises independent
  // models, inactive/last sales and two clicks against one pending confirmation.
  const economyContext=await makeContext(),economy=await openPage(economyContext);
  await commit(economy,'garage-new');await selected(economy,'glass-comet');await prepare(economy,'garage-buy');
  async function duplicateConfirm(page){
    await el(page,'garage-confirm').evaluate(button=>{button.click();button.click();});
    await page.waitForFunction(()=>document.querySelector('#garage').dataset.busy==='false');
    await el(page,'garage-confirmation').waitFor({state:'hidden'});await waitStatus(page,'SAVED');
  }
  await duplicateConfirm(economy);let actual=await saved(economy);
  assert.equal(actual.credits,0);assert.equal(actual.nextVehicleId,2);assert.equal(actual.revision,1);
  assert.deepEqual(actual.bays,[{ownedVehicleId:'car-000001',modelId:'glass-comet',build:stockVehicleBuild('glass-comet'),condition:{version:1,status:'pristine'}},null,null,null]);
  await capture(economy,'premium-owned-car');await prepare(economy,'garage-sell');await duplicateConfirm(economy);
  actual=await saved(economy);assert.equal(actual.credits,1440);assert.equal(actual.revision,2);
  assert.equal(actual.activeVehicleId,null);assert.deepEqual(actual.bays,[null,null,null,null]);
  const afterPremiumSale=await raw(economy);await el(economy,'garage-confirm').evaluate(button=>button.click());
  await expectUnchanged(economy,afterPremiumSale,'repeated confirmation cannot pay a second sale');
  assert.equal(actual.nextVehicleId,2,'selling last vehicle retains allocation history');
  await commit(economy,'garage-new');await buy(economy,'cinder-two');await buy(economy,'lilt');
  await capture(economy,'multiple-owned-models');actual=await saved(economy);
  assert.equal(actual.credits,900);assert.equal(actual.activeVehicleId,'car-000001');
  assert.deepEqual(actual.bays.map(car=>car?.modelId??null),['cinder-two','lilt',null,null]);
  await el(economy,'garage-bay-1').click();await prepare(economy,'garage-sell');await duplicateConfirm(economy);
  actual=await saved(economy);assert.equal(actual.credits,1440);assert.equal(actual.activeVehicleId,'car-000001');
  assert.equal(actual.bays[1],null,'inactive sale clears only its own bay');
  await el(economy,'garage-bay-0').click();await commit(economy,'garage-sell');actual=await saved(economy);
  assert.equal(actual.credits,1800);assert.equal(actual.activeVehicleId,null);assert.equal(actual.nextVehicleId,3);
  await capture(economy,'last-car-sold');await buy(economy);actual=await saved(economy);
  assert.equal(actual.bays[0].ownedVehicleId,'car-000003','sold serials are not reused');assert.equal(actual.credits,1200);
  // An explicitly selected legacy file contains the ownership just acquired
  // above through real controls, projected to the published v1 format. It is
  // imported as a whole replacement; no balance or build is injected into UI.
  const legacyFile={...actual,version:1,edition:'after-hours-v1',
    bays:actual.bays.map(car=>car&&({ownedVehicleId:car.ownedVehicleId,modelId:car.modelId}))};
  const beforeLegacy=await raw(economy);
  await importText(economy,JSON.stringify(legacyFile));
  await el(economy,'garage-confirmation').waitFor({state:'visible'});
  await expectUnchanged(economy,beforeLegacy,'legacy file is a proposal until confirmed');
  await confirm(economy);await waitStatus(economy,'SAVED');
  assert.deepEqual(await saved(economy),actual,'legacy import preserves money, allocation and owned identities with stock builds');
  assert.deepEqual(JSON.parse(await raw(economy)).legacyBackup,legacyFile);
  assert.deepEqual(JSON.parse(await download(economy,'garage-legacy-export')),legacyFile);
  await economy.reload();await el(economy,'enter-garage').click();await waitStatus(economy,'SAVED');
  assert.deepEqual(await saved(economy),actual);
  scenarios.push('explicit legacy file import assigns stock builds, preserves ownership and exports its retained backup after reload');
  await economyContext.close();scenarios.push('premium and mixed-model purchases, inactive and last-car sales, duplicate confirmation and monotonic identities');

  // The replacement UI must reject stale imports as firmly as stale purchases.
  const importer=await openPage(context);await importText(importer,exported);
  await el(importer,'garage-confirmation').waitFor({state:'visible'});await buy(a);
  const afterNewPurchase=await raw(a);await waitStatus(importer,'CONFLICT');
  assert(!(await el(importer,'garage-confirmation').isVisible()),'conflict invalidates replacement confirmation');
  await expectUnchanged(importer,afterNewPurchase,'stale import cannot restore earlier money or ownership');
  await el(importer,'garage-reload').click();await waitStatus(importer,'SAVED');
  await selected(importer,'cinder-two');await prepare(importer,'garage-buy');
  const identical=await download(a),beforeIdentical=JSON.parse(await raw(a));
  await importText(a,identical);await confirm(a);await waitStatus(importer,'CONFLICT');
  const afterIdentical=JSON.parse(await raw(a));
  assert.deepEqual(afterIdentical.garage,beforeIdentical.garage);assert.equal(afterIdentical.sequence,beforeIdentical.sequence+1);
  assert.equal(afterIdentical.generation,beforeIdentical.generation);
  await expectUnchanged(importer,await raw(a),'identical replacement cannot revive an old purchase');
  await importer.close();scenarios.push('stale whole-state imports and identical-data replacements invalidate old confirmations');

  // A genuine exclusive lock in this browser makes the UI fail promptly rather
  // than queue a purchase to execute after its original confirmation has aged.
  await a.evaluate(key=>{
    window.garageLockHeld=false;
    window.garageHoldingLock=navigator.locks.request(key,{mode:'exclusive'},()=>new Promise(resolve=>{
      window.garageLockHeld=true;window.releaseGarageLock=resolve;
    }));
  },slot);
  await a.waitForFunction(()=>window.garageLockHeld);await selected(a,'cinder-two');
  const beforeBusy=await raw(a);await prepare(a,'garage-buy');await confirm(a);await waitStatus(a,'UNSAVED');
  assert.match(await el(a,'garage-status-copy').textContent(),/saving|retry|review/i);
  await expectUnchanged(a,beforeBusy,'busy Web Lock cannot commit or queue a later purchase');
  await a.evaluate(async()=>{window.releaseGarageLock();await window.garageHoldingLock;});
  await settleDraw(a);await expectUnchanged(a,beforeBusy,'releasing lock cannot execute an unaccepted queued action');
  await el(a,'garage-reload').click();await waitStatus(a,'SAVED');
  scenarios.push('actual exclusive Web Lock contention fails closed without deferred or duplicate purchases');

  // Test delayed acquisition on first creation: busy controls cannot confirm
  // twice, and the preview never becomes accepted ownership while waiting.
  const setupContext=await makeContext(),setup=await openPage(setupContext);
  await firstVisit(setup);await selected(setup,'lilt');await prepare(setup,'garage-create');
  await setup.evaluate(()=>{
    window.originalSetupRequest=navigator.locks.request.bind(navigator.locks);
    navigator.locks.request=(...args)=>new Promise(resolve=>{window.finishSetup=()=>resolve(window.originalSetupRequest(...args));});
  });
  await el(setup,'garage-confirm').click();
  assert.equal(await el(setup,'garage').getAttribute('data-busy'),'true');
  assert(await el(setup,'garage-create').isDisabled());assert(await el(setup,'garage-confirm').isDisabled());
  assert(await el(setup,'garage-new').isDisabled());assert(await el(setup,'garage-buy').isDisabled());
  await el(setup,'garage-confirm').evaluate(button=>button.click());assert.equal(await raw(setup),null);
  await setup.evaluate(()=>{window.finishSetup();navigator.locks.request=window.originalSetupRequest;});
  await el(setup,'garage-confirmation').waitFor({state:'hidden'});await created(setup);
  assert.equal(JSON.parse(await raw(setup)).sequence,0,'one creation committed');
  assert.equal(await el(setup,'garage').getAttribute('data-model-id'),'lilt','creation preserves the inspected model');
  await setupContext.close();scenarios.push('busy first creation disables both creation actions and duplicate confirmation until verified commitment');

  for(const failure of ['quota','write-denied','readback-denied']){
    const failedContext=await makeContext(),failed=await openPage(failedContext);
    await firstVisit(failed);await failed.evaluate(failure=>{window.garageStorageFault=failure;},failure);
    await prepare(failed,'garage-create');await confirm(failed);await waitStatus(failed,'STORAGE UNAVAILABLE');
    assert.equal(await el(failed,'garage-balance').textContent(),'No saved garage');
    assert.equal(await el(failed,'garage-introduction').getAttribute('data-mode'),'unavailable');
    assert(await el(failed,'garage-create').isHidden());assert(await el(failed,'garage-buy').isDisabled());
    assert(await el(failed,'garage-new').isDisabled());
    await failed.evaluate(()=>{window.garageStorageFault='none';});
    if(failure==='readback-denied'){
      assert.equal((await saved(failed)).credits,2400);
      await el(failed,'garage-intro-reload').click();await waitStatus(failed,'SAVED');
      assert.equal(JSON.parse(await raw(failed)).sequence,0,'reconciliation never duplicates initial balance');
    }else assert.equal(await raw(failed),null,'failed creation does not fund a garage');
    await failedContext.close();
  }
  const unreadableContext=await makeContext();
  await unreadableContext.addInitScript(()=>{window.garageStorageFault='read-denied';});
  const unreadable=await openPage(unreadableContext);await waitStatus(unreadable,'STORAGE UNAVAILABLE');
  assert.equal(await el(unreadable,'garage-introduction').getAttribute('data-mode'),'unavailable');
  assert(await el(unreadable,'garage-create').isHidden());assert(await el(unreadable,'garage-buy').isDisabled());
  await unreadable.evaluate(()=>{window.garageStorageFault='none';});assert.equal(await raw(unreadable),null);
  await unreadableContext.close();
  scenarios.push('initial quota, denied write and failed save verification never enable purchases from an unconfirmed setup');

  const faultContext=await makeContext(),fault=await openPage(faultContext);await commit(fault,'garage-new');
  const beforeFault=await raw(fault);await fault.evaluate(()=>{window.garageStorageFault='write-denied';});
  await prepare(fault,'garage-buy');await confirm(fault);await waitStatus(fault,'STORAGE UNAVAILABLE');
  await expectUnchanged(fault,beforeFault,'SecurityError cannot award an unsaved car');
  assert(await el(fault,'garage-buy').isDisabled());await fault.evaluate(()=>{window.garageStorageFault='none';});
  await el(fault,'garage-reload').click();await waitStatus(fault,'SAVED');
  await fault.evaluate(()=>{window.garageStorageFault='readback-denied';});
  await prepare(fault,'garage-buy');await confirm(fault);await waitStatus(fault,'STORAGE UNAVAILABLE');
  assert.equal(await el(fault,'garage-balance').textContent(),'2,400 credits','unverified write is not optimistically displayed');
  assert.equal(await el(fault,'garage').getAttribute('data-owned-count'),'0');assert(await el(fault,'garage-buy').isDisabled());
  await fault.evaluate(()=>{window.garageStorageFault='none';});
  assert.equal((await saved(fault)).credits,1800,'real write may have completed before readback failed');
  await el(fault,'garage-reload').click();await waitStatus(fault,'SAVED');
  assert.equal(await el(fault,'garage-balance').textContent(),'1,800 credits');
  assert.equal((await saved(fault)).nextVehicleId,2);assert.equal((await saved(fault)).revision,1);
  const recoveredFault=await download(fault);
  await fault.evaluate(()=>{window.garageStorageFault='read-denied';});await el(fault,'garage-reload').click();
  await waitStatus(fault,'STORAGE UNAVAILABLE');assert(await el(fault,'garage-buy').isDisabled());
  await fault.evaluate(()=>{window.garageStorageFault='none';});await el(fault,'garage-reload').click();await waitStatus(fault,'SAVED');
  assert.equal(await download(fault),recoveredFault,'restoring read access changes no ownership');
  scenarios.push('SecurityError reads/writes and uncertain readback preserve displayed state and require explicit reconciliation');

  for(const broken of ['{broken',JSON.stringify({version:99,garage:{}})]){
    // Deliberately corrupt browser storage; never inject an accepted garage.
    await fault.evaluate(({key,broken})=>localStorage.setItem(key,broken),{key:slot,broken});
    await el(fault,'garage-reload').click();await waitStatus(fault,'UNSAVED');
    assert.equal(await raw(fault),broken,'corrupt storage cannot silently reset to free funds');
    assert.equal(await el(fault,'garage-balance').textContent(),'No saved garage');
    assert.equal(await el(fault,'garage-introduction').getAttribute('data-mode'),'invalid-save');
    assert.match(await el(fault,'garage-intro-title').textContent(),/Recover/);
    await capture(fault,'corrupt-save-recovery');
    await prepare(fault,'garage-create');await el(fault,'garage-cancel').click();
    await expectUnchanged(fault,broken,'review/cancel replacement preserves corrupt bytes');
    await el(fault,'garage-intro-import').click();
    assert.equal(await fault.evaluate(()=>document.activeElement.id),'garage-import');
    await importText(fault,recoveredFault);await el(fault,'garage-confirmation').waitFor({state:'visible'});
    assert.equal(await raw(fault),broken,'admitted backup still requires replacement confirmation');
    await confirm(fault);await waitStatus(fault,'SAVED');assert.equal(await download(fault),recoveredFault);
  }
  await capture(fault,'corrupt-save-recovered');await faultContext.close();
  scenarios.push('corrupt and unsupported stored saves recover through confirmed actual exported backup without free cash');

  // The existing championship was created by its own UI, and remains resumable
  // after every garage reset, sale, import and cross-tab mutation.
  assert.deepEqual(await a.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(key=>key!=='circuit-overdrive.garage.v1').map(key=>[key,localStorage.getItem(key)]))),otherKeys);
  await el(a,'garage-close').click();await el(a,'enter-woc').click();await el(a,'woc-continue').click();
  assert(await el(a,'woc-grid').isVisible(),'existing championship save still resumes its accepted briefing');
  await el(a,'woc-back').click();await el(a,'woc-leave').click();await el(a,'enter-garage').click();
  scenarios.push('real previously created championship save remains unchanged and resumable after garage transactions');

  const padContext=await makeContext();await padContext.addInitScript(()=>{
    window.garagePad={index:0,id:'Garage acceptance pad',mapping:'standard',connected:true,
      axes:[0,0,0,0],buttons:Array.from({length:17},()=>({value:0,pressed:false}))};
    window.garageReports=[window.garagePad];window.garagePadReads=0;
    Object.defineProperty(navigator,'getGamepads',{value:()=>{window.garagePadReads++;return window.garageReports;}});
  });
  const pad=await padContext.newPage();await pad.goto(base.href);await el(pad,'controllers').click();
  await el(pad,'driver-device').selectOption('pad-0');await el(pad,'use-device').click();await pad.bringToFront();
  const waitPadPoll=async()=>{const reads=await pad.evaluate(()=>window.garagePadReads);await pad.waitForFunction(reads=>window.garagePadReads>=reads+2,reads);};
  await waitPadPoll();
  const padButton=async(button,value)=>{await pad.evaluate(([button,value])=>{window.garagePad.buttons[button]={value,pressed:value>0};},[button,value]);await waitPadPoll();};
  await el(pad,'enter-garage').focus();await padButton(0,1);await pad.waitForSelector('body[data-phase="garage"]');
  await el(pad,'garage-new').focus();await pad.waitForTimeout(150);assert(!(await el(pad,'garage-confirmation').isVisible()),'held controller confirm cannot cross the menu boundary');
  await padButton(0,0);await padButton(0,1);await el(pad,'garage-confirmation').waitFor({state:'visible'});
  await el(pad,'garage-confirm').focus();await pad.waitForTimeout(150);assert.equal(await saved(pad),null,'held controller confirmation cannot fund garage');
  await padButton(0,0);await padButton(0,1);await waitStatus(pad,'SAVED');await padButton(0,0);
  assert.equal((await saved(pad)).credits,2400);
  await prepare(pad,'garage-buy');const beforeDisconnect=await raw(pad);
  await pad.evaluate(()=>{window.garageReports[0]=null;});await pad.waitForTimeout(150);
  await pad.evaluate(()=>{window.garagePad.buttons[0]={value:1,pressed:true};window.garageReports[0]=window.garagePad;});
  await el(pad,'garage-confirm').focus();await pad.waitForTimeout(150);await expectUnchanged(pad,beforeDisconnect,'reconnected held controller cannot regain ownership or buy');
  await padContext.close();scenarios.push('synthetic standard gamepad with real menu polling: held confirmation, neutral rearming and disconnect protection');

  for(const [width,height] of [[1920,1080],[1440,900],[720,900],[390,844]]){
    const responsive=await makeContext({viewport:{width,height},hasTouch:width<=720,isMobile:width<720});
    const page=await openPage(responsive);await page.emulateMedia({reducedMotion:'reduce'});
    await firstVisit(page);await capture(page,'onboarding-'+width);
    // Reopen after deliberately scrolling away; first setup remains discoverable.
    await el(page,'garage-new').scrollIntoViewIfNeeded();await el(page,'garage-close').click();
    await el(page,'enter-garage').click();await firstVisit(page);
    await page.keyboard.press('Enter');await el(page,'garage-confirmation').waitFor({state:'visible'});
    await inView(page,'garage-cancel');await inView(page,'garage-confirm');
    await page.keyboard.press('Escape');await firstVisit(page);
    await page.keyboard.press('Enter');await el(page,'garage-confirmation').waitFor({state:'visible'});
    // Safe Cancel is first focus; a fresh Tab and Enter confirms setup.
    await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'garage-confirm');
    await page.keyboard.press('Enter');await el(page,'garage-confirmation').waitFor({state:'hidden'});await created(page);
    await page.keyboard.press('Enter');await el(page,'garage-confirmation').waitFor({state:'visible'});
    await confirm(page);await waitStatus(page,'SAVED');assert.equal((await saved(page)).credits,1800);
    const before=await raw(page);await el(page,'garage-close').click();await el(page,'enter-garage').click();
    assert(await el(page,'garage-introduction').isHidden());await expectUnchanged(page,before,'reopening never tops up credits');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'garage-close');
    const scroll=await page.evaluate(()=>[document.querySelector('#garage').scrollTop,document.querySelector('main').scrollTop]);
    await settleDraw(page);assert.deepEqual(await page.evaluate(()=>[document.querySelector('#garage').scrollTop,document.querySelector('main').scrollTop]),scroll,'idle frames do not force scrolling');
    onboardingLayouts.push({width,height,firstActionVisible:true,cancellation:true,keyboardPurchase:true,savedBalance:1800});
    await responsive.close();
  }
  scenarios.push('1920x1080, 1440x900, 720px and mobile first-run visibility, stale scroll, keyboard cancellation/setup/purchase and stable reopen focus');

  const mobileContext=await makeContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const mobile=await openPage(mobileContext);await commit(mobile,'garage-new');
  await selected(mobile,'cinder-two');await prepare(mobile,'garage-buy');await el(mobile,'garage-confirm').tap();await waitStatus(mobile,'SAVED');
  assert.equal((await saved(mobile)).credits,1800);
  assert(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile layout does not overflow viewport');
  await capture(mobile,'mobile-purchase-controls');
  await mobile.emulateMedia({reducedMotion:'reduce'});await el(mobile,'garage-camera-side').tap();await capture(mobile,'mobile-owned-garage');
  await mobileContext.close();scenarios.push('responsive touch purchase and reduced-motion camera controls');

  const deniedContext=await makeContext();await deniedContext.addInitScript(()=>Object.defineProperty(navigator,'locks',{configurable:true,value:undefined}));
  const denied=await openPage(deniedContext);await waitStatus(denied,'STORAGE UNAVAILABLE');assert.equal(await saved(denied),null);
  assert(await el(denied,'garage-new').isDisabled());assert(await el(denied,'garage-create').isHidden());assert.equal(await el(denied,'garage-introduction').getAttribute('data-mode'),'unavailable');await deniedContext.close();
  scenarios.push('missing Web Locks fails closed with explicit storage status');

  const noGLContext=await makeContext();await noGLContext.addInitScript(()=>{
    const get=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,...args){return this.id==='garage-canvas'&&type.includes('webgl')?null:get.call(this,type,...args);};
  });
  const noGL=await openPage(noGLContext);await noGL.waitForFunction(()=>/unavailable|WebGL/i.test(document.querySelector('#garage-graphics-status').textContent));
  await commit(noGL,'garage-new');await buy(noGL);assert.equal((await saved(noGL)).credits,1800);await noGLContext.close();
  scenarios.push('showroom WebGL unavailability leaves explicit, working ownership controls');

  const noGraphicsContext=await makeContext();await noGraphicsContext.addInitScript(()=>{
    const get=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,...args){return type.includes('webgl')?null:get.call(this,type,...args);};
  });
  const noGraphics=await noGraphicsContext.newPage();await noGraphics.goto(base.href);
  await noGraphics.waitForSelector('body[data-phase="error"]');await el(noGraphics,'error-garage').click();
  await noGraphics.waitForSelector('body[data-phase="garage"]');await commit(noGraphics,'garage-new');await buy(noGraphics);
  assert.equal((await saved(noGraphics)).credits,1800,'HTML garage remains reachable when all WebGL is unavailable');
  await noGraphicsContext.close();scenarios.push('global WebGL failure still offers a reachable HTML garage with real persisted purchases');

  assert.deepEqual(errors,[]);
  const report={version:1,source:revision,browser:browser.version(),runtime,url:base.href,scenarios,resources,captures,
    requests:requests.length,externalRequests:requests.filter(url=>!url.startsWith(base.href)&&!url.startsWith('blob:')&&!url.startsWith('data:')),errors,
    exports,onboardingLayouts,invalidImportCases:invalidFiles.map(([name])=>name),finalGarage:await saved(a),limitations:['Synthetic standard gamepad reports and storage service faults are explicitly identified.','Software WebGL unless GARAGE_NATIVE=1; this smoke is not a native 60 FPS certification.']};
  if(evidence)await writeFile(join(evidence,'garage-browser.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));await context.close();
}finally{await browser.close();}
