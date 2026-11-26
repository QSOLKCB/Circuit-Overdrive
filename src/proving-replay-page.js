// SPDX-License-Identifier: Apache-2.0
import {FixedClock} from '../vendor/vanillajs/modules/time/index.js';
import {parseProvingReplay,createProvingPlayback,PROVING_REPLAY_BYTES} from './proving-replay.js';
import {createProvingScene} from './proving-ground-scene.js';
import {attachDriverInput} from './driver-input.js';
import {savedMapper} from './profiles.js';
const $=id=>document.getElementById('pr-'+id),source=document.querySelector('meta[name="game-revision"]').content||null;
const clock=new FixedClock({step:1/60,maxFrame:.1,maxSteps:6}),reduced=matchMedia('(prefers-reduced-motion: reduce)');
let tape=null,cursor=null,scene=null,phase='empty',generation=0,lost=false,disposed=false,prior=null;
const task=()=>new Promise(resolve=>setTimeout(resolve,0));
const input=attachDriverInput(window,()=>false,action=>{
  if(action==='confirm'){toggle();return true;}if(action==='pause'){pause('Playback paused.');return true;}return false;
},reason=>pause(reason),null);
function status(text){$('status').textContent=text;}
function instruments(){
  const busy=['verifying','seeking'].includes(phase);
  $('play').disabled=!cursor||busy||lost;$('restart').disabled=!cursor||busy;$('seek').disabled=!cursor||busy;
  $('play').textContent=phase==='playing'?'Pause recording':'Play recording';
  $('progress').textContent=(cursor?.tick??0)+' / '+(tape?.ticks??0)+' ticks';
  $('seek').max=String(tape?.ticks??0);$('seek').value=String(cursor?.tick??0);
  $('result').textContent=JSON.stringify(tape?.result??null,null,2);
  const v=cursor?.run.vehicle;
  $('telemetry').textContent=JSON.stringify({phase,tick:cursor?.tick??0,totalTicks:tape?.ticks??0,
    position:v?.position??null,velocity:v?.velocity??null,orientation:v?.orientation??null,angularVelocity:v?.angularVelocity??null,
    modelId:tape?.modelId??null,ownedVehicleId:tape?.ownedVehicleId??null,build:tape?.build??null,
    recipeDigest:tape?.recipeDigest??null,sourceRevision:tape?.revision??null},null,2);
}
function pause(message){clock.setPaused(true);input.clear();if(phase==='playing')phase=cursor?.done?'finished':'paused';if(message)status(message);instruments();}
function makeScene(){
  scene?.dispose();scene=null;if(!cursor||lost)return;
  try{scene=createProvingScene($('world'),cursor.run,Math.min(2,devicePixelRatio||1));}
  catch(error){status('Graphics unavailable: '+error.message+'. Verified results and seeking remain available.');}
}
async function seek(target){
  if(!tape)return;pause();const token=++generation,original=tape;phase='seeking';instruments();
  try{
    const rebuilt=createProvingPlayback(original);
    while(rebuilt.tick!==target){
      rebuilt.seekBatch(target);await task();if(token!==generation||disposed)return;
    }
    cursor=rebuilt;phase=cursor.done?'finished':'paused';status('Reconstructed '+target+' accepted ticks from the recorded build.');instruments();
  }catch(error){if(token===generation){phase='rejected';status('Seek rejected: '+error.message);instruments();}}
}
function toggle(){
  if(!cursor||['verifying','seeking'].includes(phase)||lost)return;
  if(phase==='playing'){pause('Playback paused.');return;}
  if(cursor.done){seek(0);return;}
  phase='playing';clock.setPaused(false);$('world').focus({preventScroll:true});status('Playing accepted recorded commands.');instruments();
}
$('file').onchange=async()=>{
  const file=$('file').files[0];if(!file)return;
  pause();const token=++generation;phase='verifying';tape=cursor=null;scene?.dispose();scene=null;$('identity').textContent='';instruments();
  try{
    if(!source)throw Error('Use a source-stamped package to admit recordings.');
    if(file.size>PROVING_REPLAY_BYTES)throw Error('Recording exceeds 2 MiB.');
    status('Verifying source, build and complete accepted command stream…');
    const accepted=await parseProvingReplay(await file.text(),source,{yieldTask:task,cancelled:()=>token!==generation||disposed});
    if(token!==generation||disposed)return;
    tape=accepted;cursor=createProvingPlayback(tape);phase='ready';clock.reset();clock.setPaused(true);
    $('identity').textContent=tape.modelId+' · '+(tape.ownedVehicleId??'Unowned simulation')+' · build '+tape.buildDigest+' · source '+tape.revision;
    status('Verified original build and terminal result. Ready to play.');makeScene();instruments();
  }catch(error){if(token===generation){phase='rejected';status('Recording rejected: '+error.message);instruments();}}
  finally{if(token===generation)$('file').value='';}
};
$('play').onclick=toggle;$('restart').onclick=()=>seek(0);
$('seek').oninput=()=>seek(Number($('seek').value));
$('cancel').onclick=()=>{generation++;$('file').value='';phase=cursor?'paused':'empty';pause('Loading / seeking cancelled.');};
$('input').onchange=()=>{
  pause('Playback input changed.');const kind=$('input').value;
  const pad=kind==='gamepad'?input.pads.devices()[0]:null;
  const ok=kind==='gamepad'?pad&&input.select('gamepad',pad.index,savedMapper(pad)??undefined):input.select('keyboard');
  if(!ok){input.select('keyboard');$('input').value='keyboard';status('Controller unavailable. Keyboard controls remain available.');}
};
window.addEventListener('keydown',event=>{
  if(event.repeat||event.ctrlKey||event.altKey||event.metaKey||event.isComposing||/^(INPUT|SELECT|BUTTON|TEXTAREA)$/.test(event.target.tagName))return;
  if(event.code==='Space'){event.preventDefault();toggle();}
  if(['ArrowLeft','ArrowRight'].includes(event.code)&&tape){event.preventDefault();seek(Math.max(0,Math.min(tape.ticks,(cursor?.tick??0)+(event.code==='ArrowLeft'?-60:60))));}
});
window.addEventListener('blur',()=>pause('Focus lost. Playback paused.'));
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause('Page hidden. Playback paused.');});
$('world').addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;pause('Graphics interrupted. Playback paused.');});
$('world').addEventListener('webglcontextrestored',()=>{lost=false;makeScene();pause('Graphics restored. Press Play to continue.');});
window.addEventListener('pagehide',event=>{generation++;if(['verifying','seeking'].includes(phase))phase=cursor?'paused':'empty';pause();if(!event.persisted){disposed=true;scene?.dispose();}});
window.addEventListener('pageshow',event=>{if(event.persisted)pause('Page restored. Press Play to continue.');});
let frame;
frame=now=>{
  if(disposed)return;const elapsed=prior===null?0:Math.max(0,(now-prior)/1000);prior=now;input.menu();
  let alpha=1;
  if(phase==='playing'&&cursor&&!lost){alpha=clock.advance(elapsed,()=>{
    cursor.advance(1);if(cursor.done){phase='finished';pause('Recorded terminal result reproduced.');}
  }).alpha;}
  if(scene&&cursor&&!lost)try{scene.draw(cursor.run,{alpha,camera:$('camera').value,reducedMotion:reduced.matches});}
  catch(error){scene.dispose();scene=null;pause('Rendering stopped: '+error.message);}
  instruments();requestAnimationFrame(frame);
};
instruments();requestAnimationFrame(frame);
