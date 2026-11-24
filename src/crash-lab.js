// SPDX-License-Identifier: Apache-2.0
import {FixedClock} from '../vendor/vanillajs/modules/time/index.js';
import {attachDriverInput} from './driver-input.js';
import {savedMapper} from './profiles.js';
import {TouringAudio,DEFAULT_VOLUMES} from './audio.js';
import {crashRecorder,crashReceipt} from './crash-replay.js';
import {CrashVoice} from './crash-audio.js';
import {createCrashScene} from './crash-scene.js';
import {createTrial,startTrial,stepTrial,latestImpact,scenarios} from './crash-trial.js';
import {neutralLab,labCondition} from './crash-damage.js';

const $=id=>document.getElementById(id),canvas=$('lab-world');
const clock=new FixedClock({step:1/60,maxFrame:.1,maxSteps:6});
const stamp=document.querySelector('meta[name="game-revision"]').content||null;
const motion=matchMedia('(prefers-reduced-motion: reduce)');
const audio=new TouringAudio({voice:new CrashVoice()});
let trial,recorder,scene,paused=false,muted=false,lost=false,lastTime=null,tail=0;
const set=(id,text)=>{if($(id).textContent!==text)$(id).textContent=text;};
const status=text=>set('lab-status',text);
const running=()=>trial?.phase==='running' && !paused && !lost;
const input=attachDriverInput(window,running,action=>{
  if(action==='pause' && running()){pause('Paused');return true;}
  if(action==='confirm' && !running()){arm();return true;}
  return false;
},reason=>pause(reason),$('lab-touch'));
const hardware=['engine','steering','tyres','suspension'];
for(const name of hardware){
  const row=document.createElement('div'),label=document.createElement('span'),meter=document.createElement('meter');
  label.textContent=name[0].toUpperCase()+name.slice(1);meter.max=1000;meter.value=1000;
  meter.id='meter-'+name;meter.setAttribute('aria-label',name+' condition');
  const value=document.createElement('output');value.id='condition-'+name;
  row.append(label,meter,value);$('components').append(row);
}
let saved;
try{saved=JSON.parse(localStorage.getItem('circuit-overdrive.settings'));}catch{}
for(const [name,initial] of Object.entries(DEFAULT_VOLUMES)){
  const label=document.createElement('label'),slider=document.createElement('input');
  label.textContent=name[0].toUpperCase()+name.slice(1);slider.type='range';slider.min=0;slider.max=100;
  const v=saved?.volumes?.[name];slider.value=100*(Number.isFinite(v)&&v>=0&&v<=1?v:initial);
  const sync=()=>audio.setVolume(name,Number(slider.value)/100);sync();
  slider.addEventListener('input',sync);label.append(slider);$('lab-mixer').append(label);
}
function syncButtons(){
  $('lab-arm').disabled=lost || !scene || trial.phase==='finished';
  $('lab-save').disabled=$('lab-receipt').disabled=!stamp || trial.phase!=='finished';
  set('lab-export-note',stamp?'':'Replay export requires a source-stamped package.');
  set('lab-arm',running()?'Pause':paused?'Resume':'Arm controls');
  $('lab-touch').hidden=input.source!=='touch' || !running();
}
function dashboard(){
  const follow=Number($('lab-follow').value),car=trial.world.cars[follow],hit=latestImpact(trial,follow);
  set('lab-speed',String(Math.round(3.6*Math.hypot(car.vx,car.vz))));set('lab-tick',String(trial.world.tick));
  set('lab-contact',trial.lastContacts.length?'Resolved contact':'Clear');
  set('lab-strike',hit?(follow?'Player test car':scenarios[trial.scenario].target)+' · '+hit.sites.find(s=>s.id===follow).zone:'—');
  for(const [id,val,unit,scale,digits] of [
    ['relative','relativeSpeed','km/h',3.6,0],['closing','closing','m/s',1,1],['impulse','normalImpulse','N·s',1,0],
    ['tangent','tangentialImpulse','N·s',1,0],['energy','dissipated','kJ',.001,1]
  ]) set('lab-'+id,hit?(hit[val]*scale).toFixed(digits)+' '+unit:'—');
  set('lab-normal',hit?hit.normal.map(v=>v.toFixed(2)).join(' / '):'—');
  for(const name of hardware){
    const condition=1000-car.damage[name],meter=$('meter-'+name);
    if(meter.value!==condition)meter.value=condition;
    set('condition-'+name,Math.round(condition/10)+'%');
  }
  for(const zone of ['front','rear','left','right']){
    const d=car.damage[zone],el=$('zone-'+zone);
    if(el.dataset.damage!==String(d)){
      el.dataset.damage=String(d);el.textContent=zone+' '+Math.round(d/10)+'%';
      el.style.setProperty('--face','rgb('+[52+d*.14,82-d*.027,81-d*.054].map(Math.round).join(' ')+')');
    }
  }
  const condition=labCondition(car.damage),site=hit?.sites.find(s=>s.id===follow);
  set('lab-deltas',hit?'Tick '+hit.tick+' · '+(hit.normalEnergy/1000).toFixed(1)+' kJ normal energy · '+
    (Object.entries(site.damage).map(([k,v])=>k+' +'+v).join(', ')||'below damage threshold'):'No accepted impact');
  set('lab-forces','Available drive '+Math.round(condition.drive*100)+'% · steering '+Math.round(condition.steer*100)+
    '% · lateral grip '+Math.round(condition.grip*100)+'% · yaw damping '+Math.round(condition.damping*100)+'%');
  set('lab-operational',condition.disabled?'Drive disabled':hardware.some(k=>car.damage[k])?'Operational · impaired':'Operational');
}
function reset(){
  const id=$('scenario').value;
  const rebuild=!trial || trial.scenario!==id || !scene;
  input.clear();audio.stop();tail=0;paused=false;clock.setPaused(true);
  trial=createTrial(id,27,stamp);recorder=crashRecorder(trial);
  if(rebuild && !lost){
    scene?.dispose();scene=null;
    try{scene=createCrashScene(canvas,id,matchMedia('(pointer: coarse)').matches?.8:1);}
    catch(error){status('Graphics unavailable · '+error.message);}
  }
  $('lab-follow-control').hidden=id!=='opposing';$('lab-follow').value='0';
  $('lab-camera').value='chase';set('station-id',scenarios[id].number);set('lab-heading',scenarios[id].name);set('lab-aim',scenarios[id].aim);
  if(scene)status('Ready · arm controls to launch');
  syncButtons();dashboard();
}
function pause(reason){
  if(!running())return;
  paused=true;input.clear();clock.setPaused(true);lastTime=null;audio.stop();tail=0;
  status(reason+' · resume for a fresh input');syncButtons();
}
function startSound(){
  if(!muted)audio.start().then(ok=>{if(!ok && running() && !muted)status('Audio unavailable · driving continues');});
}
function arm(){
  if(!scene || lost || trial.phase==='finished')return;
  if(running()){pause('Paused');return;}
  if(!input.canStart()){status('Centre controls and release pedals before arming');return;}
  if(trial.phase==='ready')startTrial(trial);
  paused=false;input.clear();clock.setPaused(false);lastTime=null;canvas.focus();
  startSound();status('Live · '+scenarios[trial.scenario].target);syncButtons();
}
function frame(ms){
  const dt=lastTime===null?0:Math.max(0,(ms-lastTime)/1000);lastTime=ms;
  if(!running())input.menu();
  const {alpha}=clock.advance(dt,()=>{
    if(!running())return;
    const {command,camera}=input.sample();
    if(!running())return;
    if(camera){const e=$('lab-camera');e.selectedIndex=(e.selectedIndex+1)%e.length;}
    stepTrial(trial,command);recorder.record(command);
    if(!muted)audio.update(trial,command);
    if(trial.phase==='finished'){
      clock.setPaused(true);input.clear();tail=.32;
      if(!motion.matches && trial.firstImpact!==null)$('lab-camera').value='inspect';
      status('Result · '+trial.result);syncButtons();
    }
  });
  if(tail>0){tail=Math.max(0,tail-dt);if(!muted)audio.update(trial,neutralLab);if(!tail)audio.stop();}
  if(!lost && scene && !document.hidden){
    scene.draw(trial,{camera:$('lab-camera').value,follow:Number($('lab-follow').value),alpha:running()?alpha:1,reducedMotion:motion.matches});
    dashboard();
  }
  requestAnimationFrame(frame);
}
$('scenario').onchange=reset;$('lab-arm').onclick=arm;$('lab-reset').onclick=reset;
$('lab-sound').onclick=()=>{
  muted=!muted;if(muted)audio.stop();else if(running())startSound();
  set('lab-sound',muted?'Sound off':'Sound on');$('lab-sound').setAttribute('aria-pressed',String(!muted));
};
$('lab-input').onchange=()=>{
  pause('Input changed');const kind=$('lab-input').value;
  const pad=kind==='gamepad'?input.pads.devices()[0]:null;
  if(!input.select(kind,pad?.index,pad?savedMapper(pad)??undefined:undefined)){
    $('lab-input').value=input.source;status('Input unavailable · '+input.source+' selected');
  }
  syncButtons();
};
function download(data,name){
  const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('lab-save').onclick=()=>download(recorder.export(),'crash-'+trial.scenario+'-replay.json');
$('lab-receipt').onclick=async()=>{
  const completed=trial;
  try{download(await crashReceipt(recorder.export(),completed,navigator.userAgent),'crash-'+completed.scenario+'-receipt.json');}
  catch(error){status('Evidence export unavailable · '+error.message);}
};
function suspend(reason){pause(reason);input.clear();audio.stop();tail=0;lastTime=null;}
window.addEventListener('blur',()=>suspend('Window inactive'));
document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend('Tab hidden');});
window.addEventListener('pagehide',event=>{suspend('Left facility');if(!event.persisted){scene?.dispose();scene=null;}});
canvas.addEventListener('webglcontextlost',e=>{
  e.preventDefault();suspend('Graphics suspended');lost=true;syncButtons();status('Graphics suspended');
});
canvas.addEventListener('webglcontextrestored',()=>{
  lost=false;scene?.dispose();scene=null;
  try{scene=createCrashScene(canvas,trial.scenario);status('Graphics restored · controls ready');}
  catch(error){status('Graphics unavailable · '+error.message);}
  syncButtons();
});
reset();requestAnimationFrame(frame);
