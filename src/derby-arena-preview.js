// SPDX-License-Identifier: Apache-2.0
import {LAB_STEP} from './crash-impact.js';
import {DERBY_ARENAS,createDerbyArenaWorld,stepDerbyArena} from './derby-arenas.js';
import {createDerbyArenaScene} from './derby-arena-scene.js';
import {FixedClock} from '../vendor/vanillajs/modules/time/index.js';

const $=id=>document.getElementById(id);
const canvas=$('arena-world'),choice=$('arena-choice'),camera=$('arena-camera'),run=$('arena-run');
const revision=document.querySelector('meta[name="game-revision"]').content||null;
const clock=new FixedClock({step:LAB_STEP,maxFrame:.1,maxSteps:6});
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const coarse=matchMedia('(pointer: coarse)');
const launch=Object.freeze({throttle:1,brake:0,steer:0});
const commands=Array(6).fill(launch);
const launchTicks=480;
let world,scene,previous,lastTime,lost=false,dirty=true,running=false,finished=false;
let carContacts,fixtureContacts,lastContact;

for(const arena of Object.values(DERBY_ARENAS))choice.add(new Option(arena.name,arena.id));

function show(id,value) {
  const text=String(value),node=$(id);
  if(node.textContent!==text)node.textContent=text;
}
function hud() {
  show('arena-cars',world.cars.length);
  show('arena-fixtures',world.barriers.length);
  show('arena-tick',world.tick);
  show('arena-car-contacts',carContacts);
  show('arena-fixture-contacts',fixtureContacts);
  show('arena-impulse',lastContact ? Math.round(lastContact.normalImpulse)+' N·s' : '—');
}
function pause(message) {
  running=false;
  clock.setPaused(true);
  lastTime=null;
  dirty=true;
  run.textContent=world.tick && !finished?'Resume launch':'Run launch test';
  run.disabled=lost || !scene || finished;
  show('arena-status',message);
}
function rebuild() {
  scene?.dispose();
  scene=null;
  try{
    scene=createDerbyArenaScene(canvas,world.arena,coarse.matches?.8:1);
  }catch(error){
    pause('Graphics unavailable · '+error.message);
  }
}
function reset() {
  const rebuildScene=world?.arena.id!==choice.value || !scene;
  world=createDerbyArenaWorld(choice.value,revision);
  previous=null;
  carContacts=fixtureContacts=0;
  lastContact=null;
  finished=false;
  clock.reset();
  show('arena-heading',world.arena.name);
  pause(lost?'Graphics suspended':'Ready');
  if(rebuildScene && !lost)rebuild();
  run.disabled=lost || !scene;
  $('arena-reset').disabled=false;
  hud();
}
function step() {
  previous=world.cars.map(({x,z,yaw})=>({x,z,yaw}));
  const result=stepDerbyArena(world,commands);
  for(const contact of result.contacts){
    if(contact.kind==='vehicle')carContacts++;
    else fixtureContacts++;
    lastContact=contact;
  }
  if(result.technicalStop){
    finished=true;
    const reason=result.technicalStop.reason ?? result.technicalStop.limitReason;
    pause('Technical stop · '+reason);
  }else if(world.tick===launchTicks){
    finished=true;
    pause('Launch complete');
  }
}
function frame(time) {
  const elapsed=lastTime===null?0:(time-lastTime)/1000;
  lastTime=time;
  const {alpha}=clock.advance(elapsed,step);
  if(scene && !lost && !document.hidden && (running || dirty)){
    if(world.technicalStop?.reason!=='invalid-motion'){
      scene.draw(world,{camera:camera.value,previous,alpha:reducedMotion.matches||!running?1:alpha});
    }
    hud();
    dirty=false;
  }
  requestAnimationFrame(frame);
}
run.onclick=()=>{
  if(running){pause('Paused');return;}
  if(lost || !scene || finished)return;
  running=true;
  lastTime=null;
  clock.setPaused(false);
  run.textContent='Pause launch';
  show('arena-status','Launch running');
};
choice.onchange=reset;
$('arena-reset').onclick=reset;
camera.onchange=()=>{dirty=true;};
reducedMotion.addEventListener('change',()=>{dirty=true;});
new ResizeObserver(()=>{dirty=true;}).observe(canvas);
window.addEventListener('blur',()=>{if(running)pause('Paused · window inactive');});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden && running)pause('Paused · page hidden');
});
canvas.addEventListener('webglcontextlost',event=>{
  event.preventDefault();
  lost=true;
  pause('Graphics suspended');
});
canvas.addEventListener('webglcontextrestored',()=>{
  lost=false;
  pause('Graphics restored');
  rebuild();
  run.disabled=!scene || finished;
});
window.addEventListener('pagehide',event=>{
  if(running)pause('Paused');
  if(!event.persisted){scene?.dispose();scene=null;}
});
reset();
requestAnimationFrame(frame);
