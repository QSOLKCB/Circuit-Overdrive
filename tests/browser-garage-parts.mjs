// SPDX-License-Identifier: Apache-2.0
// Production UI purchases/fittings only. Faults replace browser storage services,
// never accepted inventory, money, a compiled recipe or a benchmark outcome.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=new URL(process.argv[2] || 'http://127.0.0.1:8767/Circuit-Overdrive/');
const evidence=process.env.EVIDENCE_DIR;
if(evidence)await mkdir(evidence,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN || undefined,
  args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const slot='circuit-overdrive.garage.v1';
const errors=[],requests=[],scenarios=[],captures=[],downloads=[],faults=[];
let source,runtime;
const el=(page,id)=>page.locator('#garage-'+id);
const parts=(page,id)=>page.locator('#garage-parts-'+id);
const raw=page=>page.evaluate(key=>localStorage.getItem(key),slot);
const envelope=async page=>JSON.parse(await raw(page));
const saved=async page=>(await envelope(page)).garage;
const hash=data=>createHash('sha256').update(data).digest('hex');

async function context(){
  const result=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  result.on('page',page=>{
    page.on('pageerror',error=>errors.push(error.message));
    page.on('response',response=>{if(response.status()>=400)errors.push(response.status()+' '+response.url());});
  });
  await result.route('**/*',route=>{
    const url=route.request().url();requests.push(url);
    if(url.startsWith(base.href)||url.startsWith('blob:')||url.startsWith('data:'))return route.continue();
    errors.push('Unexpected request '+url);return route.abort();
  });
  await result.addInitScript(slot=>{
    window.partsStorageFault='none';
    const get=Storage.prototype.getItem,set=Storage.prototype.setItem;
    let uncertainRead=false;
    Storage.prototype.getItem=function(key){
      if(key===slot&&uncertainRead){uncertainRead=false;throw new DOMException('Test interrupted verification','SecurityError');}
      return get.call(this,key);
    };
    Storage.prototype.setItem=function(key,value){
      if(key===slot&&window.partsStorageFault==='quota')throw new DOMException('Test quota','QuotaExceededError');
      const result=set.call(this,key,value);
      if(key===slot&&window.partsStorageFault==='readback')uncertainRead=true;
      return result;
    };
  },slot);
  return result;
}
async function open(context){
  const page=await context.newPage();await page.goto(base.href);
  const stamp=await page.locator('meta[name="game-revision"]').getAttribute('content');
  assert.match(stamp,/^[0-9a-f]{40}$/,'Use a source-stamped package');
  if(process.env.SOURCE_SHA)assert.equal(stamp,process.env.SOURCE_SHA);
  source??=stamp;assert.equal(source,stamp);
  await page.locator('#enter-garage:enabled').click();
  await page.waitForSelector('body[data-phase="garage"]');return page;
}
async function status(page,value){await page.waitForFunction(value=>document.querySelector('#garage-status').textContent===value,value);}
async function prepare(page,id){
  const before=await raw(page);await el(page,id).click();
  await el(page,'confirmation').waitFor({state:'visible'});
  assert.equal(await raw(page),before,'Review never writes proposed ownership');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'garage-cancel');
}
async function confirm(page,{duplicate=false}={}){
  if(duplicate)await el(page,'confirm').evaluate(button=>{button.click();button.click();});
  else await el(page,'confirm').click();
  await page.waitForFunction(()=>document.querySelector('#garage').dataset.busy==='false');
  await el(page,'confirmation').waitFor({state:'hidden'});
}
async function commit(page,id){await prepare(page,id);await confirm(page);await status(page,'SAVED');}
async function buy(page){await el(page,'model-cinder-two').click();await commit(page,'buy');}
async function selectPart(page,category,id,tuning={}){
  await parts(page,'slot').selectOption(category);
  await parts(page,'part').selectOption(id);
  for(const [key,value] of Object.entries(tuning))await parts(page,key).selectOption(String(value));
}
async function prepareFit(page,category,id,tuning={}){
  await selectPart(page,category,id,tuning);
  const before=await raw(page);
  await parts(page,'review').click();await el(page,'confirmation').waitFor({state:'visible'});
  assert.equal(await raw(page),before,'Fitting review never debits credits or fits a proposed part');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'garage-cancel');
}
async function fit(page,category,id,tuning={}){
  await prepareFit(page,category,id,tuning);await confirm(page);await status(page,'SAVED');
}
async function download(page){
  const pending=page.waitForEvent('download');await el(page,'export').click();
  const file=await pending;assert.equal(await file.failure(),null);
  const text=await readFile(await file.path(),'utf8'),name='parts-download-'+String(downloads.length+1).padStart(2,'0')+'.json';
  downloads.push({file:name,bytes:Buffer.byteLength(text),sha256:hash(text)});
  if(evidence)await writeFile(join(evidence,name),text);
  return text;
}
async function capture(page,name,{canvas=false}={}){
  if(!evidence)return null;
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const filename=name+'.png',path=join(evidence,filename);
  if(canvas)await page.locator('#garage-canvas').screenshot({path});
  else await page.screenshot({path,fullPage:true});
  const sha256=hash(await readFile(path));captures.push({file:filename,sha256});return sha256;
}
async function measured(page,ownedVehicleId){
  return page.evaluate(async({base,slot,source,ownedVehicleId})=>{
    const {compileVehicleBuild,identifyVehicleBuild}=await import(new URL('src/vehicle-builds.js',base).href);
    const {createVehicle}=await import(new URL('vendor/vanillajs/modules/vehicle3d/index.js',base).href);
    const owned=JSON.parse(localStorage.getItem(slot)).garage.bays.find(car=>car?.ownedVehicleId===ownedVehicleId);
    if(!owned)throw Error('Measurement requires the actual committed owned vehicle');
    const accepted=compileVehicleBuild(owned.modelId,owned.build);
    const identity=await identifyVehicleBuild(owned.modelId,owned.build,source);
    const vehicle=createVehicle(accepted.recipe),world={sampleSurface:()=>({height:0,normal:[0,1,0],friction:1,surfaceId:'parts-browser-level-dry-v1'}),barriers:[]};
    let state=vehicle.spawn(),elapsed=null,acceptedTicks=0;
    const start={position:state.position.slice(),orientation:state.orientation.slice(),velocity:state.velocity.slice()};
    let threshold=null;
    for(let tick=0;tick<1500;tick++){
      const before=state,prior=Math.hypot(before.velocity[0],before.velocity[2]);
      state=vehicle.step(state,{throttle:1,brake:0,steer:0},world,1/60);acceptedTicks++;
      if(state.truncated||state.needsRecovery||!state.wheels.every(w=>w.grounded))throw Error('Owned build failed accepted physical run');
      const speed=Math.hypot(state.velocity[0],state.velocity[2]);
      if(![...state.position,...state.velocity,...state.angularVelocity].every(Number.isFinite))throw Error('Non-finite owned motion');
      if(speed>=100/3.6){
        const fraction=(100/3.6-prior)/(speed-prior);elapsed=(tick+fraction)/60;
        threshold={priorSpeedMps:prior,nextSpeedMps:speed,fraction};break;
      }
    }
    if(elapsed===null)throw Error('Owned build did not reach declared 100 km/h threshold');
    return {ownedVehicleId,modelId:owned.modelId,sourceRevision:source,build:owned.build,
      rulesVersion:accepted.rulesVersion,buildDigest:identity.buildDigest,recipeDigest:identity.recipeDigest,
      canonicalRecipe:accepted.canonicalRecipe,
      rules:{id:'co-014c-owned-browser-acceleration-v1',seed:0,step:1/60,maxTicks:1500,
        command:{throttle:1,brake:0,steer:0},surfaceId:'parts-browser-level-dry-v1',friction:1,
        crossing:'linear interpolation of consecutive accepted horizontal speed endpoints'},
      comparison:'Same deterministic threshold policy/command values; timed stream lengths differ.',
      start,acceptedTicks,elapsedSeconds:elapsed,threshold,
      terminal:{position:state.position,orientation:state.orientation,velocity:state.velocity,
        angularVelocity:state.angularVelocity,gear:state.gear,rpm:state.rpm}};
  },{base:base.href,slot,source,ownedVehicleId});
}

try{
  const shared=await context(),page=await open(shared);
  assert.equal(await raw(page),null);await commit(page,'create');await buy(page);
  await el(page,'bay-0').click();
  const initial=await envelope(page),stock=await measured(page,'car-000001');
  assert.equal(initial.garage.credits,1800);assert.equal(initial.garage.nextVehicleId,2);
  assert.equal(initial.garage.bays[0].build.rulesVersion,1);
  scenarios.push('Real garage creation and Cinder purchase; actual committed stock build drives the pinned solver');
  runtime=await page.evaluate(()=>{
    const gl=document.querySelector('#garage-canvas').getContext('webgl'),debug=gl.getExtension('WEBGL_debug_renderer_info');
    return {browser:navigator.userAgent,webLocks:typeof navigator.locks?.request==='function',renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
  });

  const beforeEngine=await raw(page);
  await prepareFit(page,'engine','street');await capture(page,'engine-confirmation');
  assert.match(await el(page,'confirm-copy').textContent(),/250|270/);
  await el(page,'cancel').click();assert.equal(await raw(page),beforeEngine);
  await prepareFit(page,'engine','street');await confirm(page,{duplicate:true});await status(page,'SAVED');
  const afterEngine=await envelope(page),engine=await measured(page,'car-000001');
  assert.equal(afterEngine.garage.credits,1530);assert.equal(afterEngine.garage.revision,2);
  assert.equal(afterEngine.sequence,initial.sequence+1,'duplicate click commits one installation');
  assert.equal(afterEngine.garage.bays[0].build.parts.engine,'street');
  assert(engine.elapsedSeconds<stock.elapsedSeconds,'actual fitted torque curve produces measured faster acceleration');
  assert.notEqual(engine.canonicalRecipe,stock.canonicalRecipe);
  assert.notEqual(engine.buildDigest,stock.buildDigest);
  scenarios.push('Cancelled engine review leaves storage unchanged; duplicate confirmation charges once and fitted engine changes actual measured motion');

  const choices=[['intake','duct',{}],['exhaust','flow',{}],['gearbox','short',{}],
    ['finalDrive','adjustable',{finalDrive:2}],['tyres','performance',{}],
    ['suspension','adjustable',{spring:1,damper:1,travel:1}],['steering','quick',{steering:1}]];
  for(const [category,id,tuning] of choices)await fit(page,category,id,tuning);
  const beforePaint=await envelope(page),beforePaintRecipe=await measured(page,'car-000001');
  const factoryCanvas=await capture(page,'before-paint-canvas',{canvas:true});
  await fit(page,'paint','midnight');
  const midnightCanvas=await capture(page,'after-paint-canvas',{canvas:true});
  const fullyFitted=await envelope(page),painted=await measured(page,'car-000001');
  assert.equal(fullyFitted.garage.credits,360);assert.equal(fullyFitted.garage.revision,10);
  assert.equal(fullyFitted.garage.nextVehicleId,2);assert.equal(fullyFitted.garage.activeVehicleId,'car-000001');
  assert.equal(painted.canonicalRecipe,beforePaintRecipe.canonicalRecipe,'paint changes no complete physical recipe field');
  assert.equal(beforePaint.garage.credits-fullyFitted.garage.credits,70);
  if(evidence)assert.notEqual(factoryCanvas,midnightCanvas,'accepted paint changes the actual rendered canvas');
  const fitted=fullyFitted.garage.bays[0];
  const expected={engine:'street',intake:'duct',exhaust:'flow',gearbox:'short',finalDrive:'adjustable',
    tyres:'performance',suspension:'adjustable',steering:'quick',paint:'midnight'};
  assert.deepEqual(fitted.build.parts,expected);
  assert.deepEqual(fitted.build.tuning,{finalDrive:2,spring:1,damper:1,travel:1,steering:1});
  for(const [category,id] of Object.entries(expected))assert.deepEqual(new Set(fitted.build.inventory[category]),new Set([category==='paint'?'factory':'stock',id]));
  assert(await parts(page,'review').isDisabled(),'already fitted settings cannot be purchased again');
  const duplicate=await raw(page);await parts(page,'review').evaluate(button=>button.click());assert.equal(await raw(page),duplicate);
  scenarios.push('All nine part categories fit affordably to one stable owned ID; accepted paint visibly changes canvas without changing physics');

  await fit(page,'engine','stock');assert.equal((await saved(page)).credits,340);
  await fit(page,'engine','street');assert.equal((await saved(page)).credits,320,'refit uses owned engine rather than buying again');
  await fit(page,'finalDrive','adjustable',{finalDrive:3});assert.equal((await saved(page)).credits,310,'tune-only fitting costs ten');
  const retained=await saved(page),exported=await download(page);
  assert.deepEqual(JSON.parse(exported),retained);
  await page.reload();await page.locator('#enter-garage:enabled').click();await status(page,'SAVED');await el(page,'bay-0').click();
  assert.deepEqual(await saved(page),retained);
  await el(page,'import').setInputFiles({name:'owned-build.json',mimeType:'application/json',buffer:Buffer.from(exported)});
  await el(page,'confirmation').waitFor({state:'visible'});await confirm(page);await status(page,'SAVED');
  assert.deepEqual(await saved(page),retained);await el(page,'bay-0').click();
  scenarios.push('Owned stock/upgrade refits avoid duplicate part payments; tune-only cost and native export/import/reload preserve the accepted build');

  const stale=await open(shared);await el(stale,'bay-0').click();
  await prepareFit(stale,'exhaust','stock');
  await fit(page,'paint','seafoam');
  const afterOtherTab=await raw(page);await status(stale,'CONFLICT');
  assert(await el(stale,'confirmation').isHidden(),'real storage event invalidates pending installation');
  await el(stale,'confirm').evaluate(button=>button.click());assert.equal(await raw(stale),afterOtherTab);
  assert.equal((await saved(page)).bays[0].build.parts.exhaust,'flow');
  await el(stale,'reload').click();await status(stale,'SAVED');assert.equal(await raw(stale),afterOtherTab);
  scenarios.push('A conflicting second tab receives the real storage event and cannot apply an obsolete parts confirmation');

  for(const fault of ['quota','readback']){
    const isolated=await context(),p=await open(isolated);await commit(p,'create');await buy(p);await el(p,'bay-0').click();
    const before=await raw(p),prior=JSON.parse(before);
    await prepareFit(p,'engine','street');await p.evaluate(fault=>{window.partsStorageFault=fault;},fault);
    await confirm(p);await status(p,'STORAGE UNAVAILABLE');
    assert.deepEqual(JSON.parse(await download(p)),prior.garage,'unconfirmed installation is not published in UI ownership');
    assert.match(await parts(p,'installed').textContent(),/^engine: Stock engine/);
    const uncertain=await raw(p);
    if(fault==='quota')assert.equal(uncertain,before);
    else{
      const pending=JSON.parse(uncertain);assert.equal(pending.garage.credits,1530);
      assert.equal(pending.garage.bays[0].build.parts.engine,'street');
    }
    await p.evaluate(()=>{window.partsStorageFault='none';});await el(p,'reload').click();
    if(fault==='quota'){
      await status(p,'SAVED');await el(p,'bay-0').click();await fit(p,'engine','street');
    }else{await status(p,'SAVED');await el(p,'bay-0').click();}
    const recovered=await envelope(p);assert.equal(recovered.garage.credits,1530);
    assert.equal(recovered.sequence,prior.sequence+1);assert.equal(recovered.garage.revision,2);
    assert.equal(recovered.garage.bays[0].build.parts.engine,'street');assert(await parts(p,'review').isDisabled());
    faults.push({fault,prior:prior.garage,recovered:recovered.garage,sequence:recovered.sequence});
    scenarios.push(fault==='quota'?'Quota failure installs no free part; explicit reload/retry purchases exactly once':
      'Unknown read-back completion keeps old accepted UI; reload discovers one complete paid installation');
    await isolated.close();
  }

  const separate=await context(),two=await open(separate);await commit(two,'create');await buy(two);await buy(two);
  const originalTwo=await saved(two);assert.equal(originalTwo.credits,1200);await el(two,'bay-0').click();
  await fit(two,'engine','street');await fit(two,'paint','midnight');
  const independentlyOwned=await saved(two);assert.equal(independentlyOwned.credits,860);
  assert.equal(independentlyOwned.bays[0].ownedVehicleId,'car-000001');
  assert.deepEqual(independentlyOwned.bays[1],originalTwo.bays[1]);
  assert.equal(independentlyOwned.bays[0].build.parts.engine,'street');
  assert.equal(independentlyOwned.bays[1].build.parts.engine,'stock');
  await el(two,'bay-1').click();assert.match(await parts(two,'installed').textContent(),/^engine: Stock engine/);
  await capture(two,'independent-owned-builds');await separate.close();
  scenarios.push('Two purchased Cinder cars keep distinct IDs/builds; upgrading and painting one cannot mutate the other');

  assert.deepEqual(errors,[]);
  const report={version:1,source,browser:browser.version(),runtime,url:base.href,scenarios,
    measurements:{stock,streetEngine:engine,fullyMechanical:beforePaintRecipe,painted},
    originalEnvelope:initial,allPartsEnvelope:fullyFitted,finalMainGarage:await saved(page),independentCars:independentlyOwned,
    faults,downloads,captures,requests:requests.length,
    externalRequests:requests.filter(url=>!url.startsWith(base.href)&&!url.startsWith('blob:')&&!url.startsWith('data:')),errors,
    limitations:['Storage quota/read-back failures are synthetic service conditions. Inventory and purchase outcomes always use real production UI controls.',
      'Acceleration is measured by the pinned solver from the actual saved owned build in a development runner, not a playable proving-ground or production performance badge.',
      'SwiftShader browser functionality and pixel change; no native GPU/frame-time claim.']};
  if(evidence)await writeFile(join(evidence,'garage-parts-browser.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({source,browser:browser.version(),scenarios:scenarios.length,stockSeconds:stock.elapsedSeconds,
    streetSeconds:engine.elapsedSeconds,finalCredits:report.finalMainGarage.credits,errors},null,2));
  await shared.close();
}finally{await browser.close();}
