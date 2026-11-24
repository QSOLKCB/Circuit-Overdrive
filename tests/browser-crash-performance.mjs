// SPDX-License-Identifier: Apache-2.0
// Observe the normal browser clock. All hooks below exist only in the runner.
import assert from 'node:assert/strict';
import {countBrowserResources} from './browser-resources.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=new URL(process.argv[2]),browser=await chromium.launch({executablePath:process.env.CHROME_BIN,args:['--enable-gpu','--use-angle=gl']});
const summarize=values=>{
  const v=values.filter(Number.isFinite).sort((a,b)=>a-b);
  assert(v.length>0);return {samples:v.length,median:v[Math.ceil(v.length*.5)-1],p95:v[Math.ceil(v.length*.95)-1],worst:v.at(-1)};
};
try{
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  const errors=[],cycles=[],retained=new Map();
  page.on('pageerror',e=>errors.push(e.message));
  const cdp=await page.context().newCDPSession(page);
  await page.addInitScript(countBrowserResources);
  async function observe(file,changes,suffix=''){
    await page.route(new URL('src/'+file+'.js',base).href,async route=>{
      const response=await route.fetch();let source=await response.text();
      for(const [from,to] of changes){assert(source.includes(from),file+' observation');source=source.replace(from,to);}
      return route.fulfill({response,body:source+suffix});
    });
  }
  await observe('crash-damage',[['const result=stepImpacts(world);','const ts=performance.now();const result=stepImpacts(world);window.solverMs=performance.now()-ts;']]);
  await observe('crash-lab',[
    ['stepTrial(trial,command);','const ts=performance.now();stepTrial(trial,command);window.stepSample(performance.now()-ts,trial);'],
    ["scene.draw(trial,{camera:$('lab-camera').value,follow:Number($('lab-follow').value),alpha:running()?alpha:1,reducedMotion:motion.matches});",
     "window.drawSample(ms,canvas,trial,()=>scene.draw(trial,{camera:$('lab-camera').value,follow:Number($('lab-follow').value),alpha:running()?alpha:1,reducedMotion:motion.matches}));"]
  ],'\nwindow.labSample=()=>({result:trial.result,tick:trial.world.tick,mesh:scene.stats()});');
  await observe('crash-scene',[['const sparks=renderer.mesh(new Float32Array(sparkle));','const sparks=renderer.mesh(new Float32Array(sparkle));window.sparkPools++;'],
    ['renderer.draw(sparks,{matrix:', 'window.flashes++;renderer.draw(sparks,{matrix:']]);
  await page.addInitScript(()=>{
    window.sparkPools=window.flashes=0;let ext,frames=0;const pending=[];
    window.resetSample=()=>{window.costs={frames:[],steps:[]};};
    window.resetSample();
    window.stepSample=(physics,t)=>window.costs.steps.push({physics,solver:window.solverMs,...t.lastStep,
      damage:t.lastContacts.filter(c=>c.sites.some(s=>Object.keys(s.damage).length)).length});
    window.drawSample=(ms,canvas,t,draw)=>{
      const gl=canvas.getContext('webgl');ext??=gl.getExtension('EXT_disjoint_timer_query');
      if(ext && gl.getParameter(ext.GPU_DISJOINT_EXT)){
        for(const {query} of pending.splice(0))ext.deleteQueryEXT(query);
      }else while(pending.length && ext.getQueryObjectEXT(pending[0].query,ext.QUERY_RESULT_AVAILABLE_EXT)){
        const {query,row}=pending.shift();row.gpu=ext.getQueryObjectEXT(query,ext.QUERY_RESULT_EXT)/1e6;ext.deleteQueryEXT(query);
      }
      const active=t.phase==='running',query=active && ext && ++frames%8===0 && pending.length<4 && ext.createQueryEXT();
      if(query)ext.beginQueryEXT(ext.TIME_ELAPSED_EXT,query);
      const ts=performance.now();draw();const row={ms,cpu:performance.now()-ts};
      if(query){ext.endQueryEXT(ext.TIME_ELAPSED_EXT);pending.push({query,row});}
      if(active)window.costs.frames.push(row);
    };
  });
  await page.goto(new URL('crash-lab.html',base).href);
  const revision=await page.locator('meta[name=game-revision]').getAttribute('content');
  assert.match(revision,/^[a-f0-9]{40}$/);if(process.env.REPLAY_REVISION)assert.equal(revision,process.env.REPLAY_REVISION);
  const chrome=await page.locator('#lab-world').evaluate(c=>[innerWidth-c.clientWidth,innerHeight-c.clientHeight]);
  await page.setViewportSize({width:1920+chrome[0],height:1080+chrome[1]});
  const graphics=await page.locator('#lab-world').evaluate(c=>{
    const gl=c.getContext('webgl'),ext=gl.getExtension('WEBGL_debug_renderer_info');
    return {renderer:gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),width:gl.drawingBufferWidth,height:gl.drawingBufferHeight};
  });
  assert(!/swiftshader|software|llvmpipe/i.test(graphics.renderer));
  await page.waitForFunction(()=>{const g=document.querySelector('#lab-world').getContext('webgl');return g.drawingBufferWidth===1920&&g.drawingBufferHeight===1080;});
  for(const scenario of ['wall','glancing','opposing','wall','glancing','opposing']){
    await page.locator('#scenario').selectOption(scenario);await page.locator('#lab-reset').click();
    const prior=await page.evaluate(()=>{window.resetSample();return {pools:window.sparkPools,flashes:window.flashes};});
    await page.locator('#lab-arm').click();await page.keyboard.down('ArrowUp');
    await page.waitForFunction(()=>!!window.labSample().result,null,{timeout:45000});await page.keyboard.up('ArrowUp');
    await page.waitForFunction(()=>resources.started>0 && resources.ended===resources.started && window.labSample().result);
    const data=await page.evaluate(()=>({...window.labSample(),...window.costs,resources:{...window.resources},
      sparkPools:window.sparkPools,flashes:window.flashes,width:document.querySelector('#lab-world').width,height:document.querySelector('#lab-world').height}));
    assert.equal(data.width,1920);assert.equal(data.height,1080);
    assert(data.steps.every(s=>!s.limited));assert(data.steps.some(s=>s.accepted && s.damage));
    assert.equal(data.sparkPools,prior.pools);assert(data.flashes>prior.flashes);
    const rc=data.resources,footprint=[rc.uploads-rc.deletes,rc.retainedBytes,rc.programs-rc.deletedPrograms,data.mesh.meshes];
    if(retained.has(scenario))assert.deepEqual(footprint,retained.get(scenario));retained.set(scenario,footprint);
    assert.equal(rc.pcm,4);assert(rc.peakVoices<=4);assert.equal(rc.started,rc.ended);
    await page.evaluate(()=>window.resetSample());await cdp.send('HeapProfiler.collectGarbage');
    const heap=await cdp.send('Runtime.getHeapUsage');
    const frames=data.frames,steps=data.steps,contact=steps.filter(s=>s.accepted);
    cycles.push({scenario,result:data.result,ticks:data.tick,frames:frames.length,
      intervalMs:summarize(frames.slice(1).map((f,i)=>f.ms-frames[i].ms)),
      physicsMs:summarize(steps.map(s=>s.physics)),solverMs:summarize(steps.map(s=>s.solver)),
      contactPhysicsMs:summarize(contact.map(s=>s.physics)),contactSolverMs:summarize(contact.map(s=>s.solver)),
      drawCpuMs:summarize(frames.map(f=>f.cpu)),gpuDrawMs:summarize(frames.map(f=>f.gpu)),
      candidatesPerTick:summarize(steps.map(s=>s.candidates)),contactsPerTick:summarize(steps.map(s=>s.accepted)),
      damageEventsPerTick:summarize(steps.map(s=>s.damage)),accepted:steps.reduce((n,s)=>n+s.accepted,0),
      damageEvents:steps.reduce((n,s)=>n+s.damage,0),retainedBuffers:footprint[0],retainedBytes:footprint[1],
      programs:footprint[2],meshes:footprint[3],sparkMeshesPerScene:1,flashFrames:data.flashes-prior.flashes,heapBytes:heap.usedSize,audio:rc});
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({revision,browser:browser.version(),renderer:graphics.renderer,
    width:1920,height:1080,viewport:page.viewportSize(),cycles},null,2));
}finally{await browser.close();}
