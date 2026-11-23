// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createReplaySession,MAX_SEEK_STEPS} from '../src/replay-theatre-core.js';
import {driverIntent} from './driver.mjs';
import {installReplayController,selectReplayController,armReplayController} from './browser-controller-driver.mjs';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = new URL(process.argv[2]);
const browser = await chromium.launch({executablePath:process.env.CHROME_BIN,
  args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors = [];
async function openPage(source = 'keyboard') {
  const context = await browser.newContext({viewport:{width:640,height:400},hasTouch:source==='touch'});
  const page = await context.newPage();
  page.on('pageerror',e => errors.push(e.message));
  page.on('response',r => { if (r.status() >= 400) errors.push(r.status()+' '+r.url()); });
  await page.route('**/*',route => {
    if (route.request().url().startsWith(url.href)) return route.continue();
    errors.push('Unexpected request '+route.request().url());
    return route.abort();
  });
  await installReplayController(page,source);
  await page.addInitScript(() => {
    const metrics = window.wocMetrics = {buffers:0, pcm:0, engine:0, music:0};
    const gl = WebGLRenderingContext.prototype, allocate = gl.createBuffer, dispose = gl.deleteBuffer;
    gl.createBuffer = function() { const buffer=allocate.call(this); if (buffer) metrics.buffers++; return buffer; };
    gl.deleteBuffer = function(buffer) { if (this.isBuffer(buffer)) metrics.buffers--; return dispose.call(this,buffer); };
    const create = BaseAudioContext.prototype.createBuffer, start = AudioBufferSourceNode.prototype.start;
    BaseAudioContext.prototype.createBuffer = function(...args) { metrics.pcm++; return create.apply(this,args); };
    AudioBufferSourceNode.prototype.start = function(...args) {
      if (this.buffer.numberOfChannels===1) metrics.engine++;
      else if (this.buffer.getChannelData(0).some(x=>x!==0)) metrics.music++;
      return start.apply(this,args);
    };
    let next, time = 0;
    window.requestAnimationFrame = cb => { next = cb; return 1; };
    window.advanceFrame = (ticks = 0) => {
      time += ticks * 1000 / 60;
      next(time);
    };
  });
  await page.addInitScript({content:'window.driveKeyboard = ('+driverIntent.toString()+');'});
  await page.goto(url.href);
  await page.evaluate(()=>window.advanceFrame());
  await selectReplayController(page,source);
  return page;
}
const frame = (page,ticks=0) => page.evaluate(n=>window.advanceFrame(n),ticks);
const click = (page,id) => page.locator('#'+id).click({force:true});
const view = page => page.locator('#woc').getAttribute('data-view');
const phase = page => page.locator('body').getAttribute('data-phase');

async function drive(page, courseId, seed, cruise) {
  return page.evaluate(async ({courseId,seed,cruise}) => {
    const {createRace, startRace, stepRace} = await import('./src/sim.js');
    const {FixedClock} = await import('./vendor/vanillajs/modules/time/index.js');
    const course = courseId === 'ridge' ? (await import('./src/ridge.js')).ridge : (await import('./src/track.js')).track;
    const shadow = createRace(seed,course);
    startRace(shadow);
    const canvas = document.querySelector('#world'), gl = canvas.getContext('webgl');
    const pixel = new Uint8Array(4), held = new Set();
    const controls = {KeyW:'throttle',KeyS:'brake',KeyA:'left',KeyD:'right'};
    function dispatch(command) {
      const desired = {...command,left:command.steer<0,right:command.steer>0};
      for (const [key,action] of Object.entries(controls)) {
        const pressed = Boolean(desired[action]);
        if (held.has(key) === pressed) continue;
        if (pressed) held.add(key); else held.delete(key);
        canvas.dispatchEvent(new KeyboardEvent(pressed ? 'keydown' : 'keyup',
          {code:key,bubbles:true,cancelable:true}));
      }
    }
    // Supply only key transitions. Both clocks run the shipping update; a
    // separate same-runtime field decides the driver's inputs and expected flag.
    const advance = FixedClock.prototype.advance;
    const pending = [];
    FixedClock.prototype.advance = function(elapsed,update) {
      return advance.call(this,elapsed,(dt) => { dispatch(pending.shift()); update(dt); });
    };
    let ticks=0, draws=0;
    try {
      window.advanceFrame();
      while (shadow.phase !== 'finished' && ticks < 35000) {
        while (pending.length < 15 && shadow.phase !== 'finished') {
          const command = shadow.phase === 'racing' ? window.driveKeyboard(shadow.player.current,cruise,0,course) : {};
          pending.push(command);
          stepRace(shadow,command);
          ticks++;
        }
        window.advanceFrame(pending.length);
        if (pending.length) throw Error('Live clock missed queued driving commands');
        if (++draws % 12 === 0) {
          gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
          await new Promise(resolve=>setTimeout(resolve,0));
        }
      }
      if (shadow.phase !== 'finished') throw Error('Reference driver missed the finish');
      return {ticks,draws,classification:shadow.order.map(({id,finishTicks,recoveries})=>({id,finishTicks,recoveries}))};
    } finally {
      FixedClock.prototype.advance = advance;
      dispatch({});
    }
  },{courseId,seed,cruise});
}

async function verifyEventReplay(page, result, round, course, seed) {
  const revision = await page.locator('meta[name=game-revision]').getAttribute('content');
  assert.match(revision,/^[a-f0-9]{40}$/,'Serve a source-stamped package');
  const [file] = await Promise.all([page.waitForEvent('download'),click(page,'woc-replay')]);
  const data = JSON.parse(await readFile(await file.path(),'utf8'));
  assert.equal(data.course,course);
  assert.equal(data.seed,seed);
  assert.equal(data.revision,revision);
  assert.equal(data.ticks,result.ticks);
  assert.match(file.suggestedFilename(),new RegExp('^woc-[a-f0-9]{32}-r'+round+'-'+course+'-'+seed+'-replay\\.json$'));
  const session = createReplaySession(data,revision);
  for (const batch of [MAX_SEEK_STEPS,63]) {
    session.reset();
    while (!session.finished) session.advance(batch);
    assert.deepEqual(session.race.order.map(({id,finishTicks,recoveries})=>({id,finishTicks,recoveries})),
      result.classification);
  }
  if (process.env.EVIDENCE_DIR) await file.saveAs(process.env.EVIDENCE_DIR+'/'+file.suggestedFilename());
  return data;
}
async function waitForSave(page,round) {
  await page.waitForFunction(n => document.querySelector('#woc-save-status').textContent.includes('Saved locally · '+n+' / 4'),
    round,{polling:30});
}
async function lifecycle(source) {
  const page = await openPage(source);
  const press = async id => {
    if (source === 'touch') return page.locator('#'+id).tap();
    await page.evaluate(id => {
      const pad = navigator.getGamepads()[1];
      const tap = index => {
        pad.buttons[index]={value:1,pressed:true}; window.advanceFrame();
        pad.buttons[index]={value:0,pressed:false}; window.advanceFrame();
      };
      window.advanceFrame();
      for (let i=0; i<32 && document.activeElement.id!==id; i++) tap(13);
      if (document.activeElement.id!==id) throw Error('Controller could not reach '+id);
      tap(0);
    },id);
  };
  await press('enter-woc');
  await press('woc-calendar');
  assert.equal(await view(page),'calendar');
  assert.match(await page.locator('#status').textContent(),/Event calendar/);
  await press('woc-back');
  await press('woc-standings');
  assert.equal(await page.locator('#woc tbody tr').count(),6);
  await press('woc-back');
  await press('woc-new');
  await press('woc-grid');
  await armReplayController(page,source);
  assert.equal(await phase(page),'countdown');
  await frame(page,15);
  if (source === 'standard') {
    // Synthetic reports can disappear without an event, as on a suspended tab.
    await page.evaluate(()=>{ navigator.getGamepads()[1].connected=false; window.advanceFrame(2); });
  } else {
    const pedal = page.locator('[data-touch=throttle]');
    const box = await pedal.boundingBox();
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',
      touchPoints:[{id:1,x:box.x+box.width/2,y:box.y+box.height/2}]});
    assert(await pedal.evaluate(node=>node.classList.contains('held')));
    await session.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
    assert(!(await pedal.evaluate(node=>node.classList.contains('held'))));
  }
  assert.equal(await phase(page),'paused');
  await click(page,'courses');
  assert.equal(await view(page),'briefing');
  const points = await page.locator('#woc tbody tr td:last-child').allTextContents();
  assert.equal(points.length,6);
  assert(points.every(value=>value==='0'));
  await page.context().close();
}

const slot = 'circuit-overdrive.woc.v1';
const names = ['#14 Mara Vale','#83 Kit Vega','#46 Emi Park','#59 Rory Flint','#32 Luca Reed','#27 Player'];
const calendar = ['Overdrive Opening Cup','Redline Mountain Challenge','Speedway Grand Prix','Ridge Championship Finale'];
const awards = [10,6,4,3,2,1];

// Independent scoreboard oracle. It takes only orders from the reference
// simulation and sorts complete countback vectors, without game scoring code.
function standings(results) {
  const field = names.map((name,id) => {
    const finishes = results.map(r=>r.classification.findIndex(row=>row.id===id)+1);
    const points = finishes.reduce((sum,place)=>sum+awards[place-1],0);
    const vector = [points,...[1,2,3].map(p=>finishes.filter(place=>place===p).length),
      ...finishes.reverse().map(p=>-p),-id];
    return {id,name,points,vector};
  });
  return field.sort((a,b) => {
    const i = a.vector.findIndex((value,index)=>value!==b.vector[index]);
    return i<0 ? 0 : b.vector[i]-a.vector[i];
  });
}
function official(ticks) {
  if (ticks===null) return 'Racing at flag';
  const ms = Math.round(ticks*1000/60);
  return Math.floor(ms/60000)+':'+String(Math.floor(ms/1000)%60).padStart(2,'0')+'.'+String(ms%1000).padStart(3,'0');
}
async function rows(table) {
  return table.locator('tbody tr').evaluateAll(nodes=>nodes.map(row=>({
    id:Number(row.dataset.driver), values:[...row.cells].map(cell=>cell.textContent)
  })));
}
async function checkEvent(table,results) {
  const ranks = standings(results);
  const expected = results.at(-1).classification.map(({id,finishTicks},i)=>({id,
    values:[String(i+1),names[id],official(finishTicks),'+'+awards[i],String(ranks.find(r=>r.id===id).points)]
  }));
  assert.deepEqual(await rows(table),expected);
}
async function checkStandings(table,results) {
  assert.deepEqual(await rows(table),standings(results).map(({id,name,points},i)=>({
    id,values:[String(i+1),name,String(points)]
  })));
}
const stored = page => page.evaluate(key=>localStorage.getItem(key),slot);
const status = page => page.locator('#woc-save-status').textContent();
async function watchDownload(page,tape,result) {
  const before = await stored(page), viewer = await page.context().newPage();
  try {
    await viewer.goto(new URL('replay-theatre.html',url).href);
    await viewer.locator('#replay-file').setInputFiles({name:'round.json',mimeType:'application/json',
      buffer:Buffer.from(JSON.stringify(tape))});
    await viewer.waitForFunction(()=>document.querySelector('#replay-status').textContent.includes('Loaded'));
    await viewer.locator('#replay-seek').evaluate((range,n)=>{
      range.value=n;
      range.dispatchEvent(new Event('input',{bubbles:true}));
    },tape.ticks);
    await viewer.waitForFunction(n=>Number(document.querySelector('#replay-seek').value)===n &&
      document.querySelector('#replay-status').textContent.includes('Position '),tape.ticks,{timeout:120000});
    const order = await viewer.locator('#replay-standing li').allTextContents();
    assert.equal(order.length,6);
    result.classification.forEach(({id},i)=>assert(order[i].includes(names[id].split(' ')[0])));
    assert.equal(await stored(page),before,'spectator must not write a championship save');
  } finally { await viewer.close(); await page.bringToFront(); }
}
async function loadResults(page,results) {
  await page.reload();
  await click(page,'enter-woc');
  await click(page,'woc-continue');
  assert.equal(await view(page),'results');
  await checkEvent(page.locator('#woc table'),results);
  assert.equal(await page.locator('#woc-replay').count(),0,'downloads belong to the original race session');
}
async function storageFaults() {
  const corrupt = await openPage();
  await corrupt.evaluate(key=>localStorage.setItem(key,'{bad'),slot);
  await click(corrupt,'enter-woc');
  assert.match(await status(corrupt),/Save could not be loaded/);
  assert.equal(await corrupt.locator('#woc-continue').count(),0);
  await click(corrupt,'woc-new');
  await click(corrupt,'woc-keep');
  assert.equal(await stored(corrupt),'{bad','cancel preserves the unreadable slot');
  await click(corrupt,'woc-new');
  await click(corrupt,'woc-replace');
  await waitForSave(corrupt,0);
  await checkStandings(corrupt.locator('#woc table'),[]);
  const peer = await corrupt.context().newPage();
  await peer.goto(url.href);
  await click(peer,'enter-woc');
  await click(peer,'woc-new');
  await click(peer,'woc-replace');
  await waitForSave(peer,0);
  const newest = await stored(peer);
  await click(corrupt,'woc-back');
  await click(corrupt,'woc-new');
  await click(corrupt,'woc-replace');
  await corrupt.waitForFunction(()=>document.querySelector('#woc-save-status').textContent.includes('Another tab'),null,{polling:30});
  assert.equal(await stored(corrupt),newest);
  await click(corrupt,'woc-back');
  await click(corrupt,'woc-load');
  await click(corrupt,'woc-continue');
  await checkStandings(corrupt.locator('#woc table'),[]);
  await peer.close();
  await corrupt.context().close();

  const denied = await openPage();
  await denied.evaluate(()=>Object.defineProperty(window,'localStorage',{get(){ throw new DOMException('Denied','SecurityError'); }}));
  await click(denied,'enter-woc');
  assert.match(await status(denied),/Storage unavailable/);
  await click(denied,'woc-new');
  await denied.waitForFunction(()=>document.querySelector('#woc-save-status').textContent.includes('this tab only'),null,{polling:30});
  await click(denied,'woc-grid');
  await denied.keyboard.press('w');
  assert.equal(await phase(denied),'countdown');
  await denied.context().close();
}
async function capture(page,name) {
  if (!process.env.EVIDENCE_DIR) return;
  await page.setViewportSize({width:1100,height:760});
  await frame(page);
  await page.screenshot({path:process.env.EVIDENCE_DIR+'/'+name+'.png'});
  await page.setViewportSize({width:640,height:400});
}
async function mute(page) {
  if (await page.locator('#sound-state').textContent()==='on') await click(page,'sound');
}
async function campaign() {
  const page = await openPage(), results = [], resources = [];
  const cdp = await page.context().newCDPSession(page);
  const revision = await page.locator('meta[name=game-revision]').getAttribute('content');
  await click(page,'choose-ridge');
  await page.locator('#enter-woc').focus();
  await page.keyboard.press('Enter');
  await capture(page,'championship-menu');
  await page.keyboard.press('Enter');
  assert.equal(await view(page),'briefing');
  assert.match(await page.locator('#status').textContent(),/Round 1.*Event briefing.*Overdrive Opening Cup/);
  assert.equal(await page.evaluate(()=>wocMetrics.pcm),0);
  const before = await page.locator('#timer').textContent();
  await frame(page,15);
  assert.equal(await page.locator('#timer').textContent(),before);
  await page.keyboard.press('Enter');
  await page.keyboard.press('w');
  await page.waitForFunction(()=>{window.advanceFrame(2);return wocMetrics.music>0 && wocMetrics.engine>0;},null,{polling:30});
  await page.keyboard.press('Escape');
  await click(page,'settings');
  await page.locator('#music-volume').fill('37');
  await click(page,'close-settings');
  await click(page,'restart');
  await page.keyboard.press('Escape');
  assert.equal(await view(page),'briefing');
  let id;
  for (let i=0; i<4; i++) {
    const round=i+1, course=i%2===0?'speedway':'ridge', seed=700+round;
    await checkStandings(page.locator('#woc table'),results);
    assert.match(await page.locator('#status').textContent(),new RegExp('Round '+round+'.*Event briefing.*'+calendar[i]));
    await mute(page);
    await click(page,'woc-grid');
    await page.keyboard.press('w');
    if (round===2) {
      await frame(page);
      await frame(page,15);
      await loadResults(page,results); // Interrupted countdown resumes at the preceding boundary.
      await click(page,'woc-next');
      await mute(page);
      await click(page,'woc-grid');
      await page.keyboard.press('w');
    }
    if (round===3) await page.evaluate(key=>{
      const write = Storage.prototype.setItem;
      Storage.prototype.setItem = function(k,v) {
        if (k===key && window.denyWocWrite) throw new DOMException('Full','QuotaExceededError');
        write.call(this,k,v);
      };
      window.denyWocWrite=true;
    },slot);
    assert.equal(await phase(page),'countdown');
    const result = await drive(page,course,seed,33);
    results.push(result);
    assert.equal(await view(page),'results');
    assert.match(await page.locator('#status').textContent(),new RegExp('Round '+round+'.*Chequered flag.*'+calendar[i]));
    await checkEvent(page.locator('#woc table'),results);
    const leader = standings(results)[0];
    assert((await page.locator('#woc-copy').textContent()).includes(leader.name+' · '+leader.points+' points'));
    if (round===3) {
      await page.waitForFunction(()=>document.querySelector('#woc-save-status').textContent.includes('this tab only'),null,{polling:30});
      assert.equal(JSON.parse(await stored(page)).history.length,2);
      await page.evaluate(()=>{window.denyWocWrite=false;});
    } else {
      await waitForSave(page,round);
      const saved=JSON.parse(await stored(page));
      id ??= saved.id;
      assert.equal(saved.revision,revision);
      assert.equal(saved.id,id);
      assert.equal(saved.history.length,round);
      saved.history.forEach((event,j)=>assert.deepEqual(event.classification,results[j].classification));
    }
    const tape = await verifyEventReplay(page,result,round,course,seed);
    await cdp.send('HeapProfiler.collectGarbage');
    resources.push({round,course,heap:(await cdp.send('Runtime.getHeapUsage')).usedSize,
      ...await page.evaluate(()=>({...wocMetrics}))});
    console.log('Round '+round+' verified · '+leader.name+' leads with '+leader.points+' points.');
    if (round===1) {
      await capture(page,'opening-results');
      await watchDownload(page,tape,result);
      await click(page,'woc-back');
      await click(page,'woc-leave');
      assert.equal(await phase(page),'menu');
      assert.equal(await page.locator('body').getAttribute('data-course'),'ridge');
      assert.equal(await page.locator('#choose-ridge').getAttribute('aria-pressed'),'true');
      await loadResults(page,results);
    }
    if (round===4) {
      await page.emulateMedia({reducedMotion:'reduce'});
      await click(page,'sound'); // Restore the music mix for the trophy.
    }
    await click(page,'woc-next');
  }
  const final = standings(results);
  assert.notEqual(final[0].id,5,'this drive must exercise a rival championship victory');
  assert.equal(await view(page),'trophy');
  assert.match(await page.locator('#status').textContent(),/World Overdrive Champion/);
  assert.equal(await page.locator('#woc-title').textContent(),final[0].name);
  assert((await page.locator('#woc-copy').textContent()).startsWith(final[0].points+' points'));
  const trophy = page.locator('#woc');
  await checkStandings(trophy.locator('table').first(),results);
  for (let i=0;i<4;i++) await checkEvent(trophy.locator('details table').nth(i),results.slice(0,i+1));
  assert.equal(await page.locator('#woc-trophy').evaluate(n=>getComputedStyle(n,'::after').animationName),'none');
  const engineStarts = await page.evaluate(()=>wocMetrics.engine);
  await page.waitForFunction(()=>{window.advanceFrame();return wocMetrics.music>0;},null,{polling:30});
  assert.equal(await page.evaluate(()=>wocMetrics.engine),engineStarts);
  await capture(page,'world-champion');
  await page.reload();
  await click(page,'enter-woc');
  await click(page,'woc-continue');
  assert.equal(await view(page),'trophy');
  await checkStandings(trophy.locator('table').first(),results);
  await click(page,'woc-new');
  await click(page,'woc-replace');
  await waitForSave(page,0);
  const reset = JSON.parse(await stored(page));
  assert.notEqual(reset.id,id);
  assert.deepEqual(reset.history,[]);
  await checkStandings(page.locator('#woc table'),[]);
  // On the same document, returning to a course must not accumulate GPU buffers.
  assert.equal(resources[2].buffers,resources[0].buffers);
  assert.equal(resources[3].buffers,resources[1].buffers);
  assert(resources.every(r=>r.buffers>0 && r.pcm<=8));
  const report={browser:browser.version(),revision,results,standings:final.map(({name,points})=>({name,points})),resources};
  if (process.env.EVIDENCE_DIR) await writeFile(process.env.EVIDENCE_DIR+'/championship.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
  await page.context().close();
}
try {
  await campaign();
  for (const source of ['standard','touch']) await lifecycle(source);
  await storageFaults();
  assert.deepEqual(errors,[]);
  console.log('Four flags, four replay downloads, standings, storage, menu and controller lifecycle passed.');
} finally { await browser.close(); }
