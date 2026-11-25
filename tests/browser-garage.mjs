// SPDX-License-Identifier: Apache-2.0
// Actual packaged garage UI, native browser storage/downloads/Web Locks and
// WebGL. Gamepad reports and storage service faults are explicitly synthetic;
// inventory, balances and transaction outcomes are never injected.
import assert from 'node:assert/strict';
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
const errors=[],requests=[],scenarios=[],captures=[],resources={};
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
    const get=Storage.prototype.getItem,set=Storage.prototype.setItem;
    Storage.prototype.getItem=function(key){
      if(key===slot&&window.garageStorageFault==='read-denied')throw new DOMException('Denied by acceptance fixture','SecurityError');
      return get.call(this,key);
    };
    Storage.prototype.setItem=function(key,value){
      if(key===slot&&window.garageStorageFault==='quota')throw new DOMException('Full by acceptance fixture','QuotaExceededError');
      return set.call(this,key,value);
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
  assert.equal(await item.failure(),null);return readFile(await item.path(),'utf8');
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
  assert.equal(await saved(a),null,'opening never fabricates starting funds');
  const otherKeys=await a.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(key=>key!=='circuit-overdrive.garage.v1').map(key=>[key,localStorage.getItem(key)])));
  await prepare(a,'garage-new');await el(a,'garage-cancel').click();assert.equal(await saved(a),null);
  await commit(a,'garage-new');assert.deepEqual(await saved(a),{version:1,edition:'after-hours-v1',catalogRevision:1,credits:2400,nextVehicleId:1,activeVehicleId:null,bays:[null,null,null,null],revision:0});
  await capture(a,'empty-garage');
  await selected(a,'cinder-two');await capture(a,'catalogue-starter');
  await prepare(a,'garage-buy');await capture(a,'purchase-confirmation');await confirm(a);await waitStatus(a,'SAVED');
  assert.deepEqual((await saved(a)).bays,[{ownedVehicleId:'car-000001',modelId:'cinder-two'},null,null,null]);
  assert.equal((await saved(a)).credits,1800);await capture(a,'first-owned-bay');
  const owned=await saved(a);await a.reload();await el(a,'enter-garage').click();await waitStatus(a,'SAVED');
  assert.deepEqual(await saved(a),owned,'saved purchase survives real reload');
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
  const exported=await download(a);assert.deepEqual(JSON.parse(exported),sold);
  await prepare(a,'garage-new');assert.equal(await download(a,'garage-backup'),exported);await confirm(a);
  await importText(a,exported);await el(a,'garage-confirmation').waitFor({state:'visible'});assert.equal((await saved(a)).credits,2400,'file preview does not replace state');
  await confirm(a);assert.equal(await download(a),exported,'canonical export/import round-trip');await capture(a,'recovered-save');
  const prior=await raw(a);
  for(const text of ['{',' '.repeat(65537),JSON.stringify({...sold,version:99}),JSON.stringify({...sold,bays:[sold.bays[0],sold.bays[0],null,null]})]){
    await importText(a,text);await waitStatus(a,'IMPORT REJECTED');await expectUnchanged(a,prior,'invalid import preserves accepted save');
    assert(!(await el(a,'garage-confirmation').isVisible()));
  }
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
    await selected(a,model);for(const camera of ['front','side','rear','bays'])await el(a,'garage-camera-'+camera).click();
    if(cycle===0&&['yardhand','glass-comet'].includes(model))await capture(a,'showroom-'+model);
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
  assert(await el(denied,'garage-new').isDisabled());await deniedContext.close();
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
    finalGarage:await saved(a),limitations:['Synthetic standard gamepad reports and storage service faults are explicitly identified.','Software WebGL unless GARAGE_NATIVE=1; this smoke is not a native 60 FPS certification.']};
  if(evidence)await writeFile(join(evidence,'garage-browser.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));await context.close();
}finally{await browser.close();}
