// SPDX-License-Identifier: Apache-2.0
// Development evidence from the same authority as the playable facility.
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {GARAGE_CATALOG} from '../src/garage-catalog.js';
import {stockVehicleBuild,stockUpgradeBuild} from '../src/vehicle-builds.js';
import {PROVING_TRACK,PROVING_TESTS,createProvingRun,startProvingRun,
  stepProvingRun,referenceProvingCommand,provingReceipt} from '../src/proving-ground.js';

const options=process.argv.slice(2);
if(options.length>1||(options.length===1&&options[0]!=='--summary')){
  throw Error('Usage: node scripts/measure-proving-ground.mjs [--summary]');
}
const root=fileURLToPath(new URL('../',import.meta.url));
const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const hash=value=>createHash('sha256').update(value).digest('hex');
const sources=['src/proving-ground.js','src/vehicle-builds.js','src/vehicle-parts.js','src/garage-catalog.js',
  'src/garage-data.js','scripts/measure-proving-ground.mjs','tests/proving-ground.test.mjs',
  'vendor/vanillajs/modules/vehicle3d/index.js','vendor/vanillajs/modules/math/index.js',
  'vendor/vanillajs/modules/collision/index.js'];
const sourceRevision=git('rev-parse','HEAD'),modified=git('status','--porcelain','--',...sources);
async function run(modelId,testId,build){
  const run=createProvingRun({modelId,testId,build,sourceRevision,driver:'reference',seed:0});
  startProvingRun(run);
  while(run.phase==='running')stepProvingRun(run,referenceProvingCommand(run));
  return provingReceipt(run);
}
const stock=[];
for(const {modelId} of GARAGE_CATALOG){
  for(const testId of ['acceleration','braking','slalom','handling']){
    stock.push(await run(modelId,testId,stockVehicleBuild(modelId)));
  }
}
const variants=[];
for(const [slot,id,testId,tuning] of [
  ['engine','street','acceleration'],['intake','duct','acceleration'],['exhaust','flow','acceleration'],
  ['gearbox','short','acceleration'],['gearbox','long','acceleration'],
  ['finalDrive','adjustable','acceleration',{finalDrive:4}],
  ['tyres','performance','handling'],['tyres','economy','handling'],
  ['suspension','adjustable','handling',{spring:-2,damper:-2,travel:2}],
  ['suspension','adjustable','handling',{spring:2,damper:2,travel:0}],
  ['steering','quick','handling',{steering:2}]
]){
  const build=structuredClone(stockUpgradeBuild('cinder-two',stockVehicleBuild('cinder-two')));
  build.parts[slot]=id;build.inventory[slot].push(id);Object.assign(build.tuning,tuning);
  variants.push({slot,partId:id,tuning:tuning??null,receipt:await run('cinder-two',testId,build)});
}
const full={kind:'co-014d-proving-ground-physical-v1',
  source:{head:sourceRevision,workingTreeMatchesHead:modified==='',modified,
    sha256:Object.fromEntries(sources.map(name=>[name,hash(readFileSync(new URL('../'+name,import.meta.url)))]))},
  runtime:{node:process.version,platform:process.platform,arch:process.arch},
  scope:'Actual pinned vehicle3d measurements through the playable proving-ground authority. Development builds are hypothetical compiler-admitted comparisons with no owned ID, purchase, persistence, reward or damage claim. Browser journey evidence separately proves owned-car admission.',
  units:'SI. Accepted calls 60 Hz; pinned solver internally advances four 240 Hz substeps per accepted call.',
  track:PROVING_TRACK,tests:PROVING_TESTS,stock,variants};
const fullText=JSON.stringify(full,null,2)+'\n';
function summarize(receipt){
  return {sourceRevision:receipt.sourceRevision,engineRevision:receipt.engineRevision,
    modelId:receipt.modelId,ownedVehicleId:receipt.ownedVehicleId,canonicalBuild:JSON.stringify(receipt.build),
    buildDigest:receipt.buildDigest,recipeDigest:receipt.recipeDigest,canonicalRecipe:receipt.canonicalRecipe,
    trackId:receipt.trackId,rulesVersion:receipt.rulesVersion,testId:receipt.testId,seed:receipt.seed,
    step:receipt.step,driver:receipt.driver,comparison:receipt.comparison,startingPose:receipt.startingPose,
    acceptedTicks:receipt.acceptedTicks,commandBlocks:receipt.commandsRLE.length,
    acceptedCommandSha256:hash(JSON.stringify(receipt.commandsRLE)),
    ...(receipt.commandsRLE.length<=2?{commandsRLE:receipt.commandsRLE}:{}),
    accelerationCrossing:receipt.accelerationCrossing,braking:receipt.braking,gates:receipt.gates,
    result:receipt.result,terminalState:receipt.terminalState,
    fullReceiptSha256:hash(JSON.stringify(receipt))};
}
const summary={...full,kind:'co-014d-proving-ground-physical-summary-v1',
  summaryPolicy:'All source/build identities, starting conditions, gate crossings, actual metrics, diagnostics and full terminal states are retained. Long command tapes are SHA-256 bound; the full command reconstructs them through the declared deterministic feedback policy. Feedback tapes can differ between builds. Acceleration retains its identical fixed tape in full.',
  fullRawReceipt:{sha256:hash(fullText),bytes:Buffer.byteLength(fullText),encoding:'UTF-8',
    command:'node scripts/measure-proving-ground.mjs',serialization:'JSON.stringify(full,null,2) followed by one LF'},
  stock:stock.map(summarize),variants:variants.map(v=>({...v,receipt:summarize(v.receipt)}))};
console.log(options[0]==='--summary'?JSON.stringify(summary,null,2):fullText.slice(0,-1));
