// SPDX-License-Identifier: Apache-2.0
// Source-bound development physical comparisons, not the later driving facility.
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {identifyVehicleBuild} from '../src/vehicle-builds.js';
import {measurePartsComparison,measurePartsEndurance} from '../tests/vehicle-parts-driver.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const options=process.argv.slice(2);
if(options.length>1||(options.length===1&&options[0]!=='--summary')){
  throw Error('Usage: node scripts/measure-vehicle-parts.mjs [--summary]');
}
const summaryOnly=options[0]==='--summary';
const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sources=['src/vehicle-builds.js','src/vehicle-parts.js','src/garage-catalog.js','src/garage-data.js',
  'tests/vehicle-parts-driver.mjs','scripts/measure-vehicle-parts.mjs',
  'vendor/vanillajs/modules/vehicle3d/index.js','vendor/vanillajs/modules/math/index.js',
  'vendor/vanillajs/modules/collision/index.js'];
const head=git('rev-parse','HEAD'),modified=git('status','--porcelain','--',...sources);
const comparison=measurePartsComparison(),endurance=measurePartsEndurance();
const bind=async result=>{
  const identity=await identifyVehicleBuild(result.modelId,result.build,head);
  return {...result,sourceRevision:head,buildDigest:identity.buildDigest,recipeDigest:identity.recipeDigest,
    recipeSha256:hash(result.canonicalRecipe),receiptSha256:hash(JSON.stringify(result))};
};
const stock=await bind(comparison.stock);
const variants=[];
for(const variant of comparison.variants)variants.push({...variant,result:await bind(variant.result)});
const runs=[];
for(const run of endurance)runs.push({...run,result:await bind(run.result)});
const full={kind:'co-014c-controlled-physical-parts-v1',
  source:{head,workingTreeMatchesHead:modified==='',modified,
    sha256:Object.fromEntries(sources.map(name=>[name,hash(readFileSync(new URL('../'+name,import.meta.url)))]))},
  runtime:{node:process.version,platform:process.platform,arch:process.arch},
  units:'SI. Accepted calls are 60 Hz; solverSubsteps are 240 Hz internal steps.',
  scope:'Hypothetical compiler-admitted development comparisons. These receipts do not claim purchases, installed inventory, rewards or a playable test facility.',
  rules:comparison.rules,modelId:comparison.modelId,stock,variants,endurance:runs
};
const fullText=JSON.stringify(full,null,2)+'\n';

// Keep full measured diagnostics and terminal states while omitting repeated
// intermediate samples from the review artifact. Source, build and recipe
// identities reconstruct every omitted sample using the unchanged driver.
const terminalStateColumns=Object.keys(stock.straight.terminal);
function summarizeRun(name,run,{referenceStock=false}={}){
  if(run===null)return null;
  const runDigest=hash(JSON.stringify(run));
  if(referenceStock&&runDigest===hash(JSON.stringify(stock[name]))){
    return {fullRunSha256:runDigest,identicalTo:'stock.'+name};
  }
  const sampleTick=name==='straight'?120:name==='steering'?3:null;
  const sample=sampleTick===null?null:run.samples.find(s=>s.acceptedTick===sampleTick);
  const selectedSample=sample?{
    acceptedTick:sample.acceptedTick,
    ...(name==='straight'?{speedMps:sample.state.speedMps,rpm:sample.state.rpm,gear:sample.state.gear,
      position:sample.state.position,velocity:sample.state.velocity}:
      {steeringRadians:sample.state.steeringRadians,headingRadians:sample.state.headingRadians,
        position:sample.state.position,angularVelocity:sample.state.angularVelocity})
  }:null;
  return {fullRunSha256:runDigest,pathM:run.pathM,crossing:run.crossing,
    brakeCompleted:run.brakeCompleted,verticalRangeM:run.verticalRangeM,
    headingChangeRadians:run.headingChangeRadians,shifts:run.shifts,
    diagnostics:run.diagnostics,selectedSample,terminalState:terminalStateColumns.map(name=>run.terminal[name])};
}
function summarizeResult(result,includeRecipe=true,referenceStock=false){
  const initial=result.corner.start;
  return {modelId:result.modelId,canonicalBuild:JSON.stringify(result.build),
    ...(includeRecipe?{recipe:result.recipe}:{}),
    sourceRevision:result.sourceRevision,rulesVersion:result.rulesVersion,engineRevision:result.engineRevision,
    buildDigest:result.buildDigest,recipeDigest:result.recipeDigest,recipeSha256:result.recipeSha256,
    fullResultSha256:result.receiptSha256,
    initialPose:{position:initial.position,orientation:initial.orientation,angularVelocity:initial.angularVelocity,
      steeringRadians:initial.steeringRadians,gear:initial.gear,rpm:initial.rpm,
      velocity:'Per test velocity is declared in rules; this common pose is taken from the actual accepted spawn.'},
    ...Object.fromEntries(['straight','braking','corner','steering','bump'].map(name=>[name,summarizeRun(name,result[name],{referenceStock})]))};
}
const summary={...full,kind:'co-014c-controlled-physical-parts-summary-v1',
  summaryPolicy:'Complete source/rules/identity, measured metrics/diagnostics and terminal states are retained. Terminal rows use the declared lossless column order. An identicalTo reference means the complete measured run, including all omitted samples, hashes identically to the named stock run. Timed samples are reduced to straight tick120 speed/RPM and steering tick3 response. Endurance recipes reconstruct from model, canonicalBuild and source and are checked against recipe digests. Every full run/result and complete default-output bytes have SHA-256 identities.',
  terminalStateColumns,
  fullRawReceipt:{sha256:hash(fullText),bytes:Buffer.byteLength(fullText),encoding:'UTF-8',
    command:'node scripts/measure-vehicle-parts.mjs',serialization:'JSON.stringify(full,null,2) followed by one LF'},
  stock:summarizeResult(stock),
  variants:variants.map(v=>({slot:v.slot,partId:v.partId,result:summarizeResult(v.result,true,true)})),
  endurance:runs.map(r=>({kind:r.kind,result:summarizeResult(r.result,false)}))};

// Compact bounded records/arrays remain readable on one line; larger records
// retain indentation. This changes only serialization, never measured values.
function reviewJSON(value,depth=0){
  const compact=JSON.stringify(value);
  if(value===null||typeof value!=='object'||compact.length<=1000)return compact;
  const indent='  '.repeat(depth),childIndent=indent+'  ';
  if(Array.isArray(value))return '[\n'+value.map(v=>childIndent+reviewJSON(v,depth+1)).join(',\n')+'\n'+indent+']';
  return '{\n'+Object.entries(value).map(([k,v])=>childIndent+JSON.stringify(k)+': '+reviewJSON(v,depth+1)).join(',\n')+'\n'+indent+'}';
}
console.log(summaryOnly?reviewJSON(summary):fullText.slice(0,-1));
