// SPDX-License-Identifier: Apache-2.0
// Native WebGL comparison of exact packaged revisions. The browser routes add
// observations to existing draw sites. Inputs still go through the game's keyboard controls.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import {arch, release} from 'node:os';
import {countBrowserResources} from './browser-resources.mjs';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=new URL(process.argv[2]), dir=process.env.EVIDENCE_DIR;
const cycles=Number(process.env.CYCLES??8), baseline=process.env.BASELINE==='1';
const native=process.env.NATIVE_GL!=='0';
const fixtures={wall:{tick:220,face:'front',damage:815},glancing:{tick:209,face:'right',damage:19},
  opposing:{tick:180,face:'front',damage:401}};
assert(dir && Number.isSafeInteger(cycles) && cycles>=0);
await mkdir(dir,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN,
  args:native?['--enable-gpu','--use-angle=gl']:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const sum=values=>{
  const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
  const percentile=p=>Number(sorted[Math.ceil(sorted.length*p)-1].toFixed(4));
  return sorted.length?{samples:sorted.length,median:percentile(.5),p95:percentile(.95),worst:percentile(1)}:null;
};
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');

// After each draw only selected evidence samples retain meshes. Production frame
// timing collects one row per active frame and a bounded set of GPU timer queries.
function panelObserver({baseline}) {
  const sources=new WeakMap(), registered=new WeakMap();
  let handles=0, calls=null, frames=null, pending=[], serial=0, updateMs=0, geometry=[];
  const evidence=window.panelEvidence={picks:{},steps:false,last:null,disposals:[]};
  evidence.observeRenderer=Renderer=>{
    const p=Renderer.prototype, {mesh,update,draw,dispose}=p;
    p.mesh=function(vertices){
      const handle=mesh.call(this,vertices);
      sources.set(handle,{id:++handles,vertices,clean:vertices});
      registered.set(this,this.canvas.id);
      return handle;
    };
    p.update=function(handle,vertices){
      const start=performance.now();
      const result=update.call(this,handle,vertices);
      if(frames && this.canvas.id==='lab-world') updateMs+=performance.now()-start;
      if(result) sources.get(handle).vertices=vertices;
      return result;
    };
    p.draw=function(handle,options){
      if(calls && options?.matrix){
        const key=Array.from(options.matrix).join(',');
        if(!calls.has(key))calls.set(key,[]);
        calls.get(key).push(sources.get(handle));
      }
      return draw.call(this,handle,options);
    };
    p.dispose=function(){
      const id=registered.get(this), before=this.stats();
      dispose.call(this);
      if(id==='lab-world' && !before.disposed){
        const after=this.stats();
        evidence.disposals.push({before,after});
      }
    };
  };
  evidence.record=(trial, impactTick)=>{
    if(!evidence.steps)return;
    if(trial.firstImpact===null && trial.world.tick>=impactTick-2) evidence.picks.before=structuredClone(trial);
    if(trial.firstImpact!==null && !evidence.picks.hit) evidence.picks.hit=structuredClone(trial);
  };
  evidence.start=()=>{frames=[];geometry=[];updateMs=0;serial=0;};
  evidence.stop=()=>{const result={frames,updateMs,geometry};frames=null;return result;};
  evidence.generate=deform=>{
    if(!frames)return deform();
    const start=performance.now(), vertices=deform();
    geometry.push(performance.now()-start);
    return vertices;
  };
  evidence.wrap=(ms,canvas,scene,trial,options)=>{
    evidence.last={canvas,scene,trial,options};
    if(!frames || canvas.id!=='lab-world')return scene.draw(trial,options);
    const gl=canvas.getContext('webgl'), ext=gl.getExtension('EXT_disjoint_timer_query');
    if(ext && gl.getParameter(ext.GPU_DISJOINT_EXT)){
      for(const {query} of pending.splice(0))ext.deleteQueryEXT(query);
    } else while(pending.length && ext.getQueryObjectEXT(pending[0].query,ext.QUERY_RESULT_AVAILABLE_EXT)){
      const {query,row}=pending.shift();
      row.gpu=ext.getQueryObjectEXT(query,ext.QUERY_RESULT_EXT)/1e6;
      ext.deleteQueryEXT(query);
    }
    const active=trial.phase==='running';
    const query=active && ext && ++serial%8===0 && pending.length<4 && ext.createQueryEXT();
    if(query)ext.beginQueryEXT(ext.TIME_ELAPSED_EXT,query);
    const start=performance.now();
    scene.draw(trial,options);
    const row={ms,cpu:performance.now()-start};
    if(query){ext.endQueryEXT(ext.TIME_ELAPSED_EXT);pending.push({query,row});}
    if(active)frames.push(row);
  };
  evidence.shot=async function(canvas,scene,trial,options,png=true){
    const drawGroups=new Map();calls=drawGroups;
    try{scene.draw(trial,{...options,alpha:1,reducedMotion:true});}
    finally{calls=null;}
    // Wheels have their own transforms. The chassis pieces share one rigid
    // transform per vehicle, in the scene's car draw order.
    const gl=canvas.getContext('webgl');
    const pixels=png?new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4):null;
    if(pixels)gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    const pixelDigest=pixels?await crypto.subtle.digest('SHA-256',pixels):null;
    const data=pixelDigest?Array.from(new Uint8Array(pixelDigest),b=>b.toString(16).padStart(2,'0')).join(''):null;
    const groups=[...drawGroups.values()].filter(meshes=>meshes.length>=5);
    assertCarCount(groups.length,trial.world.cars.length);
    const body=await Promise.all(groups.map(group=>Promise.all(group.map(async ({id,vertices,clean})=>{
      // The v1.1.0 arithmetic reset can change the sign bit of vertex zero.
      const floats=baseline?Float32Array.from(vertices,v=>v===0?0:v):vertices;
      const hash=await crypto.subtle.digest('SHA-256',floats);
      let leftChanged=0,rearChanged=0;
      for(let i=0;i<vertices.length;i+=11){
        if(clean[i]<-.46 || clean[i+2]>.90){
          let changed=false;
          for(let j=0;j<11;j++)changed ||= !Object.is(vertices[i+j],clean[i+j]);
          if(changed && clean[i]<-.46)leftChanged++;
          if(changed && clean[i+2]>.90)rearChanged++;
        }
      }
      return {id,vertices:floats.length/11,leftChanged,rearChanged,
        hash:Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')};
    }))));
    return {body,tick:trial.world.tick,stats:scene.stats(),data};
  };
  function assertCarCount(got,expected){if(got!==expected)throw Error(`Expected ${expected} chassis draw groups, got ${got}`);}
}

try{
  const context=await browser.newContext({viewport:{width:2320,height:1134},deviceScaleFactor:1,acceptDownloads:true});
  const errors=[], captures={}, checks={}, readings=[], footprints=new Map();
  await context.addInitScript(countBrowserResources);
  await context.addInitScript(panelObserver,{baseline});
  const vendor='vendor/vanillajs/modules/render-lit/index.js';
  const routes={
    [vendor]:{append:'\nwindow.panelEvidence.observeRenderer(LitRenderer);'},
    'src/crash-scene.js':{changes:baseline?[
      ['deformPanels(part.vertices,d)','window.panelEvidence.generate(()=>deformPanels(part.vertices,d))']
    ]:[
      ['deformImpactPanel(panel,value)','window.panelEvidence.generate(()=>deformImpactPanel(panel,value))']
    ]},
    'src/crash-lab.js':{changes:[
      ['stepTrial(trial,command);','stepTrial(trial,command);window.panelEvidence.record(trial,'+JSON.stringify(Object.fromEntries(
        Object.entries(fixtures).map(([id,f])=>[id,f.tick])))+'[trial.scenario]);'],
      ["scene.draw(trial,{camera:$('lab-camera').value,follow:Number($('lab-follow').value),alpha:running()?alpha:1,reducedMotion:motion.matches});",
        "window.panelEvidence.wrap(ms,canvas,scene,trial,{camera:$('lab-camera').value,follow:Number($('lab-follow').value),alpha:running()?alpha:1,reducedMotion:motion.matches});"]]},
    'src/replay-theatre.js':{changes:[
      ["scene.draw(session.race,{camera:$('replay-camera').value,follow:Number($('replay-follow').value),alpha,reducedMotion:reducedMotion.matches});",
        "window.panelEvidence.wrap(0,canvas,scene,session.race,{camera:$('replay-camera').value,follow:Number($('replay-follow').value),alpha,reducedMotion:reducedMotion.matches});"]]}
  };
  await context.route('**/*',async route=>{
    const url=route.request().url();
    if(!url.startsWith(base.href)){errors.push('External request '+url);return route.abort();}
    const hook=routes[url.slice(base.href.length)];
    if(!hook)return route.continue();
    const response=await route.fetch();let source=await response.text();
    for(const [from,to] of hook.changes??[]){assert(source.includes(from),'Missing observation point: '+from);source=source.replace(from,to);}
    return route.fulfill({response,body:source+(hook.append??'')});
  });
  const page=await context.newPage();
  const watchErrors=p=>p.on('pageerror',error=>errors.push(error.message));
  watchErrors(page);
  const cdp=await context.newCDPSession(page);
  await page.goto(base.href);await page.locator('#enter-crash').click();
  const revision=await page.locator('meta[name=game-revision]').getAttribute('content');
  assert.match(revision,/^[a-f0-9]{40}$/);
  if(process.env.REPLAY_REVISION)assert.equal(revision,process.env.REPLAY_REVISION);
  await page.waitForFunction(()=>window.panelEvidence.last?.canvas.width===1920 && window.panelEvidence.last.canvas.height===1080);
  const graphics=await page.locator('#lab-world').evaluate(canvas=>{
    const gl=canvas.getContext('webgl'), ext=gl.getExtension('WEBGL_debug_renderer_info');
    return {renderer:gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),size:[gl.drawingBufferWidth,gl.drawingBufferHeight]};
  });
  if(native)assert(!/swiftshader|software|llvmpipe/i.test(graphics.renderer));

  async function save(name,data,tick){
    const bytes=Buffer.isBuffer(data)?data:Buffer.from(data.split(',')[1],'base64');
    captures[name]={sha256:sha256(bytes),tick};
    await writeFile(`${dir}/${name}.png`,bytes);
  }
  const shot=(p,options={},png=false)=>p.evaluate(async ({options,png})=>{
    const {canvas,scene,trial,options:current}=window.panelEvidence.last;
    return window.panelEvidence.shot(canvas,scene,trial,{...current,...options},png);
  },{options,png});
  const geometry=s=>s.body.map(group=>group.map(({hash,vertices})=>({hash,vertices})));
  const footprint=()=>page.evaluate(()=>{
    const rc=window.resources, {scene}=window.panelEvidence.last;
    const {meshes,vertices,bytes,uploads,skippedIdentical}=scene.stats();
    return {meshes,vertices,bytes,uploads,skippedIdentical,buffers:rc.uploads-rc.deletes,
      bufferBytes:rc.retainedBytes,programs:rc.programs-rc.deletedPrograms,programsCreated:rc.programs,
      webglUploads:rc.uploads,webglError:window.panelEvidence.last.canvas.getContext('webgl').getError()};
  });
  const setup=async scenario=>{
    await page.bringToFront();await page.locator('#scenario').selectOption(scenario);await page.locator('#lab-reset').click();
    await page.waitForFunction(id=>window.panelEvidence.last?.trial.scenario===id && window.panelEvidence.last.trial.world.tick===0,scenario);
  };
  const drive=async()=>{
    await page.locator('#lab-arm').click();
    await page.keyboard.down('ArrowUp');
    try{await page.waitForFunction(()=>window.panelEvidence.last?.trial.phase==='finished',null,{timeout:60000});}
    finally{await page.keyboard.up('ArrowUp');}
  };
  const download=async id=>{
    const pending=page.waitForEvent('download');await page.locator(id).click();
    const file=await pending, chunks=[];for await(const chunk of await file.createReadStream())chunks.push(chunk);
    const bytes=Buffer.concat(chunks);
    await writeFile(`${dir}/${file.suggestedFilename()}`,bytes);
    return bytes;
  };

  async function inspectReplay(tape,trial,clean,final){
    const theatre=await context.newPage();watchErrors(theatre);
    try{
      await theatre.goto(new URL('replay-theatre.html',base).href);
      await theatre.locator('#replay-file').setInputFiles({name:'trial.json',mimeType:'application/json',buffer:tape});
      await theatre.waitForFunction(()=>document.querySelector('#replay-status').textContent.startsWith('Loaded'));
      if(trial.scenario==='opposing')await theatre.locator('#replay-follow').selectOption('1');
      await theatre.locator('#replay-camera').selectOption('inspect');
      const seek=async tick=>{
        await theatre.locator('#replay-seek').evaluate((el,t)=>{el.value=t;el.dispatchEvent(new Event('input'));},tick);
        await theatre.waitForFunction(t=>window.panelEvidence.last?.trial.world.tick===t,tick);
        return shot(theatre,{},false);
      };
      assert.deepEqual(geometry(await seek(0)),geometry(clean));
      assert.deepEqual(geometry(await seek(trial.firstImpact-1)),geometry(clean));
      const impact=await seek(trial.firstImpact);
      assert.notDeepEqual(geometry(impact),geometry(clean));
      if(trial.scenario==='opposing')await save('replay-impact',await theatre.screenshot(),trial.firstImpact);
      assert.deepEqual(geometry(await seek(trial.world.tick)),geometry(final));
      assert.deepEqual(geometry(await seek(0)),geometry(clean));
      assert.deepEqual(geometry(await seek(trial.firstImpact)),geometry(impact));
      if(trial.scenario==='opposing')await save('replay-impact-reseek',await theatre.screenshot(),trial.firstImpact);
      for(const rate of ['1','2']){
        await theatre.locator('#replay-rate').selectOption(rate);await seek(0);
        await theatre.locator('#replay-play').click();
        await theatre.waitForFunction(t=>window.panelEvidence.last?.trial.world.tick===t,trial.world.tick);
        assert.deepEqual(geometry(await shot(theatre)),geometry(final));
      }
      return geometry(impact);
    }finally{await theatre.close();await page.bringToFront();}
  }

  // The capture drive is separate from the timing runs. It uses the real accepted
  // before/impact snapshots again at a fixed camera and draws an undamaged control
  // at the same pose. The control exists only in this browser test.
  for(const [scenario,{tick,face,damage}] of Object.entries(fixtures)){
    await setup(scenario);
    await page.locator('#lab-camera').selectOption('inspect');
    const clean=await shot(page,{camera:'inspect'},true);
    await save(scenario+'-clean',await page.screenshot(),0);
    await page.evaluate(()=>{window.panelEvidence.steps=true;window.panelEvidence.picks={};});
    await drive();
    const trial=await page.evaluate(()=>{window.panelEvidence.steps=false;return window.panelEvidence.last.trial;});
    const hit=trial.contacts[0];
    assert(hit.tick>=tick && hit.tick<=tick+4);
    assert.equal(hit.revision,revision);assert(hit.normalImpulse>0 && hit.dissipated>0);
    for(const site of hit.sites){assert.equal(site.zone,face);assert.equal(site.damage[face],damage);}
    if(scenario==='wall')assert.equal(hit.sites[0].damage.engine,733);
    const final=await shot(page,{camera:'inspect'});
    for(const car of final.body) assert.equal(new Set(car.map(mesh=>mesh.id)).size,car.length);
    assert.equal(new Set(final.body.flat().map(mesh=>mesh.id)).size,final.body.flat().length,'each car owns its body draw handles');
    assert.deepEqual(final.body.map(car=>car.map(mesh=>mesh.id)),clean.body.map(car=>car.map(mesh=>mesh.id)));
    const changed=geometry(final).map((group,car)=>group.filter((mesh,i)=>mesh.hash!==clean.body[car][i].hash).length);
    assert(changed.every(count=>count>0));
    if(!baseline)assert(changed.every(count=>count<=3),'only the affected meshes per zone change');
    const unchangedSide=face==='right'?'leftChanged':'rearChanged';
    const oppositeVerticesChanged=final.body.flat().reduce((total,mesh)=>total+mesh[unchangedSide],0);
    if(!baseline)assert.equal(oppositeVerticesChanged,0,'the opposite side preserves all original vertex attributes');
    await save(scenario+'-inspect-0',await page.screenshot(),trial.world.tick);
    if(scenario==='opposing'){
      await page.locator('#lab-follow').selectOption('1');
      await page.waitForFunction(()=>window.panelEvidence.last?.options.follow===1);
      assert.deepEqual(geometry(await shot(page)),geometry(final));
      await save(scenario+'-inspect-1',await page.screenshot(),trial.world.tick);
    }
    const tape=await download('#lab-save');await download('#lab-receipt');
    assert.equal(JSON.parse(tape).version,5);
    const replay=await inspectReplay(tape,trial,clean,final);
    const controlled=await page.evaluate(async base=>{
      const {createCrashScene}=await import(new URL('src/crash-scene.js',base));
      const panel=window.panelEvidence, {before,hit}=panel.picks;
      const canvas=document.createElement('canvas');
      Object.assign(canvas.style,{position:'fixed',left:'-1280px',top:'0',width:'1280px',height:'720px'});
      document.body.append(canvas);
      const scene=createCrashScene(canvas,hit.scenario), gl=canvas.getContext('webgl');
      const opposing=hit.scenario==='opposing';
      const options={follow:0,alpha:1,reducedMotion:true,camera:opposing?'fixture':'inspect'};
      // Inspect settled wall/rail damage where the solid fixture cannot hide
      // the struck panel. Use the exact first-contact pose for opposing cars.
      const damagedTrial=opposing?hit:panel.last.trial;
      const zero=structuredClone(damagedTrial);
      for(const car of zero.world.cars)for(const key of Object.keys(car.damage))car.damage[key]=0;
      function render(trial,view=options){
        scene.draw(trial,view);
        const rgba=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
        gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
        return {rgba,png:canvas.toDataURL()};
      }
      try{
        if(before.world.tick!==hit.world.tick-1)throw Error('Missing tick immediately before accepted contact');
        const contactOptions={...options,camera:'fixture'};
        render(before,contactOptions); // Warm the new drawing buffer before taking a capture.
        const {png:preImpact}=render(before,contactOptions), {png:contact}=render(hit,contactOptions);
        const liveImpact=await panel.shot(canvas,scene,hit,contactOptions,false);
        const clean=render(zero), damaged=render(damagedTrial), reset=render(zero);
        const width=gl.drawingBufferWidth,height=gl.drawingBufferHeight;
        let changed=0, resetChanged=0, minX=width, maxX=-1, minY=height, maxY=-1;
        for(let i=0;i<damaged.rgba.length;i+=4){
          if(damaged.rgba.slice(i,i+4).some((v,j)=>Math.abs(v-clean.rgba[i+j])>2)){
            const x=i/4%width,y=height-1-Math.floor(i/4/width);
            minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);changed++;
          }
          if(reset.rgba.slice(i,i+4).some((v,j)=>v!==clean.rgba[i+j]))resetChanged++;
        }
        return {preImpact,contact,liveImpact,controlTick:damagedTrial.world.tick,clean:clean.png,damaged:damaged.png,changed,resetChanged,
          bounds:[minX,minY,maxX,maxY],width,height};
      } finally {scene.dispose();canvas.remove();}
    },base.href);
    await save(`${scenario}-before-contact`,controlled.preImpact,hit.tick-1);
    await save(`${scenario}-contact`,controlled.contact,hit.tick);
    for(const key of ['clean','damaged'])await save(`${scenario}-control-${key}`,controlled[key],controlled.controlTick);
    assert(controlled.changed>0,`${scenario}: accepted damage produces visible pixels`);
    assert.deepEqual(geometry(controlled.liveImpact),replay,'Theatre regenerates the live accepted-impact geometry');
    if(!baseline)assert.equal(controlled.resetChanged,0,`${scenario}: controlled reset restores all pixels`);
    await page.locator('#lab-reset').click();await page.locator('#lab-camera').selectOption('inspect');
    await page.waitForFunction(()=>window.panelEvidence.last?.trial.world.tick===0 && window.panelEvidence.last.options.camera==='inspect');
    const reset=await shot(page,{},true);
    assert.deepEqual(geometry(reset),geometry(clean));
    // The fixed offscreen view is the pixel comparison. The live scene also
    // proves Reset Trial recreates the canonical Float32 input to WebGL.
    if(scenario==='wall')await save('wall-reset',await page.screenshot(),0);
    const {changed:changedPixels,resetChanged,bounds,width,height}=controlled;
    checks[scenario]={impact:hit,terminalTick:trial.world.tick,damage:trial.world.cars.map(car=>car.damage),
      liveResetPixelsIdentical:reset.data===clean.data,
      tapeSha256:sha256(tape),meshChanges:changed,oppositeVerticesChanged,pixels:{changedPixels,resetChanged,bounds,width,height},
      liveFinal:geometry(final),replayFirstImpact:replay};
  }

  for(let cycle=1;cycle<=cycles;cycle++){
    for(const scenario of Object.keys(fixtures)){
      await setup(scenario);
      const before=await footprint();
      await page.evaluate(()=>window.panelEvidence.start());
      await drive();
      await page.waitForTimeout(150);
      const damaged=await footprint();
      const {frames,updateMs,geometry}=await page.evaluate(()=>window.panelEvidence.stop());
      await page.locator('#lab-reset').click();
      await page.waitForFunction(()=>window.panelEvidence.last?.trial.world.tick===0);
      const reset=await footprint();
      await page.waitForTimeout(100);
      assert.deepEqual(await footprint(),reset,'idle frames must never upload geometry');
      const retained=({buffers,bufferBytes,meshes,vertices,bytes,programs,webglError})=>({buffers,bufferBytes,meshes,vertices,bytes,programs,webglError});
      assert.deepEqual(retained(damaged),retained(before));assert.deepEqual(retained(reset),retained(before));
      if(footprints.has(scenario))assert.deepEqual(retained(reset),footprints.get(scenario));
      else footprints.set(scenario,retained(reset));
      assert.equal(reset.programsCreated,before.programsCreated);assert.equal(reset.programs,2);assert.equal(reset.webglError,0);
      assert.equal(reset.buffers,reset.meshes+1);assert.equal(reset.bufferBytes,reset.bytes+24);
      const impactUploads=damaged.uploads-before.uploads,resetUploads=reset.uploads-damaged.uploads;
      assert(impactUploads>0 && resetUploads>0);assert.equal(reset.webglUploads-before.webglUploads,impactUploads+resetUploads);
      if(!baseline)assert(impactUploads<=(scenario==='opposing'?12:3) && resetUploads<=(scenario==='opposing'?6:3));
      await cdp.send('HeapProfiler.collectGarbage');
      const heap=await cdp.send('Runtime.getHeapUsage');
      const gpuDrawMs=sum(frames.map(f=>f.gpu));if(native)assert(gpuDrawMs);
      readings.push({cycle,scenario,frameIntervalMs:sum(frames.slice(1).map((f,i)=>f.ms-frames[i].ms)),
        drawCpuMs:sum(frames.map(f=>f.cpu)),gpuDrawMs,geometryCpuMs:sum(geometry),
        updateMs:Number(updateMs.toFixed(4)),impactUploads,resetUploads,
        skippedIdentical:reset.skippedIdentical-before.skippedIdentical,heapBytes:heap.usedSize,...retained(reset)});
    }
  }
  const disposal=await page.evaluate(()=>{
    dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false}));
    const {uploads,deletes,retainedBytes,programs,deletedPrograms}=window.resources;
    return {disposals:window.panelEvidence.disposals,buffers:uploads-deletes,retainedBytes,programs:programs-deletedPrograms};
  });
  assert.equal(disposal.buffers,0);assert.equal(disposal.retainedBytes,0);assert.equal(disposal.programs,0);
  assert(disposal.disposals.length>=cycles*3);
  for(const {before,after} of disposal.disposals){assert(before.meshes>0);assert.equal(after.meshes,0);assert.equal(after.bytes,0);}
  await setup('wall');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.locator('#lab-camera').selectOption('inspect');
  await drive();
  const beforeLoss=await shot(page,{},true);
  assert.deepEqual(geometry(beforeLoss),[checks.wall.liveFinal[0]]);
  await page.evaluate(()=>{
    window.labLoss=document.querySelector('#lab-world').getContext('webgl').getExtension('WEBGL_lose_context');
    window.labLoss.loseContext();
  });
  await page.waitForFunction(()=>document.querySelector('#lab-status').textContent==='Graphics suspended');
  await page.evaluate(()=>window.labLoss.restoreContext());
  await page.waitForFunction(()=>document.querySelector('#lab-status').textContent.startsWith('Graphics restored') &&
    !window.panelEvidence.last.scene.stats().lost);
  const afterLoss=await shot(page,{},true);
  assert.equal(afterLoss.tick,beforeLoss.tick);
  assert.deepEqual(geometry(afterLoss),geometry(beforeLoss));
  assert.notDeepEqual(afterLoss.body.map(group=>group.map(mesh=>mesh.id)),beforeLoss.body.map(group=>group.map(mesh=>mesh.id)));
  assert.deepEqual(errors,[]);
  const report={revision,browser:browser.version(),node:process.version,host:`${arch()} Linux ${release()}`,native,
    ...graphics,cycles,baseline,checks,captures,readings,contextRestoration:{tick:afterLoss.tick,geometry:geometry(afterLoss)},disposal:{...disposal,disposals:disposal.disposals.length},errors};
  await writeFile(`${dir}/browser-impact-panels.json`,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({revision,...graphics,cycles,scenarios:readings.length,disposal:report.disposal}));
}finally{await browser.close();}
