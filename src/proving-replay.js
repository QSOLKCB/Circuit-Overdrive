// SPDX-License-Identifier: Apache-2.0
// v7 is separate from historical Theatre v2-v6. Only inputs and a validated
// recorded build drive reconstruction; imported motion is never simulator state.
import {garageArray,garageInteger,garageRecord} from './garage-data.js';
import {BUILD_ENGINE_REVISION,compileVehicleBuild,identifyVehicleBuild} from './vehicle-builds.js';
import {PROVING_RULES,PROVING_STEP,PROVING_TRACK,PROVING_TESTS,
  createProvingRun,startProvingRun,stepProvingRun,stopProvingRun,validateProvingCommand} from './proving-ground.js';

export const PROVING_REPLAY_VERSION=7;
export const PROVING_REPLAY_BYTES=2*1024*1024;
export const PROVING_SEEK_STEPS=120;
const FORMAT='circuit-overdrive.proving-replay',SHA=/^[a-f0-9]{40}$/,DIGEST=/^[a-f0-9]{64}$/;
const admitted=new WeakSet();
const keys=['format','version','discipline','revision','engineRevision','modelId','ownedVehicleId',
  'buildRulesVersion','build','buildDigest','recipeDigest','trackId','rules','testId','testRules',
  'seed','step','driver','startingPose','ticks','runs','terminalStop','result','terminalStateDigest'];
const metricKeys=['accelerationSeconds','brakingDistanceM','brakingStartSpeedMps','slalomSeconds','handlingSeconds',
  'headingChangeRadians','lateralSlipIntegralM','maxLateralAccelerationMps2','pathM'];
const nullableMetrics=metricKeys.slice(0,5);
const diagnosticKeys=['minUpY','minGrounded','maxSpeedMps','maxAngularSpeed','maxWheelLoadN','maxCompressionM',
  'barrierContactTicks','solverTruncated','needsRecovery'];
const reasons=['stopped-by-player','solver-rejected-state','solver-limit-or-nonfinite','facility-enclosure',
  'barrier-contact','straight-corridor','braked-to-stop','slalom-boundary','handling-boundary','missed-timing-gate',
  'all-timing-gates','practice-limit','threshold-not-reached','fixed-command-tape-complete','test-time-limit'];
const freeze=value=>{
  if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}
  return value;
};
const copy=value=>JSON.parse(JSON.stringify(value));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function source(revision){
  if(typeof revision!=='string'||!SHA.test(revision))throw TypeError('Proving replay requires an exact source-stamped runtime');
  return revision;
}
function digestField(value,label){
  if(typeof value!=='string'||!DIGEST.test(value))throw TypeError('Invalid '+label+' digest');
  return value;
}
function finite(value,label,min=-1e12,max=1e12){
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw RangeError('Invalid '+label);
  return value===0?0:value;
}
function boolean(value,label){if(typeof value!=='boolean')throw TypeError('Invalid '+label);return value;}
function constantRecord(value,expected,label){
  const data=garageRecord(value,Object.keys(expected),label),accepted={};
  for(const [key,want] of Object.entries(expected)){
    if(Array.isArray(want)){
      const found=garageArray(data[key],want.length,want.length,label+' '+key);
      if(found.some((item,i)=>item!==want[i]))throw RangeError(label+' differs from recorded source rules');
      accepted[key]=found;
    }else{
      if(data[key]!==want)throw RangeError(label+' differs from recorded source rules');
      accepted[key]=want;
    }
  }
  return accepted;
}
function resultRecord(value,testId,ticks){
  const data=garageRecord(value,['status','reason','testId','acceptedTicks','elapsedSeconds','gatesPassed','metrics','diagnostics'],'Proving terminal result');
  if(!['completed','non-completion','invalid','physical-failure'].includes(data.status)||!reasons.includes(data.reason)||
      data.testId!==testId||data.acceptedTicks!==ticks||data.elapsedSeconds!==ticks*PROVING_STEP)throw RangeError('Invalid proving terminal metadata');
  const gatesPassed=garageInteger(data.gatesPassed,0,testId==='slalom'?6:testId==='handling'?8:0,'Terminal gates');
  const rawMetrics=garageRecord(data.metrics,metricKeys,'Terminal metrics'),metrics={};
  for(const key of metricKeys)metrics[key]=rawMetrics[key]===null&&nullableMetrics.includes(key)?null:
    finite(rawMetrics[key],'terminal '+key,key==='headingChangeRadians'?-1e12:0);
  const rawDiagnostics=garageRecord(data.diagnostics,diagnosticKeys,'Terminal diagnostics'),diagnostics={};
  for(const key of diagnosticKeys){
    const raw=rawDiagnostics[key];
    diagnostics[key]=['solverTruncated','needsRecovery'].includes(key)?boolean(raw,key):
      key==='minGrounded'?garageInteger(raw,0,4,key):key==='barrierContactTicks'?garageInteger(raw,0,ticks,key):
      finite(raw,key,key==='minUpY'?-1:0,key==='minUpY'?1:1e12);
  }
  return {status:data.status,reason:data.reason,testId,acceptedTicks:ticks,elapsedSeconds:ticks*PROVING_STEP,gatesPassed,metrics,diagnostics};
}
async function hash(value){
  const bytes=new TextEncoder().encode(JSON.stringify(value));
  const result=await globalThis.crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(result),byte=>byte.toString(16).padStart(2,'0')).join('');
}
function byteBound(data){
  if(new TextEncoder().encode(JSON.stringify(data)).length>PROVING_REPLAY_BYTES)throw RangeError('Proving replay exceeds 2 MiB UTF-8');
}
function header(value,revision){
  source(revision);
  const data=garageRecord(value,keys,'Proving replay');
  if(data.format!==FORMAT||data.version!==PROVING_REPLAY_VERSION||data.discipline!=='proving-ground')throw TypeError('Unsupported proving replay format/version');
  if(data.revision!==revision)throw RangeError('Proving replay needs its exact source revision');
  if(data.engineRevision!==BUILD_ENGINE_REVISION||data.trackId!==PROVING_TRACK.id||data.rules!==PROVING_RULES||data.step!==PROVING_STEP)throw RangeError('Unsupported proving engine, track or rules');
  if(typeof data.testId!=='string'||!Object.hasOwn(PROVING_TESTS,data.testId))throw RangeError('Unknown proving replay test');
  const accepted=compileVehicleBuild(data.modelId,data.build);
  if(data.buildRulesVersion!==accepted.rulesVersion)throw RangeError('Proving build rules mismatch');
  const ticks=garageInteger(data.ticks,1,PROVING_TESTS[data.testId].limitTicks,'Proving replay ticks');
  garageInteger(data.seed,0,0xffffffff,'Proving replay seed');
  if(!['manual','reference'].includes(data.driver))throw TypeError('Unknown proving replay driver');
  const run=createProvingRun({modelId:accepted.modelId,build:accepted.build,ownedVehicleId:data.ownedVehicleId,
    sourceRevision:revision,testId:data.testId,seed:data.seed,driver:data.driver});
  const rawRuns=garageArray(data.runs,1,ticks,'Proving command runs');
  let total=0;
  const runs=rawRuns.map(value=>{
    const row=garageRecord(value,['ticks','throttle','brake','steer'],'Proving command run');
    const count=garageInteger(row.ticks,1,ticks-total,'Proving command run ticks');
    const command=validateProvingCommand({throttle:row.throttle,brake:row.brake,steer:row.steer});
    total+=count;return {ticks:count,...command};
  });
  if(total!==ticks)throw RangeError('Truncated proving command stream');
  for(let i=1;i<runs.length;i++)if(['throttle','brake','steer'].every(key=>runs[i-1][key]===runs[i][key]))throw RangeError('Proving command runs must be canonical');
  const tape={format:FORMAT,version:PROVING_REPLAY_VERSION,discipline:'proving-ground',revision,
    engineRevision:BUILD_ENGINE_REVISION,modelId:accepted.modelId,ownedVehicleId:run.ownedVehicleId,
    buildRulesVersion:accepted.rulesVersion,build:accepted.build,
    buildDigest:digestField(data.buildDigest,'build'),recipeDigest:digestField(data.recipeDigest,'recipe'),
    trackId:PROVING_TRACK.id,rules:PROVING_RULES,testId:data.testId,
    testRules:constantRecord(data.testRules,PROVING_TESTS[data.testId],'Proving test rules'),
    seed:data.seed,step:PROVING_STEP,driver:data.driver,
    startingPose:constantRecord(data.startingPose,run.startingPose,'Proving starting pose'),
    ticks,runs,terminalStop:boolean(data.terminalStop,'terminal stop'),result:resultRecord(data.result,data.testId,ticks),
    terminalStateDigest:digestField(data.terminalStateDigest,'terminal state')};
  if(tape.terminalStop!==(tape.result.reason==='stopped-by-player'))throw RangeError('Proving terminal stop mismatch');
  byteBound(tape);
  return tape;
}
function cursor(tape){
  let run,at,row,left;
  function reset(){
    run=createProvingRun({modelId:tape.modelId,build:tape.build,ownedVehicleId:tape.ownedVehicleId,
      sourceRevision:tape.revision,testId:tape.testId,seed:tape.seed,driver:tape.driver});
    startProvingRun(run);at=0;row=0;left=tape.runs[0].ticks;
  }
  function one(){
    if(at===tape.ticks)return false;
    if(run.phase!=='running')throw RangeError('Proving replay terminates before its recorded tick count');
    const {throttle,brake,steer}=tape.runs[row];
    stepProvingRun(run,{throttle,brake,steer});at++;
    if(run.ticks!==at)throw RangeError('Proving replay command was not physically accepted');
    left--;if(left===0&&at<tape.ticks)left=tape.runs[++row].ticks;
    if(at===tape.ticks){
      if(tape.terminalStop){
        if(run.phase!=='running')throw RangeError('Player stop cannot replace a physical terminal');
        stopProvingRun(run);
      }
      if(run.phase!=='finished'||!same(run.result,tape.result))throw RangeError('Proving terminal result does not reproduce');
    }
    return true;
  }
  reset();
  return Object.freeze({tape,get run(){return run;},get tick(){return at;},get done(){return at===tape.ticks;},
    advance(steps=1){
      garageInteger(steps,0,PROVING_SEEK_STEPS,'Proving playback batch');
      let count=0;for(;count<steps&&one();count++){}return count;
    },
    seekBatch(target){
      garageInteger(target,0,tape.ticks,'Proving seek target');
      if(target<at)reset();
      return this.advance(Math.min(PROVING_SEEK_STEPS,target-at));
    }});
}
/** Full asynchronous admission. No result is accepted merely because a digest
 * string is present: commands must physically reconstruct the terminal result.
 */
export async function admitProvingReplay(value,revision,{yieldTask=async()=>{},cancelled=()=>false}={}){
  const check=()=>{if(cancelled())throw Error('Proving replay admission cancelled');};
  check();const tape=header(value,revision);
  const identity=await identifyVehicleBuild(tape.modelId,tape.build,revision);check();
  if(identity.buildDigest!==tape.buildDigest||identity.recipeDigest!==tape.recipeDigest)throw RangeError('Proving build or recipe digest mismatch');
  const playback=cursor(tape);
  while(!playback.done){playback.advance(PROVING_SEEK_STEPS);check();await yieldTask();check();}
  if(await hash(playback.run.vehicle)!==tape.terminalStateDigest)throw RangeError('Proving terminal physical state does not reproduce');
  check();freeze(tape);admitted.add(tape);return tape;
}
/** A finished accepted run supplies inputs, never a current-garage lookup. The
 * reconstructed recording is verified before it becomes exportable/playable.
 */
export async function createProvingRecording(run,options={}){
  if(!run||run.phase!=='finished'||!run.result)throw RangeError('Finish a proving run before recording export');
  const revision=source(run.sourceRevision),identity=await identifyVehicleBuild(run.modelId,run.build,revision);
  const tape={format:FORMAT,version:PROVING_REPLAY_VERSION,discipline:'proving-ground',revision,
    engineRevision:BUILD_ENGINE_REVISION,modelId:run.modelId,ownedVehicleId:run.ownedVehicleId,
    buildRulesVersion:run.build.rulesVersion,build:identity.build,buildDigest:identity.buildDigest,recipeDigest:identity.recipeDigest,
    trackId:PROVING_TRACK.id,rules:PROVING_RULES,testId:run.testId,testRules:PROVING_TESTS[run.testId],
    seed:run.seed,step:PROVING_STEP,driver:run.driver,startingPose:copy(run.startingPose),
    ticks:run.ticks,runs:copy(run.commandsRLE),terminalStop:run.result.reason==='stopped-by-player',
    result:copy(run.result),terminalStateDigest:await hash(run.vehicle)};
  return admitProvingReplay(tape,revision,options);
}
export async function parseProvingReplay(text,revision,options={}){
  if(typeof text!=='string'||new TextEncoder().encode(text).length>PROVING_REPLAY_BYTES)throw RangeError('Proving replay exceeds 2 MiB UTF-8');
  let value;try{value=JSON.parse(text);}catch{throw TypeError('Invalid proving replay JSON');}
  return admitProvingReplay(value,revision,options);
}
export function serializeProvingReplay(tape){
  if(!admitted.has(tape))throw TypeError('Proving replay must complete physical admission before export');
  const text=JSON.stringify(tape,null,2);
  if(new TextEncoder().encode(text).length>PROVING_REPLAY_BYTES)throw RangeError('Proving replay exceeds 2 MiB UTF-8');
  return text;
}
export function createProvingPlayback(tape){
  if(!admitted.has(tape))throw TypeError('Proving replay must complete physical admission before playback');
  return cursor(tape);
}
