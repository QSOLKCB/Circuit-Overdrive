// SPDX-License-Identifier: Apache-2.0
// CO-REPLAY-001 — replay authority and bounded spectator playback.
// Only data from source-stamped, compatible replay files is accepted.
// Never imports code from recordings, reads a wall clock, or alters race rules.
import {createRace,startRace,stepRace,recoverCar} from './sim.js';
import {LAB_TICKS,createTrial,startTrial,stepTrial,scenarios} from './crash-trial.js';
import {LAB_RULES} from './crash-impact.js';
import {validateLabCommand} from './crash-damage.js';
import {track} from './track.js';
import {ridge} from './ridge.js';
import {skyway} from './skyway.js';
import {createRocketRace,startRocketRace,stepRocketRace,recoverRocketCar} from './rocket-race.js';
import {ROCKET_RULES} from './rocket-dynamics.js';
import {createNitroRace,startNitroRace,stepNitroRace,recoverNitroCar,NITRO_RULES} from './nitro-race.js';

export const MAX_REPLAY_BYTES=16*1024*1024;
export const MAX_REPLAY_TICKS=30*60*60;
export const MAX_SEEK_STEPS=240;
const V090='f7f45d1b6c3521dd728945b71cf20ab406603cb4';
const legacyNitroSources=Object.freeze([V090,'f36377549b2aec82edb150f80e73bc314d91cc30']);
export const REPLAY_COMPATIBLE_RELEASES=Object.freeze([
  '020e5dc4c7e2485e01f0f47c698f80ee58fe228b', // v0.6.0
  'd81a2d4a09286029b87c2ac201edf8ab6448e023', // v0.6.1
  'c97ee47e7577337032a55eb2e6ae53b855285573', // v0.6.2
  '3295b82004b64328072ac5fa64f8ba2b55394416', // v0.7.0
  '8204da56fce6b40ab33cb66c684a2e780f3e3001', // v0.8.0
  V090
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
function validateCrashTape(source,revision) {
  const fields=own(source,['version','revision','discipline','rules','scenario','seed','ticks','runs'],'Crash replay');
  const value=k=>fields[k].value;
  if(value('revision')!==revision)throw RangeError('Crash replay needs its exact source revision');
  const scenario=value('scenario'),seed=value('seed'),ticks=value('ticks'),raw=value('runs');
  if(value('discipline')!=='crash-lab' || value('rules')!==LAB_RULES ||
      typeof scenario!=='string' || !Object.hasOwn(scenarios,scenario))throw RangeError('Unknown experiment or rules');
  if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff || !Number.isSafeInteger(ticks)||ticks<1||ticks>LAB_TICKS ||
      !Array.isArray(raw)||raw.length<1||raw.length>ticks)throw RangeError('Invalid experiment duration or seed');
  dense(raw,raw.length,'Crash runs');
  let total=0;
  const runs=raw.map(row=>{
    dense(row,4,'Crash row');
    const [length,throttle,brake,steer]=row;
    validateLabCommand({throttle,brake,steer});
    if(!Number.isSafeInteger(length)||length<1 || length>ticks-total)throw RangeError('Invalid crash run length');
    total+=length;return Object.freeze(Array.from(row));
  });
  if(total!==ticks)throw RangeError('Truncated experiment');
  return Object.freeze({version:5,revision,discipline:'crash-lab',rules:LAB_RULES,scenario,seed,ticks,
    runs:Object.freeze(runs),compatibility:'exact'});
}
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
  const version=info.version.value;
  if (version===5) return validateCrashTape(recording,siteRevision);
  if (version!==2 && version!==3 && version!==4) throw RangeError('Unsupported replay version');
  const fields=own(recording,version===2 ? headerKeys : [...headerKeys,'discipline','rules'],'Replay');
  const get=name=>fields[name].value;
  const revision=get('revision');
  if(typeof revision!=='string'||!SHA.test(revision)) throw RangeError('Malformed source revision');
  const legacyNitro=version===3 && legacyNitroSources.includes(revision);
  const compatible=version===2 ? REPLAY_COMPATIBLE_RELEASES.includes(revision) : legacyNitro;
  if(revision!==siteRevision && !compatible)
    throw RangeError('This replay needs revision '+revision+
      '. Open an archive with matching physics; this Theatre cannot safely reinterpret it.');
  const course=get('course');
  const discipline=version===4 ? 'rocket' : 'nitro';
  const rules=version===4 ? ROCKET_RULES : legacyNitro ? 1 : NITRO_RULES;
  if (version===2 ? course!=='ridge' && course!=='speedway' :
      course!==(version===4 ? 'orbital' : 'skyway') || get('discipline')!==discipline || get('rules')!==rules)
    throw RangeError('Unsupported race course or discipline rules');
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
    dense(row,version===4 ? 8 : version===3 ? 7 : 5,'Replay run');
    const [length,throttle,brake,steer]=row;
    if(!Number.isSafeInteger(length)||length<1||
       !validUnit(throttle)||!validUnit(brake)||
       typeof steer!=='number'||!Number.isFinite(steer)||steer< -1||steer>1||
       typeof row[4]!=='boolean'||(version>=3 && typeof row[5]!=='boolean')||
       (version===3 && typeof row[6]!=='boolean')||
       (version===4 && (row[5]!==false||!Number.isInteger(row[6])||Math.abs(row[6])>1||typeof row[7]!=='boolean')))
      throw RangeError('Invalid replay control data');
    total+=length;
    if(total>ticks)throw RangeError('Replay ticks exceed declared duration');
    runs.push(Object.freeze(Array.from(row)));
  }
  if(total!==ticks)throw RangeError('Truncated replay command stream');
  return Object.freeze({version,...(version===2 ? {} : {discipline,rules}),revision,course,seed,ticks,runs:Object.freeze(runs),
    compatibility:revision===siteRevision?'exact':'verified-compatible'});
}
// The validator has already checked the exact row width and scalar types.
export function decodeReplayRun(version,row) {
  const command={throttle:row[1],brake:row[2],steer:row[3]};
  if (version===4) {
    command.boost=row[4]; command.dodge=row[6];
  } else if (version===3) {
    command.drift=row[4]; command.boost=row[5];
  }
  return {command,recover:version===5 ? false : row.at(-1)};
}
/** Rebuild from the race start on backwards seeks. No unbounded checkpoint
 * snapshots or arbitrary pose assignment. At most MAX_SEEK_STEPS per call.
 */
export function createReplaySession(source,siteRevision) {
  const tape=validateTheatreReplay(source,siteRevision);
  const crash=tape.version===5;
  const rules=crash ? {create:seed=>createTrial(tape.scenario,seed,tape.revision),start:startTrial,step:stepTrial} :
    tape.version===4 ? {create:createRocketRace,start:startRocketRace,step:stepRocketRace,recover:recoverRocketCar} :
    tape.version===3 ? {create:seed=>createNitroRace(seed,skyway,tape.rules),start:startNitroRace,step:stepNitroRace,recover:recoverNitroCar} :
    {create:seed=>createRace(seed,tape.course==='ridge' ? ridge : track),start:startRace,step:stepRace,recover:recoverCar};
  let race,at,runIndex,remaining;
  function reset(){
    race=rules.create(tape.seed);
    rules.start(race);
    at=0;runIndex=0;remaining=0;
  }
  function one(){
    if(at>=tape.ticks)return false;
    if(race.phase==='finished')throw RangeError(crash?'Controls after the experiment result':'Replay contains controls after the chequered flag');
    if(!remaining) {
      if(runIndex>=tape.runs.length)throw RangeError('Truncated replay');
      remaining=tape.runs[runIndex][0];
    }
    const {command,recover}=decodeReplayRun(tape.version,tape.runs[runIndex]);
    if(recover && !rules.recover(race)) throw RangeError('Replay requests an invalid recovery at tick '+at);
    rules.step(race,command);
    at++;remaining--;
    if(remaining===0)runIndex++;
    if(at===tape.ticks && race.phase!=='finished')
      throw RangeError(crash?'Recording ended before the experiment reached a result':'Replay ended before the recorded race reached the finish');
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
