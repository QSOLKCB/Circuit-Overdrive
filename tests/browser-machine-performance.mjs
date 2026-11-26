// SPDX-License-Identifier: Apache-2.0
// Native CO-014 workload profiler. Test-only observers wrap browser services;
// accepted ownership, builds, commands and physics are never injected or changed.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {cpus,platform,release} from 'node:os';
import {join} from 'node:path';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=new URL(process.argv[2]||'http://127.0.0.1:8773/Circuit-Overdrive/');
const evidence=process.env.EVIDENCE_DIR;
if(evidence)await mkdir(evidence,{recursive:true});
const software=process.env.MACHINE_PERF_SOFTWARE==='1';
const cycleCount=Number(process.env.MACHINE_PERF_CYCLES||8);
assert(Number.isInteger(cycleCount)&&cycleCount>=1&&cycleCount<=8);
if(!software)assert.equal(cycleCount,8,'Native certification requires eight complete cycles');
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||undefined,
  headless:software||process.env.MACHINE_HEADFUL==='0',
  args:software?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:['--enable-gpu','--use-angle=gl']});
const slot='circuit-overdrive.garage.v1',errors=[],warnings=[],requests=[],captures=[],periods=[],memory=[],cycles=[],nativeStockAdmissions=[];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const summary=values=>{
  const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b),n=sorted.length;
  if(!n)return null;const q=f=>sorted[Math.max(0,Math.ceil(n*f)-1)];
  return {samples:n,medianMs:q(.5),p95Ms:q(.95),worstMs:sorted.at(-1),meanMs:sorted.reduce((a,b)=>a+b,0)/n};
};
let source,runtime,acceptedRaw,isolated;
try{
  const viewport=software?{width:1280,height:720}:{width:1920,height:1080};
  const context=await browser.newContext({viewport,deviceScaleFactor:1,acceptDownloads:true});
  await context.route('**/*',route=>{
    const url=route.request().url();requests.push(url);
    if(url.startsWith(base.href)||url.startsWith('blob:')||url.startsWith('data:'))return route.continue();
    errors.push('Unexpected request '+url);return route.abort();
  });
  await context.addInitScript(()=>{
    const ids=new Set(['garage-canvas','pg-world','pr-world']);
    const nativeRAF=requestAnimationFrame.bind(window),contexts=new WeakSet(),bindings=new WeakMap();
    const buffers=new Map(),programs=new Set(),rows=[],events=[],audioContexts=new Set(),voices=new Set(),gains=new Set(),gainParams=new WeakMap();
    const resources={createdBuffers:0,deletedBuffers:0,invalidatedBuffers:0,liveBuffers:0,retainedBytes:0,
      uploads:0,uploadedBytes:0,createdPrograms:0,deletedPrograms:0,invalidatedPrograms:0,livePrograms:0,
      drawCalls:0,contextLosses:0,contextRestorations:0};
    const audio={created:0,closeCalls:0,closed:0,live:0,resumeCalls:0,createdSources:0,endedSources:0,liveSources:0,stateChanges:[],gainRamps:0,lastGainRamp:null};
    const gpu={available:null,created:0,completed:0,discarded:0,peakPending:0};
    let mode=null,current=null,glForQuery=null,ext=null,lastTicks=0,lastEvent=null;
    const pending=[];
    const counts=()=>({...resources});
    const update=()=>{resources.liveBuffers=buffers.size;resources.livePrograms=programs.size;};
    const pollGPU=()=>{
      if(!ext||!glForQuery||glForQuery.isContextLost())return;
      if(glForQuery.getParameter(ext.GPU_DISJOINT_EXT)){
        for(const item of pending.splice(0)){ext.deleteQueryEXT(item.query);gpu.discarded++;}return;
      }
      while(pending.length&&ext.getQueryObjectEXT(pending[0].query,ext.QUERY_RESULT_AVAILABLE_EXT)){
        const item=pending.shift();item.row.gpuMs=ext.getQueryObjectEXT(item.query,ext.QUERY_RESULT_EXT)/1e6;
        ext.deleteQueryEXT(item.query);gpu.completed++;
      }
    };
    function register(gl){
      if(contexts.has(gl))return;contexts.add(gl);
      gl.canvas.addEventListener('webglcontextlost',()=>{
        resources.contextLosses++;resources.invalidatedBuffers+=buffers.size;resources.invalidatedPrograms+=programs.size;
        buffers.clear();programs.clear();resources.retainedBytes=0;update();
        gpu.discarded+=pending.length;pending.length=0;ext=null;glForQuery=null;
      });
      gl.canvas.addEventListener('webglcontextrestored',()=>resources.contextRestorations++);
    }
    function beginGPU(gl){
      if(!mode||!current||current.query||pending.length>=8)return;
      if(!glForQuery){glForQuery=gl;ext=gl.getExtension('EXT_disjoint_timer_query');gpu.available=!!ext;}
      if(!ext||gl.isContextLost()||gl.getParameter(ext.GPU_DISJOINT_EXT))return;
      const query=ext.createQueryEXT();if(query){ext.beginQueryEXT(ext.TIME_ELAPSED_EXT,query);current.query=query;gpu.created++;}
    }
    for(const type of [globalThis.WebGLRenderingContext,globalThis.WebGL2RenderingContext].filter(Boolean)){
      for(const name of ['createBuffer','deleteBuffer','bindBuffer','bufferData','bufferSubData','createProgram','deleteProgram','clear','drawArrays','drawElements']){
        const original=type.prototype[name];type.prototype[name]=function(...args){
          if(!ids.has(this.canvas.id))return original.apply(this,args);register(this);
          if(name==='clear')beginGPU(this);
          const start=name.startsWith('draw')?performance.now():0,result=original.apply(this,args);
          if(name==='createBuffer'&&result){resources.createdBuffers++;buffers.set(result,0);}
          if(name==='deleteBuffer'&&args[0]){resources.deletedBuffers++;resources.retainedBytes-=buffers.get(args[0])||0;buffers.delete(args[0]);}
          if(name==='bindBuffer'){let bound=bindings.get(this);if(!bound){bound=new Map();bindings.set(this,bound);}bound.set(args[0],args[1]);}
          if(name==='bufferData'||name==='bufferSubData'){
            const data=args[name==='bufferData'?1:2],bytes=typeof data==='number'?data:data?.byteLength??0;
            resources.uploads++;resources.uploadedBytes+=bytes;
            if(name==='bufferData'){const buffer=bindings.get(this)?.get(args[0]);if(buffers.has(buffer)){resources.retainedBytes+=bytes-buffers.get(buffer);buffers.set(buffer,bytes);}}
          }
          if(name==='createProgram'&&result){resources.createdPrograms++;programs.add(result);}
          if(name==='deleteProgram'&&args[0]){resources.deletedPrograms++;programs.delete(args[0]);}
          if(name.startsWith('draw')){resources.drawCalls++;if(current){current.draws++;current.glSubmissionMs+=performance.now()-start;}}
          update();return result;
        };
      }
    }
    const NativeAudio=globalThis.AudioContext;
    if(NativeAudio)globalThis.AudioContext=class extends NativeAudio{
      constructor(...args){super(...args);audio.created++;audioContexts.add(this);audio.live=audioContexts.size;
        this.addEventListener('statechange',()=>{if(audio.stateChanges.length<100)audio.stateChanges.push(this.state);});}
      createGain(...args){const node=super.createGain(...args);gains.add(node);gainParams.set(node.gain,this);return node;}
      createBufferSource(...args){const node=super.createBufferSource(...args);audio.createdSources++;voices.add(node);audio.liveSources=voices.size;
        node.addEventListener('ended',()=>{audio.endedSources++;voices.delete(node);audio.liveSources=voices.size;});return node;}
      resume(...args){audio.resumeCalls++;return super.resume(...args);}
      close(...args){audio.closeCalls++;const result=super.close(...args);return result.then(value=>{
        audio.closed++;audioContexts.delete(this);audio.live=audioContexts.size;return value;
      });}
    };
    if(globalThis.AudioParam){
      const ramp=AudioParam.prototype.linearRampToValueAtTime;
      AudioParam.prototype.linearRampToValueAtTime=function(value,when){
        const context=gainParams.get(this);if(context){audio.gainRamps++;audio.lastGainRamp={value,when,contextTime:context.currentTime};}
        return ramp.call(this,value,when);
      };
    }
    for(const type of ['click','change']){
      document.addEventListener(type,event=>{
        const id=event.target.closest?.('button,select')?.id;
        if(mode==='workshop-selections'&&/^garage-(?:model-|camera-|parts-)/.test(id||''))lastEvent={id,type,start:performance.now()};
      },true);
      document.addEventListener(type,event=>{
        if(lastEvent&&lastEvent.type===type&&events.length<500)events.push({...lastEvent,eventDispatchMs:performance.now()-lastEvent.start});
      });
    }
    window.requestAnimationFrame=callback=>nativeRAF(function(time){
      if(callback.name!=='frame')return callback(time);pollGPU();
      const row={mode,time,draws:0,glSubmissionMs:0},start=performance.now();current=row;
      try{callback(time);}finally{
        row.callbackMs=performance.now()-start;
        if(row.query&&ext&&!glForQuery.isContextLost()){
          ext.endQueryEXT(ext.TIME_ELAPSED_EXT);pending.push({query:row.query,row});delete row.query;
          gpu.peakPending=Math.max(gpu.peakPending,pending.length);
        }
        const node=document.getElementById('pg-telemetry')||document.getElementById('pr-telemetry');
        if(node)try{const value=JSON.parse(node.textContent),ticks=value.ticks??value.tick??0;row.acceptedSteps=Math.max(0,ticks-lastTicks);lastTicks=ticks;}catch{}
        if(lastEvent){row.action=lastEvent.id;row.actionToCallbackMs=performance.now()-lastEvent.start;lastEvent=null;}
        if(mode&&rows.length<15000)rows.push(row);current=null;
      }
    });
    window.machinePerf={resources,audio,gpu,rows,events,pollGPU,
      mode(value){mode=value;lastEvent=null;},
      reset(){rows.length=0;events.length=0;lastEvent=null;},
      snapshot(){return {resources:counts(),audio:{...audio,stateChanges:audio.stateChanges.slice(),gainValues:[...gains].map(node=>node.gain.value)},gpu:{...gpu},pendingQueries:pending.length};}};
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(['warning','error'].includes(message.type()))warnings.push({type:message.type(),text:message.text()});});
  page.on('response',response=>{if(response.status()>=400)errors.push(response.status()+' '+response.url());});
  const cdp=await context.newCDPSession(page),el=id=>page.locator('#'+id);
  const json=async id=>JSON.parse(await el(id).textContent());
  const raw=()=>page.evaluate(key=>localStorage.getItem(key),slot);
  async function stamped(){
    const value=await page.locator('meta[name="game-revision"]').getAttribute('content');assert.match(value,/^[a-f0-9]{40}$/);
    source??=value;assert.equal(value,source);if(process.env.SOURCE_SHA)assert.equal(value,process.env.SOURCE_SHA);
  }
  async function garageReady(){await page.waitForSelector('body[data-phase="garage"]');await page.waitForFunction(()=>document.querySelector('#garage-status').textContent==='SAVED');}
  async function commit(id){await el(id).click();await el('garage-confirmation').waitFor({state:'visible'});await el('garage-confirm').click();await garageReady();await el('garage-confirmation').waitFor({state:'hidden'});}
  async function fit(slotName,partId,tuning={}){
    await el('garage-parts-slot').selectOption(slotName);await el('garage-parts-part').selectOption(partId);
    for(const [key,value]of Object.entries(tuning))await el('garage-parts-'+key).selectOption(String(value));
    await commit('garage-parts-review');
  }
  const counts=()=>page.evaluate(()=>window.machinePerf.snapshot());
  const canvasDetails=id=>page.evaluate(id=>{const canvas=document.getElementById(id),gl=canvas.getContext('webgl');
    return {css:{width:canvas.clientWidth,height:canvas.clientHeight},drawingBuffer:{width:gl.drawingBufferWidth,height:gl.drawingBufferHeight}};},id);
  async function mode(value){await page.evaluate(value=>window.machinePerf.mode(value),value);}
  async function flush(){await page.waitForTimeout(100);await page.evaluate(()=>window.machinePerf.pollGPU());}
  async function period(label){
    await mode(null);await flush();
    const data=await page.evaluate(()=>({rows:window.machinePerf.rows,events:window.machinePerf.events,snapshot:window.machinePerf.snapshot()}));
    const frames=data.rows.filter(row=>row.mode===label),intervals=frames.slice(1).map((row,i)=>row.time-frames[i].time);
    const rendered=frames.filter(row=>row.draws>0),gpu=frames.map(row=>row.gpuMs).filter(Number.isFinite);
    const result={label,frames:frames.length,renderedFrames:rendered.length,
      intervals:summary(intervals),callbackCpu:summary(frames.map(row=>row.callbackMs)),
      drawFrameCallbackCpu:summary(rendered.map(row=>row.callbackMs)),glDrawSubmission:summary(rendered.map(row=>row.glSubmissionMs)),gpuElapsed:summary(gpu),
      acceptedStepCallbackCpu:summary(frames.filter(row=>row.acceptedSteps>0).map(row=>row.callbackMs)),
      eventDispatch:summary(data.events.map(row=>row.eventDispatchMs)),actionToCallback:summary(frames.map(row=>row.actionToCallbackMs)),
      acceptedSteps:frames.reduce((sum,row)=>sum+(row.acceptedSteps||0),0),snapshot:data.snapshot,
      raw:{intervalsMs:intervals,callbackMs:frames.map(row=>row.callbackMs),gpuMs:gpu,acceptedSteps:frames.map(row=>row.acceptedSteps??0)},events:data.events};
    periods.push(result);await page.evaluate(()=>window.machinePerf.reset());return result;
  }
  async function heap(label){
    await mode(null);await flush();await page.evaluate(()=>window.machinePerf.reset());
    await cdp.send('HeapProfiler.collectGarbage');const value=await cdp.send('Runtime.getHeapUsage');
    const sample={label,...value,snapshot:await counts()};memory.push(sample);return sample;
  }
  async function capture(name){if(!evidence)return;if(software)name=name.replace('machine-native','machine-software').replace('1080p','720p');const file=name+'.png',path=join(evidence,file);await page.screenshot({path});captures.push({file,sha256:sha(await readFile(path))});}
  async function restore(canvasId,label){
    const before=await counts(),start=performance.now();
    await page.evaluate(id=>{const gl=document.getElementById(id).getContext('webgl'),ext=gl.getExtension('WEBGL_lose_context');
      if(!ext)throw Error('Context-loss service unavailable');window.restoreMachineContext=()=>ext.restoreContext();ext.loseContext();},canvasId);
    await page.waitForFunction(old=>window.machinePerf.resources.contextLosses>old,before.resources.contextLosses);
    await page.waitForFunction(()=>window.machinePerf.audio.liveSources===0,null,{timeout:10000});
    const lost=await counts(),audioSilencedWallMs=performance.now()-start;assert.equal(lost.resources.liveBuffers,0);assert.equal(lost.audio.liveSources,0);
    await page.waitForTimeout(100);await page.evaluate(()=>window.restoreMachineContext());
    await page.waitForFunction(old=>window.machinePerf.resources.contextRestorations>old&&window.machinePerf.resources.liveBuffers>0,before.resources.contextRestorations);
    return {label,wallMs:performance.now()-start,audioSilencedWallMs,deliberateLostIntervalMs:100,before,lost,restored:await counts()};
  }
  await page.goto(base.href);await page.bringToFront();await stamped();await el('enter-garage:enabled').click();
  await commit('garage-create');await el('garage-model-cinder-two').click();await commit('garage-buy');await el('garage-bay-0').click();
  for(const [slotName,partId,tuning]of [['engine','street'],['intake','duct'],['exhaust','flow'],['gearbox','short'],
    ['finalDrive','adjustable',{finalDrive:1}],['tyres','performance'],['suspension','adjustable',{spring:1,damper:1,travel:1}],
    ['steering','quick',{steering:1}],['paint','midnight']])await fit(slotName,partId,tuning);
  acceptedRaw=await raw();const accepted=JSON.parse(acceptedRaw).garage;
  assert.equal(accepted.bays[0].ownedVehicleId,'car-000001');assert.equal(accepted.credits,360);
  runtime=await page.evaluate(()=>{
    const canvas=document.getElementById('garage-canvas'),gl=canvas.getContext('webgl'),ext=gl.getExtension('WEBGL_debug_renderer_info');
    return {userAgent:navigator.userAgent,renderer:gl.getParameter(ext?.UNMASKED_RENDERER_WEBGL??gl.RENDERER),
      vendor:gl.getParameter(ext?.UNMASKED_VENDOR_WEBGL??gl.VENDOR),viewport:{width:innerWidth,height:innerHeight,devicePixelRatio},
      garageBuffer:{width:gl.drawingBufferWidth,height:gl.drawingBufferHeight},cssGarage:{width:canvas.clientWidth,height:canvas.clientHeight}};
  });
  assert.equal(runtime.viewport.width,viewport.width);assert.equal(runtime.viewport.height,viewport.height);assert(Math.abs(runtime.viewport.devicePixelRatio-1)<1e-5);
  if(!software)assert(/nvidia/i.test(runtime.renderer)&&!/swiftshader|llvmpipe|software/i.test(runtime.renderer),'Native NVIDIA required: '+runtime.renderer);
  let recordedBytes=null,referenceResult=null;
  for(let cycle=1;cycle<=cycleCount;cycle++){
    await el('garage-bay-0').click();await el('garage-camera-rear').click();
    await mode('workshop-idle-'+cycle);await page.waitForFunction(label=>window.machinePerf.rows.filter(r=>r.mode===label).length>=120,'workshop-idle-'+cycle);
    const garageIdle=await period('workshop-idle-'+cycle);
    await mode('workshop-selections');
    for(const section of ['engine','intake','exhaust','gearbox','finalDrive','tyres','suspension','steering','paint'])await el('garage-parts-section-'+section).click();
    for(const camera of ['front','side','rear','bays'])await el('garage-camera-'+camera).click();
    const selection=await period('workshop-selections');
    assert(selection.snapshot.resources.liveBuffers<=150);assert.equal(selection.snapshot.resources.livePrograms,2);
    if(cycle===1)await capture('machine-native-workshop-1080p');
    await el('garage-close').click();await page.waitForSelector('body[data-phase="menu"]');
    const closed=await heap('closed-workshop-'+cycle);assert.equal(closed.snapshot.resources.liveBuffers,0);assert.equal(closed.snapshot.resources.livePrograms,0);
    await el('enter-garage').click();await garageReady();await el('garage-bay-0').click();
    const admissionStart=performance.now();await el('garage-test-drive').click();await page.waitForURL('**/proving-ground.html?vehicle=car-000001');await stamped();
    await page.waitForFunction(()=>{try{const t=JSON.parse(document.querySelector('#pg-telemetry').textContent);return t.ticks===0&&t.ownedVehicleId==='car-000001';}catch{return false;}});
    const admissionWallMs=performance.now()-admissionStart;
    if(!software&&cycle===1){
      for(const model of ['cinder-two','lilt','evening-line','rivet-eight','yardhand','glass-comet']){
        await el('pg-build-mode').selectOption('stock');await el('pg-stock-model').selectOption(model);
        await el('pg-test').selectOption('practice');await el('pg-driver').selectOption('manual');await el('pg-load').click();
        const initial=await json('pg-telemetry');assert.equal(initial.modelId,model);assert.equal(initial.ownedVehicleId,null);
        await el('pg-arm').click();await page.keyboard.down('w');
        await page.waitForFunction(()=>JSON.parse(document.querySelector('#pg-telemetry').textContent).ticks>=60);
        await page.keyboard.up('w');await el('pg-arm').click();const driven=await json('pg-telemetry');
        assert(driven.paused);assert(driven.position.every(Number.isFinite));assert(Math.hypot(...driven.velocity)>.5);
        const snapshot=await counts();assert.equal(snapshot.resources.liveBuffers,19);assert.equal(await raw(),acceptedRaw);
        nativeStockAdmissions.push({modelId:model,initial,driven,canvas:await canvasDetails('pg-world'),snapshot});
        await capture('machine-native-stock-'+model+'-1080p');
      }
      await el('pg-owned').selectOption('car-000001');await el('pg-build-mode').selectOption('current');
    }
    await el('pg-test').selectOption('acceleration');await el('pg-driver').selectOption('reference');await el('pg-load').click();
    const provingCanvas=await canvasDetails('pg-world');
    const loaded=await counts();assert.equal(loaded.resources.liveBuffers,19);assert.equal(loaded.resources.livePrograms,2);assert.equal(loaded.audio.created,0);
    await el('pg-sound').click();await mode('owned-driving-'+cycle);await el('pg-arm').click();
    let restoration=null;
    if(cycle===4||software&&cycle===1){
      await page.waitForFunction(()=>JSON.parse(document.querySelector('#pg-telemetry').textContent).ticks>=180);
      const before=await json('pg-telemetry');restoration=await restore('pg-world','owned-test');
      const after=await json('pg-telemetry');assert(after.paused);assert(after.ticks>=before.ticks);await el('pg-arm').click();
    }
    await page.waitForFunction(()=>JSON.parse(document.querySelector('#pg-result').textContent)!==null,null,{timeout:90000});
    const result=await json('pg-result'),driving=await period('owned-driving-'+cycle),finished=await counts();
    assert.equal(result.status,'completed');assert.equal(result.acceptedTicks,900);assert.equal(result.diagnostics.solverTruncated,false);assert.equal(result.diagnostics.needsRecovery,false);
    referenceResult??=result;assert.deepEqual(result,referenceResult,'Each accepted 900-call run reproduces despite navigation, graphics recovery and audio lifecycle');
    assert.equal(finished.audio.created,1,'Pause/resume must reuse one gesture-created AudioContext');
    assert(finished.audio.createdSources>0,'The real audio device must have scheduled actual buffer voices');
    assert.equal(finished.audio.liveSources,0);assert.equal(finished.audio.lastGainRamp?.value,0,'Pause must schedule a fade to silence');
    assert.equal(await el('pg-sound').getAttribute('aria-pressed'),'true','Audio device should remain available through the accepted drive');
    assert.equal(finished.resources.liveBuffers,19);assert.equal(finished.resources.livePrograms,2);
    if(!restoration){assert.equal(finished.resources.uploads,loaded.resources.uploads,'Actual driving must reuse retained meshes');assert.equal(finished.resources.retainedBytes,loaded.resources.retainedBytes);}
    assert.equal(await raw(),acceptedRaw,'Inspection, driving and restoration cannot mutate the accepted save');
    if(cycle===1){
      await capture('machine-native-owned-test-1080p');
      isolated=await page.evaluate(async()=>{
        const buildModule=await import('./src/vehicle-builds.js'),core=await import('./src/proving-ground.js'),scene=await import('./src/proving-ground-scene.js');
        const car=JSON.parse(localStorage.getItem('circuit-overdrive.garage.v1')).garage.bays[0],source=document.querySelector('meta[name="game-revision"]').content;
        const compilation=[],geometry=[],physics=[];
        for(let i=0;i<65;i++){const start=performance.now();buildModule.compileVehicleBuild(car.modelId,car.build);if(i)compilation.push(performance.now()-start);}
        let vertices=0;
        for(let i=0;i<17;i++){const start=performance.now(),facility=scene.provingGroundGeometry(),vehicle=scene.provingVehicleGeometry(car.modelId,car.build.parts.paint,{tyres:car.build.parts.tyres,exhaust:car.build.parts.exhaust});
          if(i)geometry.push(performance.now()-start);vertices=[...Object.values(facility),...Object.values(vehicle.body),...vehicle.wheels.flatMap(w=>Object.values(w))].reduce((sum,a)=>sum+a.length/11,0);}
        const run=core.createProvingRun({modelId:car.modelId,build:car.build,sourceRevision:source,testId:'acceleration',driver:'reference'});core.startProvingRun(run);
        for(let i=0;i<720;i++){const command=core.referenceProvingCommand(run),start=performance.now();core.stepProvingRun(run,command);if(i>=120)physics.push(performance.now()-start);}
        return {modelId:car.modelId,build:car.build,compilation,geometry,physics,vertices,physicsAcceptedCalls:720,physicsMeasuredCalls:600,
          methods:'Isolated direct calls to unchanged packaged modules using the actual purchased saved build; no production simulation state is modified. Geometry has one warmup/16 samples; compiler one warmup/64; solver first120calls warm up and next600 are individually timed at60Hz accepted step. Timer granularity can produce zero samples.'};
      });
      assert.equal(await raw(),acceptedRaw);isolated.summary={compilation:summary(isolated.compilation),geometry:summary(isolated.geometry),physicsStep:summary(isolated.physics)};
    }
    const download=page.waitForEvent('download');await el('pg-record').click();const file=await download;assert.equal(await file.failure(),null);
    const tapeBytes=await readFile(await file.path()),recording=JSON.parse(tapeBytes.toString());
    assert.equal(recording.revision,source);assert.equal(recording.ticks,900);assert.deepEqual(recording.result,result);
    recordedBytes??=tapeBytes;assert.equal(sha(tapeBytes),sha(recordedBytes),'Same source/build/commands export identical recording bytes');
    if(evidence&&cycle===1)await writeFile(join(evidence,'native-upgraded-v7.json'),tapeBytes);
    await heap('owned-test-finished-'+cycle);const viewerStart=performance.now();await el('pg-view-replay').click();await page.waitForURL('**/proving-replay.html');await stamped();
    await el('pr-file').setInputFiles({name:'native-upgraded-v7.json',mimeType:'application/json',buffer:tapeBytes});
    await page.waitForFunction(()=>JSON.parse(document.querySelector('#pr-telemetry').textContent).phase==='ready',null,{timeout:90000});
    const admissionViewerWallMs=performance.now()-viewerStart;assert.equal((await json('pr-telemetry')).recipeDigest,recording.recipeDigest);
    const viewerLoaded=await counts();assert.equal(viewerLoaded.resources.liveBuffers,19);assert.equal(viewerLoaded.audio.created,0);
    const viewerCanvas=await canvasDetails('pr-world');
    await mode('replay-driving-'+cycle);await el('pr-play').click();await page.waitForFunction(()=>JSON.parse(document.querySelector('#pr-telemetry').textContent).tick>=120);
    await el('pr-play').click();const replayDriving=await period('replay-driving-'+cycle);
    const seekStart=performance.now();await el('pr-seek').evaluate(control=>{control.value='900';control.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.waitForFunction(()=>{const t=JSON.parse(document.querySelector('#pr-telemetry').textContent);return t.tick===900&&t.phase==='finished';},null,{timeout:90000});
    const seekWallMs=performance.now()-seekStart;assert.deepEqual(await json('pr-result'),result);
    let replayRestoration=null;if(cycle===8)replayRestoration=await restore('pr-world','replay-viewer');
    assert.equal(await raw(),acceptedRaw);const viewerFinished=await heap('replay-finished-'+cycle);
    if(cycle===1)await capture('machine-native-replay-1080p');
    cycles.push({cycle,admissionWallMs,admissionViewerWallMs,seekWallMs,provingCanvas,viewerCanvas,loaded,finished,restoration,replayRestoration,
      result,recording:{bytes:tapeBytes.length,sha256:sha(tapeBytes),buildDigest:recording.buildDigest,recipeDigest:recording.recipeDigest},
      garageIdle:{frames:garageIdle.frames,intervals:garageIdle.intervals},selection:{eventDispatch:selection.eventDispatch,actionToCallback:selection.actionToCallback},
      driving:{frames:driving.frames,intervals:driving.intervals,callbackCpu:driving.callbackCpu,acceptedStepCallbackCpu:driving.acceptedStepCallbackCpu,gpuElapsed:driving.gpuElapsed},
      replay:{frames:replayDriving.frames,intervals:replayDriving.intervals},viewerResources:viewerFinished.snapshot});
    await page.locator('a[href="./index.html#garage"]').click();await garageReady();await stamped();assert.equal(await raw(),acceptedRaw);
  }
  await el('garage-close').click();await page.waitForSelector('body[data-phase="menu"]');const finalClosed=await heap('closed-workshop-final');
  assert.equal(finalClosed.snapshot.resources.liveBuffers,0);assert.equal(finalClosed.snapshot.resources.livePrograms,0);assert.equal(await raw(),acceptedRaw);
  assert.deepEqual(errors,[]);
  const closed=memory.filter(row=>row.label.startsWith('closed-workshop'));
  const report={version:1,kind:'co-014f-machine-native-performance-v1',source,observerSourceSha256:sha(await readFile(new URL(import.meta.url))),browser:browser.version(),runtime,
    host:{platform:platform(),release:release(),cpu:cpus()[0]?.model},native:!software,cycles:cycleCount,
    acceptedGarage:JSON.parse(acceptedRaw),nativeStockAdmissions,periods,cycleReceipts:cycles,isolated,
    memory:{samples:memory,closedHeapGrowthBytes:closed.at(-1).usedSize-closed[0].usedSize},
    nativeRecordingSha256:sha(recordedBytes),captures,requests:requests.length,externalRequests:[],warnings,errors,
    methods:['Unchanged source-stamped runtime and real UI transactions; all injected functions are observational browser-service wrappers.',
      'RAF intervals are actual production callback timestamp gaps; idle Garage callbacks may submit no draw. Full callback CPU includes observer overhead, UI and render as well as accepted physics.',
      'Individual solver/compile/geometry costs are isolated read-only module calls, not a claimed decomposition of live production callback time.',
      'GPU elapsed queries span first scene clear through callback completion; asynchronous disjoint samples are discarded. GL draw-call submission excludes other render CPU work.',
      'UI event dispatch timing spans capture-to-bubble around real production handlers; action-to-callback and navigation/seek wall times include browser scheduling/automation IPC, not compositor presentation latency.',
      'WebGL counters track only Garage/Proving/viewer canvases, not the independent racing menu canvas. Lost-context objects are invalidated separately from explicit deletes.',
      'Closed-workshop resource and post-GC heap samples are taken after the real close control disposes its scene, before reopening for a real test-drive entry. Whole-document navigations then release their old realms; per-document counts are not summed into invented live global GPU totals.',
      'Audio tracks actual gesture-created AudioContexts, queued BufferSources, ended events, intrinsic gain values and forwarded native fade automation. TouringAudio.stop intentionally retains its one pooled context while stopping voices and scheduling gain to zero; resume must reuse it. Zero live buffer voices establishes stopped output; an intrinsic AudioParam.value is not used as an output-level meter. No audible-listening or speaker-quality claim.',
      'Post-GC V8 heaps are CDP Runtime.getHeapUsage, not total browser, driver, compositor or GPU memory. Eight bounded cycles do not prove unbounded leak freedom.',
      'No native 60FPS guarantee is inferred from median alone; p95/worst frame intervals and raw samples are retained.']};
  if(evidence)await writeFile(join(evidence,'machine-performance.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({source,native:!software,browser:report.browser,renderer:runtime.renderer,cycles:cycleCount,
    ownedDriving:cycles.map(c=>({cycle:c.cycle,...c.driving})),isolated:isolated.summary,closedHeapGrowthBytes:report.memory.closedHeapGrowthBytes,
    errors},null,2));
  await context.close();
}finally{await browser.close();}
