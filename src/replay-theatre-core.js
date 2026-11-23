// SPDX-License-Identifier: Apache-2.0
// CO-REPLAY-001 — replay authority and bounded spectator playback.
// Only data from source-stamped, compatible replay files is accepted.
// Never imports code from recordings, reads a wall clock, or alters race rules.
import {createRace,startRace,stepRace,recoverCar} from './sim.js';
import {track} from './track.js';
import {ridge} from './ridge.js';

export const MAX_REPLAY_BYTES=16*1024*1024;
export const MAX_REPLAY_TICKS=30*60*60;
export const MAX_SEEK_STEPS=240;
export const REPLAY_COMPATIBLE_RELEASES=Object.freeze([
  '020e5dc4c7e2485e01f0f47c698f80ee58fe228b', // v0.6.0
  'd81a2d4a09286029b87c2ac201edf8ab6448e023'  // v0.6.1
]);
const SHA=/^[0-9a-f]{40}$/;
const headerKeys=['version','revision','course','seed','ticks','runs'];
const own=(data,keys,name)=>{
  if(!data || typeof data!=='object' || Object.getPrototypeOf(data)!==Object.prototype)
    throw TypeError(name+' must be a plain JSON object');
  const descriptors=Object.getOwnPropertyDescriptors(data);
  const found=Reflect.ownKeys(descriptors);
  if(found.length!==keys.length || keys.some(key=>!Object.hasOwn(descriptors,key)) ||
    found.some(key=>typeof key!=='string'||!keys.includes(key) ||
      !Object.hasOwn(descriptors[key],'value')||!descriptors[key].enumerable))
    throw TypeError(name+' has missing, unknown or accessor fields');
  return descriptors;
};
function dense(values,length,name) {
  if(!Array.isArray(values)||Object.getPrototypeOf(values)!==Array.prototype ||
     values.length!==length)throw RangeError(name+' length');
  const descriptors=Object.getOwnPropertyDescriptors(values);
  if(Reflect.ownKeys(descriptors).length!==length+1)throw RangeError(name+' has extra or sparse elements');
  for(let i=0;i<length;i++){
    const item=descriptors[i];
    if(!item || !Object.hasOwn(item,'value') || !item.enumerable)
      throw TypeError(name+' must contain own data properties');
  }
  return descriptors;
}
const validUnit=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1;
/** Validated, copied RLE. Old source compatibility is allowed ONLY for the exact
 * releases whose authority blobs are pinned in tests/replay-theatre.test.mjs.
 */
export function validateTheatreReplay(recording,siteRevision) {
  if(typeof siteRevision!=='string'||!SHA.test(siteRevision))
    throw RangeError('Source revision unavailable. Open the verified GitHub Pages site or its stamped offline ZIP.');
  if(!recording || typeof recording!=='object')throw TypeError('Expected replay JSON data');
  // Check metadata before reading anything with possible getters.
  const info=Object.getOwnPropertyDescriptors(recording);
  if(!Object.hasOwn(info,'version')||!Object.hasOwn(info.version,'value'))throw TypeError('Replay version missing');
  if(info.version.value===1)
    throw RangeError('Legacy v1 replay has no source revision. Re-record it with a source-stamped release.');
  const fields=own(recording,headerKeys,'Replay');
  const get=name=>fields[name].value;
  if(get('version')!==2||typeof get('revision')!=='string'||!SHA.test(get('revision')))
    throw RangeError('Unsupported or malformed replay version');
  const revision=get('revision');
  if(revision!==siteRevision && !REPLAY_COMPATIBLE_RELEASES.includes(revision))
    throw RangeError('This replay needs revision '+revision+
      '. Open an archive with matching physics; this Theatre cannot safely reinterpret it.');
  const course=get('course');
  if(course!=='ridge'&&course!=='speedway')throw RangeError('Unsupported race course');
  const seed=get('seed');
  if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff)throw RangeError('Invalid replay seed');
  const ticks=get('ticks'),raw=get('runs');
  if(!Number.isSafeInteger(ticks)||ticks<1||ticks>MAX_REPLAY_TICKS)
    throw RangeError('Replay exceeds the permitted 30-minute tick budget');
  if(!Array.isArray(raw)||raw.length<1||raw.length>ticks)
    throw RangeError('Invalid replay runs');
  dense(raw,raw.length,'Replay runs');
  const runs=[];let total=0;
  for(const row of raw){
    dense(row,5,'Replay run');
    const [length,throttle,brake,steer,recover]=row;
    if(!Number.isSafeInteger(length)||length<1||
       !validUnit(throttle)||!validUnit(brake)||
       typeof steer!=='number'||!Number.isFinite(steer)||steer< -1||steer>1||
       typeof recover!=='boolean')throw RangeError('Invalid replay control data');
    total+=length;
    if(total>ticks)throw RangeError('Replay ticks exceed declared duration');
    runs.push(Object.freeze([length,throttle,brake,steer,recover]));
  }
  if(total!==ticks)throw RangeError('Truncated replay command stream');
  return Object.freeze({version:2,revision,course,seed,ticks,runs:Object.freeze(runs),
    compatibility:revision===siteRevision?'exact':'verified-compatible'});
}
/** Rebuild from the race start on backwards seeks. No unbounded checkpoint
 * snapshots or arbitrary pose assignment. At most MAX_SEEK_STEPS per call.
 */
export function createReplaySession(source,siteRevision) {
  const tape=validateTheatreReplay(source,siteRevision);
  const course=tape.course==='ridge'?ridge:track;
  let race,at,runIndex,remaining;
  function reset(){
    race=createRace(tape.seed,course);
    startRace(race);
    at=0;runIndex=0;remaining=0;
  }
  function one(){
    if(at>=tape.ticks)return false;
    if(race.phase==='finished')throw RangeError('Replay contains controls after the chequered flag');
    if(!remaining) {
      if(runIndex>=tape.runs.length)throw RangeError('Truncated replay');
      remaining=tape.runs[runIndex][0];
    }
    const row=tape.runs[runIndex],command={throttle:row[1],brake:row[2],steer:row[3]};
    if(row[4] && !recoverCar(race))throw RangeError('Replay requests an invalid recovery at tick '+at);
    stepRace(race,command);
    at++;remaining--;
    if(remaining===0)runIndex++;
    if(at===tape.ticks && race.phase!=='finished')
      throw RangeError('Replay ended before the recorded race reached the finish');
    return true;
  }
  reset();
  return {
    get race(){return race;},
    get tick(){return at;},
    get totalTicks(){return tape.ticks;},
    get recording(){return tape;},
    get finished(){return at===tape.ticks;},
    reset,
    step(){return one();},
    advance(steps){
      if(!Number.isSafeInteger(steps)||steps<0||steps>MAX_SEEK_STEPS)
        throw RangeError('Replay work batch exceeds its bound');
      let count=0;
      for(;count<steps&&one();count++){}
      return count;
    },
    seekBatch(target){
      if(!Number.isSafeInteger(target)||target<0||target>tape.ticks)
        throw RangeError('Invalid seek target');
      if(target<at)reset();
      return this.advance(Math.min(MAX_SEEK_STEPS,target-at));
    }
  };
}
