// SPDX-License-Identifier: Apache-2.0
// CO-REPLAY-001: source-bound six-car spectator. Reads local JSON, never executes it.
// Camera, tempo and seek operations only change presentation or re-simulate ticks.
import {createReplaySession,MAX_REPLAY_BYTES,MAX_SEEK_STEPS} from './replay-theatre-core.js';
import {createScene} from './scene.js';
import {FIELD,PLAYER_ID} from './field.js';
import {interpolateReplayPoses,createReplayPoses} from './replay-presentation.js';

const $=id=>document.getElementById(id);
const canvas=$('replay-world');
const stamp=document.querySelector('meta[name="game-revision"]')?.content||'';
const controls=['replay-play','replay-restart','replay-back','replay-forward','replay-download',
  'replay-seek','replay-follow','replay-camera','replay-rate'];
const poses=createReplayPoses();
let session=null,scene=null,playing=false,seekTarget=null,frameTime=null,playBudget=0;
let imported='',currentFileName='',lastHud=-1;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const coarse=matchMedia('(pointer: coarse)');
const formatTime=ticks=>{
  const seconds=Math.max(0,ticks)/60;
  const minutes=Math.floor(seconds/60);
  return minutes+':'+String(Math.floor(seconds%60)).padStart(2,'0')+
    '.'+String(Math.round(seconds%1*1000)).padStart(3,'0');
};
const shortTime=ticks=>{
  const seconds=Math.floor(ticks/60);
  return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
};
const notify=text=>$('replay-status').textContent=text;
const set=(id,value)=>{
  const valueText=String(value),element=$(id);
  if(element.textContent!==valueText)element.textContent=valueText;
};
function setControls(enabled){
  for(const id of controls)$(id).disabled=!enabled;
}
function displayErrors(error){
  playing=false;seekTarget=null;
  $('replay-play').textContent='Play';
  notify('Cannot play replay: '+String(error?.message||error));
}
function dashboard(force=false){
  if(!session)return;
  const tick=session.tick;
  if(!force && tick===lastHud)return;
  lastHud=tick;
  $('replay-seek').value=String(tick);
  set('replay-clock',shortTime(tick)+' / '+shortTime(session.totalTicks));
  const index=Number($('replay-follow').value);
  const driver=session.race.entrants[index]??session.race.player;
  const p=driver.current;
  set('replay-title',session.race.course.name);
  set('replay-driver','#'+driver.number+' '+driver.name);
  set('replay-place','P'+driver.position+' / 6');
  set('replay-speedometer',Math.round(p.speed*3.6)+' km/h');
  set('replay-gear',p.gear<0?'R':String(p.gear));
  set('replay-racetime',formatTime(driver.elapsedTicks));
  set('replay-progress',session.race.course.closed?'Lap '+driver.lap+' / 3':
    'Checkpoint '+driver.splitTicks.length+' / 7');
  const table=$('replay-standing');
  table.replaceChildren(...session.race.order.map(item=>{
    const line=document.createElement('li');
    line.classList.toggle('is-follow',item.id===index);
    const name=document.createElement('span'),status=document.createElement('span');
    name.textContent='P'+item.position+' · #'+item.number+' '+item.name;
    status.textContent=item.finishTicks===null?'Racing':formatTime(item.finishTicks);
    line.append(name,status);
    return line;
  }));
}
function render(elapsed){
  if(!scene||!session)return;
  // A one-tick presentation delay lets ½× and high-refresh playback smoothly
  // interpolate between accepted simulation snapshots without changing physics.
  // Pause, seek and finished presentation use exact authoritative current poses.
  const alpha=playing && !session.finished && seekTarget===null?playBudget:1;
  interpolateReplayPoses(session.race,poses,alpha);
  const followId=Number($('replay-follow').value);
  scene.draw(poses,{mode:session.race.phase==='finished'?'finished':'racing',
    camera:$('replay-camera').value,followId,
    dt:playing?elapsed:0,reducedMotion:reducedMotion.matches,reducedEffects:true});
}
function pause(){
  playing=false;playBudget=0;
  $('replay-play').textContent='Play';
}
function restart(){
  if(!session)return;
  pause();seekTarget=null;session.reset();
  $('replay-play').disabled=false; // Restart also cancels any in-flight seek.
  scene?.resetEffects();
  lastHud=-1;dashboard(true);
  notify('Restarted. Press Play to watch.');
}
function targetTick(tick){
  if(!session||!Number.isSafeInteger(tick))return;
  pause();
  seekTarget=Math.min(session.totalTicks,Math.max(0,tick));
  if(seekTarget<session.tick){session.reset();scene?.resetEffects();}
  notify('Seeking — simulating accepted race ticks…');
  $('replay-play').disabled=true;
}
function stepPlayer(){
  if(!session || session.finished)return false;
  return session.step();
}
function frame(ms){
  const elapsed=frameTime===null?0:Math.min(.1,Math.max(0,(ms-frameTime)/1000));
  frameTime=ms;
  if(session && !document.hidden){
    try {
      if(seekTarget!==null) {
        const target=seekTarget;
        session.seekBatch(target);
        if(session.tick>=target) {
          seekTarget=null;
          $('replay-play').disabled=false;
          notify('Position '+shortTime(session.tick)+' · '+session.recording.compatibility+' source.');
        }
      } else if(playing){
        playBudget=Math.min(12,playBudget+elapsed*60*Number($('replay-rate').value));
        const steps=Math.min(12,Math.floor(playBudget));
        playBudget-=steps;
        for(let n=0;n<steps;n++) {
          if(!stepPlayer())break;
        }
        if(session.finished) {
          pause();
          notify('Chequered flag! Race reconstructed from '+session.totalTicks+
            ' recorded ticks. Classification is shown at the left.');
        }
      }
      dashboard();
      render(elapsed);
    }catch(error){displayErrors(error);}
  }
  requestAnimationFrame(frame);
}
function loadRecordedRace(data,sourceText,fileName){
  const candidate=createReplaySession(data,stamp);
  // Construct the new scene only after source/shape admission has succeeded.
  const size=coarse.matches?.75:1;
  scene?.dispose();
  scene=null;
  const fresh=createScene(canvas,candidate.race.course,size);
  session=candidate;scene=fresh;
  imported=sourceText;currentFileName=fileName;
  seekTarget=null;pause();lastHud=-1;
  $('replay-seek').max=String(candidate.totalTicks);
  for(const option of FIELD){
    // Rebuild the selector with stable numeric IDs; no replay-supplied HTML.
    const element=document.createElement('option');
    element.value=String(option.id);
    element.textContent='#'+option.number+' '+option.name;
    $('replay-follow').append(element);
  }
  // A previous session may have populated the picker.
  while($('replay-follow').options.length>FIELD.length)$('replay-follow').remove(0);
  $('replay-follow').value=String(PLAYER_ID);
  $('replay-camera').value='chase';
  $('replay-rate').value='1';
  $('replay-empty').hidden=true;
  $('replay-telemetry').hidden=false;
  setControls(true);
  dashboard(true);
  const label=candidate.recording.compatibility==='exact'?'exact source':
    'verified compatible race physics at '+candidate.recording.revision;
  notify('Loaded '+candidate.recording.course+' · '+candidate.totalTicks+
    ' ticks · '+label+'. Press Play or move the timeline.');
  frameTime=null;
}
$('replay-file').addEventListener('change',async event=>{
  pause();
  const file=event.target.files?.[0];
  if(!file)return;
  try{
    if(file.size<1||file.size>MAX_REPLAY_BYTES)throw RangeError('Replay file must be 1 byte to 16 MiB');
    const text=await file.text();
    const data=JSON.parse(text);
    loadRecordedRace(data,text,file.name);
  }catch(error){displayErrors(error);}
  finally{$('replay-file').value='';}
});
$('replay-play').addEventListener('click',()=>{
  if(!session||seekTarget!==null)return;
  if(session.finished)restart();
  playing=!playing;playBudget=0;frameTime=null;
  $('replay-play').textContent=playing?'Pause':'Play';
  notify(playing?'Replaying source-stamped race…':'Paused — replay state is unchanged.');
});
$('replay-restart').addEventListener('click',restart);
$('replay-back').addEventListener('click',()=>targetTick(session.tick-300));
$('replay-forward').addEventListener('click',()=>targetTick(session.tick+300));
$('replay-seek').addEventListener('input',()=>targetTick(Number($('replay-seek').value)));
$('replay-follow').addEventListener('change',()=>dashboard(true));
$('replay-camera').addEventListener('change',()=>dashboard(true));
$('replay-download').addEventListener('click',()=>{
  if(!session || !imported)return;
  const url=URL.createObjectURL(new Blob([imported],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;
  a.download=/^[a-zA-Z0-9_. -]{1,100}\.json$/.test(currentFileName)?
    currentFileName:'circuit-overdrive-replay.json';
  a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
document.addEventListener('keydown',event=>{
  if(event.altKey||event.ctrlKey||event.metaKey||!session||event.target!==document.body)return;
  if(event.code==='Space'){$('replay-play').click();event.preventDefault();}
  if(event.code==='ArrowLeft'){targetTick(session.tick-300);event.preventDefault();}
  if(event.code==='ArrowRight'){targetTick(session.tick+300);event.preventDefault();}
  if(event.code==='Home'){targetTick(0);event.preventDefault();}
  if(event.code==='End'){targetTick(session.totalTicks);event.preventDefault();}
  if(event.code==='KeyV'){
    $('replay-camera').value=$('replay-camera').value==='chase'?'high':'chase';
    event.preventDefault();
  }
});
window.addEventListener('blur',pause);
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
window.addEventListener('pagehide',event=>{
  pause();
  // A bfcache navigation preserves the live WebGL scene and source-bound
  // session. A real unload disposes retained GPU resources as before.
  if(!event.persisted){scene?.dispose();scene=null;}
});
window.addEventListener('pageshow',event=>{
  frameTime=null;
  if(event.persisted && session && !scene) {
    try{scene=createScene(canvas,session.race.course,coarse.matches?.75:1);
      notify('Replay graphics restored after navigation. Press Play to resume.');}
    catch(error){displayErrors(error);}
  }
});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();pause();notify('WebGL context lost. Playback suspended.');});
canvas.addEventListener('webglcontextrestored',()=>{
  if(!session)return;
  try{scene?.dispose();scene=createScene(canvas,session.race.course,coarse.matches?.75:1);
    notify('Graphics restored. Press Play to resume.');}
  catch(error){displayErrors(error);}
});
if(!/^[0-9a-f]{40}$/.test(stamp))
  notify('This checkout has no verified revision stamp. Use GitHub Pages or a verified offline release ZIP.');
requestAnimationFrame(frame);
