// SPDX-License-Identifier: Apache-2.0
// Drive the production page through its controls. Instruments and native exports
// are read-only evidence; this runner never injects a garage, build or vehicle state.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=new URL(process.argv[2] || 'http://127.0.0.1:8768/Circuit-Overdrive/');
const evidence=process.env.EVIDENCE_DIR;
if(evidence)await mkdir(evidence,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN || undefined,
  args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const slot='circuit-overdrive.garage.v1',errors=[],requests=[],scenarios=[],captures=[],downloads=[];
const engineRevision='9d95d74b355ec17add32db0b55f0f71130f9c004';
const garage=(page,id)=>page.locator('#garage-'+id);
const parts=(page,id)=>page.locator('#garage-parts-'+id);
const pg=(page,id)=>page.locator('#pg-'+id);
const hash=data=>createHash('sha256').update(data).digest('hex');
const raw=page=>page.evaluate(key=>localStorage.getItem(key),slot);
const json=async locator=>JSON.parse(await locator.textContent());
const telemetry=page=>json(pg(page,'telemetry'));
const horizontalSpeed=t=>Math.hypot(t.velocity[0],t.velocity[2]);
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
let source,runtime,diagnosticPage;

async function context(){
  const result=await browser.newContext({viewport:{width:1440,height:1080},acceptDownloads:true});
  result.on('page',page=>{
    page.on('pageerror',error=>errors.push(error.message));
    page.on('response',response=>{if(response.status()>=400)errors.push(response.status()+' '+response.url());});
  });
  await result.route('**/*',route=>{
    const url=route.request().url();requests.push(url);
    if(url.startsWith(base.href)||url.startsWith('blob:')||url.startsWith('data:'))return route.continue();
    errors.push('Unexpected request '+url);return route.abort();
  });
  return result;
}
async function stamp(page){
  const value=await page.locator('meta[name="game-revision"]').getAttribute('content');
  assert.match(value,/^[0-9a-f]{40}$/,'Browser acceptance requires the actual source-stamped package');
  if(process.env.SOURCE_SHA)assert.equal(value,process.env.SOURCE_SHA);
  source??=value;assert.equal(value,source);return value;
}
async function openGarage(context){
  const page=await context.newPage();await page.goto(base.href);await stamp(page);
  await page.locator('#enter-garage:enabled').click();
  await page.waitForSelector('body[data-phase="garage"]');return page;
}
async function status(page,text){
  await page.waitForFunction(text=>document.querySelector('#garage-status').textContent===text,text);
}
async function review(page,locator){
  const before=await raw(page);await locator.click();
  await garage(page,'confirmation').waitFor({state:'visible'});
  assert.equal(await raw(page),before,'Reviewing a proposed transaction never changes the accepted save');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'garage-cancel');
}
async function confirm(page){
  await garage(page,'confirm').click();
  await page.waitForFunction(()=>document.querySelector('#garage').dataset.busy==='false');
  await garage(page,'confirmation').waitFor({state:'hidden'});await status(page,'SAVED');
}
async function commit(page,id){await review(page,garage(page,id));await confirm(page);}
async function fit(page,category,id){
  await parts(page,'slot').selectOption(category);await parts(page,'part').selectOption(id);
  await review(page,parts(page,'review'));await confirm(page);
}
async function capture(page,name,{canvas=false}={}){
  if(!evidence)return;
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const file=name+'.png',path=join(evidence,file);
  if(canvas)await pg(page,'world').screenshot({path});else await page.screenshot({path,fullPage:true});
  captures.push({file,sha256:hash(await readFile(path))});
}
async function admitted(page){
  await pg(page,'telemetry').waitFor({state:'attached'});
  await page.waitForFunction(()=>{
    try {const t=JSON.parse(document.querySelector('#pg-telemetry').textContent);return t.position?.length===3&&t.ticks===0&&t.paused;}
    catch{return false;}
  });
  const t=await telemetry(page);finite(t);return t;
}
async function load(page,{mode='current',model='cinder-two',test='practice',driver='manual',part}={}){
  await pg(page,'build-mode').selectOption(mode);
  if(mode==='stock')await pg(page,'stock-model').selectOption(model);
  if(part){await pg(page,'proposed-slot').selectOption(part.slot);await pg(page,'proposed-part').selectOption(part.id);}
  await pg(page,'test').selectOption(test);await pg(page,'driver').selectOption(driver);
  await pg(page,'load').click();return admitted(page);
}
function finite(t){
  assert(Number.isSafeInteger(t.ticks)&&t.ticks>=0);
  for(const field of ['position','velocity','angularVelocity']){
    assert.equal(t[field].length,3);assert(t[field].every(Number.isFinite),'Accepted '+field+' remains finite');
  }
}
async function ticks(page,min){
  await page.waitForFunction(min=>{
    try{return JSON.parse(document.querySelector('#pg-telemetry').textContent).ticks>=min;}catch{return false;}
  },min,{timeout:30000});
  const t=await telemetry(page);finite(t);return t;
}
async function stable(page){
  const before=await telemetry(page);await page.waitForTimeout(220);
  const after=await telemetry(page);assert.equal(after.ticks,before.ticks,'Paused rendering cannot advance accepted simulation');
  assert.deepEqual(after.position,before.position);return after;
}
async function compare(page,test){
  await pg(page,'test').selectOption(test);await pg(page,'compare').click();
  await page.waitForFunction(test=>{
    try {const r=JSON.parse(document.querySelector('#pg-comparison').textContent);return r.testId===test&&Array.isArray(r.results)&&r.results.length>=2;}
    catch{return false;}
  },test,{timeout:120000});
  const report=await json(pg(page,'comparison'));
  for(const receipt of report.results)receiptIdentity(receipt,test);
  return report;
}
function receiptIdentity(receipt,test){
  assert.equal(receipt.sourceRevision,source);
  assert.equal(receipt.engineRevision,engineRevision);
  assert.equal(receipt.trackId,'machine-test-facility-v1');
  assert.equal(receipt.rulesVersion,1);assert.equal(receipt.buildRulesVersion,receipt.build.rulesVersion);
  assert.equal(receipt.buildRulesVersion,receipt.mode==='stock'?1:2);
  assert.equal(receipt.seed,0);assert.equal(receipt.step,1/60);
  assert.equal(receipt.modelId,'cinder-two');
  assert.equal(receipt.testId,test);
  assert.match(receipt.buildDigest,/^[0-9a-f]{64}$/);
  assert.match(receipt.recipeDigest,/^[0-9a-f]{64}$/);
  assert(Number.isSafeInteger(receipt.acceptedTicks)&&receipt.acceptedTicks>0);
  assert(receipt.result&&typeof receipt.result==='object');
  assert.equal(receipt.result.status,'completed','The production reference policy must complete '+test);
  assert.equal(receipt.result.acceptedTicks,receipt.acceptedTicks);
  assert.equal(receipt.commandsRLE.reduce((sum,command)=>sum+command.ticks,0),receipt.acceptedTicks);
  assert.equal(receipt.result.diagnostics.solverTruncated,false);
  assert.equal(receipt.result.diagnostics.needsRecovery,false);
  const metric={acceleration:'accelerationSeconds',braking:'brakingDistanceM',slalom:'slalomSeconds',handling:'handlingSeconds'}[test];
  assert(Number.isFinite(receipt.result.metrics[metric])&&receipt.result.metrics[metric]>0);
  if(test==='slalom')assert.equal(receipt.result.gatesPassed,6);
  if(test==='handling')assert.equal(receipt.result.gatesPassed,8);
  for(const field of ['position','velocity','orientation','angularVelocity'])assert(receipt.terminalState[field].every(Number.isFinite));
}
async function exported(page){
  const pending=page.waitForEvent('download');await pg(page,'export').click();
  const file=await pending;assert.equal(await file.failure(),null);
  const text=await readFile(await file.path(),'utf8');
  const name='proving-ground-receipt-'+String(downloads.length+1).padStart(2,'0')+'.json';
  downloads.push({file:name,suggestedFilename:file.suggestedFilename(),bytes:Buffer.byteLength(text),sha256:hash(text)});
  if(evidence)await writeFile(join(evidence,name),text);return JSON.parse(text);
}

try{
  const shared=await context(),page=await openGarage(shared);
  diagnosticPage=page;
  assert.equal(await raw(page),null);await commit(page,'create');
  await garage(page,'model-cinder-two').click();await commit(page,'buy');await garage(page,'bay-0').click();
  const bought=JSON.parse(await raw(page));assert.equal(bought.garage.credits,1800);
  assert.equal(bought.garage.bays[0].ownedVehicleId,'car-000001');
  await fit(page,'engine','street');
  const savedRaw=await raw(page),installed=JSON.parse(savedRaw);
  assert.equal(installed.garage.credits,1530);assert.equal(installed.garage.revision,2);
  assert.equal(installed.garage.bays[0].ownedVehicleId,'car-000001');
  assert.equal(installed.garage.bays[0].build.parts.engine,'street');
  const testDrive=page.locator('#garage-test-drive');
  assert.equal(new URL(await testDrive.getAttribute('href'),base).searchParams.get('vehicle'),'car-000001');
  await testDrive.click();await page.waitForURL('**/proving-ground.html?vehicle=car-000001');await stamp(page);
  let t=await admitted(page);assert.equal(t.ownedVehicleId,'car-000001');assert.equal(t.modelId,'cinder-two');
  assert.equal(t.buildMode,'current');assert.equal(await raw(page),savedRaw);
  scenarios.push('Real create, Cinder purchase and confirmed street-engine installation; selected owned ID enters the facility with the exact accepted saved build');
  runtime=await page.evaluate(()=>{
    const gl=document.querySelector('#pg-world').getContext('webgl'),debug=gl.getExtension('WEBGL_debug_renderer_info');
    return {browser:navigator.userAgent,webLocks:typeof navigator.locks?.request==='function',
      renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
      viewport:{width:innerWidth,height:innerHeight}};
  });

  const start=t.position.slice();await pg(page,'arm').click();await page.keyboard.down('w');
  t=await ticks(page,95);assert(horizontalSpeed(t)>3);assert(distance(start,t.position)>2);
  const straight=t.position.slice();await page.keyboard.down('a');t=await ticks(page,t.ticks+65);
  await page.keyboard.up('a');await page.keyboard.up('w');
  assert(Math.abs(t.position[0]-straight[0])>.05,'Actual accepted chassis responds laterally to a fresh steering command');
  await capture(page,'owned-cinder-manual-drive',{canvas:true});
  const manual={start,terminal:t};await pg(page,'arm').click();await stable(page);
  scenarios.push('Fresh keyboard throttle and steering move the actual owned chassis through normal animation frames; pause freezes accepted ticks');

  await load(page);await pg(page,'arm').click();await page.keyboard.down('w');await ticks(page,65);
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await page.waitForFunction(()=>JSON.parse(document.querySelector('#pg-telemetry').textContent).paused);
  await page.keyboard.up('w');const blurred=await stable(page);
  await pg(page,'arm').click();t=await ticks(page,blurred.ticks+45);
  assert(horizontalSpeed(t)<=horizontalSpeed(blurred)+.1,'Resume cannot reapply throttle released off-window');
  const resumedNeutral=t;
  const neutralSpeed=horizontalSpeed(t);await page.keyboard.down('w');t=await ticks(page,t.ticks+45);
  await page.keyboard.up('w');assert(horizontalSpeed(t)>neutralSpeed+.5,'Fresh input can drive after blur neutralization');
  await pg(page,'arm').click();await stable(page);
  scenarios.push('Held key → blur → off-window release pauses and clears driving; resume stays neutral until a fresh key press');

  await load(page);await pg(page,'arm').click();await page.keyboard.down('w');await ticks(page,45);
  const beforeLoss=await telemetry(page);
  await page.evaluate(()=>{
    const gl=document.querySelector('#pg-world').getContext('webgl');
    window.provingContextService=gl.getExtension('WEBGL_lose_context');
    if(!window.provingContextService)throw Error('WEBGL_lose_context unavailable');
    window.provingContextService.loseContext();
  });
  await page.waitForFunction(()=>JSON.parse(document.querySelector('#pg-telemetry').textContent).paused);
  await page.keyboard.up('w');const lost=await stable(page);
  assert(lost.ticks>=beforeLoss.ticks);assert.equal(lost.ownedVehicleId,'car-000001');
  await page.evaluate(()=>window.provingContextService.restoreContext());
  await pg(page,'arm').waitFor({state:'visible'});
  await page.waitForFunction(()=>!document.querySelector('#pg-arm').disabled);
  const restored=await stable(page);assert.equal(restored.ticks,lost.ticks);
  await pg(page,'arm').click();t=await ticks(page,restored.ticks+35);
  assert(horizontalSpeed(t)<=horizontalSpeed(restored)+.1,'Restored renderer cannot restore a stale held throttle');
  await pg(page,'arm').click();assert.equal(await raw(page),savedRaw);
  scenarios.push('Actual WebGL context loss/restoration preserves accepted owned state, pauses physics and requires fresh controls');

  await load(page,{mode:'proposed',part:{slot:'gearbox',id:'short'}});
  const comparisons={};
  for(const test of ['acceleration','braking','slalom','handling']){
    comparisons[test]=await compare(page,test);assert.equal(await raw(page),savedRaw);
  }
  const acceleration=comparisons.acceleration;
  assert.deepEqual(new Set(acceleration.results.map(r=>r.mode)),new Set(['stock','current','proposed']));
  const stock=acceleration.results.find(r=>r.mode==='stock'),current=acceleration.results.find(r=>r.mode==='current');
  const proposed=acceleration.results.find(r=>r.mode==='proposed');
  assert.notEqual(stock.buildDigest,current.buildDigest);assert.notEqual(stock.recipeDigest,current.recipeDigest);
  assert.notEqual(proposed.recipeDigest,current.recipeDigest);
  assert(current.result.metrics.accelerationSeconds<stock.result.metrics.accelerationSeconds,
    'The actually purchased engine must change measured motion and improve its declared acceleration target');
  assert.notEqual(proposed.result.metrics.accelerationSeconds,current.result.metrics.accelerationSeconds,
    'Short gearing changes physical acceleration under the identical command tape');
  assert.deepEqual(stock.commandsRLE,current.commandsRLE);assert.deepEqual(current.commandsRLE,proposed.commandsRLE);
  assert.equal(stock.acceptedTicks,900);assert.equal(current.acceptedTicks,900);assert.equal(proposed.acceptedTicks,900);
  await capture(page,'controlled-build-comparison');
  scenarios.push('Production stock/current/proposed reference comparisons run all four physical benchmarks; real fitted engine and sandbox short gearbox have distinct source-bound accepted recipes');

  // One reference run uses normal render timing and the same admission controls;
  // the comparison action above uses the production bounded asynchronous runner.
  await load(page,{test:'acceleration',driver:'reference'});await pg(page,'arm').click();
  await page.waitForFunction(()=>{
    try {const r=JSON.parse(document.querySelector('#pg-result').textContent);return r&&typeof r==='object'&&Object.keys(r).length>0;}
    catch{return false;}
  },null,{timeout:90000});
  const renderedResult=await json(pg(page,'result')),receipt=await exported(page);
  receiptIdentity(receipt,'acceleration');assert.deepEqual(receipt.result,renderedResult);
  assert.equal(receipt.ownedVehicleId,'car-000001');
  assert.equal(receipt.build.parts.engine,'street');
  assert.equal(receipt.buildDigest,current.buildDigest);assert.equal(receipt.recipeDigest,current.recipeDigest);
  assert.deepEqual(receipt.result,current.result,'Normal frame-timed driving reproduces the bounded comparison result');
  await capture(page,'owned-engine-acceleration-receipt');assert.equal(await raw(page),savedRaw);
  scenarios.push('A normal-frame reference acceleration completes and native export records its original saved build, source, commands and accepted terminal result');

  const stockAdmissions=[];
  for(const model of ['cinder-two','lilt','evening-line','rivet-eight','yardhand','glass-comet']){
    const initial=await load(page,{mode:'stock',model});assert.equal(initial.modelId,model);
    assert.equal(initial.ownedVehicleId,null,'Free stock simulations never fabricate ownership');
    await pg(page,'arm').click();await page.keyboard.down('w');const driven=await ticks(page,35);
    await page.keyboard.up('w');assert(horizontalSpeed(driven)>.5);assert(distance(initial.position,driven.position)>.1);
    await pg(page,'arm').click();stockAdmissions.push({model,initial,driven});assert.equal(await raw(page),savedRaw);
    if(model==='yardhand'||model==='glass-comet')await capture(page,'stock-'+model,{canvas:true});
  }
  scenarios.push('All six freely admitted catalogue stock models spawn their actual finite physical chassis and respond to live throttle without creating owned cars');

  await pg(page,'return').click();await page.waitForURL(new URL('index.html#garage',base).href);
  await page.waitForSelector('body[data-phase="garage"]');await status(page,'SAVED');
  assert.equal(await raw(page),savedRaw,'Every practice, comparison, proposal, reset, context recovery and export leaves the exact whole accepted save untouched');
  assert.deepEqual(JSON.parse(await raw(page)),installed);await garage(page,'bay-0').click();
  assert.match(await parts(page,'installed').textContent(),/^engine: Street rebuild/);
  scenarios.push('Return and reload preserve the exact serialized Vault envelope, credits, owned identity and fitted engine after every facility operation');

  assert.deepEqual(errors,[]);
  const report={version:1,source,browser:browser.version(),runtime,url:base.href,scenarios,
    purchasedGarage:installed,manual,blur:{paused:blurred,resumed:resumedNeutral},context:{lost,restored},
    comparisons,renderedResult,exportedReceipt:receipt,stockAdmissions,downloads,captures,
    requests:requests.length,externalRequests:requests.filter(url=>!url.startsWith(base.href)&&!url.startsWith('blob:')&&!url.startsWith('data:')),errors,
    limitations:['SwiftShader browser functionality only; this is not native GPU or frame-time certification.',
      'WebGL context loss and blur are synthetic browser-service conditions. Ownership, credits, builds, vehicle motion and benchmark outcomes always use production controls and simulation.',
      'The exported proving-ground receipt is diagnostic evidence; build-bound replay admission and playback are reserved for CO-014E.']};
  if(evidence)await writeFile(join(evidence,'proving-ground-browser.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({source,browser:browser.version(),scenarios:scenarios.length,
    ownedVehicleId:receipt.ownedVehicleId,acceptedTicks:receipt.acceptedTicks,
    accelerationSeconds:{stock:stock.result.metrics.accelerationSeconds,
      current:current.result.metrics.accelerationSeconds,proposed:proposed.result.metrics.accelerationSeconds},
    stockModels:stockAdmissions.length,credits:installed.garage.credits,errors},null,2));

  // These later transactions intentionally establish a new accepted save. The
  // first report above retains the exact-save-preservation journey separately.
  const followup={version:1,source,browser:browser.version(),scenarios:[]};
  await fit(page,'gearbox','short');
  const gearedRaw=await raw(page),geared=JSON.parse(gearedRaw);
  assert.equal(geared.garage.credits,1350);assert.equal(geared.garage.revision,3);
  assert.equal(geared.garage.bays[0].ownedVehicleId,'car-000001');
  assert.equal(geared.garage.bays[0].build.parts.engine,'street');
  assert.equal(geared.garage.bays[0].build.parts.gearbox,'short');
  assert.deepEqual(geared.garage.bays[0].build.inventory.gearbox,['short','stock']);
  await page.locator('#garage-test-drive').click();
  await page.waitForURL('**/proving-ground.html?vehicle=car-000001');await stamp(page);await admitted(page);
  const gearComparison=await compare(page,'acceleration');
  const actualGear=gearComparison.results.find(r=>r.mode==='current');
  assert.equal(actualGear.build.parts.gearbox,'short');assert.equal(actualGear.ownedVehicleId,'car-000001');
  assert.notEqual(actualGear.recipeDigest,current.recipeDigest);
  assert.notEqual(actualGear.result.metrics.accelerationSeconds,current.result.metrics.accelerationSeconds);
  assert.deepEqual(actualGear.commandsRLE,current.commandsRLE);assert.equal(actualGear.acceptedTicks,900);
  assert.equal(await raw(page),gearedRaw,'Testing the actually purchased gearbox cannot spend or install a further part');
  followup.gearbox={saved:geared,current:actualGear,engineOnlyAccelerationSeconds:current.result.metrics.accelerationSeconds};
  followup.scenarios.push('A second real purchase fits the short gearbox to the same owned car; its accepted 900-call physical result differs from the engine-only installed build');
  await capture(page,'installed-short-gearbox-comparison');

  await load(page);assert.equal(await pg(page,'arm').isEnabled(),true);
  const other=await openGarage(shared);await garage(other,'bay-0').click();await fit(other,'paint','seafoam');
  const changedRaw=await raw(other),changedGarage=JSON.parse(changedRaw);
  await page.waitForFunction(()=>/Garage changed|unavailable/i.test(document.querySelector('#pg-status').textContent));
  assert.equal(await pg(page,'arm').isDisabled(),true,'A stale owned snapshot cannot resume after another tab commits');
  await stable(page);assert.equal(await raw(page),changedRaw);
  await other.close();await page.bringToFront();await load(page);
  assert.equal(await pg(page,'arm').isEnabled(),true);
  assert.match(await pg(page,'identity').textContent(),new RegExp('saved revision '+changedGarage.garage.revision));
  followup.staleTab={saved:changedGarage,requiredExplicitLoad:true};
  followup.scenarios.push('A real second-tab paint transaction invalidates the admitted owned snapshot; explicit Load is required before driving the newly accepted save');

  await pg(page,'input').selectOption('touch');await pg(page,'arm').click();
  const pedal=pg(page,'touch').locator('[data-touch="throttle"]');await pedal.scrollIntoViewIfNeeded();
  const bounds=await pedal.boundingBox();assert(bounds);
  const cdp=await shared.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2}]});
  let touchDriven=await ticks(page,50);assert(horizontalSpeed(touchDriven)>1);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  await page.waitForFunction(()=>JSON.parse(document.querySelector('#pg-telemetry').textContent).paused);
  const touchCancelled=await stable(page);await pg(page,'arm').click();
  const touchResumed=await ticks(page,touchCancelled.ticks+35);
  assert(horizontalSpeed(touchResumed)<=horizontalSpeed(touchCancelled)+.1,'Cancelled touch cannot reapply its held pedal');
  await pg(page,'arm').click();await cdp.detach();assert.equal(await raw(page),changedRaw);
  followup.touch={driven:touchDriven,cancelled:touchCancelled,resumed:touchResumed};
  followup.scenarios.push('A browser-dispatched touch contact drives the actual car; native touch cancellation pauses and clears its pedal before neutral resume');

  await load(page);
  await page.evaluate(()=>{
    // Replace only the browser device service. The production mapper, neutral
    // arming, disconnection handling and physical update remain unchanged.
    window.provingGamepadService={connected:true,throttle:1};
    Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>{
      const service=window.provingGamepadService;
      return service.connected?[{index:0,id:'Proving Browser Standard Controller',mapping:'standard',connected:true,
        timestamp:1,axes:[0,0,0,0],buttons:Array.from({length:17},(_,i)=>({value:i===7?service.throttle:0,
          pressed:i===7&&service.throttle>.5,touched:i===7&&service.throttle>0}))}]:[];
    }});
  });
  await pg(page,'input').selectOption('gamepad');await pg(page,'arm').click();
  await page.waitForFunction(()=>/neutral/i.test(document.querySelector('#pg-status').textContent));
  assert.equal((await stable(page)).ticks,0,'A held virtual pedal cannot arm the stopped test');
  await page.evaluate(()=>{window.provingGamepadService.throttle=0;});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await pg(page,'arm').click();await ticks(page,12);
  await page.evaluate(()=>{window.provingGamepadService.throttle=1;});
  const padDriven=await ticks(page,65);assert(horizontalSpeed(padDriven)>1);
  await page.evaluate(()=>{window.provingGamepadService.connected=false;});
  await page.waitForFunction(()=>JSON.parse(document.querySelector('#pg-telemetry').textContent).paused);
  const disconnected=await stable(page);await pg(page,'arm').click();await stable(page);
  assert.equal(await raw(page),changedRaw);
  followup.controller={service:'Synthetic standard Gamepad API device; production mapping and driving path.',driven:padDriven,disconnected};
  followup.scenarios.push('Synthetic controller service proves neutral arming, live throttle and disconnect pause through the shared production input path');

  const invalid=await shared.newPage();
  await invalid.goto(new URL('proving-ground.html?vehicle=car-999999',base).href);await stamp(invalid);
  await invalid.waitForFunction(()=>/requested|owned|admission rejected/i.test(document.querySelector('#pg-status').textContent));
  assert.equal(await pg(invalid,'arm').isDisabled(),true);
  assert.equal(await pg(invalid,'telemetry').textContent(),'null','An invalid explicit owned ID cannot silently fall back to the active car');
  assert.equal(await raw(invalid),changedRaw);await invalid.close();
  followup.scenarios.push('An explicit unowned URL is rejected without silently substituting the active saved car');
  followup.finalGarage=changedGarage;followup.errors=errors;assert.deepEqual(errors,[]);
  followup.limitations=['Synthetic Gamepad API and browser touch dispatch test device-service lifecycle behavior; no vehicle state or outcome is injected.',
    'SwiftShader functional acceptance only; native hardware performance remains a separate release gate.'];
  if(evidence)await writeFile(join(evidence,'proving-ground-lifecycle-browser.json'),JSON.stringify(followup,null,2)+'\n');
  console.log(JSON.stringify({source,followupScenarios:followup.scenarios.length,
    installedGearboxAccelerationSeconds:actualGear.result.metrics.accelerationSeconds,
    finalCredits:changedGarage.garage.credits,errors},null,2));
  await shared.close();
}catch(error){
  const diagnostic={error:error.stack,source,scenarios,errors};
  if(diagnosticPage&&!diagnosticPage.isClosed()){
    diagnostic.page=await diagnosticPage.evaluate(()=>({url:location.href,
      status:document.querySelector('#pg-status')?.textContent,
      telemetry:document.querySelector('#pg-telemetry')?.textContent,
      result:document.querySelector('#pg-result')?.textContent,
      comparison:document.querySelector('#pg-comparison')?.textContent})).catch(()=>null);
    if(evidence)await diagnosticPage.screenshot({path:join(evidence,'proving-ground-failure.png'),fullPage:true,timeout:5000}).catch(()=>{});
  }
  if(evidence)await writeFile(join(evidence,'proving-ground-failure.json'),JSON.stringify(diagnostic,null,2)+'\n');
  console.error(JSON.stringify({error:error.message,url:diagnostic.page?.url,status:diagnostic.page?.status,
    telemetry:diagnostic.page?.telemetry,completedScenarios:scenarios.length,errors},null,2));
  throw error;
}finally{await browser.close();}
