// SPDX-License-Identifier: Apache-2.0
// Platform adapter only: accepted physics and measurements live in proving-ground.js.
import {FixedClock} from '../vendor/vanillajs/modules/time/index.js';
import {attachDriverInput} from './driver-input.js';
import {savedMapper} from './profiles.js';
import {TouringAudio} from './audio.js';
import {createGarageVault} from './garage-vault.js';
import {GARAGE_CATALOG,garageModel} from './garage-catalog.js';
import {PART_SLOTS,vehicleParts} from './vehicle-parts.js';
import {admitProvingSelection} from './proving-ground-admission.js';
import {createProvingRun,startProvingRun,stepProvingRun,stopProvingRun,referenceProvingCommand,provingReceipt,PROVING_STEP} from './proving-ground.js';
import {createProvingScene} from './proving-ground-scene.js';
import {createProvingRecording,serializeProvingReplay} from './proving-replay.js';
import {retainWorkshopRecording} from './workshop-evidence.js';

const $=id=>document.getElementById('pg-'+id);
const sourceRevision=document.querySelector('meta[name="game-revision"]').content||null;
const clock=new FixedClock({step:PROVING_STEP,maxFrame:.1,maxSteps:6});
const audio=new TouringAudio(),reduced=matchMedia('(prefers-reduced-motion: reduce)');
let run=null,accepted=null,scene=null,paused=true,lost=false,dirty=false,stale=false;
let generation=0,comparing=false,sound=false,wallTimeDropped=0,disposed=false;
let acceptedGarageText=null;
function status(message){$('status').textContent=message;}
function running(){return !!run&&run.phase==='running'&&!paused&&!lost&&!dirty&&!stale&&!comparing;}
function pause(message){
  paused=true;clock.setPaused(true);input.clear();audio.stop();
  if(message)status(message);instruments();
}
const input=attachDriverInput(window,running,action=>{
  if(action==='pause'){pause('Paused. Arm with fresh controls to continue.');return true;}
  if(action==='confirm'){arm();return true;}
  // A throttle key cannot implicitly arm this separate test facility.
  return false;
},reason=>pause(reason),$('touch'));
const vault=createGarageVault({onChange:view=>{
  if(accepted?.ownedVehicleId&&(['CONFLICT','STORAGE UNAVAILABLE'].includes(view.status)||
      view.status==='SAVED'&&JSON.stringify(view.state)!==acceptedGarageText)){
    stale=true;generation++;comparing=false;pause('Garage changed or became unavailable. Load the saved build again.');
  }
}});
function option(select,value,label){const node=document.createElement('option');node.value=value;node.textContent=label;select.append(node);}
for(const model of GARAGE_CATALOG)option($('stock-model'),model.modelId,model.displayName);
for(const slot of PART_SLOTS)option($('proposed-slot'),slot,slot);
function parts(){
  $('proposed-part').replaceChildren();
  for(const part of vehicleParts($('proposed-slot').value))option($('proposed-part'),part.id,part.name);
}
parts();$('proposed-part').value='street';
function refreshOwnership(view){
  const previous=$('owned').value;$('owned').replaceChildren();option($('owned'),'','Free catalogue simulation');
  if(view.status==='SAVED'&&!view.migrationRequired)for(const car of view.state?.bays??[]){
    if(car)option($('owned'),car.ownedVehicleId,garageModel(car.modelId).displayName+' · '+car.ownedVehicleId);
  }
  if([...$('owned').options].some(item=>item.value===previous))$('owned').value=previous;
}
function selection(mode=$('build-mode').value){
  return {mode,ownedVehicleId:$('owned').value||null,modelId:$('stock-model').value,
    slot:mode==='proposed'?$('proposed-slot').value:null,partId:mode==='proposed'?$('proposed-part').value:null};
}
function syncSelection(){
  $('proposal').hidden=$('build-mode').value!=='proposed';
  $('stock-model').disabled=$('build-mode').value==='current';
}
function changed(){
  generation++;comparing=false;dirty=true;pause('Selection changed. Load the selected build before driving.');syncSelection();
}
function makeScene(){
  scene?.dispose();scene=null;
  try{scene=createProvingScene($('world'),run,Math.min(2,devicePixelRatio||1));}
  catch(error){status('Graphics unavailable: '+error.message+'. Tests and receipt export remain available.');}
}
function load(){
  generation++;comparing=false;pause();
  const view=vault.load();refreshOwnership(view);
  try{
    if($('owned').value&&view.status!=='SAVED')throw Error('Reload or migrate your garage before owned-car admission.');
    accepted=admitProvingSelection(view.state,selection());
    acceptedGarageText=accepted.ownedVehicleId?JSON.stringify(view.state):null;
    run=createProvingRun({...accepted,sourceRevision,testId:$('test').value,driver:$('driver').value,seed:0});
    dirty=false;stale=false;wallTimeDropped=0;clock.reset();clock.setPaused(true);
    $('identity').textContent=garageModel(accepted.modelId).displayName+' · '+(accepted.ownedVehicleId??'No owned ID')+
      ' · '+accepted.scope+(accepted.garageRevision===null?'':' · saved revision '+accepted.garageRevision);
    makeScene();
    if(scene)status('Accepted build ready. Arm controls to start.');
  }catch(error){run=null;accepted=null;scene?.dispose();scene=null;status('Admission rejected: '+error.message);}
  instruments();
}
function arm(){
  if(!run||dirty||stale||lost||comparing||run.phase==='finished')return;
  if(running()){pause('Paused. Arm with fresh controls to continue.');return;}
  if(!input.canStart()){status('Release controller controls to neutral before arming.');return;}
  input.clear();
  if(run.phase==='ready')startProvingRun(run);
  paused=false;clock.setPaused(false);status('Running · '+run.driver+' · '+run.testId);
  $('world').focus({preventScroll:true});
  if(sound)audio.start().then(ok=>{if(!ok){sound=false;syncSound();}if(!running())audio.stop();});
  instruments();
}
function instruments(){
  $('arm').disabled=!run||dirty||stale||lost||comparing||run.phase==='finished';
  $('arm').textContent=running()?'Pause test':run?.phase==='running'?'Resume · fresh controls':'Arm controls';
  $('compare').disabled=comparing||$('test').value==='practice';
  $('export').disabled=!run?.result||!sourceRevision;
  $('record').disabled=!run?.result||!sourceRevision;
  $('finish').disabled=!run||run.phase!=='running'||run.ticks<1||comparing;
  $('result').textContent=JSON.stringify(run?.result??null,null,2);
  if(!run){
    $('telemetry').textContent='null';$('identity').textContent='';$('tick').textContent='0';$('speed').textContent='0';
    document.body.dataset.phase='rejected';document.body.dataset.tick='0';return;
  }
  const v=run.vehicle;
  $('tick').textContent=String(run.ticks);$('speed').textContent=(Math.hypot(v.velocity[0],v.velocity[2])*3.6).toFixed(1);
  $('telemetry').textContent=JSON.stringify({phase:run.phase,paused,ticks:run.ticks,position:v.position,velocity:v.velocity,
    angularVelocity:v.angularVelocity,steering:v.steering,gear:v.gear,rpm:v.rpm,modelId:run.modelId,
    ownedVehicleId:run.ownedVehicleId,buildMode:accepted.mode,driver:run.driver,diagnostics:run.diagnostics,
    wallTimeDroppedSeconds:wallTimeDropped},null,2);
  document.body.dataset.phase=paused?'paused':run.phase;document.body.dataset.tick=String(run.ticks);
}
function syncSound(){ $('sound').textContent=sound?'Sound on':'Sound off';$('sound').setAttribute('aria-pressed',String(sound)); }
function fixedUpdate(){
  if(!running())return;
  const sample=input.sample();
  if(!running())return;
  if(sample.camera)$('camera').value=$('camera').value==='chase'?'high':'chase';
  const command=run.driver==='reference'?referenceProvingCommand(run):sample.command;
  stepProvingRun(run,command);
  if(run.phase==='finished')pause('Test '+run.result.status+' · '+run.result.reason+'. Reset or load another test.');
}
async function compare(){
  pause();const token=++generation;comparing=true;instruments();$('comparison').textContent='null';$('measurements').replaceChildren();
  try{
    if(!sourceRevision)throw Error('Use a source-stamped standalone package for attributable comparisons.');
    const testId=$('test').value;if(testId==='practice')throw Error('Choose one of the four measured tests.');
    const view=vault.load(),chosen=selection();
    if(chosen.ownedVehicleId&&view.status!=='SAVED')throw Error('Reload a valid saved garage first.');
    const results=[];let evidenceError=null;
    const modes=chosen.ownedVehicleId?['stock','current','proposed']:['stock','proposed'];
    for(const mode of modes){
      const proposed={...chosen,mode,slot:mode==='proposed'?$('proposed-slot').value:null,
        partId:mode==='proposed'?$('proposed-part').value:null};
      const admission=admitProvingSelection(view.state,proposed);
      const test=createProvingRun({...admission,sourceRevision,testId,driver:'reference',seed:0});startProvingRun(test);
      while(test.phase==='running'){
        if(token!==generation||disposed)return;
        for(let i=0;i<120&&test.phase==='running';i++)stepProvingRun(test,referenceProvingCommand(test));
        status('Measuring '+mode+' · '+testId+' · '+test.ticks+' accepted ticks');
        await new Promise(resolve=>setTimeout(resolve,0));
      }
      const receipt=await provingReceipt(test);if(token!==generation||disposed)return;
      results.push({...receipt,mode,scope:admission.scope,garageRevision:admission.garageRevision});
      try{const recording=await createProvingRecording(test,{yieldTask:()=>new Promise(resolve=>setTimeout(resolve,0)),cancelled:()=>token!==generation||disposed});if(token!==generation||disposed)return;retainWorkshopRecording(recording,mode);}
      catch(error){if(token!==generation||disposed)return;evidenceError=error.message;}
    }
    if(token!==generation||disposed)return;
    $('comparison').textContent=JSON.stringify({testId,comparisonPolicy:results[0].comparison,results},null,2);
    const [key,label,unit]={acceleration:['accelerationSeconds','0–100 km/h','s'],braking:['brakingDistanceM','Reached 100 to stop','m'],
      slalom:['slalomSeconds','Six-gate slalom','s'],handling:['handlingSeconds','Constant-radius handling','s']}[testId];
    const table=document.createElement('table'),caption=table.createCaption();caption.textContent=label+' · measured';
    const head=table.createTHead().insertRow();
    for(const text of ['Configuration','Outcome','Ticks']){const cell=document.createElement('th');cell.scope='col';cell.textContent=text;head.append(cell);}
    const body=table.createTBody();
    for(const receipt of results){
      const row=body.insertRow(),metric=receipt.result.metrics[key];
      for(const text of [receipt.mode,receipt.result.status==='completed'&&metric!==null?metric.toFixed(3)+' '+unit:receipt.result.status+' · '+receipt.result.reason,String(receipt.acceptedTicks)])row.insertCell().textContent=text;
    }
    $('measurements').append(table);
    status(evidenceError?'Comparison complete. Temporary evidence unavailable: '+evidenceError:
      'Comparison complete. Return to The Garage and verify measured tests to inspect these exact builds.');
  }catch(error){if(token===generation&&!disposed)status('Comparison rejected: '+error.message);}
  finally{if(token===generation&&!disposed){comparing=false;instruments();}}
}
$('load').onclick=$('reset').onclick=load;$('arm').onclick=arm;$('compare').onclick=compare;
$('finish').onclick=()=>{if(run?.phase==='running'&&run.ticks>0){pause();stopProvingRun(run);status('Run stopped. The accepted outcome and commands can be recorded.');instruments();}};
$('build-mode').onchange=changed;
$('owned').onchange=()=>{
  const car=vault.view.state?.bays.find(car=>car?.ownedVehicleId===$('owned').value);
  if(car)$('stock-model').value=car.modelId;else if($('build-mode').value==='current')$('build-mode').value='stock';
  changed();
};
$('stock-model').onchange=()=>{$('owned').value='';changed();};
$('proposed-slot').onchange=()=>{parts();changed();};
for(const id of ['proposed-part','test','driver'])$(id).onchange=changed;
$('input').onchange=()=>{
  pause('Input changed. Arm fresh controls.');const kind=$('input').value;
  let ok;if(kind==='gamepad'){
    const pad=input.pads.devices()[0];ok=!!pad&&input.select(kind,pad.index,savedMapper(pad)??undefined);
  }else ok=input.select(kind);
  if(!ok){status('Selected input unavailable. Keyboard remains available.');input.select('keyboard');$('input').value='keyboard';}
  $('touch').hidden=input.source!=='touch';
};
$('sound').onclick=()=>{sound=!sound;syncSound();if(!sound)audio.stop();else if(running())audio.start();};
$('export').onclick=async()=>{
  const completed=run,attribution=accepted;
  try{
    const receipt=await provingReceipt(completed),text=JSON.stringify({...receipt,mode:attribution.mode,scope:attribution.scope},null,2);
    const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),link=document.createElement('a');
    link.href=url;link.download='circuit-overdrive-'+receipt.modelId+'-'+receipt.testId+'-receipt.json';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),0);
  }catch(error){status('Receipt rejected: '+error.message);}
};
$('record').onclick=async()=>{
  const completed=run,attribution=accepted;
  try{
    const recording=await createProvingRecording(completed,{yieldTask:()=>new Promise(resolve=>setTimeout(resolve,0))}),text=serializeProvingReplay(recording);
    const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),link=document.createElement('a');
    link.href=url;link.download='circuit-overdrive-'+recording.modelId+'-proving-v7.json';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),0);
    try{retainWorkshopRecording(recording,attribution.mode);}catch(error){status('Recording exported. Temporary workshop evidence unavailable: '+error.message);}
  }catch(error){status('Recording rejected: '+error.message);}
};
window.addEventListener('blur',()=>pause('Focus lost. Arm with fresh controls to continue.'));
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause('Page hidden. Arm with fresh controls to continue.');});
$('touch').addEventListener('pointercancel',()=>pause('Touch cancelled. Arm with fresh controls.'));
$('world').addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;pause('Graphics context lost. Simulation paused.');});
$('world').addEventListener('webglcontextrestored',()=>{lost=false;if(run)makeScene();pause('Graphics restored. Arm with fresh controls.');});
window.addEventListener('pagehide',event=>{
  generation++;comparing=false;pause();
  if(!event.persisted){disposed=true;scene?.dispose();vault.dispose();}
});
window.addEventListener('pageshow',event=>{if(event.persisted){vault.load();pause('Page restored. Reload any changed build and arm fresh controls.');}});
let prior=null;
function frame(now){
  if(disposed)return;
  const elapsed=prior===null?0:Math.max(0,(now-prior)/1000);prior=now;
  if(!running())input.menu();
  let alpha=1;
  if(running()){
    const progress=clock.advance(elapsed,fixedUpdate);alpha=progress.alpha;wallTimeDropped+=progress.dropped;
    if(sound&&!audio.update({vehicle:run.vehicle,current:{s:-run.vehicle.position[2]}},run.lastCommand,{id:'proving-ground'})){
      sound=false;syncSound();audio.stop();
    }
  }
  if(scene&&run&&!lost)try{scene.draw(run,{alpha,camera:$('camera').value,reducedMotion:reduced.matches});}
  catch(error){scene.dispose();scene=null;pause('Rendering stopped: '+error.message);}
  instruments();requestAnimationFrame(frame);
}
const view=vault.load();refreshOwnership(view);
const requested=new URLSearchParams(location.search).get('vehicle');
const requestedAvailable=!requested||[...$('owned').options].some(option=>option.value===requested);
if(requested&&requestedAvailable)$('owned').value=requested;
else if(view.status==='SAVED'&&view.state?.activeVehicleId)$('owned').value=view.state.activeVehicleId;
if(!$('owned').value)$('build-mode').value='stock';
const car=view.state?.bays.find(car=>car?.ownedVehicleId===$('owned').value);if(car)$('stock-model').value=car.modelId;
syncSelection();
if(requestedAvailable)load();else{status('Admission rejected: requested owned vehicle is unavailable. Choose a valid saved car or free simulation.');instruments();}
requestAnimationFrame(frame);
