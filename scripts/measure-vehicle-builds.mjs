// SPDX-License-Identifier: Apache-2.0
// Development stock certification receipts, not the later playable test facility.
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {GARAGE_CATALOG} from '../src/garage-catalog.js';
import {identifyVehicleBuild,stockVehicleBuild} from '../src/vehicle-builds.js';
import {measureStockVehicle,STOCK_TEST_RULES} from '../tests/vehicle-build-driver.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const sources=['src/vehicle-builds.js','src/garage-catalog.js','src/garage-data.js',
  'tests/vehicle-build-driver.mjs','scripts/measure-vehicle-builds.mjs',
  'vendor/vanillajs/modules/vehicle3d/index.js','vendor/vanillajs/modules/math/index.js',
  'vendor/vanillajs/modules/collision/index.js'];
const hash=text=>createHash('sha256').update(text).digest('hex');
const modified=git('status','--porcelain','--',...sources);
const head=git('rev-parse','HEAD');
const measurements=await Promise.all(GARAGE_CATALOG.map(async({modelId})=>{
  const receipt=measureStockVehicle(modelId);
  const identity=await identifyVehicleBuild(modelId,stockVehicleBuild(modelId),head);
  return {...receipt,sourceRevision:identity.sourceRevision,buildDigest:identity.buildDigest,
    recipeDigest:identity.recipeDigest,recipeSha256:hash(receipt.canonicalRecipe),receiptSha256:hash(JSON.stringify(receipt))};
}));
console.log(JSON.stringify({
  kind:'co-014a-stock-physical-receipts-v1',
  source:{head,workingTreeMatchesHead:modified==='',modified,
    sha256:Object.fromEntries(sources.map(name=>[name,hash(readFileSync(new URL('../'+name,import.meta.url)))]))},
  runtime:{node:process.version,platform:process.platform,arch:process.arch},
  units:'SI; +Y up, -Z forward. acceptedTicks are 60 Hz calls; solverSubsteps are 240 Hz internal steps.',
  comparison:'Same deterministic threshold policy and command values; stream lengths and braking start speeds differ. Stock designs vary in multiple mechanical parameters.',
  rules:STOCK_TEST_RULES,measurements,
},null,2));
