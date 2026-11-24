// SPDX-License-Identifier: Apache-2.0
// Exercise the shipped input/clock/render path. The test adds a read-only
// observer to the served module and delivers key transitions before each tick.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {skywayIntent,skywayGateIntent} from './skyway-driver.mjs';
import {createReplaySession,MAX_SEEK_STEPS} from '../src/replay-theatre-core.js';
import {createNitroRace,startNitroRace,stepNitroRace} from '../src/nitro-race.js';
import {skyway} from '../src/skyway.js';
import {NEUTRAL_NITRO} from '../src/nitro-physics.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=new URL(process.argv[2]), out=process.env.EVIDENCE_DIR;
if (out) await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN,
  args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
async function driveRace(scenario) {
  const edgeFinish=scenario==='edge', overfly=scenario==='overfly';
  const driver=scenario==='stunts' ? skywayIntent : skywayGateIntent;
  const page=await browser.newPage({viewport:{width:960,height:560},acceptDownloads:true});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
    const url=route.request().url();
    if (!url.startsWith(base.href)) {errors.push('Off-site request '+url);return route.abort();}
    if (url===new URL('src/main.js',base).href) {
      const response=await route.fetch();
      return route.fulfill({response,body:await response.text()+'\nwindow.observeNitroRace=()=>race;'});
    }
    return route.continue();
  });
  await page.addInitScript({content:'window.nitroDriver='+driver.toString()+';'});
  await page.addInitScript(()=>{
    let callback,ms=0;
    window.requestAnimationFrame=fn=>{callback=fn;return 1;};
    window.advance=ticks=>{ms+=ticks*1000/60;callback(ms);};
  });
  await page.goto(base.href);
  await page.locator('#choose-skyway').click();
  await page.evaluate(()=>window.advance(0));
  const capture=async name=>{
    if (!out || (scenario!=='stunts' && name!=='skyway-edge-flag' && name!=='skyway-missed-cp')) return;
    await page.screenshot({path:out+'/'+name+'.png'});
  };
  await capture('skyway-selection');
  await page.locator('#start').click();
  await page.keyboard.press('w');
  await page.evaluate(()=>window.advance(0));
  assert.equal(await page.locator('body').getAttribute('data-phase'),'countdown');
  const stamp=await page.locator('meta[name=game-revision]').getAttribute('content');
  assert.match(stamp,/^[0-9a-f]{40}$/);
  if (process.env.REPLAY_REVISION) assert.equal(stamp,process.env.REPLAY_REVISION);
  await capture('skyway-grid');
  await page.evaluate(async ({edgeFinish,overfly})=>{
    const {createNitroRace,startNitroRace,stepNitroRace}=await import('./src/nitro-race.js');
    const {NEUTRAL_NITRO}=await import('./src/nitro-physics.js');
    const {skyway}=await import('./src/skyway.js');
    const {FixedClock}=await import('./vendor/vanillajs/modules/time/index.js');
    const live=window.observeNitroRace(), reference=createNitroRace(live.seed,skyway);
    startNitroRace(reference);
    const held=new Set(),canvas=document.querySelector('#world');
    const gl=canvas.getContext('webgl'),pixel=new Uint8Array(4);
    const report={seed:live.seed,ticks:0,frames:0,samples:0,peakEnergy:0,boostTicks:0,airborneTicks:0,
      maxAirTicks:0,positiveBoostAcceleration:0,chargingTicks:0,landings:0,positions:[],gates:[]};
    const framesCaptured=new Set(),nativeAdvance=FixedClock.prototype.advance;
    let mark;
    const gateStation=overfly ? skyway.gates[4].s : skyway.length;
    const wheelLoads=body=>body.wheels.filter(w=>w.grounded && w.load>150).map(w=>w.surfaceId);
    function key(code,pressed) {
      if (held.has(code)===pressed) return;
      if (pressed) held.add(code); else held.delete(code);
      canvas.dispatchEvent(new KeyboardEvent(pressed?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
    }
    FixedClock.prototype.advance=function(dt,update) {
      return nativeAdvance.call(this,dt,h=>{
        if (reference.phase==='finished') return update(h);
        const c=reference.phase==='racing' ? window.nitroDriver(reference.player,skyway,overfly) : NEUTRAL_NITRO;
        key('KeyW',!!c.throttle);key('KeyS',!!c.brake);key('KeyA',c.steer<0);key('KeyD',c.steer>0);
        key('Space',c.drift);key('ShiftLeft',c.boost);
        const before=live.player.current, speed=before.speed, position=live.player.position;
        const nearGate=(overfly || edgeFinish) && before.s>gateStation-2 && before.s<gateStation;
        const previousTyres=nearGate ? wheelLoads(live.player.vehicle) : null;
        stepNitroRace(reference,c);
        update(h);
        report.ticks++;
        const p=live.player,n=p.nitro;
        if(nearGate && p.current.s>=gateStation) {
          const fraction=(gateStation-before.s)/(p.current.s-before.s);
          report.gateCrossing={lateral:before.lateral+(p.current.lateral-before.lateral)*fraction,
            previousTyres,tyres:wheelLoads(p.vehicle),positionBefore:position,positionAfter:p.position};
          if(edgeFinish && live.phase!=='finished') throw Error('Supported leading driver denied the flag: '+JSON.stringify(report.gateCrossing));
        }
        if (!report.positions.includes(p.position)) report.positions.push(p.position);
        if (!report.gates.includes(p.nextGate)) report.gates.push(p.nextGate);
        if (n.charging) report.chargingTicks++;
        if (n.boosting) {report.boostTicks++;if (p.current.speed>speed) report.positiveBoostAcceleration++;}
        if (n.airborne) report.airborneTicks++;
        if (n.landed) report.landings++;
        report.maxAirTicks=Math.max(report.maxAirTicks,n.airTicks);
        report.peakEnergy=Math.max(report.peakEnergy,n.energy);
        const event=n.rewarded?'landing':n.airTicks>=12?'airborne':n.boosting?'boost':n.charging?'drift':null;
        if (!mark && event && !framesCaptured.has(event)) {mark=event;framesCaptured.add(event);}
        if (report.ticks%90===0 || n.launch || n.landed || reference.phase==='finished') {
          // Includes chassis, quaternion, wheel loads/contact patches, vehicle
          // impulses, AI state, gate and recovery bookkeeping, and energy.
          if (JSON.stringify(live.entrants)!==JSON.stringify(reference.entrants) ||
              live.phase!==reference.phase) throw Error('Live/reference divergence at tick '+report.ticks);
          report.samples++;
        }
      });
    };
    window.driveChunk=()=>{
      mark=null;
      for(let i=0;i<16 && !mark && !(overfly && report.gateCrossing) && reference.phase!=='finished';i++) {
        window.advance(report.frames++%2 ? 12 : 7);
        if (report.frames%12===0) gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
      }
      if (report.ticks>24000) throw Error('Skyway driver missed finish at '+live.player.current.s);
      if(overfly && report.gateCrossing) {
        FixedClock.prototype.advance=nativeAdvance;
        for(const code of held) key(code,false);
        return {mark,finished:true};
      }
      return {mark,finished:reference.phase==='finished'};
    };
    window.nitroReport=()=>({...report,stunts:live.player.nitro.stunts,points:live.player.nitro.points,
      standings:live.order.map(e=>({id:e.id,position:e.position,finishTicks:e.finishTicks,recoveries:e.recoveries})),
      splits:live.player.splitTicks,field:live.entrants});
  },{edgeFinish,overfly});
  let state;
  do {
    state=await page.evaluate(()=>window.driveChunk());
    if (state.mark==='boost') {
      const streak=()=>page.locator('#hud').evaluate(el=>getComputedStyle(el,'::before').content);
      assert.equal(await streak(),'""');
      await page.emulateMedia({reducedMotion:'reduce'});
      assert.equal(await streak(),'none');
      await page.emulateMedia({reducedMotion:'no-preference'});
    }
    if (state.mark) await capture('skyway-'+state.mark);
  } while (!state.finished);
  const {field,...report}=await page.evaluate(()=>window.nitroReport());
  if (overfly) {
    const before=field.find(e=>!e.ai), gate=before.nextGate;
    assert.deepEqual(report.gateCrossing.previousTyres,[]);
    assert.deepEqual(report.gateCrossing.tyres,[]);
    assert.equal(gate,4);
    assert(before.missedGate && before.finishTicks===null);
    assert.equal(await page.locator('#feedback').textContent(),'CP 4 missed · Press R to retry (+3 s)');
    await capture('skyway-missed-cp');
    await page.keyboard.press('r');
    await page.evaluate(()=>window.advance(1));
    const after=await page.evaluate(()=>window.observeNitroRace().player);
    assert.equal(after.nextGate,gate);
    assert.equal(after.recoveries,before.recoveries+1);
    assert.equal(after.elapsedTicks,before.elapsedTicks+181);
    assert(after.current.s<=skyway.gates[gate-1].s && !after.missedGate);
    assert.match(await page.locator('#feedback').textContent(),/Recovered/);
    assert.deepEqual(errors,[]);
    const result={scenario,revision:stamp,gate,crossing:report.gateCrossing,recoveredAt:after.current.s,ticks:report.ticks};
    if (out) await writeFile(out+'/skyway-missed-cp.json',JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify(result));
    await page.close();
    return;
  }
  await capture(edgeFinish?'skyway-edge-flag':'skyway-flag');
  assert.equal(await page.locator('#classification li').count(),6);
  assert.equal(await page.locator('body').getAttribute('data-phase'),'finished');
  if(edgeFinish) {
    const finish=report.gateCrossing;
    assert(finish && finish.lateral>skyway.halfWidth && finish.lateral<skyway.barrierOffset);
    for(const tyres of [finish.previousTyres,finish.tyres]) {
      assert(tyres.length>=2 && tyres.every(id=>id==='apron'));
    }
    assert.equal(finish.positionBefore,1);
    assert.equal(finish.positionAfter,1);
    assert.equal(report.standings[0].recoveries,0);
    assert.equal(await page.locator('#classification li').first().getAttribute('data-id'),String(report.standings[0].id));
  } else {
    assert(report.chargingTicks>0 && report.peakEnergy>0 && report.boostTicks>0 && report.positiveBoostAcceleration>0);
    assert(report.maxAirTicks>=8 && report.landings>0 && report.stunts>0 && report.points>0);
  }
  assert.equal(report.splits.length,skyway.gates.length-2);
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#save-drive').click()]);
  const bytes=await readFile(await download.path());
  const tape=JSON.parse(bytes);
  assert.equal(tape.version,3);assert.equal(tape.revision,stamp);assert.equal(tape.ticks,report.ticks);
  const prefix=edgeFinish?'skyway-edge':'skyway';
  if (out) await writeFile(out+'/'+prefix+'-replay.json',bytes);
  const direct=createNitroRace(tape.seed,skyway);
  startNitroRace(direct);
  for(let tick=0;tick<tape.ticks;tick++) stepNitroRace(direct,direct.phase==='racing' ? driver(direct.player,skyway) : NEUTRAL_NITRO);
  assert.deepEqual(direct.order.map(e=>({id:e.id,position:e.position,finishTicks:e.finishTicks,recoveries:e.recoveries})),report.standings);
  const counters=({energy,chargedTotal,spentTotal,launches,landings,stunts,points})=>
    ({energy,chargedTotal,spentTotal,launches,landings,stunts,points});
  assert.deepEqual(direct.entrants.map(e=>counters(e.nitro)),field.map(e=>counters(e.nitro)));
  // Each runtime checks every field against its own authoritative drive.
  // Trigonometric implementations in different JS engines may differ by ulps.
  await page.evaluate(async tape=>{
    const {createReplaySession}=await import('./src/replay-theatre-core.js');
    const session=createReplaySession(tape,document.querySelector('meta[name=game-revision]').content);
    while (!session.finished) session.advance(63);
    if (JSON.stringify(session.race.entrants)!==JSON.stringify(window.observeNitroRace().entrants))
      throw Error('Browser replay differs from the original six chassis, wheel contacts or stunt state');
  },tape);
  for (const batch of [37,MAX_SEEK_STEPS]) {
    const session=createReplaySession(tape,stamp);
    while (!session.finished) session.advance(batch);
    assert.deepEqual(session.race.entrants,direct.entrants);
  }
  const result={revision:stamp,browser:browser.version(),...report};
  if (out) await writeFile(out+'/'+prefix+'.json',JSON.stringify(result,null,2)+'\n');
  if (edgeFinish) {
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify(result));
    await page.close();
    return;
  }
  // The spectator gets an ordinary rAF clock in its own browser context.
  const viewer=await browser.newPage();
  viewer.on('pageerror',e=>errors.push(e.message));
  await viewer.goto(new URL('replay-theatre.html',base).href);
  await viewer.locator('#replay-file').setInputFiles({name:'skyway.json',mimeType:'application/json',buffer:bytes});
  await viewer.waitForFunction(()=>document.querySelector('#replay-status').textContent.includes('Loaded'));
  await viewer.locator('#replay-seek').evaluate((el,n)=>{el.value=n;el.dispatchEvent(new Event('input'));},tape.ticks);
  await viewer.waitForFunction(n=>Number(document.querySelector('#replay-seek').value)===n &&
    document.querySelector('#replay-status').textContent.includes('Position'),tape.ticks,{timeout:90000});
  const order=await viewer.locator('#replay-standing li').allTextContents();
  for (const [i,e] of direct.order.entries()) assert(order[i].includes(e.name));
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify(result));
  await viewer.close();
  await page.close();
}
try {
  await driveRace('stunts');
  await driveRace('edge');
  await driveRace('overfly');
} finally { await browser.close(); }
