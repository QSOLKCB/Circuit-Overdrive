// SPDX-License-Identifier: Apache-2.0
// Native production-page measurement. No runtime source is rewritten and no
// ownership state is injected. Observers add measurable overhead; CPU callback
// cost, GL draw-call submission, GPU elapsed queries and RAF cadence are distinct.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {cpus,release,platform} from 'node:os';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=new URL(process.argv[2] || 'http://127.0.0.1:8000/');
const evidence=process.env.EVIDENCE_DIR;
if(evidence)await mkdir(evidence,{recursive:true});
const software=process.env.GARAGE_PERF_SOFTWARE==='1';
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN || undefined,
  headless:software || process.env.GARAGE_HEADFUL==='0',
  args:software?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:['--enable-gpu','--use-angle=gl']});
const failures=[],requests=[];
const summary=values=>{
  const numbers=values.filter(Number.isFinite).sort((a,b)=>a-b),n=numbers.length;
  if(!n)return null;
  const q=f=>numbers[Math.max(0,Math.ceil(n*f)-1)];
  return {samples:n,medianMs:q(.5),p95Ms:q(.95),worstMs:numbers.at(-1),meanMs:numbers.reduce((a,b)=>a+b,0)/n};
};
const models=['cinder-two','lilt','evening-line','rivet-eight','yardhand','glass-comet'];
const cameras=['front','side','rear','bays'];
try {
  const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  await context.route('**/*',route=>{
    const url=route.request().url();requests.push(url);
    if(url.startsWith(base.href)||url.startsWith('blob:')||url.startsWith('data:'))return route.continue();
    failures.push('Unexpected network request '+url);return route.abort();
  });
  await context.addInitScript(()=>{
    const nativeRAF=window.requestAnimationFrame.bind(window),liveBuffers=new Map(),livePrograms=new Set();
    const resources={createdBuffers:0,deletedBuffers:0,invalidatedBuffers:0,liveBuffers:0,
      retainedBytes:0,uploads:0,uploadedBytes:0,createdPrograms:0,deletedPrograms:0,
      invalidatedPrograms:0,livePrograms:0,drawCalls:0,contextLosses:0,contextRestorations:0};
    const bindings=new WeakMap(),contexts=new WeakSet();
    let mode=null,current=null,lastAction=null,ext=null,queryGL=null;
    const measurements=[],pending=[],gpu={available:null,discarded:0,queries:0,completed:0,peakPending:0};
    const register=gl=>{
      if(contexts.has(gl))return;
      contexts.add(gl);
      gl.canvas.addEventListener('webglcontextlost',()=>{
        resources.contextLosses++;resources.invalidatedBuffers+=liveBuffers.size;
        resources.invalidatedPrograms+=livePrograms.size;liveBuffers.clear();livePrograms.clear();
        resources.liveBuffers=resources.retainedBytes=resources.livePrograms=0;
        gpu.discarded+=pending.length;pending.length=0;ext=null;queryGL=null;
      });
      gl.canvas.addEventListener('webglcontextrestored',()=>{resources.contextRestorations++;});
    };
    const pollGPU=()=>{
      if(!ext || !queryGL || queryGL.isContextLost())return;
      if(queryGL.getParameter(ext.GPU_DISJOINT_EXT)){
        for(const item of pending.splice(0)){ext.deleteQueryEXT(item.query);gpu.discarded++;}
        return;
      }
      while(pending.length && ext.getQueryObjectEXT(pending[0].query,ext.QUERY_RESULT_AVAILABLE_EXT)){
        const {row,query}=pending.shift();row.gpuMs=ext.getQueryObjectEXT(query,ext.QUERY_RESULT_EXT)/1e6;
        ext.deleteQueryEXT(query);gpu.completed++;
      }
    };
    const beginGPU=gl=>{
      if(!current || !mode || current.query || pending.length>=8)return;
      if(!queryGL){queryGL=gl;ext=gl.getExtension('EXT_disjoint_timer_query');gpu.available=!!ext;}
      if(!ext || gl.isContextLost() || gl.getParameter(ext.GPU_DISJOINT_EXT))return;
      const query=ext.createQueryEXT();if(!query)return;
      ext.beginQueryEXT(ext.TIME_ELAPSED_EXT,query);current.query=query;gpu.queries++;
    };
    for(const type of [globalThis.WebGLRenderingContext,globalThis.WebGL2RenderingContext].filter(Boolean)) {
      for(const name of ['createBuffer','deleteBuffer','bindBuffer','bufferData','bufferSubData',
        'createProgram','deleteProgram','clear','drawArrays','drawElements']) {
        const original=type.prototype[name];
        type.prototype[name]=function(...args){
          if(this.canvas.id!=='garage-canvas')return original.apply(this,args);
          register(this);
          if(name==='clear')beginGPU(this);
          const started=name.startsWith('draw')?performance.now():0;
          const result=original.apply(this,args);
          if(name==='createBuffer' && result){resources.createdBuffers++;liveBuffers.set(result,0);}
          if(name==='deleteBuffer' && args[0]){
            resources.deletedBuffers++;resources.retainedBytes-=liveBuffers.get(args[0])||0;liveBuffers.delete(args[0]);
          }
          if(name==='bindBuffer'){let bound=bindings.get(this);if(!bound){bound=new Map();bindings.set(this,bound);}bound.set(args[0],args[1]);}
          if(name==='bufferData'||name==='bufferSubData') {
            const data=args[name==='bufferData'?1:2],bytes=typeof data==='number'?data:data?.byteLength??0;
            resources.uploads++;resources.uploadedBytes+=bytes;
            if(name==='bufferData'){
              const buffer=bindings.get(this)?.get(args[0]);
              if(liveBuffers.has(buffer)){resources.retainedBytes+=bytes-liveBuffers.get(buffer);liveBuffers.set(buffer,bytes);}
            }
          }
          if(name==='createProgram' && result){resources.createdPrograms++;livePrograms.add(result);}
          if(name==='deleteProgram' && args[0]){resources.deletedPrograms++;livePrograms.delete(args[0]);}
          if(name.startsWith('draw')) {
            resources.drawCalls++;
            if(current){current.drawCalls++;current.glDrawSubmissionMs+=performance.now()-started;}
          }
          resources.liveBuffers=liveBuffers.size;resources.livePrograms=livePrograms.size;
          return result;
        };
      }
    }
    document.addEventListener('click',event=>{
      const id=event.target.closest?.('button')?.id;
      if(mode==='switches' && /^garage-(model-|camera-)/.test(id||''))lastAction={id,start:performance.now()};
    },true);
    window.requestAnimationFrame=callback=>nativeRAF(function(time){
      // Observe the actual production main-loop callback. The observer's own
      // RAF waits use anonymous functions and do not become frame samples.
      if(callback.name!=='frame')return callback(time);
      pollGPU();
      const garage=document.body?.dataset.phase==='garage';
      const row={mode,time,drawCalls:0,glDrawSubmissionMs:0},start=performance.now();
      current=row;
      try { callback(time); }
      finally {
        row.callbackCpuMs=performance.now()-start;
        if(row.query && ext && !queryGL.isContextLost()){
          ext.endQueryEXT(ext.TIME_ELAPSED_EXT);pending.push({query:row.query,row});delete row.query;
          gpu.peakPending=Math.max(gpu.peakPending,pending.length);
        }
        if(row.drawCalls && lastAction){row.action=lastAction.id;row.actionToDrawMs=performance.now()-lastAction.start;lastAction=null;}
        if(garage && mode && measurements.length<12000)measurements.push(row);
        current=null;
      }
    });
    window.garagePerf={
      resources,measurements,gpu,
      setMode(value){mode=value;lastAction=null;},
      get mode(){return mode;},
      clearMeasurements(){measurements.length=0;lastAction=null;},
      pollGPU,
      get pendingQueries(){return pending.length;}
    };
  });
  const page=await context.newPage();
  page.on('pageerror',error=>failures.push(error.message));
  page.on('response',response=>{if(response.status()>=400)failures.push(response.status()+' '+response.url());});
  const cdp=await context.newCDPSession(page);
  await page.goto(base.href);await page.bringToFront();
  await page.locator('#enter-garage').click();
  await page.waitForSelector('body[data-phase="garage"]');
  await page.waitForFunction(()=>window.garagePerf.resources.liveBuffers===42&&window.garagePerf.resources.drawCalls>0);
  const source=await page.locator('meta[name="game-revision"]').getAttribute('content');
  assert.match(source,/^[0-9a-f]{40}$/,'use a source-stamped package');
  if(process.env.SOURCE_SHA)assert.equal(source,process.env.SOURCE_SHA);
  const runtime=await page.evaluate(()=>{
    const canvas=document.querySelector('#garage-canvas'),gl=canvas.getContext('webgl');
    const debug=gl.getExtension('WEBGL_debug_renderer_info');
    return {userAgent:navigator.userAgent,renderer:gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL??gl.RENDERER),
      vendor:gl.getParameter(debug?.UNMASKED_VENDOR_WEBGL??gl.VENDOR),
      viewport:{width:innerWidth,height:innerHeight,devicePixelRatio},
      drawingBuffer:{width:gl.drawingBufferWidth,height:gl.drawingBufferHeight},
      cssCanvas:{width:canvas.clientWidth,height:canvas.clientHeight}};
  });
  assert.equal(runtime.viewport.width,1920);assert.equal(runtime.viewport.height,1080);
  assert(Math.abs(runtime.viewport.devicePixelRatio-1)<1e-5,'CSS pixels measured at native scale');
  if(!software)assert(!/swiftshader|llvmpipe|software/i.test(runtime.renderer),'native GPU required: '+runtime.renderer);
  const waitDraw=async previous=>page.waitForFunction(previous=>window.garagePerf.resources.drawCalls>previous,previous);
  const counts=()=>page.evaluate(()=>({...window.garagePerf.resources}));
  const clickAndDraw=async id=>{const previous=(await counts()).drawCalls;await page.locator('#'+id).click();await waitDraw(previous);};
  const commit=async id=>{
    await page.locator('#'+id).click();await page.locator('#garage-confirmation').waitFor({state:'visible'});
    await page.locator('#garage-confirm').click();await page.waitForFunction(()=>document.querySelector('#garage-status').textContent==='SAVED'&&!document.querySelector('#garage-confirmation').open);
  };
  await commit('garage-new');
  for(let i=0;i<4;i++){await clickAndDraw('garage-model-cinder-two');await commit('garage-buy');}
  await clickAndDraw('garage-camera-bays');
  const acceptedBefore=await page.evaluate(()=>localStorage.getItem('circuit-overdrive.garage.v1'));
  assert.equal(JSON.parse(acceptedBefore).garage.bays.filter(Boolean).length,4);
  await page.waitForTimeout(1000);
  const initial=await counts();
  assert.equal(initial.liveBuffers,42);assert.equal(initial.retainedBytes,788592);assert.equal(initial.livePrograms,2);
  async function sampleMode(mode,frames){
    await page.evaluate(mode=>window.garagePerf.setMode(mode),mode);
    await page.waitForFunction(({mode,frames})=>window.garagePerf.measurements.filter(row=>row.mode===mode).length>=frames,{mode,frames},{timeout:30000});
    await page.evaluate(()=>window.garagePerf.setMode(null));
  }
  await sampleMode('idle',360);
  const idle=await counts();assert.deepEqual(idle,initial,'stationary demand-render showroom creates/uploads/draws nothing');
  await page.evaluate(()=>window.garagePerf.setMode('switches'));
  for(let cycle=0;cycle<8;cycle++)for(const model of models){
    await clickAndDraw('garage-model-'+model);
    for(const camera of cameras)await clickAndDraw('garage-camera-'+camera);
  }
  await page.evaluate(()=>window.garagePerf.setMode(null));
  const switched=await counts();
  for(const key of ['createdBuffers','uploads','retainedBytes','liveBuffers','createdPrograms','livePrograms'])assert.equal(switched[key],initial[key],key+' is stable over 48 model selections and 192 camera changes');
  // Keep the main loop running while asynchronous GPU query results retire.
  await page.waitForFunction(()=>window.garagePerf.pendingQueries===0,{},{timeout:10000});
  const timings=await page.evaluate(()=>({rows:window.garagePerf.measurements,gpu:{...window.garagePerf.gpu}}));
  await page.evaluate(()=>window.garagePerf.clearMeasurements());
  const intervalSummary=mode=>{
    const rows=timings.rows.filter(row=>row.mode===mode),intervals=rows.slice(1).map((row,i)=>row.time-rows[i].time);
    const elapsed=intervals.reduce((sum,value)=>sum+value,0);
    return {frames:rows.length,intervals:summary(intervals),sampleSeconds:elapsed/1000,
      meanCallbacksPerSecond:intervals.length/(elapsed/1000),rawIntervalsMs:intervals,
      callbackCpu:summary(rows.map(row=>row.callbackCpuMs)),
      drawnFrames:rows.filter(row=>row.drawCalls>0).length,
      drawFrameCallbackCpu:summary(rows.filter(row=>row.drawCalls>0).map(row=>row.callbackCpuMs)),
      glDrawCallSubmission:summary(rows.filter(row=>row.drawCalls>0).map(row=>row.glDrawSubmissionMs)),
      gpuElapsed:summary(rows.map(row=>row.gpuMs)),actionToDraw:summary(rows.map(row=>row.actionToDrawMs)),
      totalDrawCalls:rows.reduce((sum,row)=>sum+row.drawCalls,0)};
  };
  const periods={idle:intervalSummary('idle'),switches:intervalSummary('switches')};
  assert(periods.idle.frames>=360&&periods.idle.drawnFrames===0);
  assert(periods.switches.drawnFrames>=240,'every requested view was really drawn');
  if(timings.gpu.available)assert(timings.gpu.completed>0,'supported GPU queries yielded measurements');
  // Isolated geometry probe uses the same packaged pure function. It does not
  // represent construction latency or modify the live production showroom.
  const geometry=await page.evaluate(async()=>{
    const {garageGeometry}=await import('./src/garage-geometry.js');
    const samples=[];let meshCount,vertices,bytes;
    for(let i=0;i<17;i++){
      const start=performance.now(),geometry=garageGeometry();
      const ms=performance.now()-start;
      const batches=[...Object.values(geometry.workshop),...geometry.vehicles.flatMap(car=>Object.values(car.parts))];
      meshCount=batches.length+1;vertices=batches.reduce((sum,b)=>sum+b.length/11,0)+6;
      bytes=batches.reduce((sum,b)=>sum+b.byteLength,0)+6*11*4;
      if(i)samples.push(ms);
      await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
    }
    return {warmup:1,runs:16,samples,meshCount,vertices,bytes};
  });
  assert.deepEqual({meshCount:geometry.meshCount,vertices:geometry.vertices,bytes:geometry.bytes},{meshCount:41,vertices:17922,bytes:788568});
  const memory=[];
  async function heap(label){
    await cdp.send('HeapProfiler.collectGarbage');
    const value=await cdp.send('Runtime.getHeapUsage');memory.push({label,...value,resources:await counts()});
  }
  await page.locator('#garage-close').click();await page.waitForSelector('body[data-phase="menu"]');
  assert.equal((await counts()).liveBuffers,0);await heap('closed-before-cycles');
  const reopen=[];
  for(let cycle=0;cycle<8;cycle++){
    const start=performance.now();
    await page.locator('#enter-garage').click();await page.waitForSelector('body[data-phase="garage"]');
    await page.waitForFunction(()=>window.garagePerf.resources.liveBuffers===42);
    await clickAndDraw('garage-camera-bays');
    reopen.push(performance.now()-start);
    await heap('open-'+(cycle+1));
    await page.locator('#garage-close').click();await page.waitForSelector('body[data-phase="menu"]');
    assert.equal((await counts()).liveBuffers,0);assert.equal((await counts()).livePrograms,0);
    await heap('closed-'+(cycle+1));
  }
  await page.locator('#enter-garage').click();await page.waitForFunction(()=>window.garagePerf.resources.liveBuffers===42);
  const restoreStart=Date.now();
  await page.evaluate(()=>{
    const canvas=document.querySelector('#garage-canvas'),gl=canvas.getContext('webgl'),ext=gl.getExtension('WEBGL_lose_context');
    if(!ext)throw Error('Context-loss extension required for certification');
    window.garageRestore=()=>ext.restoreContext();ext.loseContext();
  });
  await page.waitForFunction(()=>window.garagePerf.resources.contextLosses===1);
  assert.equal((await counts()).liveBuffers,0);
  await page.waitForTimeout(100);await page.evaluate(()=>window.garageRestore());
  await page.waitForFunction(()=>window.garagePerf.resources.contextRestorations===1&&window.garagePerf.resources.liveBuffers===42);
  await clickAndDraw('garage-camera-bays');
  const restorationWallMs=Date.now()-restoreStart;
  const finalOpen=await counts();
  assert.equal(finalOpen.retainedBytes,788592);assert.equal(finalOpen.livePrograms,2);
  assert.equal(await page.evaluate(()=>localStorage.getItem('circuit-overdrive.garage.v1')),acceptedBefore,'all inspection/lifecycle work preserves committed ownership');
  const screenshots=[];
  if(evidence){const name='garage-native-1080p.png',path=join(evidence,name);await page.screenshot({path});screenshots.push({file:name,sha256:createHash('sha256').update(await readFile(path)).digest('hex')});}
  await page.locator('#garage-close').click();await page.waitForSelector('body[data-phase="menu"]');await heap('closed-after-restoration');
  const finalClosed=await counts();assert.equal(finalClosed.liveBuffers,0);assert.equal(finalClosed.livePrograms,0);assert.equal(finalClosed.retainedBytes,0);
  assert.deepEqual(failures,[]);
  const closed=memory.filter(row=>row.label.startsWith('closed')),heapGrowth=closed.at(-1).usedSize-closed[0].usedSize;
  const report={version:1,source,browser:browser.version(),runtime,host:{platform:platform(),release:release(),cpu:cpus()[0]?.model},
    measurement:{native:!software,viewport:'1920x1080',catalogueCycles:8,modelSelections:48,cameraSelections:192,
      reopenCycles:8,geometryRuns:16,methods:['Unchanged packaged runtime; observational RAF and WebGL wrappers only.',
        'RAF intervals describe production main callbacks, including idle frames with no draws.',
        'Callback CPU includes observer overhead; GL submission is only measured drawArrays/drawElements call time, not complete scene CPU.',
        'Action latency ends when the next JavaScript render callback completes, not when the compositor presents pixels.',
        'GPU elapsed query spans first clear through the end of the production frame callback; asynchronous, disjoint samples discarded.',
        'Geometry timings come from an isolated direct call to the packaged pure geometry function, not live constructors.',
        'Post-GC heap is CDP Runtime.getHeapUsage after HeapProfiler.collectGarbage; no browser/driver total-memory claim.',
        'Reopen latency includes Playwright/IPC/input waits; context-restore wall time includes a deliberate100ms loss interval.']},
    periods,gpuQueries:timings.gpu,geometry:{...geometry,cpu:summary(geometry.samples)},
    resources:{initial,idle,afterSwitches:switched,afterRestoration:finalOpen,finalClosed},
    memory:{samples:memory,closedHeapGrowthBytes:heapGrowth},reopenWallMs:summary(reopen),restorationWallMs,
    requests:requests.length,externalRequests:[],failures,screenshots};
  if(evidence)await writeFile(join(evidence,'garage-performance.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
  await context.close();
} finally {await browser.close();}
