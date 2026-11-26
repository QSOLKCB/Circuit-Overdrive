// SPDX-License-Identifier: Apache-2.0
// Production-control stock benchmark and proposal matrix. No build, command,
// vehicle state, accepted result or ownership is injected into the application.
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=new URL(process.argv[2]||'http://127.0.0.1:8773/Circuit-Overdrive/'),evidence=process.env.EVIDENCE_DIR;
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||undefined,
  args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[],requests=[],captures=[],matrix=[],proposals=[];
const models=['cinder-two','lilt','evening-line','rivet-eight','yardhand','glass-comet'];
const tests=['acceleration','braking','slalom','handling'];
try{
  if(evidence)await mkdir(evidence,{recursive:true});
  const context=await browser.newContext({viewport:{width:1440,height:1080}});
  await context.route('**/*',route=>{
    const url=route.request().url();requests.push(url);
    if(url.startsWith(base.href)||url.startsWith('blob:')||url.startsWith('data:'))return route.continue();
    errors.push('Unexpected network request '+url);return route.abort();
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.status()>=400)errors.push(response.status()+' '+response.url());});
  await page.goto(new URL('proving-ground.html',base).href);
  const source=await page.locator('meta[name="game-revision"]').getAttribute('content');
  assert.match(source,/^[a-f0-9]{40}$/);if(process.env.SOURCE_SHA)assert.equal(source,process.env.SOURCE_SHA);
  const pg=id=>page.locator('#pg-'+id),json=async node=>JSON.parse(await node.textContent());
  const raw=()=>page.evaluate(()=>localStorage.getItem('circuit-overdrive.garage.v1'));
  assert.equal(await raw(),null,'Fresh certification profile has no invented garage');
  async function compare(testId){
    await pg('test').selectOption(testId);await pg('compare').click();
    await page.waitForFunction(testId=>{
      try{const r=JSON.parse(document.querySelector('#pg-comparison').textContent);return r.testId===testId&&r.results.length===2;}catch{return false;}
    },testId,{timeout:120000});
    const report=await json(pg('comparison'));
    for(const r of report.results){
      assert.equal(r.sourceRevision,source);assert.equal(r.engineRevision,'9d95d74b355ec17add32db0b55f0f71130f9c004');
      assert.equal(r.testId,testId);assert.equal(r.ownedVehicleId,null);assert.equal(r.seed,0);assert.equal(r.step,1/60);
      assert.equal(r.result.status,'completed');assert.equal(r.result.diagnostics.solverTruncated,false);assert.equal(r.result.diagnostics.needsRecovery,false);
      assert.equal(r.commandsRLE.reduce((sum,row)=>sum+row.ticks,0),r.acceptedTicks);
      assert(r.terminalState.position.every(Number.isFinite));assert(r.terminalState.velocity.every(Number.isFinite));
      if(testId==='slalom')assert.equal(r.result.gatesPassed,6);if(testId==='handling')assert.equal(r.result.gatesPassed,8);
    }
    assert.equal(await raw(),null,'Comparisons never create money, ownership, fitted parts or condition');
    return {testId,policy:report.comparisonPolicy,results:report.results.map(r=>({mode:r.mode,modelId:r.modelId,
      build:r.build,buildDigest:r.buildDigest,recipeDigest:r.recipeDigest,acceptedTicks:r.acceptedTicks,
      commandsSha256:createHash('sha256').update(JSON.stringify(r.commandsRLE)).digest('hex'),result:r.result}))};
  }
  for(const modelId of models){
    await pg('build-mode').selectOption('stock');await pg('stock-model').selectOption(modelId);
    await pg('test').selectOption('practice');await pg('driver').selectOption('manual');await pg('load').click();
    await page.waitForFunction(model=>{try{const t=JSON.parse(document.querySelector('#pg-telemetry').textContent);return t.modelId===model&&t.ticks===0;}catch{return false;}},modelId);
    await pg('arm').click();await page.keyboard.down('w');
    await page.waitForFunction(()=>JSON.parse(document.querySelector('#pg-telemetry').textContent).ticks>=45);
    await page.keyboard.up('w');await pg('arm').click();const live=await json(pg('telemetry'));
    assert.equal(live.modelId,modelId);assert(live.velocity.every(Number.isFinite));assert(Math.hypot(live.velocity[0],live.velocity[2])>.5);
    if(evidence){const name='stock-'+modelId+'.png',path=join(evidence,name);await pg('world').screenshot({path});
      captures.push({file:name,sha256:createHash('sha256').update(await readFile(path)).digest('hex')});}
    const runs=[];for(const testId of tests){const r=await compare(testId);assert(r.results.every(row=>row.modelId===modelId));runs.push(r);}
    matrix.push({modelId,liveAdmission:live,benchmarks:runs});
  }
  await pg('build-mode').selectOption('proposed');await pg('stock-model').selectOption('cinder-two');
  for(const [slot,part,testId] of [['engine','competition','acceleration'],['intake','duct','acceleration'],['exhaust','flow','acceleration'],
    ['gearbox','short','acceleration'],['gearbox','long','acceleration'],['finalDrive','adjustable','acceleration'],
    ['tyres','performance','handling'],['tyres','economy','handling'],['suspension','adjustable','handling'],['steering','quick','handling']]){
    await pg('proposed-slot').selectOption(slot);await pg('proposed-part').selectOption(part);
    proposals.push({slot,part,benchmark:await compare(testId)});
  }
  assert.equal(await raw(),null);assert.deepEqual(errors,[]);
  const report={kind:'co-014f-production-benchmark-matrix-v1',source,browser:browser.version(),url:base.href,
    scope:'Real production controls and accepted physical results; free simulations never create ownership. Software WebGL functional evidence, not native performance.',
    stockModels:matrix.length,stockBenchmarkPairs:matrix.reduce((sum,r)=>sum+r.benchmarks.length,0),proposalPairs:proposals.length,
    matrix,proposals,captures,requests:requests.length,errors};
  if(evidence)await writeFile(join(evidence,'machine-certification-browser.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({source,stockModels:matrix.length,stockBenchmarkPairs:24,proposalPairs:proposals.length,errors},null,2));
}finally{await browser.close();}
