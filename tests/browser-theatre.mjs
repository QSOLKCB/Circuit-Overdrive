// SPDX-License-Identifier: Apache-2.0
// Actual packaged WebGL spectator acceptance. Synthetic source-bound input
// recordings are generated with the same six-car race simulator, NOT shipped.
import assert from 'node:assert/strict';
import {driverIntent} from './driver.mjs';
import {createRecording} from '../src/replay.js';
import {createRace,startRace,stepRace} from '../src/sim.js';
import {track} from '../src/track.js';
import {ridge} from '../src/ridge.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=new URL(process.argv[2]||'http://127.0.0.1:8000/');
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||undefined,
  args:process.env.NATIVE_GL==='1'?['--enable-gpu','--use-angle=gl']:
    ['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const zero={throttle:0,brake:0,steer:0};
function recordedRace(course,revision){
  const race=createRace(27,course),recording=createRecording(course.id,27,revision);
  startRace(race);
  for(let tick=0;tick<18000&&race.phase!=='finished';tick++){
    const command=race.phase==='countdown'?zero:driverIntent(race.player.current,30,0,course);
    recording.record(command,false);
    stepRace(race,command);
  }
  assert.equal(race.phase,'finished','fixture driver must finish '+course.id);
  return {data:recording.export(),race};
}
let page;
try {
  page=await browser.newPage({viewport:{width:1280,height:720}});
  const failures=[],requests=[];
  page.on('pageerror',e=>failures.push(String(e)));
  page.on('request',r=>requests.push(r.url()));
  page.on('response',r=>{if(r.status()>=400)failures.push(r.url()+' '+r.status());});
  await page.route('**/*',route=>{
    if(route.request().url().startsWith(base.href))return route.continue();
    failures.push('Off-origin '+route.request().url());return route.abort();
  });
  await page.goto(new URL('replay-theatre.html',base).href);
  const revision=await page.locator('meta[name="game-revision"]').getAttribute('content');
  assert.match(revision,/^[0-9a-f]{40}$/,'hosted Theatre must be source stamped');
  assert.equal(await page.locator('#replay-play').isDisabled(),true);
  const file=page.locator('#replay-file');
  for(const course of [track,ridge]){
    // Use v0.6.0 for the first race to prove the auditable compatibility path,
    // and the exact test site revision for the second.
    const source=course.closed?'020e5dc4c7e2485e01f0f47c698f80ee58fe228b':revision;
    const {data,race}=recordedRace(course,source);
    await file.setInputFiles({name:'race-'+course.id+'.json',mimeType:'application/json',
      buffer:Buffer.from(JSON.stringify(data))});
    await page.waitForFunction(id=>document.querySelector('#replay-status').textContent.includes('Loaded '+id),
      course.id,{timeout:60000});
    assert.equal(await page.locator('#replay-play').isEnabled(),true);
    assert.equal(await page.locator('#replay-title').textContent(),course.name);
    const gl=await page.locator('#replay-world').evaluate(canvas=>!!canvas.getContext('webgl'));
    assert(gl,'real WebGL spectator canvas');
    // A paused camera switch must immediately change the WebGL view even
    // though accepted race ticks and elapsed physics time remain frozen.
    await page.waitForTimeout(100);
    const lowCamera=await page.locator('#replay-world').screenshot();
    await page.locator('#replay-camera').selectOption('high');
    await page.waitForTimeout(100);
    const highCamera=await page.locator('#replay-world').screenshot();
    assert.notDeepEqual(highCamera,lowCamera,'paused camera preset must update scene without advancing ticks');
    assert.equal(Number(await page.locator('#replay-seek').inputValue()),0);
    await page.locator('#replay-follow').selectOption('0');
    assert.match(await page.locator('#replay-driver').textContent(),/Mara Vale/);
    await page.locator('#replay-follow').selectOption('5');
    await page.locator('#replay-rate').selectOption('2');
    await page.locator('#replay-play').click();
    await page.waitForFunction(()=>Number(document.querySelector('#replay-seek').value)>0);
    await page.locator('#replay-play').click();
    const tick=Number(await page.locator('#replay-seek').inputValue());
    assert(tick>0,'playing must move simulation ticks');
    await page.locator('#replay-seek').evaluate((range,value)=>{
      range.value=String(value);range.dispatchEvent(new Event('input',{bubbles:true}));
    },Math.min(720,data.ticks-1));
    await page.waitForFunction(target=>
      Number(document.querySelector('#replay-seek').value)===target &&
      document.querySelector('#replay-status').textContent.includes('Position '),
    Math.min(720,data.ticks-1),{timeout:60000});
    // Seeking backwards reconstructs the grid, does not teleport the cars.
    await page.locator('#replay-restart').click();
    assert.equal(Number(await page.locator('#replay-seek').inputValue()),0);
    // A Restart while a long seek is pending must return the Play button to
    // the enabled state even though the seek-completion callback never runs.
    await page.locator('#replay-seek').evaluate((range,value)=>{
      range.value=String(value);range.dispatchEvent(new Event('input',{bubbles:true}));
    },data.ticks);
    await page.locator('#replay-restart').click();
    assert.equal(await page.locator('#replay-play').isEnabled(),true);
    assert.equal(Number(await page.locator('#replay-seek').inputValue()),0);
    // Drive the entire original race asynchronously, bounded in 240-step chunks.
    await page.locator('#replay-seek').evaluate((range,value)=>{
      range.value=String(value);range.dispatchEvent(new Event('input',{bubbles:true}));
    },data.ticks);
    await page.waitForFunction(target=>
      Number(document.querySelector('#replay-seek').value)===target &&
      document.querySelector('#replay-status').textContent.includes('Position '),
    data.ticks,{timeout:120000});
    assert.equal(Number(await page.locator('#replay-seek').inputValue()),data.ticks);
    const rows=await page.locator('#replay-standing li').allTextContents();
    assert.equal(rows.length,6);
    for(let i=0;i<6;i++){
      assert(rows[i].includes('#'+race.order[i].number),
        'theatre and independent six-car simulation agree on finishing order '+course.id);
    }
    const spectatorPosition=await page.locator('#replay-place').textContent();
    assert.equal(spectatorPosition,'P'+race.player.position+' / 6');
    // A persisted pagehide must not dispose the WebGL renderer, or browser
    // Back/Forward restoration would leave working controls with a blank view.
    await page.evaluate(()=>{
      window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
      window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
    });
    await page.waitForTimeout(75);
    assert(await page.locator('#replay-world').evaluate(canvas=>
      !!canvas.getContext('webgl')),'WebGL remains available across persisted navigation');
    if(process.env.EVIDENCE_DIR)
      await page.screenshot({path:process.env.EVIDENCE_DIR+'/theatre-'+course.id+'.png'});
    console.log(JSON.stringify({course:course.id,revision:source,ticks:data.ticks,
      playerPosition:race.player.position,finishTicks:race.player.finishTicks,standings:rows}));
  }
  const rejected=recordedRace(track,'ff'.repeat(20)).data;
  await file.setInputFiles({name:'wrong-revision.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify(rejected))});
  await page.waitForFunction(()=>document.querySelector('#replay-status').textContent.includes('needs revision'));
  assert((await page.locator('#replay-status').textContent()).includes('Cannot play replay'));
  const legacy=recordedRace(track,revision).data;
  legacy.version=1;delete legacy.revision;
  await file.setInputFiles({name:'legacy.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify(legacy))});
  await page.waitForFunction(()=>document.querySelector('#replay-status').textContent.includes('Legacy'));
  assert.deepEqual(failures,[]);
  assert(requests.every(url=>url.startsWith(base.href)||url.startsWith('data:')),
    'no outbound runtime requests');
  console.log('Real browser Theatre input, replay, camera, seek, six-car classification and invalid revision checks passed.');
} finally {await browser.close();}
