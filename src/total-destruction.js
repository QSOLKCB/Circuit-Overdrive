// SPDX-License-Identifier: Apache-2.0
import {FixedClock} from '../vendor/vanillajs/modules/time/index.js';
import {TouringAudio,DEFAULT_VOLUMES} from './audio.js';
import {controllerMenu,menuAction} from './controller-menu.js';
import {labCondition,neutralLab} from './crash-damage.js';
import {DERBY_TICK_LIMIT,createDerbyRound} from './derby.js';
import {createDerbyRecorder} from './derby-replay.js';
import {createDerbyArenaScene} from './derby-arena-scene.js';
import {DERBY_ARENAS} from './derby-arenas.js';
import {DerbyVoice} from './derby-audio.js';
import {attachDriverInput} from './driver-input.js';
import {FIELD,PLAYER_ID} from './field.js';
import {IMPACT_PANEL_ZONES} from './impact-panels.js';

const $=id=>document.getElementById(id);
const canvas=$('derby-world'),arenaChoice=$('derby-arena'),camera=$('derby-camera'),follow=$('derby-follow');
const revision=document.querySelector('meta[name="game-revision"]').content||null;
const clock=new FixedClock({step:1/60,maxFrame:.1,maxSteps:6});
const motion=matchMedia('(prefers-reduced-motion: reduce)'),coarse=matchMedia('(pointer: coarse)');
const audio=new TouringAudio({voice:new DerbyVoice()});
const countdownTicks=180,seed=27;
const components=['engine','steering','tyres','suspension'];
const label=id=>FIELD[id].name+' #'+FIELD[id].number;
const title=name=>name[0].toUpperCase()+name.slice(1);
const set=(id,value)=>{
  const text=String(value),node=$(id);
  if(node.textContent!==text)node.textContent=text;
};
let round,recorder,scene,previous,lastImpact,lastTime,resumePhase,countdown,standingsOrder;
let effects=[],phase='menu',lost=false,dirty=true,muted=false,tail=0;

let settings;
try{settings=JSON.parse(localStorage.getItem('circuit-overdrive.settings'));}catch{}
const quality=settings?.quality??'auto';
const reducedEffects=()=>motion.matches||quality==='reduced'||quality==='mobile'||(quality==='auto'&&coarse.matches);
const active=()=>phase==='countdown'||phase==='running'||phase==='spectating';
const focused=()=>!document.hidden&&document.hasFocus()&&!$('controller-dialog').open&&
  (input.source!=='keyboard'||document.activeElement===canvas);
const input=attachDriverInput(window,()=>active()&&focused(),handleAction,
  reason=>pause(reason),$('derby-touch'));
const controller=controllerMenu(input,()=>{
  set('derby-status','Input · '+title(input.source)+' selected');
  syncControls();
  $(phase==='paused'?'derby-pause':'derby-arm').focus();
});

for(const arena of Object.values(DERBY_ARENAS))arenaChoice.add(new Option(arena.name,arena.id));
for(const {id} of FIELD)follow.add(new Option(label(id),id));
const standingNodes=FIELD.map(({id,color})=>{
  const row=document.createElement('li'),name=document.createElement('span'),detail=document.createElement('span');
  name.textContent=label(id);
  name.style.borderLeft='3px solid '+color;
  name.style.paddingLeft='5px';
  if(id===PLAYER_ID)row.dataset.player='';
  row.append(name,detail);
  return {row,detail};
});
for(const name of components){
  const row=document.createElement('div'),label=document.createElement('span');
  const meter=document.createElement('meter'),value=document.createElement('output');
  label.textContent=title(name);
  meter.max=1000;
  meter.id='derby-meter-'+name;
  meter.setAttribute('aria-label',label.textContent+' condition');
  value.id='derby-value-'+name;
  row.append(label,meter,value);
  $('derby-components').append(row);
}
for(const [name,initial] of Object.entries(DEFAULT_VOLUMES)){
  const label=document.createElement('label'),slider=document.createElement('input');
  label.textContent=title(name);
  slider.type='range';
  slider.min=0;
  slider.max=100;
  const value=settings?.volumes?.[name];
  slider.value=100*(Number.isFinite(value)&&value>=0&&value<=1?value:initial);
  const apply=()=>audio.setVolume(name,Number(slider.value)/100);
  apply();
  slider.addEventListener('input',apply);
  label.append(slider);
  $('derby-mixer').append(label);
}

function syncControls(){
  const selection=phase==='menu',grid=phase==='grid',paused=phase==='paused',finished=phase==='finished';
  $('derby-intro').hidden=!selection;
  arenaChoice.disabled=!selection;
  $('derby-arm').hidden=!(selection||grid);
  $('derby-arm').disabled=lost||!scene;
  set('derby-arm',selection?'Arm grid':'Start round');
  $('derby-pause').hidden=!(paused||active());
  $('derby-pause').disabled=lost||!scene;
  set('derby-pause',paused?'Resume':'Pause');
  $('derby-restart').hidden=!(paused||finished);
  $('derby-select').hidden=!(grid||paused||finished);
  $('derby-instruments').hidden=selection;
  $('derby-speed-panel').hidden=selection;
  $('derby-result').hidden=!finished;
  $('derby-result-actions').hidden=!finished||!recorder.available;
  $('derby-stamp-help').hidden=!finished||recorder.available;
  $('derby-follow-control').hidden=camera.value!=='spectator';
  $('derby-touch').hidden=input.source!=='touch'||!active();
  $('derby-countdown').hidden=phase!=='countdown';
}
const phaseLabels={menu:'Arena selection',grid:'Grid armed',countdown:'Starting grid',
  running:'Round live',paused:'Paused',spectating:'Spectating',finished:'Official result'};
function presentPhase(next,status=phaseLabels[next]){
  phase=next;
  document.body.dataset.phase=phase;
  set('derby-phase',phaseLabels[phase]);
  set('derby-status',status);
  syncControls();
  dirty=true;
}
function focusId(){
  return camera.value==='spectator'?Number(follow.value):PLAYER_ID;
}
function dashboard(){
  const {standings}=round,player=round.world.cars[PLAYER_ID];
  const local=standings.find(row=>row.id===PLAYER_ID),remaining=Math.ceil((DERBY_TICK_LIMIT-round.ticks)/60);
  const rival=round.targets[PLAYER_ID],latest=round.eliminations.at(-1);
  document.body.dataset.tick=String(round.ticks);
  set('derby-speed',Math.round(Math.hypot(player.vx,player.vz)*3.6));
  set('derby-time',Math.floor(remaining/60)+':'+String(remaining%60).padStart(2,'0'));
  set('derby-survivors',standings.filter(row=>row.active).length);
  set('derby-knockouts',local.knockouts);
  const damage=player.damage,condition=labCondition(damage);
  const state=round.result?.winnerId===PLAYER_ID?'Winner':!local.active?
    (phase==='spectating'||resumePhase==='spectating'&&phase==='paused'?'Eliminated · spectating':'Eliminated'):
    condition.disabled?'Disabled':Object.values(damage).some(Boolean)?'Damaged':'Active';
  set('derby-driver-status',state);
  set('derby-target',rival===null?'—':label(rival));
  set('derby-impulse',lastImpact?(lastImpact.kind==='fixed'?'Wall':'Car')+' · '+Math.round(lastImpact.normalImpulse)+' N·s':'—');
  set('derby-elimination',latest?label(latest.id)+' · '+(latest.attackerId===null?'uncredited':label(latest.attackerId)):'—');
  for(const name of components){
    const left=1000-damage[name],meter=$('derby-meter-'+name);
    if(meter.value!==left)meter.value=left;
    set('derby-value-'+name,Math.round(left/10)+'%');
  }
  for(const name of IMPACT_PANEL_ZONES){
    const value=damage[name],node=$('derby-'+name);
    if(node.dataset.damage===String(value))continue;
    node.dataset.damage=String(value);
    set('derby-'+name,title(name)+' '+Math.round(value/10)+'%');
    const color=[51+value*.13,81-value*.031,83-value*.061].map(Math.round);
    node.style.setProperty('--face','rgb('+color.join(' ')+')');
  }
  const order=standings.map(row=>row.id).join('');
  if(order!==standingsOrder){
    standingsOrder=order;
    $('derby-standings').replaceChildren(...standings.map(({id})=>standingNodes[id].row));
  }
  for(const row of standings){
    const detail=standingNodes[row.id].detail,text=row.knockouts+' KO · '+(row.active?'UP':'OUT');
    if(detail.textContent!==text)detail.textContent=text;
  }
}
function rebuildScene(){
  scene?.dispose();
  scene=null;
  try{
    scene=createDerbyArenaScene(canvas,round.world.arena,quality==='mobile'||quality==='auto'&&coarse.matches?.78:1,
      {damagePanels:true});
  }catch(error){
    set('derby-status','Graphics unavailable · '+error.message);
  }
  dirty=true;
  syncControls();
}
function reset(next='menu'){
  const rebuild=round?.world.arena.id!==arenaChoice.value||!scene;
  input.clear();
  audio.stop();
  audio.selectMusic('derby');
  round=createDerbyRound({arena:arenaChoice.value,seed,revision});
  recorder=createDerbyRecorder(round);
  lastImpact=null;
  previous=null;
  lastTime=null;
  resumePhase=null;
  countdown=countdownTicks;
  tail=0;
  effects=[];
  clock.reset();
  clock.setPaused(true);
  follow.value=String(PLAYER_ID);
  camera.value=next==='menu'?'raised':'chase';
  set('derby-venue',round.world.arena.name);
  delete document.body.dataset.result;
  presentPhase(next,lost?'Graphics suspended':next==='menu'?'Choose an arena and arm the grid.':'Six cars ready. Start the round.');
  if(rebuild&&!lost)rebuildScene();
  dashboard();
}
function pause(reason='Paused'){
  if(!active())return;
  resumePhase=phase;
  clock.setPaused(true);
  lastTime=null;
  previous=null;
  input.clear();
  audio.stop();
  presentPhase('paused',reason+' · resume with fresh input.');
}
function startSound(){
  if(!muted)audio.start().then(ok=>{
    if(!ok&&!muted&&active())set('derby-status','Audio unavailable · round continues.');
  });
}
function arm(){
  if(!scene||lost||document.hidden||!document.hasFocus())return;
  if(!input.canStart()){
    set('derby-status','Centre the controls and release the pedals to arm.');
    return;
  }
  if(phase==='menu'){
    camera.value='chase';
    presentPhase('grid','Six cars ready. Start the round.');
    canvas.focus({preventScroll:true});
    return;
  }
  if(phase!=='grid'&&phase!=='paused')return;
  const next=phase==='paused'?resumePhase:'countdown';
  input.clear();
  lastTime=null;
  clock.setPaused(false);
  presentPhase(next);
  canvas.focus({preventScroll:true});
  startSound();
}
function togglePause(){
  if(active())pause();
  else if(phase==='paused')arm();
}
function handleAction(action){
  if(document.hidden||!document.hasFocus())return false;
  if($('controller-dialog').open)return input.source==='gamepad'&&controller.navigate(action);
  if(action==='pause'&&(active()||phase==='paused')){
    togglePause();
    return true;
  }
  if(action==='arm'&&phase==='grid'&&document.activeElement===canvas){
    arm();
    return true;
  }
  if(input.source==='gamepad'&&!active()){
    if(action==='confirm'&&(phase==='grid'||phase==='paused')){
      arm();
      return true;
    }
    return menuAction(action);
  }
  return false;
}
function cycleCamera(){
  camera.selectedIndex=(camera.selectedIndex+1)%camera.length;
  syncControls();
  dirty=true;
}
const noEvents=Object.freeze([]);
function updateSound(command,contacts=noEvents,eliminations=noEvents){
  if(muted)return;
  audio.update(round,command,{phase,focus:PLAYER_ID,contacts,eliminations},
    {phase,elapsedTicks:round.ticks,surviving:round.standings.filter(row=>row.active).length,eliminated:eliminations.length>0});
}
const resultLabels={
  'last-car-standing':'Last car standing','simultaneous-elimination':'No survivor',
  'time-limit':'Time limit','technical-stop':'Technical stop'
};
function settle(){
  const {winnerId,reason,technicalStop}=round.result;
  clock.setPaused(true);
  input.clear();
  tail=.88;
  document.body.dataset.result=reason;
  const winner=winnerId===null?null:label(winnerId);
  presentPhase('finished',resultLabels[reason]+(technicalStop?' · '+(technicalStop.reason??technicalStop.limitReason):''));
  set('derby-winner',winner?winner+' wins':reason==='technical-stop'?'Round stopped without a winner.':'All remaining cars were eliminated.');
  if(winner&&!motion.matches){
    camera.value='spectator';
    follow.value=String(winnerId);
    syncControls();
  }
}
function advance(){
  if(!active())return;
  const sample=input.sample();
  if(!active())return;
  if(sample.camera)cycleCamera();
  if(phase==='countdown'){
    updateSound(neutralLab);
    set('derby-countdown',Math.ceil(countdown/60));
    if(--countdown===0)presentPhase('running','Round live · physical impacts decide the result.');
    return;
  }
  const command=phase==='spectating'?neutralLab:sample.command;
  previous=round.world.cars.map(({x,z,yaw})=>({x,z,yaw}));
  const result=recorder.step(command);
  if(result.technicalStop){
    // The partial solver prefix is diagnostic. Keep the last certified image and instruments.
    settle();
    document.body.dataset.tick=String(round.ticks);
    updateSound(neutralLab);
    return;
  }
  effects=effects.filter(hit=>round.world.tick-hit.tick<10);
  for(const hit of result.contacts){
    if(!hit.newImpact)continue;
    // Retain only enough presentation events for a short burst on the next draw.
    lastImpact=hit;
    if(hit.normalImpulse>=650){
      effects.push(hit);
      if(effects.length>8)effects.shift();
    }
  }
  if(result.result)settle();
  else if(phase==='running'&&result.eliminations.some(entry=>entry.id===PLAYER_ID)){
    camera.value='spectator';
    follow.value=String(round.standings.find(row=>row.active).id);
    input.clear();
    presentPhase('spectating','Player eliminated · the remaining cars are still competing.');
  }
  updateSound(command,result.contacts,result.eliminations);
  dirty=true;
}
function frame(time){
  const elapsed=lastTime===null?0:Math.max(0,(time-lastTime)/1000);
  lastTime=time;
  controller.refresh();
  if(!active()&&!document.hidden&&document.hasFocus())input.menu();
  const {alpha:blend}=clock.advance(elapsed,advance);
  if(tail>0){
    tail=Math.max(0,tail-elapsed);
    if(tail>0)updateSound(neutralLab);
    else audio.stop();
  }
  if(scene&&!lost&&!round.result?.technicalStop&&!document.hidden&&(dirty||active())){
    const alpha=active()&&!motion.matches?blend:1;
    if(round.world.cars.every(car=>Number.isFinite(car.x)&&Number.isFinite(car.z)&&Number.isFinite(car.yaw))){
      scene.draw(round.world,{camera:camera.value,follow:focusId(),previous,alpha,effects:reducedEffects()?[]:effects});
    }
    if(dirty)dashboard();
    dirty=false;
  }
  requestAnimationFrame(frame);
}

function downloadDerby(data,suffix) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const link=document.createElement('a');
  link.href=url;
  link.download='derby-'+data.arena+'-'+suffix+'.json';
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('save-derby-replay').onclick=()=>{
  if(recorder.available)downloadDerby(recorder.export(),'replay');
};
$('save-derby-evidence').onclick=async()=>{
  if(!recorder.available)return;
  try {
    downloadDerby(await recorder.receipt(navigator.userAgent),'receipt');
  }catch(error){
    set('derby-status','Evidence unavailable · '+error.message);
  }
};

arenaChoice.onchange=()=>{if(phase==='menu')reset();};
$('derby-arm').onclick=arm;
$('derby-pause').onclick=togglePause;
$('derby-restart').onclick=()=>reset('grid');
$('derby-select').onclick=()=>{reset();arenaChoice.focus();};
camera.onchange=()=>{
  syncControls();
  dirty=true;
  if(active()&&input.source==='keyboard')canvas.focus({preventScroll:true});
};
follow.onchange=()=>{
  dirty=true;
  if(active()&&input.source==='keyboard')canvas.focus({preventScroll:true});
};
$('derby-sound').onclick=()=>{
  muted=!muted;
  $('derby-sound').setAttribute('aria-pressed',String(!muted));
  set('derby-sound',muted?'Sound off':'Sound on');
  if(muted)audio.stop();
  else if(active())startSound();
};
$('derby-controller').onclick=()=>{pause('Input selection');input.clear();controller.open();};
function suspend(reason){
  pause(reason);
  input.clear();
  audio.stop();
  tail=0;
  lastTime=null;
}
canvas.addEventListener('blur',event=>{
  if(input.source==='keyboard'&&event.relatedTarget!==$('derby-pause'))pause('Focus left the driving controls');
});
window.addEventListener('blur',()=>suspend('Window inactive'));
document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend('Tab hidden');});
window.addEventListener('pagehide',event=>{
  suspend('Page inactive');
  if(!event.persisted){scene?.dispose();scene=null;}
});
canvas.addEventListener('webglcontextlost',event=>{
  event.preventDefault();
  lost=true;
  suspend('Graphics suspended');
  set('derby-status','Graphics suspended');
  syncControls();
});
canvas.addEventListener('webglcontextrestored',()=>{
  lost=false;
  set('derby-status',phase==='paused'?'Graphics restored · resume with fresh input.':'Graphics restored');
  rebuildScene();
});
motion.addEventListener('change',()=>{dirty=true;});
new ResizeObserver(()=>{dirty=true;}).observe(canvas);
reset();
requestAnimationFrame(frame);
