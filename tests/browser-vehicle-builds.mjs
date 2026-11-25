// SPDX-License-Identifier: Apache-2.0
// Development-only native ES module/solver check against a clean source server.
// This does not claim a workshop purchase, playable facility, or GPU benchmark.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {GARAGE_CATALOG} from '../src/garage-catalog.js';
import {identifyVehicleBuild,stockVehicleBuild} from '../src/vehicle-builds.js';
import {measureStockVehicle} from './vehicle-build-driver.mjs';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=new URL(process.argv[2] || 'http://127.0.0.1:8764/');
const root=new URL('../',import.meta.url);
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const revision=git('rev-parse','HEAD');
const sources=['src/vehicle-builds.js','src/garage-catalog.js','src/garage-data.js',
  'tests/vehicle-build-driver.mjs','vendor/vanillajs/modules/vehicle3d/index.js',
  'vendor/vanillajs/modules/math/index.js','vendor/vanillajs/modules/collision/index.js'];
assert.equal(git('status','--porcelain','--',...sources),'','Use clean committed measurement sources');
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN || undefined,
  args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
  const page=await browser.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  // Any static same-origin document suffices; no storage or game mutation occurs.
  await page.goto(new URL('index.html',base).href);
  const sha256={};
  for(const path of sources){
    const response=await page.request.get(new URL(path,base).href);
    assert(response.ok(),path);
    const bytes=await response.body();
    assert.deepEqual(bytes,await readFile(new URL(path,root)),'served source differs: '+path);
    sha256[path]=createHash('sha256').update(bytes).digest('hex');
  }
  const measurements=[];
  for(const {modelId} of GARAGE_CATALOG){
    const result=await page.evaluate(async ({base,modelId,revision})=>{
      const {measureStockVehicle}=await import(new URL('tests/vehicle-build-driver.mjs',base).href);
      const {identifyVehicleBuild,stockVehicleBuild}=await import(new URL('src/vehicle-builds.js',base).href);
      const first=measureStockVehicle(modelId),second=measureStockVehicle(modelId);
      if(JSON.stringify(first)!==JSON.stringify(second))throw Error('Browser repeat diverged');
      const identity=await identifyVehicleBuild(modelId,stockVehicleBuild(modelId),revision);
      return {measurement:first,buildDigest:identity.buildDigest,recipeDigest:identity.recipeDigest};
    },{base:base.href,modelId,revision});
    const expected=measureStockVehicle(modelId);
    const identity=await identifyVehicleBuild(modelId,stockVehicleBuild(modelId),revision);
    assert.equal(result.buildDigest,identity.buildDigest);
    assert.equal(result.recipeDigest,identity.recipeDigest);
    for(const [a,b] of [
      [result.measurement.acceleration.crossing.elapsedSeconds,expected.acceleration.crossing.elapsedSeconds],
      [result.measurement.braking.distanceM,expected.braking.distanceM],
      [result.measurement.steering.headingChangeRadians,expected.steering.headingChangeRadians]]){
      assert(Math.abs(a-b)<1e-6,'Node/browser measured metric differs beyond declared tolerance');
    }
    measurements.push(result);
  }
  assert.deepEqual(errors,[]);
  const receipt={revision,browser:browser.version(),userAgent:await page.evaluate(()=>navigator.userAgent),
    scope:'Development source modules; repeated physical stock runs. Software WebGL; no GPU performance claim.',
    crossRuntimeMetricTolerance:1e-6,sha256,measurements,errors};
  if(process.env.RECEIPT)await writeFile(process.env.RECEIPT,JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify({revision,browser:receipt.browser,models:measurements.length,errors},null,2));
}finally{await browser.close();}
