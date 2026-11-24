// SPDX-License-Identifier: Apache-2.0
// Play the shipped UI using keyboard events. A separately created six-body
// race receives the same digital pilot commands. No reference body enters the UI.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {orbitalDrive} from './orbital-driver.mjs';
import {verifyRocketOpening} from './rocket-opening-touch.mjs';
import {orbital} from '../src/orbital.js';
import {createRocketRace,startRocketRace,stepRocketRace} from '../src/rocket-race.js';
import {NEUTRAL_ROCKET} from '../src/rocket-dynamics.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=new URL(process.argv[2]), raceOnly=process.argv.includes('--race-only'), directory=process.env.EVIDENCE_DIR;
if (directory) await mkdir(directory,{recursive:true});
const source=await readFile(new URL('./orbital-driver.mjs',import.meta.url),'utf8');
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
  const opening=await verifyRocketOpening(browser,base);
  const page=await browser.newPage({viewport:{width:960,height:600},acceptDownloads:true});
  const errors=[], captures=[];
  async function observeRenderer(target) {
    await target.evaluate(async()=>{
      const {LitRenderer}=await import('./vendor/vanillajs/modules/render-lit/index.js');
      const begin=LitRenderer.prototype.begin,draw=LitRenderer.prototype.draw;
      LitRenderer.prototype.begin=function(eye,orientation,settings) {
        if (![...eye,...orientation,settings.fov].every(Number.isFinite)) throw Error('Non-finite camera transform');
        window.renderReceipt={eye:eye.slice(),orientation:orientation.slice(),fov:settings.fov,draws:0,transforms:0};
        return begin.call(this,eye,orientation,settings);
      };
      LitRenderer.prototype.draw=function(mesh,options={}) {
        if(options.matrix) {
          if(options.matrix.length!==16 || !Array.from(options.matrix).every(Number.isFinite)) throw Error('Non-finite submitted mesh matrix');
          window.renderReceipt.transforms++;
        }
        window.renderReceipt.draws++;
        return draw.call(this,mesh,options);
      };
    });
  }
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
    const url=route.request().url();
    if (!url.startsWith(base.href)) { errors.push('External asset '+url); return route.abort(); }
    if (url===new URL('tests/orbital-driver.mjs',base).href)
      return route.fulfill({contentType:'application/javascript',body:source});
    if (url===new URL('src/main.js',base).href) {
      const response=await route.fetch();
      return route.fulfill({response,body:await response.text()+'\nwindow.rocketObserver=()=>race; window.followPose=()=>poses[race.player.id]; window.cameraName=()=>camera;'});
    }
    return route.continue();
  });
  await page.addInitScript(()=>{
    let callback,ms=0;
    window.requestAnimationFrame=fn=>{callback=fn;return 1;};
    window.driveFrame=ticks=>{ms+=ticks*1000/60;callback(ms);};
  });
  await page.goto(base.href);
  await observeRenderer(page);
  if (!raceOnly) await page.evaluate(async()=>{
    const {TouringAudio}=await import('./src/audio.js'),select=TouringAudio.prototype.selectMusic;
    const {RaceMusic}=await import('./src/music.js'),start=AudioBufferSourceNode.prototype.start;
    const sample=window.rocketAudioReceipt={title:null,selected:null,frames:0,mono:0,stereo:0,audible:0};
    TouringAudio.prototype.selectMusic=function(id) {
      sample.selected=id; sample.title=new RaceMusic(id).title;
      return select.call(this,id);
    };
    AudioBufferSourceNode.prototype.start=function(...args) {
      const buffer=this.buffer;
      if (buffer) {
        sample.frames+=buffer.length;
        if (buffer.numberOfChannels===1) sample.mono++;
        if (buffer.numberOfChannels===2) sample.stereo++;
        if (buffer.getChannelData(0).some(x=>x!==0 && Number.isFinite(x))) sample.audible++;
      }
      return start.apply(this,args);
    };
  });
  const revision=await page.locator('meta[name=game-revision]').getAttribute('content');
  assert.match(revision,/^[a-f0-9]{40}$/);
  if (process.env.REPLAY_REVISION) assert.equal(revision,process.env.REPLAY_REVISION);
  async function capture(name,sample,target=page) {
    const rendered=await target.evaluate(()=>({camera:window.cameraName(),pose:window.followPose(),view:window.renderReceipt}));
    assert(rendered.view.draws>0 && rendered.view.transforms>=5 && rendered.pose.orientation.every(Number.isFinite));
    const entry={name,revision,...sample,...rendered};
    if (directory) {
      const file='orbital-'+name+'.png',bytes=await target.screenshot({path:directory+'/'+file});
      entry.file=file;
      entry.sha256=createHash('sha256').update(bytes).digest('hex');
    }
    captures.push(entry);
  }
  await page.locator('#choose-orbital').click();
  await page.evaluate(()=>window.driveFrame(0));
  await capture('selection',{tick:0});
  await page.locator('#start').click();
  await page.keyboard.press('w');
  await page.evaluate(()=>window.driveFrame(0));
  assert.equal(await page.locator('body').getAttribute('data-phase'),'countdown');
  await capture('grid',{tick:0});
  const graphics=await page.evaluate(async()=>{
    const {createRocketRace,startRocketRace,stepRocketRace}=await import('./src/rocket-race.js');
    const {NEUTRAL_ROCKET}=await import('./src/rocket-dynamics.js');
    const {orbitalDrive}=await import('./tests/orbital-driver.mjs');
    const {FixedClock}=await import('./vendor/vanillajs/modules/time/index.js');
    const live=window.rocketObserver(), reference=createRocketRace(live.seed);
    startRocketRace(reference);
    if (live.entrants.length!==6) throw Error('Incomplete starting grid');
    const held=new Set(),canvas=document.querySelector('#world'),gl=canvas.getContext('webgl');
    const ext=gl.getExtension('WEBGL_debug_renderer_info'),pixel=new Uint8Array(4);
    const report={seed:live.seed,ticks:0,frames:0,samples:0,grounded:0,attached:0,inverted:0,wall:0,
      flight:0,dodges:0,landings:0,boostTicks:0,positions:[],gates:[],pairContacts:0};
    const markers=new Set();
    let captured=null;
    function key(code,pressed) {
      if (held.has(code)===pressed) return;
      if (pressed) held.add(code); else held.delete(code);
      canvas.dispatchEvent(new KeyboardEvent(pressed?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
    }
    const orbitalGate=()=>live.course.gates[live.player.nextGate]?.station ?? null;
    function sample() {
      const p=live.player,b=p.vehicle;
      return {tick:report.ticks,section:b.contactFrame?.id ?? null,station:p.current.s,
        position:b.position,velocity:b.velocity,angularVelocity:b.angularVelocity,orientation:b.orientation,
        normal:b.contactFrame?.normal ?? null,adhesionAcceleration:b.adhesionAcceleration,
        energy:b.energy,attached:b.attached,airTicks:b.airTicks,boosting:b.boosting,dodge:b.dodgeApplied,
        gate:p.nextGate,nextGateStation:orbitalGate(),loaded:b.wheels.filter(w=>w.contact && w.load>0).length};
    }
    const stepClock=FixedClock.prototype.advance;
    FixedClock.prototype.advance=function(dt,update) {
      return stepClock.call(this,dt,h=>{
        if (reference.phase==='finished') return update(h);
        const c=reference.phase==='racing' ? orbitalDrive(reference.player) : NEUTRAL_ROCKET;
        const wasAir=live.player.vehicle.airTicks;
        key('KeyW',!!c.throttle); key('KeyS',!!c.brake); key('KeyA',c.steer<0); key('KeyD',c.steer>0);
        key('Space',c.assist); key('ShiftLeft',c.boost); key('KeyQ',c.dodge<0); key('KeyE',c.dodge>0);
        stepRocketRace(reference,c);
        update(h);
        report.ticks++;
        const p=live.player,b=p.vehicle,id=b.contactFrame?.id,ny=b.contactFrame?.normal[1];
        const q=report;
        if (!q.positions.includes(p.position)) q.positions.push(p.position);
        if (!q.gates.includes(p.nextGate)) q.gates.push(p.nextGate);
        if (p.pairContact) q.pairContacts++;
        if (b.grounded) q.grounded++;
        if (b.attached) q.attached++;
        if (b.attached && Math.abs(ny)<.12) q.wall++;
        if (b.attached && ny<-.95) q.inverted++;
        if (b.boosting) q.boostTicks++;
        if (b.airTicks>0) q.flight++;
        if (b.dodgeApplied) q.dodges++;
        if (b.grounded && wasAir>=4) q.landings++;
        if (q.ticks%90===0 || live.phase==='finished') verify();
      });
    };
    function verify() {
      if (JSON.stringify(live.entrants)!==JSON.stringify(reference.entrants) || live.phase!==reference.phase)
        throw Error('Live six-car state differs at tick '+report.ticks);
      report.samples++;
    }
    function markFrame(gap) {
      const p=live.player,b=p.vehicle,id=b.contactFrame?.id,ny=b.contactFrame?.normal[1];
      const inTransfer=p.current.s>gap.start-3 && p.current.s<gap.end+65, wasAir=p.previousBody.airTicks;
      const labels=[
        ['straight',id==='mass-driver' && p.current.speed>23],['bank',id==='azimuth-bank' && b.grounded && ny<.997],
        ['wall-entry',id==='radial-elbow' && b.attached && ny<.65 && ny>.25],
        ['wall',id==='antenna-wall' && b.attached && Math.abs(ny)<.1],
        ['wall-to-ceiling',id==='crown-elbow' && b.attached && ny<-.35 && ny>-.78],
        ['ceiling',id==='inverted-spine' && b.attached && ny<-.95],
        ['ceiling-to-wall',id==='return-elbow' && b.attached && ny<-.35 && ny>-.78],
        ['descent',id==='earthward-wall' && b.attached && Math.abs(ny)<.1],
        ['return-floor',id==='escape-bank' && b.grounded && ny>.88],
        ['boost',b.boosting],['flight',inTransfer && b.airTicks>=4],['dodge',inTransfer && !!b.dodgeApplied],
        ['landing',inTransfer && id==='catch-deck' && b.grounded && wasAir>=4]
      ];
      const event=labels.find(([id,met])=>met && !markers.has(id));
      if (event) {
        markers.add(event[0]);
        captured=event[0];
        verify();
      }
    }
    window.driveRocketChunk=()=>{
      captured=null;
      for(let i=0;i<16 && !captured && reference.phase!=='finished';i++) {
        const s=reference.player.current.s, sections=reference.course.sections;
        const gap=sections.find(section=>section.kind==='air');
        // Resolve a one-tick dodge and the first grounded catch in separate rendered frames.
        const precision=s>gap.start-60 && s<gap.end+60;
        window.driveFrame(precision ? 1 : report.frames%2 ? 7 : 10);
        markFrame(gap);
        if (report.frames++%12===0) gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
      }
      if (report.ticks>15000) throw Error('Orbital driver stalled at '+reference.player.current.s);
      return {capture:captured,sample:sample(),finished:reference.phase==='finished'};
    };
    window.rocketReport=()=>({...report,
      result:live.order.map(e=>({id:e.id,position:e.position,finish:e.finishTicks,recoveries:e.recoveries})),
      splits:live.player.splitTicks,energy:live.player.vehicle.energy});
    return {vendor:gl.getParameter(ext ? ext.UNMASKED_VENDOR_WEBGL : gl.VENDOR),
      renderer:gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)};
  });
  let state;
  do {
    state=await page.evaluate(()=>window.driveRocketChunk());
    if(state.capture) await capture(state.capture,state.sample);
  } while(!state.finished);
  await capture('flag',state.sample);
  assert.equal(await page.locator('body').getAttribute('data-phase'),'finished');
  assert.equal(await page.locator('#classification li').count(),6);
  const report=await page.evaluate(()=>window.rocketReport());
  for(const name of ['straight','bank','wall-entry','wall','wall-to-ceiling','ceiling','ceiling-to-wall','descent','return-floor','boost','flight','dodge','landing'])
    assert(captures.some(e=>e.name===name),'Missing '+name);
  assert(report.wall>20 && report.inverted>60 && report.flight>=8 && report.landings>0 && report.dodges>0 && report.boostTicks>0);
  assert.equal(report.splits.length,orbital.gates.length-2);
  const direct=createRocketRace(report.seed);
  startRocketRace(direct);
  for(let i=0;i<report.ticks;i++)stepRocketRace(direct,direct.phase==='racing' ? orbitalDrive(direct.player) : NEUTRAL_ROCKET);
  assert.deepEqual(report.result,direct.order.map(e=>({id:e.id,position:e.position,finish:e.finishTicks,recoveries:e.recoveries})));
  assert.deepEqual(report.splits,direct.player.splitTicks);
  const result={revision,browser:browser.version(),graphics,opening,...report,captures};
  if(!raceOnly) {
    result.audio=await page.evaluate(()=>window.rocketAudioReceipt);
    assert.equal(result.audio.selected,'rocket'); assert.equal(result.audio.title,'RASTER VELOCITY');
    assert(result.audio.mono>0 && result.audio.stereo>0 && result.audio.audible>0);
    const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#save-drive').click()]);
    const bytes=await readFile(await download.path()), tape=JSON.parse(bytes);
    assert.equal(tape.revision,revision); assert.equal(tape.version,4); assert.equal(tape.ticks,report.ticks);
    result.recordingSha256=createHash('sha256').update(bytes).digest('hex');
    if(directory)await writeFile(directory+'/orbital-replay.json',bytes);
    await page.evaluate(async tape=>{
      const {createReplaySession}=await import('./src/replay-theatre-core.js');
      const session=createReplaySession(tape,document.querySelector('meta[name=game-revision]').content);
      while(!session.finished)session.advance(61);
      if(JSON.stringify(session.race.entrants)!==JSON.stringify(window.rocketObserver().entrants))
        throw Error('Browser v4 reconstruction differs from the live six-body state');
    },tape);
    const {createReplaySession,MAX_SEEK_STEPS}=await import('../src/replay-theatre-core.js');
    for(const n of [57,MAX_SEEK_STEPS]) {
      const session=createReplaySession(tape,revision);
      while(!session.finished)session.advance(n);
      assert.deepEqual(session.race.entrants,direct.entrants);
    }
    const viewer=await browser.newPage();
    viewer.on('pageerror',e=>errors.push(e.message));
    await viewer.route(new URL('src/replay-theatre.js',base).href,async route=>{
      const response=await route.fetch();
      return route.fulfill({response,body:await response.text()+'\nwindow.followPose=()=>poses[Number(document.querySelector("#replay-follow").value)]; window.cameraName=()=>document.querySelector("#replay-camera").value;'});
    });
    await viewer.goto(new URL('replay-theatre.html',base).href);
    await observeRenderer(viewer);
    await viewer.locator('#replay-file').setInputFiles({name:'orbital.json',mimeType:'application/json',buffer:bytes});
    await viewer.waitForFunction(()=>document.querySelector('#replay-status').textContent.includes('Loaded'));
    assert.equal(await viewer.locator('#replay-follow option').count(),6);
    for (const follow of ['1','5']) {
      await viewer.locator('#replay-follow').selectOption(follow);
      await viewer.locator('#replay-camera').selectOption(follow==='1'?'high':'chase');
      const target=follow==='1' ? captures.find(s=>s.name==='ceiling').tick : tape.ticks;
      await viewer.locator('#replay-seek').evaluate((el,n)=>{el.value=n;el.dispatchEvent(new Event('input'));},target);
      await viewer.waitForFunction(n=>Number(document.querySelector('#replay-seek').value)===n &&
        document.querySelector('#replay-status').textContent.includes('Position'),target,{timeout:90000});
      assert(await viewer.locator('#replay-rocket').isVisible());
      await capture(follow==='1' ? 'theatre-ceiling' : 'theatre-flag',{tick:target,follow:Number(follow)},viewer);
    }
    const order=await viewer.locator('#replay-standing li').allTextContents();
    for(const [i,e] of direct.order.entries()) assert(order[i].includes(e.name));
  }
  assert.deepEqual(errors,[]);
  if(directory)await writeFile(directory+'/orbital.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({...report,revision,browser:browser.version(),graphics,opening,images:captures.map(e=>e.name)}));
} finally {await browser.close();}
