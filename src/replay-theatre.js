// SPDX-License-Identifier: Apache-2.0
// CO-REPLAY-001: source-bound six-car spectator. Reads local JSON, never executes it.
// Camera, tempo and seek operations only change presentation or re-simulate ticks.
import {createReplaySession,MAX_REPLAY_BYTES,MAX_SEEK_STEPS} from './replay-theatre-core.js';
import {createCrashScene} from './crash-scene.js';
import {createDerbyArenaScene} from './derby-arena-scene.js';
import {DERBY_REPLAY_VERSION} from './derby-replay.js';
import {scenarios} from './crash-trial.js';
import {createScene} from './scene.js';
import {courseEnvironment,eventTitle} from './environment.js';
import {FIELD,PLAYER_ID} from './field.js';
import {interpolateReplayPoses,createReplayPoses} from './replay-presentation.js';

const $=id=>document.getElementById(id);
const canvas=$('replay-world');
const stamp=document.querySelector('meta[name="game-revision"]')?.content||'';
const controls=['replay-play','replay-restart','replay-back','replay-forward','replay-download',
  'replay-seek','replay-follow','replay-camera','replay-environment','replay-rate'];
const poses=createReplayPoses();
let session=null,scene=null,playing=false,seekTarget=null,frameTime=null,playBudget=0;
let environment='day';
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
  $('replay-evidence').disabled=true;
  notify('Cannot play replay: '+String(error?.message||error));
}
let selectedImpact='';
function crashDashboard(id){
  const t=session.race,car=t.world.cars[id],title=scenarios[t.scenario].name;
  set('replay-title',title);
  set('theatre-lab-state',(id?'Opposing car':'Player')+' · '+Math.round(Math.hypot(car.vx,car.vz)*3.6)+' km/h · tick '+t.world.tick+' · '+(t.result||'Running'));
  set('theatre-lab-damage',Object.entries(car.damage).map(([k,v])=>k+' '+v+'/1000').join(' · '));
  const hits=t.contacts.filter(h=>h.newImpact && h.sites.some(s=>s.id===id));
  const picker=$('theatre-impacts');
  if(picker.length!==hits.length || (hits.length && picker.options[0]?.value!==hits[0].id)){
    picker.replaceChildren(...hits.map(hit=>new Option('Tick '+hit.tick+' · '+hit.sites.find(s=>s.id===id).zone,hit.id)));
  }
  const hit=hits.find(h=>h.id===selectedImpact)??hits.at(-1);
  picker.disabled=!hit;$('theatre-hit-seek').disabled=!hit;
  if(hit)picker.value=hit.id;
  const partner=id?'Player test car':scenarios[t.scenario].target;
  set('theatre-hit',hit ? partner+' · '+hit.closing.toFixed(1)+' m/s closing · '+
    hit.normalImpulse.toFixed(0)+' N·s normal · '+hit.tangentialImpulse.toFixed(0)+' N·s slide · '+
    (hit.dissipated/1000).toFixed(1)+' kJ lost · normal '+hit.normal.map(v=>v.toFixed(2)).join(' / ') : 'No accepted impact at this tick');
}
const driverLabel=id=>'#'+FIELD[id].number+' '+FIELD[id].name;
function derbyResult(result) {
  if (!result) return 'Running';
  if (result.reason==='technical-stop') return 'Technical stop';
  if (result.reason==='simultaneous-elimination') return 'Simultaneous eliminations · No survivor';
  const winner=driverLabel(result.winnerId);
  return result.reason==='time-limit' ? 'Time limit · '+winner+' wins' : winner+' · Last car standing';
}
function derbyDashboard(id) {
  const round=session.race, car=round.world.cars[id];
  const driver=round.standings.find(row=>row.id===id);
  set('replay-title',round.world.arena.name);
  set('theatre-derby-state',derbyResult(round.result)+' · tick '+round.ticks);
  set('theatre-derby-driver',driverLabel(id)+' · '+Math.round(Math.hypot(car.vx,car.vz)*3.6)+
    ' km/h · '+(driver.active?'Active':'Eliminated')+' · '+driver.knockouts+' KO');
  set('theatre-derby-damage',Object.entries(car.damage).map(([key,value])=>key+' '+value+'/1000').join(' · '));
  const hit=session.latestImpact(id);
  set('theatre-derby-hit',hit ? 'Tick '+hit.tick+' · '+hit.sites.find(site=>site.id===id).zone+' · '+
    hit.closing.toFixed(1)+' m/s closing · '+hit.normalImpulse.toFixed(0)+' N·s normal · '+
    hit.tangentialImpulse.toFixed(0)+' N·s slide · '+(hit.dissipated/1000).toFixed(1)+' kJ lost' :
    'No accepted impact for this driver');
  const table=$('theatre-derby-standing');
  for (const [i,row] of round.standings.entries()) {
    const line=table.children[i];
    line.classList.toggle('is-follow',row.id===id);
    line.firstElementChild.textContent=row.rank+' · '+driverLabel(row.id);
    line.lastElementChild.textContent=row.knockouts+' KO · '+(row.active?'Active':'Out '+shortTime(row.eliminatedTick));
  }
  const picker=$('theatre-eliminations');
  if (picker.length!==round.eliminations.length) {
    const selected=picker.value;
    picker.replaceChildren(...round.eliminations.map((event,i)=>new Option(
      'Tick '+event.tick+' · '+driverLabel(event.id),String(i))));
    if (selected && Number(selected)<picker.length) picker.value=selected;
  }
  picker.disabled=$('theatre-elimination-seek').disabled=!picker.length;
  $('replay-evidence').disabled=!session.finished;
}
function dashboard(force=false){
  if(!session)return;
  const tick=session.tick;
  if(!force && tick===lastHud)return;
  lastHud=tick;
  $('replay-seek').value=String(tick);
  set('replay-clock',shortTime(tick)+' / '+shortTime(session.totalTicks));
  const index=Number($('replay-follow').value);
  if(session.recording.version===5){crashDashboard(index);return;}
  if(session.recording.version===DERBY_REPLAY_VERSION){derbyDashboard(index);return;}
  const driver=session.race.entrants[index]??session.race.player;
  const p=driver.current;
  set('replay-title',eventTitle(session.race.course,environment));
  $('replay-nitro').hidden=!driver.nitro;
  if (driver.nitro) set('replay-nitro',Math.round(driver.nitro.energy/1000)+'% nitro · '+driver.nitro.points+' stunt points');
  const rocket=session.recording.version===4;
  $('replay-rocket').hidden=!rocket;
  if (rocket) {
    const body=driver.vehicle;
    const support=body.attached ? 'Magnetic adhesion' : body.grounded ? 'Wheel contact' : 'Free flight';
    set('replay-rocket',support+' · '+Math.round(body.energy)+'% fuel'+(body.boosting ? ' · Boost' : ''));
  }
  set('replay-driver','#'+driver.number+' '+driver.name);
  set('replay-place','P'+driver.position+' / 6');
  set('replay-speedometer',Math.round(p.speed*3.6)+' km/h');
  set('replay-gear',p.gear<0?'R':String(p.gear));
  set('replay-racetime',formatTime(driver.elapsedTicks));
  set('replay-progress',session.race.course.closed?'Lap '+driver.lap+' / 3':
    'Checkpoint '+driver.splitTicks.length+' / '+(session.race.course.gates.length-2));
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
  if(session.recording.version===5){
    scene.draw(session.race,{camera:$('replay-camera').value,follow:Number($('replay-follow').value),alpha,reducedMotion:reducedMotion.matches});return;
  }
  if(session.recording.version===DERBY_REPLAY_VERSION){
    const {world}=session.race;
    if (world.cars.every(car=>[car.x,car.z,car.yaw].every(Number.isFinite))) {
      scene.draw(world,{camera:$('replay-camera').value,follow:Number($('replay-follow').value),
        previous:session.previous,alpha:reducedMotion.matches?1:alpha});
    }
    return;
  }
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
  scene?.resetEffects?.();
  lastHud=-1;dashboard(true);
  notify('Restarted. Press Play to watch.');
}
function targetTick(tick){
  if(!session||!Number.isSafeInteger(tick))return;
  pause();
  seekTarget=Math.min(session.totalTicks,Math.max(0,tick));
  if(seekTarget<session.tick){session.reset();scene?.resetEffects?.();}
  notify('Seeking — simulating accepted race ticks…');
  $('replay-play').disabled=true;
  $('replay-evidence').disabled=true;
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
          if(session.recording.version===4) scene?.resetEffects?.();
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
          if(session.recording.version===5)notify('Experiment reconstructed · '+session.race.result+' · '+session.tick+' ticks.');
          else if(session.recording.version===DERBY_REPLAY_VERSION)
            notify('Derby reconstructed · '+derbyResult(session.race.result)+' · '+session.race.ticks+' accepted ticks.');
          else notify('Chequered flag! Race reconstructed from '+session.totalTicks+
            ' recorded ticks. Classification is shown at the left.');
        }
      }
      dashboard();
      render(elapsed);
    }catch(error){displayErrors(error);}
  }
  requestAnimationFrame(frame);
}
function installScene(race,nextEnvironment) {
  const crash=!!race.scenario,course=race.course,arena=race.world?.arena;
  nextEnvironment=crash||arena?'day':courseEnvironment(course,nextEnvironment);
  scene?.dispose();
  scene=null;
  const pixelRatio=coarse.matches?.75:1;
  scene=arena ? createDerbyArenaScene(canvas,arena,pixelRatio,{damagePanels:true}) :
    crash ? createCrashScene(canvas,race.scenario,pixelRatio) : createScene(canvas,course,pixelRatio,nextEnvironment);
  environment=nextEnvironment;
  $('replay-environment').value=environment;
  document.body.dataset.environment=environment;
}
function loadRecordedRace(data,sourceText,fileName){
  const candidate=createReplaySession(data,stamp);
  // Construct the new scene only after source/shape admission has succeeded.
  installScene(candidate.race,'day');
  session=candidate;
  imported=sourceText;currentFileName=fileName;
  seekTarget=null;pause();lastHud=-1;
  $('replay-seek').max=String(candidate.totalTicks);
  const crash=candidate.recording.version===5,derby=candidate.recording.version===DERBY_REPLAY_VERSION;
  const drivers=crash ? candidate.race.world.cars.map(c=>({id:c.id,label:c.id?'Opposing car':'Player'})) :
    FIELD.map(d=>({id:d.id,label:'#'+d.number+' '+d.name}));
  $('replay-follow').replaceChildren(...drivers.map(d=>new Option(d.label,String(d.id))));
  $('replay-follow').value=String(crash?0:PLAYER_ID);
  $('replay-camera').replaceChildren(...(crash?[['Chase','chase'],['Impact zone','fixture'],['Inspection','inspect']]:
    derby?[['Chase','chase'],['Arena','raised'],['Spectator follow','spectator']]:
    [['Low chase','chase'],['High chase','high']]).map(([text,value])=>new Option(text,value)));
  $('race-instruments').hidden=crash||derby;$('crash-instruments').hidden=!crash;
  $('derby-instruments').hidden=$('replay-evidence').hidden=!derby;
  $('replay-evidence').disabled=true;
  $('theatre-eliminations').replaceChildren();
  if(derby) $('theatre-derby-standing').replaceChildren(...FIELD.map(()=>{
    const row=document.createElement('li');
    row.append(document.createElement('span'),document.createElement('span'));
    return row;
  }));
  $('replay-nitro').hidden=$('replay-rocket').hidden=true;
  $('theatre-impacts').replaceChildren();selectedImpact='';
  $('replay-camera').value='chase';
  $('replay-rate').value='1';
  $('replay-empty').hidden=true;
  $('replay-telemetry').hidden=false;
  setControls(true);
  $('replay-environment').disabled=candidate.recording.version>=3;
  dashboard(true);
  const label=candidate.recording.compatibility==='exact'?'exact source':
    'verified compatible race physics at '+candidate.recording.revision;
  notify('Loaded '+(candidate.recording.arena??candidate.recording.scenario??candidate.recording.course)+' · '+candidate.totalTicks+
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
$('replay-follow').addEventListener('change',()=>{selectedImpact='';dashboard(true);});
$('theatre-impacts').onchange=()=>{selectedImpact=$('theatre-impacts').value;dashboard(true);};
$('theatre-hit-seek').onclick=()=>{
  const hit=session?.race.contacts?.find(h=>h.id===$('theatre-impacts').value);
  if(hit)targetTick(hit.tick);
};
$('theatre-elimination-seek').onclick=()=>{
  const picker=$('theatre-eliminations');
  const elimination=picker.value==='' ? null : session?.race.eliminations?.[Number(picker.value)];
  if(elimination) targetTick(elimination.tick);
};
$('replay-camera').addEventListener('change',()=>dashboard(true));
$('replay-environment').addEventListener('change',()=>{
  if(!session)return;
  try{
    installScene(session.race,$('replay-environment').value);
    frameTime=null;
    dashboard(true);
  }catch(error){displayErrors(error);}
});
function download(text,filename) {
  const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=filename;
  a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('replay-download').addEventListener('click',()=>{
  if(!session || !imported)return;
  download(imported,/^[a-zA-Z0-9_. -]{1,100}\.json$/.test(currentFileName)?
    currentFileName:'circuit-overdrive-replay.json');
});
$('replay-evidence').addEventListener('click',async()=>{
  if(session?.recording.version!==DERBY_REPLAY_VERSION || !session.finished)return;
  try {
    const receipt=await session.derbyEvidence(navigator.userAgent);
    download(JSON.stringify(receipt,null,2),'derby-'+receipt.arena+'-receipt.json');
  } catch(error) {notify('Cannot export evidence: '+String(error?.message||error));}
});
document.addEventListener('keydown',event=>{
  if(event.altKey||event.ctrlKey||event.metaKey||!session||event.target!==document.body)return;
  if(event.code==='Space'){$('replay-play').click();event.preventDefault();}
  if(event.code==='ArrowLeft'){targetTick(session.tick-300);event.preventDefault();}
  if(event.code==='ArrowRight'){targetTick(session.tick+300);event.preventDefault();}
  if(event.code==='Home'){targetTick(0);event.preventDefault();}
  if(event.code==='End'){targetTick(session.totalTicks);event.preventDefault();}
  if(event.code==='KeyV'){
    const picker=$('replay-camera');picker.selectedIndex=(picker.selectedIndex+1)%picker.length;
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
    try{installScene(session.race,environment);
      notify('Replay graphics restored after navigation. Press Play to resume.');}
    catch(error){displayErrors(error);}
  }
});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();pause();notify('WebGL context lost. Playback suspended.');});
canvas.addEventListener('webglcontextrestored',()=>{
  if(!session)return;
  try{installScene(session.race,environment);
    notify('Graphics restored. Press Play to resume.');}
  catch(error){displayErrors(error);}
});
if(!/^[0-9a-f]{40}$/.test(stamp))
  notify('This checkout has no verified revision stamp. Use GitHub Pages or a verified offline release ZIP.');
requestAnimationFrame(frame);
