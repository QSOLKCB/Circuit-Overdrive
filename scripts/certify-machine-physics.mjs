// SPDX-License-Identifier: Apache-2.0
// Development certification: independent pinned-solver observations, never game
// ownership, persistent damage, rewards or a substitute performance display.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createVehicle} from '../vendor/vanillajs/modules/vehicle3d/index.js';
import {rotate} from '../vendor/vanillajs/modules/math/index.js';
import {GARAGE_CATALOG} from '../src/garage-catalog.js';
import {compileVehicleBuild,stockVehicleBuild,identifyVehicleBuild} from '../src/vehicle-builds.js';
import {PROVING_TRACK,PROVING_TESTS,PROVING_STEP,createProvingRun,startProvingRun,
  stepProvingRun,referenceProvingCommand,provingReceipt} from '../src/proving-ground.js';
import {createProvingRecording,parseProvingReplay,serializeProvingReplay,createProvingPlayback} from '../src/proving-replay.js';
import {measurePartsComparison,extremePartBuild,PART_TEST_RULES} from '../tests/vehicle-parts-driver.mjs';

export const CERTIFICATION_TESTS=Object.freeze(['acceleration','braking','slalom','handling']);
export const CERTIFICATION_BUILDS=Object.freeze(['stock','responsive','soft-long','maximum']);
const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const speed=state=>Math.hypot(state.velocity[0],state.velocity[2]);
const heading=state=>{const forward=rotate(state.orientation,[0,0,-1]);return Math.atan2(forward[0],-forward[2]);};
const near=(actual,expected)=>assert(Math.abs(actual-expected)<1e-9*Math.max(1,Math.abs(expected)),actual+' differs from '+expected);
const sample=(run,tick)=>run.samples.find(row=>row.acceptedTick===tick).state;
const displacement=(a,b)=>Math.hypot(...a.terminal.position.map((value,i)=>value-b.terminal.position[i]));

export function certificationBuild(modelId,kind){
  if(kind==='stock')return stockVehicleBuild(modelId);
  if(kind==='responsive'||kind==='soft-long')return extremePartBuild(modelId,kind);
  if(kind!=='maximum')throw RangeError('Unknown certification configuration');
  const draft=structuredClone(extremePartBuild(modelId,'responsive'));
  draft.parts.engine='competition';draft.inventory.engine.push('competition');
  // Rivet's combined competition/intake/exhaust reaches 559 Nm and must reject.
  return compileVehicleBuild(modelId,draft).build;
}

const flatWorld={sampleSurface(x,z,maxY){
  const b=PROVING_TRACK.bounds;
  return x>=b.minX&&x<=b.maxX&&z>=b.minZ&&z<=b.maxZ&&maxY>=0?PROVING_TRACK.surface:null;
},barriers:PROVING_TRACK.barriers};

/** This observer never calls the game's step/gate/threshold helpers. Only the
 * immutable source track constants and accepted commands are shared. */
export function independentlyReconstruct(run){
  const accepted=compileVehicleBuild(run.modelId,run.build),solver=createVehicle(accepted.recipe);
  const stock=compileVehicleBuild(run.modelId,stockVehicleBuild(run.modelId)).recipe;
  const start=run.testId==='slalom'?PROVING_TRACK.slalom.start:run.testId==='handling'?PROVING_TRACK.handling.start:PROVING_TRACK.straight.start;
  const pose={position:[start[0],stock.wheel.radius+stock.suspension.restLength-stock.mass*9.81/(4*stock.suspension.spring),start[1]],
    yaw:0,pitch:0,roll:0,velocity:[0,0,0]};
  assert.deepEqual(pose,run.startingPose,'Recorded starting pose derives from the declared source');
  let state=solver.spawn(pose),ticks=0,crossing=null,braking=null,pathM=0,headingChange=0;
  const gates=[];
  for(const block of run.commandsRLE)for(let i=0;i<block.ticks;i++){
    const previous=state;
    state=solver.step(state,{throttle:block.throttle,brake:block.brake,steer:block.steer},flatWorld,PROVING_STEP);ticks++;
    assert(!state.truncated&&!state.needsRecovery,'Independent reconstruction must remain inside solver limits');
    assert.equal(state.contacts.length,0);
    const distance=Math.hypot(state.position[0]-previous.position[0],state.position[2]-previous.position[2]);pathM+=distance;
    const angle=heading(state)-heading(previous);headingChange+=Math.atan2(Math.sin(angle),Math.cos(angle));
    const before=speed(previous),after=speed(state);
    if(crossing===null&&before<100/3.6&&after>=100/3.6){
      crossing=(ticks-1+(100/3.6-before)/(after-before))*PROVING_STEP;
      if(run.testId==='braking')braking={pathM:0,startTick:ticks,startSpeedMps:after};
    }else if(braking)braking.pathM+=distance;
    const gate=PROVING_TRACK[run.testId]?.gates?.[gates.length];
    if(gate){
      const a=(previous.position[0]-gate.center[0])*gate.normal[0]+(previous.position[2]-gate.center[1])*gate.normal[1];
      const b=(state.position[0]-gate.center[0])*gate.normal[0]+(state.position[2]-gate.center[1])*gate.normal[1];
      if(a<0&&b>=0){
        const fraction=-a/(b-a),x=previous.position[0]+fraction*(state.position[0]-previous.position[0]),z=previous.position[2]+fraction*(state.position[2]-previous.position[2]);
        const lateral=(x-gate.center[0])*(-gate.normal[1])+(z-gate.center[1])*gate.normal[0];
        assert(Math.abs(lateral)<=gate.halfWidth,'Independent finite gate aperture');
        gates.push({id:gate.id,tick:ticks,fraction,time:(ticks-1+fraction)*PROVING_STEP});
      }
    }
  }
  assert.equal(ticks,run.ticks);assert.equal(state.tick,ticks*4);
  assert.deepEqual(state,run.vehicle,'Full actual solver state must reproduce, not just a changed field');
  assert.equal(crossing,run.result.metrics.accelerationSeconds);
  near(pathM,run.result.metrics.pathM);near(headingChange,run.result.metrics.headingChangeRadians);
  if(braking){near(braking.pathM,run.result.metrics.brakingDistanceM);assert.equal(braking.startSpeedMps,run.result.metrics.brakingStartSpeedMps);}
  if(gates.length){
    assert.equal(gates.length,run.gatesPassed);assert.deepEqual(gates.map(g=>g.id),run.gates.map(g=>g.id));
    near(gates.at(-1).time,run.result.metrics[run.testId==='slalom'?'slalomSeconds':'handlingSeconds']);
  }
  return {ticks,terminalStateSha256:hash(state),accelerationSeconds:crossing,
    brakingDistanceM:braking?.pathM??null,pathM,headingChangeRadians:headingChange,gates};
}

export function measureFacilityRun(modelId,kind,testId,revision){
  const run=createProvingRun({modelId,build:certificationBuild(modelId,kind),testId,sourceRevision:revision,driver:'reference',seed:0});
  startProvingRun(run);while(run.phase==='running')stepProvingRun(run,referenceProvingCommand(run));
  assert.equal(run.result.status,'completed',modelId+' / '+kind+' / '+testId+' must physically complete: '+run.result.reason);
  assert(!run.result.diagnostics.solverTruncated&&!run.result.diagnostics.needsRecovery);
  assert(run.vehicle.position.every(Number.isFinite)&&run.vehicle.angularVelocity.every(Number.isFinite));
  return run;
}

async function recordRun(run,kind,verifyRecording){
  const independent=independentlyReconstruct(run),receipt=await provingReceipt(run);
  let replay=null;
  if(verifyRecording){
    const exported=await createProvingRecording(run),text=serializeProvingReplay(exported);
    const admitted=await parseProvingReplay(text,run.sourceRevision),playback=createProvingPlayback(admitted);
    const middle=Math.floor(run.ticks/2);
    while(playback.tick<middle)playback.seekBatch(middle);
    while(!playback.done)playback.advance(120);
    assert.deepEqual(playback.run.vehicle,run.vehicle);assert.deepEqual(playback.run.result,run.result);
    while(playback.tick>0)playback.seekBatch(0);
    assert.equal(playback.tick,0);assert.deepEqual(playback.run.vehicle.position,run.startingPose.position);
    replay={bytes:Buffer.byteLength(text),sha256:hash(text),terminalStateDigest:admitted.terminalStateDigest,
      midpointSeek:middle,terminalTick:run.ticks,restartTick:playback.tick};
  }
  return {kind,modelId:run.modelId,testId:run.testId,build:run.build,sourceRevision:run.sourceRevision,
    buildDigest:receipt.buildDigest,recipeDigest:receipt.recipeDigest,startingPose:run.startingPose,
    seed:run.seed,step:PROVING_STEP,driver:run.driver,comparison:receipt.comparison,
    acceptedTicks:run.ticks,commandBlocks:run.commandsRLE.length,acceptedCommandSha256:hash(run.commandsRLE),
    ...(run.commandsRLE.length<=2?{commandsRLE:run.commandsRLE}:{}),
    result:run.result,independent,replay,
    terminalMotion:{position:run.vehicle.position,velocity:run.vehicle.velocity,orientation:run.vehicle.orientation,
      angularVelocity:run.vehicle.angularVelocity,gear:run.vehicle.gear,rpm:run.vehicle.rpm},
    fullReceiptSha256:hash(receipt)};
}

export async function certifyFacilityMatrix(revision,{models=GARAGE_CATALOG.map(model=>model.modelId),
  kinds=CERTIFICATION_BUILDS,tests=CERTIFICATION_TESTS,includeRaw=false}={}){
  const runs=[],rejections=[],raw=[];
  for(const modelId of models)for(const kind of kinds){
    try{certificationBuild(modelId,kind);}catch(error){
      assert.equal(modelId,'rivet-eight');assert.equal(kind,'maximum');assert.match(error.message,/550 Nm/);
      rejections.push({modelId,kind,reason:error.message});continue;
    }
    for(const testId of tests){
      const run=measureFacilityRun(modelId,kind,testId,revision);
      const verifyRecording=modelId==='cinder-two'&&kind==='stock'||kind==='responsive'&&testId==='acceleration';
      runs.push(await recordRun(run,kind,verifyRecording));
      if(includeRaw)raw.push(await provingReceipt(run));
    }
  }
  return {rules:{track:PROVING_TRACK,tests:PROVING_TESTS,builds:CERTIFICATION_BUILDS,
    independentObserver:'Raw pinned createVehicle, source-derived starting pose, accepted command stream; independent speed/path/gate computations and complete solver-state equality.',
    policy:'All runs declare seed0. Acceleration uses identical900 full-throttle calls; other reference policies may produce different accepted commands between builds. No part-only causality claim is made for feedback lap times.'},
    completed:runs.length,rejectedCombinations:rejections,runs,...(includeRaw?{raw}: {})};
}

function briefRig(run){
  return {start:run.start,terminal:run.terminal,pathM:run.pathM,crossing:run.crossing,brakeCompleted:run.brakeCompleted,
    verticalRangeM:run.verticalRangeM,headingChangeRadians:run.headingChangeRadians,diagnostics:run.diagnostics,
    shifts:run.shifts,samples:run.samples.filter(sample=>[3,120].includes(sample.acceptedTick)),fullRunSha256:hash(run)};
}
function effectDelta(before,after){
  return {accelerationSeconds:after.straight.crossing.elapsedSeconds-before.straight.crossing.elapsedSeconds,
    speedAt2SecondsMps:sample(after.straight,120).speedMps-sample(before.straight,120).speedMps,
    rpmAt2Seconds:sample(after.straight,120).rpm-sample(before.straight,120).rpm,
    firstShiftTicks:after.straight.shifts[0].acceptedTick-before.straight.shifts[0].acceptedTick,
    exactStartBrakingDistanceM:after.braking.pathM-before.braking.pathM,
    turnLateralSlipIntegralM:after.corner.diagnostics.lateralSlipIntegralM-before.corner.diagnostics.lateralSlipIntegralM,
    turnHeadingRadians:after.corner.headingChangeRadians-before.corner.headingChangeRadians,
    steeringAt3TicksRadians:sample(after.steering,3).steeringRadians-sample(before.steering,3).steeringRadians,
    steeringHeadingRadians:after.steering.headingChangeRadians-before.steering.headingChangeRadians,
    bumpMaxWheelLoadN:after.bump.diagnostics.maxWheelLoadN-before.bump.diagnostics.maxWheelLoadN,
    bumpVerticalRangeM:after.bump.verticalRangeM-before.bump.verticalRangeM,
    bumpMaxVerticalSpeedMps:after.bump.diagnostics.maxAbsVerticalSpeedMps-before.bump.diagnostics.maxAbsVerticalSpeedMps,
    bumpTerminalHeightM:after.bump.terminal.position[1]-before.bump.terminal.position[1]};
}
export function independentlyMeasurePartEffects(){
  const comparison=measurePartsComparison(),baseline=comparison.stock;
  for(const variant of comparison.variants){
    const after=variant.result;
    for(const key of ['straight','braking','corner','steering','bump'])assert.deepEqual(after[key].start,baseline[key].start,'Identical declared rig start');
    const delta=effectDelta(baseline,after);
    if(['engine','intake','exhaust','finalDrive'].includes(variant.slot)||variant.slot==='gearbox'&&variant.partId==='short'){
      assert(delta.accelerationSeconds<-.01);assert(delta.speedAt2SecondsMps>.01);assert(displacement(after.straight,baseline.straight)>.1);
    }
    if(variant.slot==='gearbox'&&variant.partId==='long'){assert(delta.speedAt2SecondsMps<-.1);assert(delta.rpmAt2Seconds<0);assert(delta.firstShiftTicks>10);}
    if(variant.slot==='gearbox'&&variant.partId==='short'||variant.slot==='finalDrive'){assert(delta.rpmAt2Seconds>0);assert(delta.firstShiftTicks< -10);}
    if(variant.slot==='tyres'){
      const direction=variant.partId==='economy'?1:-1;
      assert(delta.exactStartBrakingDistanceM*direction>.25);assert(delta.turnLateralSlipIntegralM*direction>.05);
      assert(displacement(after.corner,baseline.corner)>.1);
    }
    if(variant.slot==='suspension'){
      assert(Math.abs(delta.bumpMaxWheelLoadN)>50);assert(Math.abs(delta.bumpVerticalRangeM)>.005);
      assert(Math.abs(delta.bumpMaxVerticalSpeedMps)>.02);assert(Math.abs(delta.bumpTerminalHeightM)>.005);
    }
    if(variant.slot==='steering'){assert(delta.steeringAt3TicksRadians>0);assert(delta.steeringHeadingRadians>.02);assert(displacement(after.steering,baseline.steering)>.1);}
    if(variant.slot==='paint'){
      assert.deepEqual(after.recipe,baseline.recipe);
      for(const key of ['straight','braking','corner','steering','bump'])assert.deepEqual(after[key],baseline[key]);
    }
  }
  return comparison;
}
async function summarizeEffects(comparison,revision){
  async function bind(result){
    const identity=await identifyVehicleBuild(result.modelId,result.build,revision);
    return {modelId:result.modelId,build:result.build,recipe:result.recipe,sourceRevision:revision,
      buildDigest:identity.buildDigest,recipeDigest:identity.recipeDigest,
      ...Object.fromEntries(['straight','braking','corner','steering','bump'].map(key=>[key,briefRig(result[key])])),fullResultSha256:hash(result)};
  }
  const baseline=await bind(comparison.stock),variants=[];
  for(const row of comparison.variants)variants.push({slot:row.slot,partId:row.partId,
    expectedDirection:row.slot==='paint'?'No physical change':row.slot==='suspension'?'Changed spring/loading/heave/damping response; not a universal performance improvement':
      row.slot==='tyres'?'Lower slip/braking path for touring/performance; higher for economy':row.slot==='steering'?'Faster initial wheel-angle response and changed yaw/trajectory':
        row.partId==='long'?'Lower initial RPM/speed and later first shift':'Higher early speed and shorter 0–100 time under identical full-throttle commands',
    delta:effectDelta(comparison.stock,row.result),result:await bind(row.result)});
  return {rules:PART_TEST_RULES,scope:'Independent raw createVehicle engineering rigs. Exact-start braking and cosine-bump runs declare their own source-bound spawn velocities/surface; these are not user benchmarks or owned damage events.',baseline,variants};
}

export async function certifyMachinePhysics(revision,options={}){
  assert.match(revision,/^[a-f0-9]{40}$/);
  const parts=independentlyMeasurePartEffects();
  return {kind:'co-014f-machine-physical-certification-v1',revision,engineRevision:compileVehicleBuild('cinder-two',stockVehicleBuild('cinder-two')).engineRevision,
    units:'SI;60Hz accepted calls;4internal240Hz solver substeps per accepted call.',
    mechanical:await summarizeEffects(parts,revision),facility:await certifyFacilityMatrix(revision,options)};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const options=process.argv.slice(2);assert(options.length===0||options.length===1&&options[0]==='--raw','Usage: node scripts/certify-machine-physics.mjs [--raw]');
  const root=fileURLToPath(new URL('../',import.meta.url));
  const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const sources=['scripts/certify-machine-physics.mjs','tests/machine-physics-certification.test.mjs','tests/vehicle-parts-driver.mjs',
    'src/garage-catalog.js','src/garage-data.js','src/vehicle-parts.js','src/vehicle-builds.js','src/proving-ground.js','src/proving-replay.js',
    'vendor/vanillajs/modules/vehicle3d/index.js','vendor/vanillajs/modules/math/index.js','vendor/vanillajs/modules/collision/index.js'];
  const revision=git('rev-parse','HEAD'),modified=git('status','--porcelain','--',...sources);
  const result=await certifyMachinePhysics(revision,{includeRaw:options[0]==='--raw'});
  result.source={head:revision,workingTreeMatchesHead:modified==='',modified,
    sha256:Object.fromEntries(sources.map(name=>[name,hash(readFileSync(new URL('../'+name,import.meta.url)))]))};
  result.runtime={node:process.version,platform:process.platform,arch:process.arch};
  result.authority='No ownership mutation, purchase evidence, rewards or persistent damage. Browser controls separately certify purchased-car admission. Recreate long tapes from declared reference policy at this exact source and compare accepted command/full receipt hashes.';
  console.log(JSON.stringify(result,null,2));
}
