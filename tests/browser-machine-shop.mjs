// SPDX-License-Identifier: Apache-2.0
// Production controls only. Reads instruments/downloads; never installs JSON,
// injects builds or supplies imported positions as accepted physical authority.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=new URL(process.argv[2]||'http://127.0.0.1:8770/Circuit-Overdrive/');
const evidence=process.env.EVIDENCE_DIR;
if(evidence)await mkdir(evidence,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||undefined,
  args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const slot='circuit-overdrive.garage.v1',engine='9d95d74b355ec17add32db0b55f0f71130f9c004';
const errors=[],requests=[],scenarios=[],captures=[],downloads=[],rejections=[];
const garage=(page,id)=>page.locator('#garage-'+id),parts=(page,id)=>page.locator('#garage-parts-'+id);
const pg=(page,id)=>page.locator('#pg-'+id),pr=(page,id)=>page.locator('#pr-'+id);
const json=async locator=>JSON.parse(await locator.textContent());
const raw=page=>page.evaluate(key=>localStorage.getItem(key),slot);
const saved=async page=>JSON.parse(await raw(page)).garage;
const hash=data=>createHash('sha256').update(data).digest('hex');
let source,runtime,diagnosticPage;

async function capture(page,name,selector){
  if(!evidence)return;
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const file=name+'.png',path=join(evidence,file);
  if(selector)await page.locator(selector).screenshot({path});else await page.screenshot({path,fullPage:true});
  captures.push({file,sha256:hash(await readFile(path))});
}
async function stamp(page){
  const value=await page.locator('meta[name="game-revision"]').getAttribute('content');
  assert.match(value,/^[a-f0-9]{40}$/,'Machine Shop acceptance requires an exact-source packaged runtime');
  if(process.env.SOURCE_SHA)assert.equal(value,process.env.SOURCE_SHA);
  source??=value;assert.equal(value,source);
}
async function garageReady(page){
  await page.waitForSelector('body[data-phase="garage"]');
  await page.waitForFunction(()=>document.querySelector('#garage-status').textContent==='SAVED');
}
async function review(page,control){
  const before=await raw(page);await control.click();await garage(page,'confirmation').waitFor({state:'visible'});
  assert.equal(await raw(page),before,'An unconfirmed proposal cannot fit parts or spend credits');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'garage-cancel');
}
async function confirm(page){
  await garage(page,'confirm').click();
  await page.waitForFunction(()=>document.querySelector('#garage').dataset.busy==='false');
  await garage(page,'confirmation').waitFor({state:'hidden'});await garageReady(page);
}
async function commit(page,id){await review(page,garage(page,id));await confirm(page);}
async function fit(page,slot,id,tuning={}){
  await parts(page,'slot').selectOption(slot);await parts(page,'part').selectOption(id);
  for(const [key,value]of Object.entries(tuning))await parts(page,key).selectOption(String(value));
  await review(page,parts(page,'review'));await confirm(page);
}
async function download(page,control,name){
  const event=page.waitForEvent('download');await control.click();const file=await event;
  assert.equal(await file.failure(),null);const text=await readFile(await file.path(),'utf8');
  downloads.push({file:name,suggestedFilename:file.suggestedFilename(),bytes:Buffer.byteLength(text),sha256:hash(text)});
  if(evidence)await writeFile(join(evidence,name),text);return {text,data:JSON.parse(text)};
}
async function enterGround(page){
  await garage(page,'test-drive').click();await page.waitForURL('**/proving-ground.html?vehicle=car-000001');await stamp(page);
  await page.waitForFunction(()=>{
    try{const t=JSON.parse(document.querySelector('#pg-telemetry').textContent);return t.ownedVehicleId==='car-000001'&&t.ticks===0&&t.paused;}
    catch{return false;}
  });
}
async function referenceAcceleration(page){
  const before=await raw(page);
  await pg(page,'build-mode').selectOption('current');await pg(page,'test').selectOption('acceleration');
  await pg(page,'driver').selectOption('reference');await pg(page,'load').click();await pg(page,'arm').click();
  await page.waitForFunction(()=>{
    try{return JSON.parse(document.querySelector('#pg-result').textContent)!==null;}catch{return false;}
  },null,{timeout:90000});
  const result=await json(pg(page,'result'));
  assert.equal(result.status,'completed');
  assert.equal(result.acceptedTicks,900);assert(Number.isFinite(result.metrics.accelerationSeconds));
  assert.equal(result.diagnostics.solverTruncated,false);assert.equal(result.diagnostics.needsRecovery,false);
  assert.equal(await raw(page),before,'An accepted benchmark never writes ownership or condition');return result;
}
async function backGarage(page){
  await pg(page,'return').click();await page.waitForURL(new URL('index.html#garage',base).href);await garageReady(page);
  await garage(page,'bay-0').click();
}
async function compare(page,test){
  await pg(page,'test').selectOption(test);await pg(page,'compare').click();
  await page.waitForFunction(test=>{
    try {const r=JSON.parse(document.querySelector('#pg-comparison').textContent);return r.testId===test&&r.results?.length===3;}
    catch{return false;}
  },test,{timeout:120000});
  const report=await json(pg(page,'comparison'));
  for(const receipt of report.results){
    assert.equal(receipt.sourceRevision,source);assert.equal(receipt.engineRevision,engine);
    assert.equal(receipt.ownedVehicleId,'car-000001');assert.equal(receipt.result.status,'completed');
    assert.equal(receipt.commandsRLE.reduce((sum,c)=>sum+c.ticks,0),receipt.acceptedTicks);
  }
  return report;
}
async function replayPhase(page,phase){
  await page.waitForFunction(phase=>{
    try{return JSON.parse(document.querySelector('#pr-telemetry').textContent).phase===phase;}catch{return false;}
  },phase,{timeout:120000});return json(pr(page,'telemetry'));
}
async function seek(page,tick){
  await pr(page,'seek').evaluate((control,value)=>{
    control.value=String(value);control.dispatchEvent(new Event('input',{bubbles:true}));
  },tick);
  await page.waitForFunction(tick=>{
    try {const t=JSON.parse(document.querySelector('#pr-telemetry').textContent);return t.tick===tick&&!['verifying','playing'].includes(t.phase);}
    catch{return false;}
  },tick,{timeout:120000});return json(pr(page,'telemetry'));
}
function compactReceipt(receipt){
  const {commandsRLE,terminalState,canonicalRecipe,...rest}=receipt;
  return {...rest,commandBlocks:commandsRLE?.length,acceptedCommands:commandsRLE?.length<=4?commandsRLE:undefined,
    terminalMotion:terminalState&&{position:terminalState.position,velocity:terminalState.velocity,orientation:terminalState.orientation}};
}

try{
  const shared=await browser.newContext({viewport:{width:1440,height:1080},acceptDownloads:true});
  shared.on('page',page=>{
    page.on('pageerror',error=>errors.push(error.message));
    page.on('response',response=>{if(response.status()>=400)errors.push(response.status()+' '+response.url());});
  });
  await shared.route('**/*',route=>{
    const url=route.request().url();requests.push(url);
    if(url.startsWith(base.href)||url.startsWith('blob:')||url.startsWith('data:'))return route.continue();
    errors.push('Unexpected request '+url);return route.abort();
  });
  const page=await shared.newPage();diagnosticPage=page;await page.goto(base.href);await stamp(page);
  await page.locator('#enter-garage:enabled').click();await commit(page,'create');
  await garage(page,'model-cinder-two').click();await commit(page,'buy');await garage(page,'bay-0').click();
  assert.match(await parts(page,'counter').textContent(),/The Machine Shop/);
  assert.match(await parts(page,'identity').textContent(),/Cinder Two/);
  assert.match(await parts(page,'identity').textContent(),/car-000001/);
  assert.equal(await parts(page,'repairs').textContent(),'No repairs required.');
  const bought=await saved(page);assert.equal(bought.credits,1800);
  await capture(page,'machine-shop-stock');
  scenarios.push('The real first purchase opens the selected owned Cinder Machine Shop, identifies its stable owned ID and reports pristine repair status');

  await enterGround(page);const stockResult=await referenceAcceleration(page);
  const stockReceipt=await download(page,pg(page,'export'),'stock-acceleration-receipt.json');
  assert.deepEqual(stockReceipt.data.result,stockResult);assert.equal(stockReceipt.data.build.parts.engine,'stock');
  await backGarage(page);await fit(page,'engine','street');const engineGarage=await saved(page);
  assert.equal(engineGarage.credits,1530);assert.equal(engineGarage.bays[0].ownedVehicleId,'car-000001');
  assert.match(await parts(page,'installed').textContent(),/^engine: Street rebuild/);
  scenarios.push('A normal-frame stock test supplies an actual measured baseline; the confirmed engine fitting deducts exactly 270 credits on the same owned car');

  await enterGround(page);const engineResult=await referenceAcceleration(page);
  assert(engineResult.metrics.accelerationSeconds<stockResult.metrics.accelerationSeconds);
  const recording=await download(page,pg(page,'record'),'owned-engine-v7-replay.json');
  assert.equal(recording.data.version,7);assert.equal(recording.data.revision,source);
  assert.equal(recording.data.engineRevision,engine);assert.equal(recording.data.ownedVehicleId,'car-000001');
  assert.equal(recording.data.build.parts.engine,'street');assert.equal(recording.data.build.parts.paint,'factory');
  assert.equal(recording.data.ticks,900);assert.deepEqual(recording.data.result,engineResult);
  assert.match(recording.data.recipeDigest,/^[a-f0-9]{64}$/);
  assert.notEqual(recording.data.recipeDigest,stockReceipt.data.recipeDigest);
  assert.deepEqual(recording.data.runs,stockReceipt.data.commandsRLE,'Engine-only before/after uses the identical accepted command tape');
  scenarios.push('The purchased engine changes normal-frame accepted acceleration; a native v7 download records that exact source, build, command tape and measured terminal result');

  const comparisonRawBefore=await raw(page),comparisons={};
  await pg(page,'build-mode').selectOption('proposed');await pg(page,'proposed-slot').selectOption('gearbox');
  await pg(page,'proposed-part').selectOption('short');
  for(const test of ['acceleration','braking','slalom','handling'])comparisons[test]=await compare(page,test);
  assert.equal(await raw(page),comparisonRawBefore);
  await backGarage(page);
  const beforeVerification=await raw(page);await page.locator('#garage-machine-verify').click();
  await page.waitForFunction(()=>document.querySelector('#garage-machine-comparisons').querySelectorAll('table tbody tr').length>=4,null,{timeout:120000});
  const measuredTable=await page.locator('#garage-machine-comparisons').textContent();
  for(const fragment of ['100','Slalom','Handling'])assert.match(measuredTable,new RegExp(fragment,'i'));
  const measuredRows=page.locator('#garage-machine-comparisons table tbody tr');
  for(const [index,test]of ['acceleration','braking','slalom','handling'].entries()){
    const metric={acceleration:'accelerationSeconds',braking:'brakingDistanceM',slalom:'slalomSeconds',handling:'handlingSeconds'}[test];
    for(const [column,mode]of ['stock','current','proposed'].entries()){
      const receipt=comparisons[test].results.find(result=>result.mode===mode),cell=measuredRows.nth(index).locator('td').nth(column+1);
      assert.match(await cell.textContent(),new RegExp(receipt.result.metrics[metric].toFixed(3).replace('.','\\.')));
      assert.match(await cell.getAttribute('title'),new RegExp(receipt.recipeDigest));
    }
  }
  assert.equal(await raw(page),beforeVerification,'Reconstructing benchmark evidence does not replace the garage');
  await capture(page,'machine-shop-measured-comparisons');
  scenarios.push('All four actual stock/current/proposed benchmark receipts return to the Garage and are explicitly re-simulated before measured comparison display; verification preserves the save');

  for(const [category,id,tuning]of [
    ['intake','duct'],['exhaust','flow'],['gearbox','short'],['finalDrive','adjustable',{finalDrive:2}],
    ['tyres','performance'],['suspension','adjustable',{spring:1,damper:1,travel:1}],
    ['steering','quick',{steering:1}],['paint','midnight']
  ]){
    await parts(page,'section-'+category).click();assert.equal(await parts(page,'slot').inputValue(),category);
    await fit(page,category,id,tuning);
  }
  const fitted=await saved(page),car=fitted.bays[0];assert.equal(fitted.credits,360);
  assert.equal(car.ownedVehicleId,'car-000001');assert.equal(car.modelId,'cinder-two');
  assert.deepEqual(car.build.parts,{engine:'street',intake:'duct',exhaust:'flow',gearbox:'short',finalDrive:'adjustable',
    tyres:'performance',suspension:'adjustable',steering:'quick',paint:'midnight'});
  assert.deepEqual(car.build.tuning,{finalDrive:2,spring:1,damper:1,travel:1,steering:1});
  assert.equal(car.condition.status,'pristine');assert.equal(await parts(page,'repairs').textContent(),'No repairs required.');
  assert.match(await parts(page,'preview').textContent(),/Already fitted|accepted|current|unchanged/i);
  await page.locator('#garage-machine-verify').click();
  await page.waitForFunction(()=>document.querySelector('#garage-machine-comparisons').textContent.includes('Original build'),null,{timeout:120000});
  await capture(page,'machine-shop-fitted-midnight');
  scenarios.push('Every named mechanical/paint section fits real existing catalogue parts and quantized settings through explicit transactions; exact owned identity and pristine condition survive all nine categories');

  const exported=await download(page,garage(page,'export'),'machine-shop-garage-export.json');
  assert.deepEqual(exported.data,fitted);await page.reload();await garageReady(page);
  await garage(page,'bay-0').click();assert.deepEqual(await saved(page),fitted);
  await garage(page,'import').setInputFiles({name:'machine-shop-garage.json',mimeType:'application/json',buffer:Buffer.from(exported.text)});
  await garage(page,'confirmation').waitFor({state:'visible'});await confirm(page);await garage(page,'bay-0').click();
  assert.deepEqual(await saved(page),fitted);assert.match(await parts(page,'installed').textContent(),/Midnight Alloy/);
  await page.setViewportSize({width:390,height:844});await parts(page,'section-suspension').click();
  assert.equal(await parts(page,'slot').inputValue(),'suspension');await capture(page,'machine-shop-mobile');
  const extents=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  assert(extents.scroll<=extents.width+1,'Machine Shop controls remain within the mobile viewport');
  await page.setViewportSize({width:1440,height:1080});
  scenarios.push('Native JSON export/import, browser reload and responsive named-section navigation preserve every installed part, setting, credit and owned identity');

  const liveRaw=await raw(page),viewer=await shared.newPage();diagnosticPage=viewer;
  await viewer.goto(new URL('proving-replay.html',base).href);await stamp(viewer);
  await pr(viewer,'file').setInputFiles({name:'owned-engine-v7.json',mimeType:'application/json',buffer:Buffer.from(recording.text)});
  let watched=await replayPhase(viewer,'ready');
  assert.equal(watched.tick,0);assert.equal(watched.totalTicks,900);assert.equal(watched.ownedVehicleId,'car-000001');
  assert.deepEqual(watched.build,recording.data.build);assert.equal(watched.build.parts.gearbox,'stock');
  assert.equal(watched.build.parts.paint,'factory');assert.equal(watched.recipeDigest,recording.data.recipeDigest);
  assert.notDeepEqual(watched.build,fitted.bays[0].build,'The recording reconstructs its original accepted build rather than looking up the current garage');
  assert.deepEqual(await json(pr(viewer,'result')),engineResult);
  await pr(viewer,'play').click();
  await viewer.waitForFunction(()=>JSON.parse(document.querySelector('#pr-telemetry').textContent).tick>=35);
  await pr(viewer,'play').click();watched=await json(pr(viewer,'telemetry'));const pausedTick=watched.tick;
  await viewer.waitForTimeout(220);assert.equal((await json(pr(viewer,'telemetry'))).tick,pausedTick);
  const midpoint=await seek(viewer,450);assert.equal(midpoint.tick,450);assert(midpoint.position.every(Number.isFinite));
  await pr(viewer,'camera').selectOption('high');await viewer.emulateMedia({reducedMotion:'reduce'});
  const terminal=await seek(viewer,900);assert.equal(terminal.tick,900);
  assert.deepEqual(await json(pr(viewer,'result')),recording.data.result);assert.equal(terminal.recipeDigest,recording.data.recipeDigest);
  await capture(viewer,'build-bound-replay-terminal','#pr-world');
  await pr(viewer,'restart').click();await viewer.waitForFunction(()=>JSON.parse(document.querySelector('#pr-telemetry').textContent).tick===0);
  assert.equal(await raw(viewer),liveRaw);
  scenarios.push('The standalone v7 viewer reconstructs the original engine-only build after the live car has different parts/paint; play, pause, midpoint/end seek, camera, reduced motion and restart reproduce its accepted result without touching the save');

  await viewer.evaluate(()=>{
    const gl=document.querySelector('#pr-world').getContext('webgl');window.machineReplayContext=gl.getExtension('WEBGL_lose_context');
    if(!window.machineReplayContext)throw Error('WebGL context service unavailable');window.machineReplayContext.loseContext();
  });
  await viewer.waitForTimeout(150);const lost=await json(pr(viewer,'telemetry'));
  await viewer.evaluate(()=>window.machineReplayContext.restoreContext());
  await viewer.waitForFunction(()=>!document.querySelector('#pr-play').disabled);
  assert.equal((await json(pr(viewer,'telemetry'))).tick,lost.tick);assert.equal(await raw(viewer),liveRaw);
  scenarios.push('The actual browser WebGL context can be lost/restored while the viewer preserves its reconstructed build and paused accepted tick');

  const malformed=[
    ['different-source',{...recording.data,revision:'0'.repeat(40)}],
    ['different-recipe',{...recording.data,recipeDigest:'f'.repeat(64)}],
    ['different-result',{...recording.data,result:{...recording.data.result,metrics:{...recording.data.result.metrics,accelerationSeconds:recording.data.result.metrics.accelerationSeconds+1}}}],
    ['diagnostic-receipt',stockReceipt.data]
  ];
  for(const [name,data]of malformed){
    await pr(viewer,'file').setInputFiles({name:name+'.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
    await replayPhase(viewer,'rejected');assert(await pr(viewer,'play').isDisabled());
    rejections.push({name,status:await pr(viewer,'status').textContent()});assert.equal(await raw(viewer),liveRaw);
  }
  scenarios.push('Native file admission rejects a different source, tampered recipe identity, fictional result and diagnostic receipt; no rejected file can start playback or mutate ownership');

  const theatre=await shared.newPage();await theatre.goto(new URL('replay-theatre.html',base).href);await stamp(theatre);
  await theatre.locator('#replay-file').setInputFiles({name:'v7-is-separate.json',mimeType:'application/json',buffer:Buffer.from(recording.text)});
  await theatre.waitForFunction(()=>document.querySelector('#replay-status').textContent.includes('Cannot play'));
  assert(await theatre.locator('#replay-play').isDisabled());assert.equal(await raw(theatre),liveRaw);
  scenarios.push('Historical Replay Theatre rejects the separate v7 contract rather than reinterpreting it as a published v2–v6 recording');

  // Both operations use ordinary controls. Preparing the partner confirmation
  // first lets its real whole-state commit overlap the read-only reconstruction.
  const partner=await shared.newPage();await partner.goto(new URL('index.html#garage',base).href);await stamp(partner);
  await garageReady(partner);await garage(partner,'bay-0').click();
  await parts(partner,'slot').selectOption('paint');await parts(partner,'part').selectOption('factory');
  await review(partner,parts(partner,'review'));
  await page.bringToFront();await page.locator('#garage-machine-verify').click();
  await page.waitForFunction(()=>document.querySelector('#garage-machine-status').textContent.startsWith('Reconstructing '));
  const pendingEvidence=await page.locator('#garage-machine-status').textContent();
  await partner.bringToFront();await confirm(partner);
  await page.waitForFunction(()=>document.querySelector('#garage-status').textContent==='CONFLICT');
  await page.bringToFront();await page.waitForTimeout(500);
  assert(await page.locator('#garage-machine-verify').isDisabled(),'A stale continuation cannot re-enable evidence verification after a real second-tab commit');
  assert.equal(await page.locator('#garage-machine-results').textContent(),'','A stale reconstruction cannot publish an old comparison table');
  const conflictingStatus=await page.locator('#garage-machine-status').textContent();
  const concurrentGarage=await saved(partner);assert.equal(concurrentGarage.credits,350);
  assert.equal(concurrentGarage.bays[0].ownedVehicleId,'car-000001');assert.equal(concurrentGarage.bays[0].build.parts.paint,'factory');
  await garage(page,'reload').click();await garageReady(page);await garage(page,'bay-0').click();
  assert.deepEqual(await saved(page),concurrentGarage);assert.equal(await page.locator('#garage-machine-results').textContent(),'');
  await page.locator('#garage-machine-verify').click();
  await page.waitForFunction(()=>document.querySelector('#garage-machine-status').textContent.startsWith('Verified '),null,{timeout:120000});
  assert.equal(await page.locator('#garage-machine-comparisons table tbody tr').count(),4);
  const concurrentVerification={pendingEvidence,conflictingStatus,garage:concurrentGarage};
  await partner.close();
  scenarios.push('A real second-tab paid paint refit cancels an in-flight evidence reconstruction; CONFLICT keeps Verify disabled and results empty until explicit Reload and a fresh verification');


  runtime=await viewer.evaluate(()=>{
    const gl=document.querySelector('#pr-world').getContext('webgl'),info=gl.getExtension('WEBGL_debug_renderer_info');
    return {browser:navigator.userAgent,renderer:info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),viewport:{width:innerWidth,height:innerHeight}};
  });
  assert.deepEqual(errors,[]);
  const report={version:1,source,browser:browser.version(),runtime,url:base.href,scenarios,purchasedGarage:bought,
    engineGarage,stockResult,engineResult,recording:recording.data,
    comparisons:Object.fromEntries(Object.entries(comparisons).map(([key,value])=>[key,{...value,results:value.results.map(compactReceipt)}])),
    fittedGarage:fitted,concurrentVerification,replay:{midpoint,terminal,contextLost:lost},rejections,captures,downloads,
    requests:requests.length,externalRequests:requests.filter(url=>!url.startsWith(base.href)&&!url.startsWith('blob:')&&!url.startsWith('data:')),errors,
    limitations:['Chrome SwiftShader functionality only; no native GPU frame-time certification.',
      'WebGL context loss is an explicit browser-service condition. Accepted builds, ownership, prices, motion, comparisons and replays are created through production controls.',
      'Negative imported files derive from native production exports solely to exercise strict rejection.']};
  if(evidence)await writeFile(join(evidence,'machine-shop-browser.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({source,browser:browser.version(),scenarios:scenarios.length,recordingVersion:recording.data.version,
    ownedVehicleId:recording.data.ownedVehicleId,stockAccelerationSeconds:stockResult.metrics.accelerationSeconds,
    engineAccelerationSeconds:engineResult.metrics.accelerationSeconds,fittedCredits:fitted.credits,finalCredits:concurrentGarage.credits,replayTicks:terminal.tick,errors},null,2));
}catch(error){
  if(evidence&&diagnosticPage&&!diagnosticPage.isClosed()){
    await diagnosticPage.screenshot({path:join(evidence,'machine-shop-failure.png'),fullPage:true}).catch(()=>{});
    const state=await diagnosticPage.evaluate(()=>({url:location.href,status:document.querySelector('#pg-status')?.textContent||document.querySelector('#pr-status')?.textContent,
      garageStatus:document.querySelector('#garage-status')?.textContent,message:document.querySelector('#garage-message')?.textContent,
      telemetry:document.querySelector('#pg-telemetry')?.textContent||document.querySelector('#pr-telemetry')?.textContent})).catch(()=>null);
    await writeFile(join(evidence,'machine-shop-failure.json'),JSON.stringify({source,error:String(error),scenarios,state,errors},null,2)+'\n');
  }
  throw error;
}finally{await browser.close();}
