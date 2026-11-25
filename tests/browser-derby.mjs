// SPDX-License-Identifier: Apache-2.0
// Drive the packaged game through the shipping controls and verify its exports.
// The default clock supplies bounded frame timestamps to make full rounds
// practical on software WebGL. --profile uses unmodified animation timestamps.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {arch,release} from 'node:os';
import {FIELD} from '../src/field.js';
import {LIT_PROFILES} from '../vendor/vanillajs/modules/render-lit/index.js';
import {countBrowserResources} from './browser-resources.mjs';
import {installDerbyProbe} from './browser-derby-probe.mjs';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=new URL(process.argv[2]),dir=process.env.EVIDENCE_DIR;
const profile=process.argv.includes('--profile'),native=process.env.NATIVE_GL==='1';
assert(!profile || native,'Profile with NATIVE_GL=1');
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN,
  args:native?['--enable-gpu','--use-angle=gl']:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
function summarize(values){
  const ordered=values.filter(Number.isFinite).sort((a,b)=>a-b);
  const at=p=>Number(ordered[Math.ceil(p*ordered.length)-1].toFixed(4));
  return ordered.length?{samples:ordered.length,median:at(.5),p95:at(.95),worst:at(1)}:null;
}
function profileReport({steps,frames,maxEffectCount}) {
  const active=frames.filter(frame=>frame.active);
  const contacts=steps.filter(step=>step.contacts>0),dirty=frames.filter(frame=>frame.updateCalls>0);
  return {frames:active.length,intervalMs:summarize(active.slice(1).map((frame,i)=>frame.time-active[i].time)),
    physicsTickMs:summarize(steps.map(step=>step.physicsMs)),solverTickMs:summarize(steps.map(step=>step.solverMs)),
    contactSolverMs:summarize(contacts.map(step=>step.solverMs)),cpuDrawMs:summarize(active.map(frame=>frame.cpuMs)),
    gpuDrawMs:summarize(active.map(frame=>frame.gpuMs)),panelDeformMs:summarize(dirty.map(frame=>frame.deformMs)),
    panelUploadMs:summarize(dirty.map(frame=>frame.updateMs)),uploadsPerDirtyFrame:summarize(dirty.map(frame=>frame.uploads)),
    broadPhasePairs:summarize(steps.map(step=>step.pairChecks)),candidates:summarize(steps.map(step=>step.candidates)),
    resolvedContacts:summarize(steps.map(step=>step.contacts)),damageEvents:summarize(steps.map(step=>step.damaging)),
    damageBearingContacts:steps.reduce((n,step)=>n+step.damaging,0),maxEffectCount};
}
function stableFootprint({mesh,resources}) {
  return {meshes:mesh.meshes,vertices:mesh.vertices,bytes:mesh.bytes,buffers:resources.uploads-resources.deletes,
    bufferBytes:resources.retainedBytes,programs:resources.programs-resources.deletedPrograms};
}
function checkBudget({mesh},label){
  const limits=LIT_PROFILES[mesh.profile];
  assert(mesh.meshes<limits.maxMeshes && mesh.vertices<limits.maxVertices && mesh.frameDraws<limits.maxDraws,label);
}
const withoutRuntime=({runtime,...receipt})=>receipt;
const canonicalPanels=groups=>groups.map(group=>group.map(zone=>({...zone,parts:zone.parts.map(({serial,...part})=>part)})));

try {
  if(dir)await mkdir(dir,{recursive:true});
  const context=await browser.newContext({viewport:profile?{width:2320,height:1240}:{width:1000,height:700},deviceScaleFactor:1,acceptDownloads:true});
  await context.addInitScript(countBrowserResources);
  await context.addInitScript(installDerbyProbe,{fast:!profile});
  const edits={
    'vendor/vanillajs/modules/render-lit/index.js':{append:'\nwindow.derbyProbe.observeRenderer(LitRenderer);'},
    'src/crash-scene.js':{changes:[
      [/function drawImpactBody\(renderer,rig,damage,root\) \{/,'$&\n  window.derbyProbe.rig(rig);'],
      ['deformImpactPanel(panel,value)','window.derbyProbe.generate(()=>deformImpactPanel(panel,value))']]},
    'src/crash-damage.js':{changes:[['const result=stepImpacts(world);','const result=window.derbyProbe.solve(()=>stepImpacts(world));']]},
    'src/total-destruction.js':{changes:[
      [/const result=(?:stepDerbyRound\(round,command\)|recorder.step\(command\));/,
        'const stepStarted=performance.now();$&window.derbyProbe.step(round,result,performance.now()-stepStarted);'],
      [/scene.draw\(round.world,\{[^;]+\}\);/,
        'window.derbyProbe.draw(canvas,time,round,phase,effects,()=>{$&});']],
      append:'\nwindow.inspectDerby=()=>({round,scene,phase,effects});'},
    'src/replay-theatre.js':{changes:[
      [/scene.draw\(world,\{[^;]+\}\);/,
        'window.derbyProbe.draw(canvas,0,session.race,\'theatre\',[],()=>{$&});']],
      append:'\nwindow.inspectDerbyReplay=()=>({session,scene});'}
  };
  const errors=[];
  await context.route('**/*',async route=>{
    const url=route.request().url();
    if(!url.startsWith(base.href)){errors.push('Off-site request '+url);return route.abort();}
    const edit=edits[url.slice(base.href.length)];
    if(!edit)return route.continue();
    const response=await route.fetch();let source=await response.text();
    for(const [find,replace] of edit.changes??[]){
      assert(typeof find==='string'?source.includes(find):find.test(source),'Missing observation point '+find);
      source=source.replace(find,replace);
    }
    return route.fulfill({response,body:source+(edit.append??'')});
  });
  const open=async()=>{
    const page=await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));
    page.on('response',response=>{if(response.status()>=400)errors.push(response.status()+' '+response.url());});
    return page;
  };
  const page=await open(),cdp=await context.newCDPSession(page);
  let revision,graphics;
  const measurements=[],captures={};
  const observe=()=>page.evaluate(()=>{
    const {round,scene,phase}=window.inspectDerby();
    const state=round&&{ticks:round.ticks,arena:round.world.arena.id,seed:round.seed,cars:round.world.cars,
      standings:round.standings,eliminations:round.eliminations,result:round.result};
    return {phase,state,mesh:scene?.stats(),resources:{...window.resources}};
  });
  const advance=async(ticks=0)=>{if(!profile)await page.evaluate(ticks=>window.advanceDerbyFrame(ticks),ticks);};
  async function capture(name,target=page,tick=null,event=null){
    if(!dir || profile)return;
    const expanded=name.endsWith('-result') || name.endsWith('-final-survivor') || name.endsWith('-grid');
    const viewport=target.viewportSize();
    if(expanded){
      await target.setViewportSize({width:1280,height:900});
      await target.evaluate(async()=>{await window.presentDerbyFrame();window.advanceDerbyFrame(0);});
    }
    await target.evaluate(()=>window.presentDerbyFrame());
    const bytes=await target.screenshot({path:dir+'/'+name+'.png',timeout:60000});
    captures[name]={revision,tick,sha256:sha256(bytes),event};
    if(expanded){
      await target.setViewportSize(viewport);
      await target.evaluate(async()=>{await window.presentDerbyFrame();window.advanceDerbyFrame(0);});
    }
  }
  async function download(target,id,fallback){
    const [file]=await Promise.all([target.waitForEvent('download'),target.locator('#'+id).click()]);
    const path=await file.path();
    const bytes=await readFile(path);
    if(dir)await writeFile(dir+'/'+fallback,bytes);
    return {bytes,data:JSON.parse(bytes)};
  }
  async function launch(arena,name){
    await page.goto(base.href);
    await page.locator('#enter-derby').click();
    await page.waitForFunction(()=>typeof window.inspectDerby==='function',null,{polling:50});
    revision=await page.locator('meta[name=game-revision]').getAttribute('content');
    assert.match(revision,/^[a-f0-9]{40}$/);
    if(process.env.REPLAY_REVISION)assert.equal(revision,process.env.REPLAY_REVISION);
    await page.locator('#derby-arena').selectOption(arena);
    await capture(name+'-selection');
    await page.locator('#derby-arm').click();
    await advance();
    assert.equal((await observe()).phase,'grid');
    await page.locator('#derby-camera').selectOption('raised');await advance();
    const canvas=page.locator('#derby-world');
    if(profile){
      const delta=await canvas.evaluate(c=>[innerWidth-c.clientWidth,innerHeight-c.clientHeight]);
      await page.setViewportSize({width:1920+delta[0],height:1080+delta[1]});
      await page.waitForFunction(()=>{const c=document.querySelector('#derby-world');return c.width===1920&&c.height===1080;});
    }
    graphics=await canvas.evaluate(c=>{
      const gl=c.getContext('webgl'),ext=gl.getExtension('WEBGL_debug_renderer_info');
      return {renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
        size:[gl.drawingBufferWidth,gl.drawingBufferHeight]};
    });
    if(native)assert(!/swiftshader|software|llvmpipe/i.test(graphics.renderer));
    const grid=await observe();
    assert.equal(grid.state.ticks,0);
    assert.equal(grid.state.standings.filter(d=>d.active).length,6);
    assert.equal(grid.state.cars.length,6);
    assert(grid.state.cars.every(car=>car.vx===0 && car.vz===0 && Object.values(car.damage).every(value=>value===0)));
    checkBudget(grid,arena+' grid');
    await capture(name+'-grid',page,0);
    return grid;
  }
  async function start(){
    await page.evaluate(()=>{window.derbyProbe.reset();});
    await page.locator('#derby-arm').click();
    assert.equal((await observe()).phase,'countdown');
    await page.keyboard.down('w');
    if(profile)return;
    await advance();
    await page.evaluate(()=>{for(let frame=0;frame<30;frame++)window.advanceDerbyFrame(6);});
    assert.equal((await observe()).phase,'running');
    assert.equal((await observe()).state.ticks,0);
  }
  async function selectCamera(mode,driver){
    // Dispatch the same select controls without moving keyboard focus away
    // from the driving canvas while the clock is stopped for a capture.
    await page.evaluate(({mode,driver})=>{
      for(const [id,value] of [['derby-camera',mode],['derby-follow',driver]]){
        const select=document.getElementById(id);select.value=String(value);
        select.dispatchEvent(new Event('change',{bubbles:true}));
      }
    },{mode,driver});
    await advance();
  }
  async function checkPauseAndRestart(grid){
    await start();
    await advance(6);
    await page.keyboard.press('Escape');
    const paused=await observe();
    assert.equal(paused.phase,'paused');
    await page.keyboard.up('w');
    await advance(6);await advance(6);
    assert.deepEqual((await observe()).state,paused.state);
    await page.locator('#derby-pause').click();await advance();await advance(1);
    const accepted=await page.evaluate(()=>window.derbyProbe.report().steps.at(-1).player);
    assert.deepEqual(accepted,{throttle:0,brake:0,steer:0},'resume requires fresh input');
    await page.keyboard.press('Escape');
    await page.locator('#derby-restart').click();await advance();
    const fresh=await observe();
    assert.equal(fresh.phase,'grid');assert.deepEqual(fresh.state,grid.state);
    await page.locator('#derby-camera').selectOption('raised');await advance();
  }
  async function seek(theatre,tick){
    await theatre.locator('#replay-seek').evaluate((slider,at)=>{
      slider.value=String(at);slider.dispatchEvent(new Event('input',{bubbles:true}));
    },tick);
    const observed=()=>theatre.evaluate(()=>window.inspectDerbyReplay().session?.tick);
    for(let frame=0;(await observed())!==tick && frame<60;frame++)
      await theatre.evaluate(()=>window.advanceDerbyFrame(1));
    assert.equal(await observed(),tick,'Replay seek endpoint');
  }
  async function reconstruct(arena,tape,live,panels){
    const theatre=await open();
    try {
      await theatre.goto(new URL('replay-theatre.html',base).href);
      await theatre.locator('#replay-file').setInputFiles({name:arena+'.json',mimeType:'application/json',buffer:tape.bytes});
      await theatre.waitForFunction(()=>window.inspectDerbyReplay?.().session?.recording.version===6,null,{polling:50});
      await theatre.evaluate(()=>window.advanceDerbyFrame(0));
      const first=live.state.eliminations[0];
      assert(first);
      const eliminates=()=>theatre.evaluate(()=>window.inspectDerbyReplay().session.race.eliminations);
      await seek(theatre,first.tick-1);assert.equal((await eliminates()).length,0);
      await seek(theatre,first.tick);assert.deepEqual((await eliminates())[0],first);
      await theatre.locator('#replay-follow').selectOption(String(first.id));
      await theatre.evaluate(()=>window.advanceDerbyFrame(0));
      await capture(arena+'-theatre-elimination',theatre,first.tick,first);
      await seek(theatre,tape.data.ticks);
      const reconstructed=await theatre.evaluate(()=>{
        const {session,scene}=window.inspectDerbyReplay(),r=session.race;
        return {cars:r.world.cars,standings:r.standings,eliminations:r.eliminations,result:r.result,mesh:scene.stats()};
      });
      for(const key of ['cars','standings','eliminations','result'])assert.deepEqual(reconstructed[key],live.state[key]);
      checkBudget(reconstructed,arena+' Theatre');
      assert.deepEqual(canonicalPanels(await theatre.evaluate(()=>window.derbyProbe.panels())),canonicalPanels(panels),
        'Theatre must reproduce all six mutable panel meshes');
      await capture(arena+'-theatre-result',theatre,tape.data.ticks);
      return (await download(theatre,'replay-evidence',arena+'-theatre-receipt.json')).data;
    } finally{await theatre.close();}
  }
  async function restoreContext(arena){
    const before=await observe();
    const panels=canonicalPanels(await page.evaluate(()=>window.derbyProbe.panels()));
    await page.evaluate(()=>{
      const gl=document.querySelector('#derby-world').getContext('webgl');
      window.lossDerby=gl.getExtension('WEBGL_lose_context');
      window.lossDerby.loseContext();
    });
    await page.waitForFunction(()=>window.inspectDerby().scene.stats().lost,null,{polling:50});
    await page.evaluate(()=>window.lossDerby.restoreContext());
    await page.waitForFunction(()=>!window.inspectDerby().scene?.stats().lost,null,{polling:50,timeout:20000});
    await advance();
    const restored=await observe();
    assert.deepEqual(restored.state,before.state,'context recovery preserves derby authority');
    for(const key of ['meshes','bytes','vertices'])assert.equal(restored.mesh[key],before.mesh[key]);
    assert.deepEqual(canonicalPanels(await page.evaluate(()=>window.derbyProbe.panels())),panels);
    await capture(arena+'-context-restored',page,restored.state.ticks);
    return {tick:restored.state.ticks,meshes:restored.mesh.meshes};
  }
  async function saturatePanels(arena){
    return page.evaluate(async arena=>{
      const [{createDerbyArenaWorld},{createDerbyArenaScene}]=await Promise.all([
        import('./src/derby-arenas.js'),import('./src/derby-arena-scene.js')]);
      // Isolated presentation fixture. No live round is modified or driven.
      const fixture=createDerbyArenaWorld(arena);
      const canvas=document.createElement('canvas');
      canvas.id='derby-panel-fixture';
      canvas.style.cssText='position:fixed;left:-1200px;top:0;width:960px;height:540px';
      document.body.append(canvas);
      const scene=createDerbyArenaScene(canvas,fixture.arena,1,{damagePanels:true});
      const retained=scene.stats(),samples=[];
      try {
        const capture=async value=>{
          for(const car of fixture.cars)
            for(const key of Object.keys(car.damage))car.damage[key]=value;
          for(let attempt=0;attempt<2;attempt++){
            const before=scene.stats();
            window.derbyProbe.draw(canvas,0,null,'fixture',[],()=>scene.draw(fixture));
            const after=scene.stats();
            samples.push({value,attempt,changed:after.uploads-before.uploads,mesh:after,
              webglError:canvas.getContext('webgl').getError()});
          }
          return window.derbyProbe.panels();
        };
        const clean=await capture(0);
        for(const value of [250,500,750])await capture(value);
        const saturated=await capture(1000),reset=await capture(0);
        return {retained,samples,clean,saturated,reset};
      }finally{scene.dispose();canvas.remove();}
    },arena);
  }
  const fixtures=[
    {arena:'crucible',name:'crucible',changes:[],winnerId:0,terminal:'last-car-standing',ticks:9540},
    {arena:'iron-pit',name:'iron-pit',changes:[[55,'d',true],[85,'d',false]],
      winnerId:1,terminal:'time-limit',ticks:10800},
    {arena:'crucible',name:'crucible-player',changes:[[130,'a',true],[240,'a',false],[600,'w',false]],
      winnerId:5,terminal:'last-car-standing',ticks:8286}
  ];
  const only=process.argv.find(arg=>arg.startsWith('--fixture='))?.slice('--fixture='.length);
  assert(!only || fixtures.some(fixture=>fixture.name===only));
  for(const fixture of only?fixtures.filter(fixture=>fixture.name===only):profile?fixtures.slice(0,2):fixtures){
    const {arena,name}=fixture;
    const grid=await launch(arena,name);
    if(!profile && name==='crucible')await checkPauseAndRestart(grid);
    await start();
    if(profile){
      await page.evaluate(()=>{window.derbyProbe.measure=true;});
      await page.waitForFunction(()=>window.inspectDerby().round.ticks>=900 || window.inspectDerby().round.result,
        null,{timeout:45000}).catch(async error=>{
          const {phase,state}=await observe();
          throw Error(`Timing stalled at ${phase} / ${state?.ticks}: ${errors.join(', ')}`,{cause:error});
        });
      await page.keyboard.up('w');
      await page.keyboard.press('Escape');
      await page.evaluate(()=>{window.derbyProbe.measure=false;});
      const timing=profileReport(await page.evaluate(()=>window.derbyProbe.report()));
      assert(timing.frames>300 && timing.gpuDrawMs?.samples>0);
      await cdp.send('HeapProfiler.collectGarbage');
      const {usedSize:heapBytes}=await cdp.send('Runtime.getHeapUsage');
      const sample=await observe();
      assert.deepEqual(stableFootprint(sample),stableFootprint(grid));
      measurements.push({arena,ticks:sample.state.ticks,mesh:sample.mesh,resources:sample.resources,heapBytes,...timing});
      continue;
    }
    const seen=new Set(),changes=fixture.changes.slice();let ended=false,tick=0;
    for(let batch=0;batch<300&&!ended;batch++){
      while(changes[0]?.[0]===tick+1){
        const [,key,held]=changes.shift();
        await page.keyboard[held?'down':'up'](key);
      }
      const frame=await page.evaluate(({first,until})=>{
        const {round}=window.inspectDerby();
        const maxStep=first?1:6;
        const events=window.derbyProbe.events,eventCount=Object.keys(events).length;
        const gl=document.querySelector('#derby-world').getContext('webgl');
        const pixel=new Uint8Array(4);
        for(let i=0;i<36 && round.ticks<until && !round.result;i++){
          const before=round.ticks;
          window.advanceDerbyFrame(Math.min(maxStep,until-before));
          if(round.ticks<=before && !round.result)throw Error('Derby progress stopped at tick '+before);
          if(Object.keys(events).length!==eventCount)break;
          if(i%12===0)gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
        }
        return {tick:round.ticks,phase:window.inspectDerby().phase,events,finished:!!round.result};
      },{first:!seen.has('first-contact'),until:changes[0]===undefined?10800:changes[0][0]-1});
      ended=frame.finished;tick=frame.tick;
      for(const [eventName,event] of Object.entries(frame.events))if(!seen.has(eventName)){
        seen.add(eventName);
        if(event.driverId!==undefined && ['crumpled-front','side-panel','severely-damaged-opponent','eliminated'].includes(eventName)){
          const previous=await page.locator('#derby-camera').inputValue();
          const previousDriver=await page.locator('#derby-follow').inputValue();
          await selectCamera('spectator',event.driverId);
          await capture(name+'-'+eventName,page,frame.tick,event);
          await selectCamera(previous,previousDriver);
        }else await capture(name+'-'+eventName,page,frame.tick,event);
      }
      if(batch%12===0)console.error(`${name}: ${frame.phase}, tick ${frame.tick}`);
    }
    await page.keyboard.up('w');
    const live=await observe(),probe=await page.evaluate(()=>window.derbyProbe.report());
    assert(ended,arena+' official result');
    assert.notEqual(live.state.result.reason,'technical-stop');
    assert(live.state.result.ticks>0 && live.state.result.ticks<=10800);
    const actualWinner=live.state.result.winnerId;
    if(browser.version()==='158.0.8127.36'){
      assert.equal(actualWinner,fixture.winnerId);
      assert.equal(live.state.result.reason,fixture.terminal);
      assert.equal(live.state.result.ticks,fixture.ticks);
    }
    if(actualWinner!==null)assert.equal(await page.locator('#derby-winner').textContent(),
      `${FIELD[actualWinner].name} #${FIELD[actualWinner].number} wins`);
    else assert.match(await page.locator('#derby-winner').textContent(),/All remaining cars were eliminated/);
    assert.deepEqual(await page.locator('#derby-standings li > span:first-child').allTextContents(),
      live.state.result.standings.map(({id})=>`${FIELD[id].name} #${FIELD[id].number}`));
    console.error(`${name}: ${live.state.result.reason}, winner ${actualWinner}, tick ${live.state.result.ticks}`);
    assert.equal(live.phase,'finished');
    assert(probe.steps[0].player.throttle>0,'Keyboard must be accepted from the beginning of the fixture');
    assert.equal(probe.steps.length,live.state.ticks);
    assert(probe.events['first-contact'].hits[0].normalImpulse>0);
    assert(probe.maxEffectCount<=8);
    assert.equal((await page.locator('#derby-survivors').textContent()),
      String(live.state.standings.filter(row=>row.active).length));
    assert.equal((await page.locator('#derby-knockouts').textContent()),
      String(live.state.standings.find(row=>row.id===5).knockouts));
    assert(live.state.cars.every(car=>Object.values(car.damage).some(value=>value>0)),arena+' all six take accepted damage');
    assert(live.state.eliminations.some(event=>event.attackerId!==null),arena+' credited knockout');
    const player=live.state.eliminations.find(event=>event.id===5);
    if(player){
      assert(live.state.ticks>player.tick,'spectator ticks must continue after player elimination');
      assert(probe.frames.some(frame=>frame.phase==='spectating' && frame.tick>player.tick));
      assert(probe.steps.slice(player.tick).every(step=>step.player.throttle===0 && step.player.brake===0 && step.player.steer===0));
    }
    assert.deepEqual(stableFootprint(live),stableFootprint(grid));
    checkBudget(live,arena+' damaged');
    const panels=await page.evaluate(()=>window.derbyProbe.panels());
    assert.equal(panels.length,6);
    const serials=panels.flatMap(rig=>rig.flatMap(zone=>zone.parts.map(part=>part.serial)));
    assert.equal(new Set(serials).size,serials.length,'six rigs own separate dynamic handles');
    for(const [id,rig] of panels.entries())for(const zone of rig)
      assert.equal(zone.damage,live.state.cars[id].damage[zone.name]);
    if(live.state.result.reason==='last-car-standing'){
      await selectCamera('spectator',live.state.result.winnerId);
      await capture(name+'-final-survivor',page,live.state.ticks,live.state.result);
    }
    await capture(name+'-result',page,live.state.ticks,live.state.result);
    const tape=await download(page,'save-derby-replay',name+'-replay.json');
    assert.equal(tape.data.revision,revision);assert.equal(tape.data.version,6);
    assert.equal(tape.data.ticks,live.state.ticks);
    const receipt=(await download(page,'save-derby-evidence',name+'-live-receipt.json')).data;
    const theatre=await reconstruct(name,tape,live,panels);
    assert.deepEqual(withoutRuntime(theatre),withoutRuntime(receipt),'Same-runtime Theatre and live digests agree');
    assert.deepEqual(receipt.eliminations,live.state.eliminations);
    assert.deepEqual(receipt.classification,live.state.standings);
    await advance(6);await advance(6);
    assert.deepEqual((await observe()).state,live.state,'Ended round stays settled');
    assert((await observe()).mesh.uploads===live.mesh.uploads,'No idle geometry uploads');
    const contextRestoration=await restoreContext(name);
    await page.locator('#derby-restart').click();await advance();
    const reset=await observe();
    assert.deepEqual(reset.state,grid.state,'Fresh grid restores every authoritative state');
    assert(reset.mesh.meshes===grid.mesh.meshes && reset.mesh.bytes===grid.mesh.bytes);
    const panelEndurance=await saturatePanels(arena);
    assert.deepEqual(panelEndurance.clean,panelEndurance.reset);
    for(const sample of panelEndurance.samples){
      assert.equal(sample.webglError,0);
      checkBudget(sample,arena+' saturated');
      for(const key of ['meshes','bytes','vertices'])assert.equal(sample.mesh[key],panelEndurance.retained[key]);
      if(sample.attempt===1)assert.equal(sample.changed,0,'idle frames must never upload geometry');
      else if(sample.value>0)assert(sample.changed>0 && sample.changed<=72,'only body panel parts may upload');
    }
    for(const [id,rig] of panelEndurance.saturated.entries())for(const [i,zone] of rig.entries()){
      assert.equal(zone.damage,1000);
      assert.deepEqual(zone.parts.map(part=>part.vertices),panelEndurance.clean[id][i].parts.map(part=>part.vertices));
    }
    await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false})));
    const disposals=await page.evaluate(()=>window.derbyProbe.report().disposable);
    assert(disposals.some(row=>row.canvas==='derby-panel-fixture' && row.after.disposed && row.after.meshes===0));
    assert(disposals.some(row=>row.canvas==='derby-world' && row.after.disposed && row.after.meshes===0));
    await cdp.send('HeapProfiler.collectGarbage');
    const {usedSize:heapBytes}=await cdp.send('Runtime.getHeapUsage');
    measurements.push({arena,name,...graphics,start:stableFootprint(grid),mesh:live.mesh,resources:live.resources,heapBytes,
      panelEndurance:{samples:panelEndurance.samples,disposals},
      result:live.state.result,events:probe.events,tapeSha256:sha256(tape.bytes),contextRestoration,panels:canonicalPanels(panels),
      work:profileReport(probe)});
  }
  assert.deepEqual(errors,[]);
  const report={revision,browser:browser.version(),node:process.version,host:`${arch()} Linux ${release()}`,native,
    clock:profile?'native-requestAnimationFrame':'deterministic 60 Hz callbacks',graphics,measurements,captures};
  if(dir)await writeFile(dir+'/browser-derby'+(profile?'-native':'')+'.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({revision,browser:report.browser,graphics,
    rounds:measurements.map(item=>({arena:item.arena,ticks:item.result?.ticks??item.ticks,winnerId:item.result?.winnerId,
      intervalMs:item.intervalMs,eliminations:item.events?.eliminated?.hits.length}))}));
}finally{await browser.close();}
