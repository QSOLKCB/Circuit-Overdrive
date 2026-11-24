// SPDX-License-Identifier: Apache-2.0
// Exercise the packaged preview through its ordinary controls and clock.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {countBrowserResources} from './browser-resources.mjs';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=new URL(process.argv[2]),dir=process.env.EVIDENCE_DIR;
const native=process.env.NATIVE_GL==='1';
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN,
  args:native?['--enable-gpu','--use-angle=gl']:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
function summarize(values) {
  const ordered=values.filter(Number.isFinite).sort((a,b)=>a-b);
  if(!ordered.length)return {samples:0};
  const at=p=>Number(ordered[Math.ceil(p*ordered.length)-1].toFixed(4));
  return {samples:ordered.length,median:at(.5),p95:at(.95),worst:at(1)};
}

// These observers leave input, stepping and rendering inside the packaged app.
function observePreview() {
  const pending=[];
  let frames,steps,first,fixtures,measure,draws;
  const drain=(gl,ext)=>{
    if(!ext)return;
    const disjoint=gl.getParameter(ext.GPU_DISJOINT_EXT);
    while(pending.length && (disjoint || ext.getQueryObjectEXT(pending[0].query,ext.QUERY_RESULT_AVAILABLE_EXT))){
      const {query,row}=pending.shift();
      if(!disjoint)row.gpu=ext.getQueryObjectEXT(query,ext.QUERY_RESULT_EXT)/1e6;
      ext.deleteQueryEXT(query);
    }
  };
  window.arenaProbe={
    begin(timed){frames=[];steps=[];first={};fixtures={};measure=timed;draws=0;},
    get first(){return first;},
    step(result,cpu){
      for(const hit of result.contacts)if(hit.newImpact){
        first[hit.kind]??=hit;
        if(hit.kind==='fixed')fixtures[hit.participants[1]]??=hit;
      }
      if(measure)steps.push({cpu,...result.stats});
    },
    draw(canvas,time,active,draw){
      if(!measure || !active)return draw();
      const gl=canvas.getContext('webgl'),ext=gl.getExtension('EXT_disjoint_timer_query');
      drain(gl,ext);
      const query=ext && ++draws%8===0 && pending.length<4 && ext.createQueryEXT();
      if(query)ext.beginQueryEXT(ext.TIME_ELAPSED_EXT,query);
      const start=performance.now();
      draw();
      const row={time,cpu:performance.now()-start};
      if(query){ext.endQueryEXT(ext.TIME_ELAPSED_EXT);pending.push({query,row});}
      frames.push(row);
    },
    end(canvas){
      const gl=canvas.getContext('webgl'),ext=gl.getExtension('EXT_disjoint_timer_query');
      drain(gl,ext);
      for(const {query} of pending.splice(0))ext.deleteQueryEXT(query);
      measure=false;
      return {frames,steps,first,fixtures};
    }
  };
  window.arenaProbe.begin(false);
}

try{
  if(dir)await mkdir(dir,{recursive:true});
  const page=await browser.newPage({viewport:{width:2320,height:1134},deviceScaleFactor:1});
  const errors=[],captures={},results=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(countBrowserResources);
  await page.addInitScript(observePreview);
  const previewFile=new URL('src/derby-arena-preview.js',base).href;
  await page.route('**/*',async route=>{
    const url=route.request().url();
    if(!url.startsWith(base.href)){errors.push('External request '+url);return route.abort();}
    if(url!==previewFile)return route.continue();
    const response=await route.fetch();
    let source=await response.text();
    const step='const result=stepDerbyArena(world,commands);';
    const draw='scene.draw(world,{camera:camera.value,previous,alpha:reducedMotion.matches||!running?1:alpha});';
    assert(source.includes(step)&&source.includes(draw));
    source=source.replace(step,'const start=performance.now();'+step+'window.arenaProbe.step(result,performance.now()-start);')
      .replace(draw,'window.arenaProbe.draw(canvas,time,running,()=>{'+draw+'});');
    source+='\nwindow.inspectArena=()=>({world,scene,running,finished,carContacts,fixtureContacts});';
    return route.fulfill({response,body:source});
  });
  await page.goto(base.href);
  await page.locator('#enter-crash').click();
  await page.getByRole('link',{name:/Derby arena preview/}).click();
  await page.waitForFunction(()=>window.inspectArena?.().scene?.stats().frames>0);
  const revision=await page.locator('meta[name=game-revision]').getAttribute('content');
  assert.match(revision,/^[a-f0-9]{40}$/);
  if(process.env.REPLAY_REVISION)assert.equal(revision,process.env.REPLAY_REVISION);
  const graphics=await page.locator('#arena-world').evaluate(canvas=>{
    const gl=canvas.getContext('webgl'),ext=gl.getExtension('WEBGL_debug_renderer_info');
    return {renderer:gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),width:gl.drawingBufferWidth,height:gl.drawingBufferHeight};
  });
  assert.equal(graphics.width,1920);
  assert.equal(graphics.height,1080);
  if(native)assert(!/swiftshader|software|llvmpipe/i.test(graphics.renderer));

  const snapshot=()=>page.evaluate(()=>{
    const {world,scene,carContacts,fixtureContacts}=window.inspectArena();
    const mesh=scene.stats(),resources=window.resources;
    const field={cars:world.cars,technicalStop:world.technicalStop,carContacts,fixtureContacts,
      latches:world.pairs.map(({a,b,active,episodeId,latchedAt})=>[a.id,b.id,active,episodeId,latchedAt])};
    return {id:world.arena.id,tick:world.tick,fixtures:world.barriers.length,mesh,field,
      received:window.arenaProbe.first,resources:{uploads:resources.uploads,buffers:resources.uploads-resources.deletes,
        bytes:resources.retainedBytes,programs:resources.programs-resources.deletedPrograms}};
  });
  async function capture(name) {
    const {id,tick}=await snapshot();
    const bytes=await page.screenshot(dir?{path:dir+'/'+name+'.png'}:{});
    captures[name]={arena:id,tick,sha256:sha256(bytes)};
  }
  async function choose(id) {
    await page.locator('#arena-choice').selectOption(id);
    await page.locator('#arena-camera').selectOption('raised');
    await page.locator('#arena-reset').click();
    await page.waitForFunction(arena=>{
      const {world,scene}=window.inspectArena();
      return world.arena.id===arena && world.tick===0 && scene.stats().frames>0;
    },id);
  }
  const run=page.locator('#arena-run'),status=page.locator('#arena-status');
  async function done() {
    await page.waitForFunction(()=>window.inspectArena().finished,null,{timeout:60000});
    assert.equal(await status.textContent(),'Launch complete');
  }
  const expected=[
    {id:'crucible',fixtures:8,vehicleTick:97,fixtureTick:276},
    {id:'iron-pit',fixtures:10,vehicleTick:94,fixtureTick:247}
  ];
  for(const item of expected){
    await choose(item.id);
    const grid=await snapshot();
    assert.equal(grid.fixtures,item.fixtures);
    assert.equal(grid.field.cars.length,6);
    assert(grid.field.cars.every(car=>car.vx===0 && car.vz===0 && Object.values(car.damage).every(d=>d===0)));
    assert.equal(grid.resources.buffers,grid.mesh.meshes+1);
    assert.equal(grid.resources.bytes,grid.mesh.bytes+24);
    assert.equal(grid.resources.programs,2);
    assert(grid.mesh.meshes<256 && grid.mesh.frameDraws<256 && grid.mesh.vertices<600000);
    await capture(item.id+'-grid');
    await page.evaluate(()=>window.arenaProbe.begin(false));
    await run.click();
    await page.waitForFunction(()=>Boolean(window.arenaProbe.first.vehicle),null,{timeout:60000});
    await run.click();
    assert.equal(await status.textContent(),'Paused');
    const paused=await snapshot();
    await page.waitForTimeout(150);
    assert.equal((await snapshot()).tick,paused.tick);
    await capture(item.id+'-first-contact');
    const before=paused.mesh.frames;
    await page.locator('#arena-camera').selectOption('reverse');
    await page.waitForFunction(prior=>window.inspectArena().scene.stats().frames>prior,before);
    assert.deepEqual((await snapshot()).field,paused.field);
    await capture(item.id+'-reverse');
    await run.click();
    await done();
    const first=await snapshot();
    assert.equal(first.tick,480);
    assert.equal(first.field.technicalStop,null);
    assert.equal(first.received.vehicle.tick,item.vehicleTick);
    assert.equal(first.received.fixed.tick,item.fixtureTick);
    assert(first.received.vehicle.normalImpulse>0 && first.received.fixed.normalImpulse>0);
    assert(first.field.carContacts>0 && first.field.fixtureContacts>0);
    assert(first.field.cars.every(car=>Object.values(car.damage).some(d=>d>0)));
    assert.equal(await page.locator('#arena-car-contacts').textContent(),String(first.field.carContacts));
    assert.equal(await page.locator('#arena-fixture-contacts').textContent(),String(first.field.fixtureContacts));
    assert.deepEqual(first.resources,grid.resources);

    await choose(item.id);
    const reset=await snapshot();
    assert.deepEqual(reset.field,grid.field);
    assert.deepEqual(reset.resources,grid.resources);
    await page.evaluate(()=>window.arenaProbe.begin(true));
    await run.click();
    await done();
    const terminal=await snapshot();
    assert.deepEqual(terminal.field,first.field,'paused and continuous launches produce the same state');
    assert.deepEqual(terminal.resources,grid.resources);
    const timing=await page.locator('#arena-world').evaluate(canvas=>window.arenaProbe.end(canvas));
    if(item.id==='iron-pit')assert(timing.fixtures[88] && timing.fixtures[89]);
    const intervals=timing.frames.slice(1).map((frame,i)=>frame.time-timing.frames[i].time);
    const gpu=summarize(timing.frames.map(frame=>frame.gpu));
    assert.equal(timing.steps.length,480);
    assert(timing.steps.every(step=>!step.limited));
    if(native)assert(gpu.samples>0);
    results.push({id:item.id,tick:terminal.tick,fixtures:grid.fixtures,cars:terminal.field.cars.length,
      carContacts:terminal.field.carContacts,fixtureContacts:terminal.field.fixtureContacts,first:timing.first,
      fixedEntries:timing.fixtures,
      fieldSha256:sha256(JSON.stringify(terminal.field)),resources:grid.resources,mesh:grid.mesh,
      intervalMs:summarize(intervals),cpuDrawMs:summarize(timing.frames.map(frame=>frame.cpu)),gpuDrawMs:gpu,
      physicsTickMs:summarize(timing.steps.map(step=>step.cpu)),
      peak:Object.fromEntries(['passes','pairChecks','rejectedPairs','candidates','sweepSamples','accepted']
        .map(key=>[key,Math.max(...timing.steps.map(step=>step[key]))]))});
  }

  // A->B->A must reclaim the retired renderer. A pause survives context loss.
  await page.evaluate(()=>{window.retiredArena=window.inspectArena().scene;});
  await choose('crucible');
  assert(await page.evaluate(()=>window.retiredArena.stats().disposed));
  const revisited=await snapshot(),original=results[0];
  assert.equal(revisited.resources.buffers,original.resources.buffers);
  assert.equal(revisited.resources.bytes,original.resources.bytes);
  await run.click();
  await page.waitForFunction(()=>window.inspectArena().world.tick>=6);
  await page.evaluate(()=>{
    window.dispatchEvent(new Event('blur'));
    window.arenaLoss=document.querySelector('#arena-world').getContext('webgl').getExtension('WEBGL_lose_context');
    window.arenaLoss.loseContext();
  });
  await page.getByText('Graphics suspended',{exact:true}).waitFor();
  const lost=await snapshot();
  await page.evaluate(()=>window.arenaLoss.restoreContext());
  await page.getByText('Graphics restored',{exact:true}).waitFor();
  await page.waitForFunction(()=>window.inspectArena().scene.stats().frames>0);
  const restored=await snapshot();
  assert.equal(restored.tick,lost.tick);
  assert.deepEqual(restored.field,lost.field);
  assert.equal(restored.mesh.meshes,original.mesh.meshes);
  assert.equal(restored.mesh.bytes,original.mesh.bytes);
  const disposal=await page.evaluate(()=>{
    const {scene}=window.inspectArena();
    const {deletes,retainedBytes,deletedPrograms}=window.resources;
    window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false}));
    return {stats:scene.stats(),buffers:window.resources.deletes-deletes,
      bytes:retainedBytes-window.resources.retainedBytes,programs:window.resources.deletedPrograms-deletedPrograms};
  });
  assert(disposal.stats.disposed && disposal.stats.meshes===0);
  assert.equal(disposal.buffers,restored.mesh.meshes+1);
  assert.equal(disposal.bytes,restored.mesh.bytes+24);
  assert.equal(disposal.programs,2);
  assert.deepEqual(errors,[]);
  const report={revision,browser:browser.version(),node:process.version,native,...graphics,results,captures,
    contextRestoration:{tick:restored.tick,meshes:restored.mesh.meshes,bytes:restored.mesh.bytes},disposal,errors};
  if(dir)await writeFile(dir+'/browser-arenas.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
