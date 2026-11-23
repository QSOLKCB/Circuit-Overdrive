// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import {driverIntent} from './driver.mjs';
import {installReplayController,selectReplayController,armReplayController} from './browser-controller-driver.mjs';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = new URL(process.argv[2]);
const browser = await chromium.launch({executablePath:process.env.CHROME_BIN,
  args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors = [];
async function openPage(source = 'keyboard') {
  const page = await browser.newPage({viewport:{width:640,height:400},hasTouch:source==='touch'});
  page.on('pageerror',e => errors.push(e.message));
  await page.route('**/*',route => {
    if (route.request().url().startsWith(url.href)) return route.continue();
    errors.push('Unexpected request '+route.request().url());
    return route.abort();
  });
  await installReplayController(page,source);
  await page.addInitScript(() => {
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
  await page.close();
}

try {
  const page = await openPage();
  await click(page,'sound');
  await click(page,'choose-ridge');
  await page.locator('#enter-woc').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  assert.equal(await view(page),'briefing');
  assert.match(await page.locator('#status').textContent(),/Round 1.*Event briefing.*Overdrive Opening Cup/);
  const before = await page.locator('#timer').textContent();
  await frame(page,15);
  assert.equal(await page.locator('#timer').textContent(),before);
  await page.keyboard.press('Enter');
  await page.keyboard.press('w');
  await frame(page);
  await frame(page,15);
  await page.keyboard.press('Escape');
  await click(page,'restart');
  await page.keyboard.press('Escape');
  assert.equal(await view(page),'briefing');
  await click(page,'woc-grid');
  await page.keyboard.press('w');
  const result = await drive(page,'speedway',701,33);
  assert.equal(await view(page),'results');
  assert.match(await page.locator('#status').textContent(),/Round 1.*Chequered flag.*Overdrive Opening Cup/);
  assert.deepEqual(await page.locator('#woc tbody tr').evaluateAll(rows=>rows.map(r=>Number(r.dataset.driver))),
    result.classification.map(d=>d.id));
  await click(page,'woc-next');
  assert.equal(await view(page),'briefing');
  assert.match(await page.locator('#woc-label').textContent(),/Round 2/);
  assert.match(await page.locator('#status').textContent(),/Round 2.*Event briefing.*Redline Mountain Challenge/);
  await click(page,'woc-back');
  await click(page,'woc-leave');
  assert.equal(await phase(page),'menu');
  assert.equal(await page.locator('body').getAttribute('data-course'),'ridge');
  assert.equal(await page.locator('#choose-ridge').getAttribute('aria-pressed'),'true');
  await page.close();
  for (const source of ['standard','touch']) await lifecycle(source);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({browser:browser.version(),opening:result,input:['keyboard','synthetic standard gamepad','Chromium touch']}));
} finally { await browser.close(); }
