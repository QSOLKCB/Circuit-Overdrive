// SPDX-License-Identifier: Apache-2.0
// Optional development check. Serve the checkout first and point this script at
// its URL. PLAYWRIGHT_MODULE and CHROME_BIN may identify existing installations.
import assert from 'node:assert/strict';
import {driverIntent} from './driver.mjs';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = new URL(process.argv[2] || 'http://127.0.0.1:8000/');
const scenic = process.argv.includes('--ridge');
const attack = process.argv.includes('--attack');
const softwareReplay = process.argv.includes('--software-replay');
const courseName = scenic ? 'Ridge' : 'Speedway';
const fullSize = {width:1280,height:720};
const replaySize = softwareReplay ? {width:640,height:360} : fullSize;
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN, args: process.env.NATIVE_GL === '1'
    ? ['--enable-gpu', '--use-angle=gl'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
let stallTimer;
try {
  const page = await browser.newPage({viewport: replaySize});
  function report(message) {
    console.error('[' + courseName + '] ' + message);
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      console.error('[' + courseName + '] No progress for 120 s after: ' + message);
      void browser.close();
    },120_000).unref();
  }
  report('Loading ' + url.href);
  await page.exposeFunction('reportReplay', report);
  async function screenshot(name) {
    report('Capturing ' + name);
    if (softwareReplay) await page.setViewportSize(fullSize);
    await page.evaluate(async () => {
      window.advanceFrame(0);
      window.finishReplayFrame();
      await window.presentReplayFrame();
    });
    await page.screenshot({path:process.env.EVIDENCE_DIR + '/' + name + '.png',timeout:60000});
    if (softwareReplay) await page.setViewportSize(replaySize);
  }
  const failures = [], loaded = new Set();
  page.on('console', msg => { if (msg.type() === 'error') failures.push(msg.text()); });
  page.on('requestfailed', r => failures.push(r.url() + ' ' + r.failure()?.errorText));
  page.on('response', r => loaded.add(new URL(r.url()).pathname));
  page.on('pageerror', e => failures.push(e.message));
  page.on('response', r => { if (r.status() >= 400) failures.push(r.status() + ' ' + r.url()); });
  await page.route('**/*', route => {
    if (route.request().url().startsWith(url.href)) return route.continue();
    failures.push('Off-origin request ' + route.request().url());
    return route.abort();
  });

  // Control only the browser's animation timestamps. The game uses its actual
  // input listeners, FixedClock, simulation, WebGL draws and results screen.
  await page.addInitScript(() => {
    let now = 0, next;
    const nativeFrame = window.requestAnimationFrame.bind(window);
    window.presentReplayFrame = () => new Promise(resolve => nativeFrame(() => nativeFrame(resolve)));
    const pixel = new Uint8Array(4);
    window.finishReplayFrame = () => {
      // A synchronous readback bounds queued SwiftShader work before capture.
      const gl = document.getElementById('world').getContext('webgl');
      gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
    };
    window.requestAnimationFrame = callback => { next = callback; return 1; };
    window.advanceFrame = (ticks = 0) => {
      if (!next) throw Error('No game frame scheduled');
      const callback = next;
      next = null;
      now += ticks * (1000 / 60);
      callback(now);
    };
  });
  // Inject the local test driver from the runner. Published games contain only runtime files.
  await page.addInitScript({content:'window.driveKeyboard = (' + driverIntent.toString() + ');'});
  if (process.env.EVIDENCE_DIR && scenic) {
    await page.exposeFunction('captureSection', name => screenshot('ridge-' + name));
  }
  const entry = await page.goto(url.href);
  assert.equal(entry.status(),200);
  assert.match(await entry.headerValue('content-type'),/text\/html/);
  await page.evaluate(() => window.advanceFrame());
  assert.equal(await page.locator('body').getAttribute('data-phase'), 'menu');
  if (scenic) await page.locator('#choose-ridge').click({force:true});
  assert.equal(await page.locator('body').getAttribute('data-course'),scenic ? 'ridge' : 'speedway');
  await page.locator('#sound').click({force: true});
  await page.locator('#start').click({force: true});
  assert.equal(await page.locator('body').getAttribute('data-phase'), 'grid');
  await page.keyboard.press('w');

  const result = await page.evaluate(async ({cruise, scenic, softwareReplay}) => {
    const {createRace, startRace, stepRace} = await import('./src/sim.js');
    const course = scenic ? (await import('./src/ridge.js')).ridge : (await import('./src/track.js')).track;
    const phase = () => document.body.dataset.phase;
    const text = id => document.getElementById(id).textContent;
    const canvas = document.querySelector('#world');
    if (document.activeElement !== canvas || phase() !== 'countdown') throw Error('Grid did not arm');
    const gl = canvas.getContext('webgl');
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    window.advanceFrame();
    const countdown = [];
    for (let n = 0; n < 3; n++) {
      countdown.push(text('lights'));
      for (let f = 0; f < 4; f++) window.advanceFrame(15);
    }
    if (phase() !== 'racing') throw Error('Countdown failed to release the car');

    // A separate car generates digital commands in the same JS runtime. The
    // playable race receives only DOM key transitions. No live state is accessed.
    const shadow = createRace(undefined,course);
    startRace(shadow);
    for (let i = 0; i < 180; i++) stepRace(shadow);
    let held = new Set(), frameTicks = 0, frames = 0;
    const places = new Set([shadow.player.position]);
    function flush() {
      if (frameTicks) {
        window.advanceFrame(frameTicks);
        if (softwareReplay && pending.length) throw Error('Replay clock left queued commands');
        frames++;
        if (softwareReplay && frames % 12 === 0) window.finishReplayFrame();
        if (Number(text('position')) !== shadow.player.position) throw Error('HUD position disagrees with the field');
      }
      frameTicks = 0;
    }
    function key(type, code) {
      canvas.dispatchEvent(new KeyboardEvent(type, {code, key:code.at(-1).toLowerCase(), bubbles:true, cancelable:true}));
    }
    // Exercise the high chase through both tunnel portals during the sprint.
    const cameraChanges = scenic ? [2900,3300] : [];
    const captures = [[-12,'start'],[460,'open'],[1000,'forest'],[1900,'bridge'],[3140,'tunnel']];
    function applyKeys(intent, beforeChange) {
      const wanted = new Set();
      if (intent.throttle) wanted.add('KeyW');
      if (intent.brake) wanted.add('KeyS');
      if (intent.steer < 0) wanted.add('KeyA');
      if (intent.steer > 0) wanted.add('KeyD');
      if (held.size === wanted.size && [...held].every(code => wanted.has(code))) return;
      beforeChange?.();
      for (const code of held) if (!wanted.has(code)) key('keyup',code);
      for (const code of wanted) if (!held.has(code)) key('keydown',code);
      held = wanted;
    }
    // A software GPU can take longer to present a frame than to run fifteen
    // physics ticks. Queue the exact same key transitions for those ticks.
    // The real FixedClock still calls the game's original update once per tick.
    const {FixedClock} = await import('./vendor/vanillajs/modules/time/index.js');
    const originalAdvance = FixedClock.prototype.advance;
    const pending = [];
    if (softwareReplay) {
      FixedClock.prototype.advance = function(elapsed, update) {
        return originalAdvance.call(this, elapsed, (...args) => {
          if (!pending.length) throw Error('Unexpected simulation tick in keyboard replay');
          applyKeys(pending.shift());
          update(...args);
        });
      };
    }
    for (let tick = 0; tick < 32000 && shadow.phase === 'racing'; tick++) {
      if (cameraChanges.length && shadow.player.current.s >= cameraChanges[0]) {
        flush();
        key('keydown','KeyC');
        key('keyup','KeyC');
        cameraChanges.shift();
      }
      if (window.captureSection && captures.length && shadow.player.current.s >= captures[0][0]) {
        flush();
        await window.captureSection(captures.shift()[1]);
      }
      const intent = window.driveKeyboard(shadow.player.current, cruise, 0, course);
      if (softwareReplay) pending.push(intent);
      else applyKeys(intent,flush);
      stepRace(shadow, intent);
      places.add(shadow.player.position);
      if (++frameTicks === 15) flush();
      if (tick % 600 === 0) {
        await window.reportReplay('Race ' + text('timer') + ', ' + (scenic ? 'checkpoint ' : 'lap ') +
          text('lap') + ', P' + text('position') + '/6, ' + frames + ' frames');
      }
      if (tick % 360 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    flush();
    if (softwareReplay) FixedClock.prototype.advance = originalAdvance;
    for (const code of held) key('keyup', code);
    return {
      phase: phase(), countdown, renderer, frames, places:[...places], lap: text('lap'), time: text('timer'),
      splits: [...document.querySelectorAll('#splits li strong')].map(li => li.textContent),
      classification: [...document.querySelectorAll('#classification li')].map(item => ({
        id:Number(item.dataset.id), driver:item.querySelector('span').textContent, time:item.querySelector('strong').textContent
      })),
      expected: shadow.order.map(e => ({id:e.id,name:e.name,number:e.number,ticks:e.finishTicks,recoveries:e.recoveries})),
      remaining:text('remaining'), expectedSplits: scenic ? shadow.player.splitTicks : shadow.player.lapTicks,
      expectedSplitCount:scenic ? course.gates.length-2 : 3, expectedTicks: shadow.player.elapsedTicks, recoveries: shadow.player.recoveries
    };
  }, {cruise:attack ? (scenic ? 42 : 38) : 30,scenic,softwareReplay});
  const time = ticks => {
    const ms = Math.round(ticks * 1000 / 60);
    return Math.floor(ms / 60000) + ':' + String(Math.floor(ms / 1000) % 60).padStart(2, '0')
      + '.' + String(ms % 1000).padStart(3, '0');
  };
  assert.deepEqual(result.countdown, ['3','2','1']);
  assert.equal(result.phase, 'finished');
  assert.equal(result.lap, String(result.expectedSplitCount));
  if (scenic) assert.equal(result.remaining,'0 m');
  assert.equal(result.splits.length, result.expectedSplitCount);
  assert.deepEqual(result.splits, result.expectedSplits.map(time));
  assert.equal(result.time, time(result.expectedTicks));
  assert.equal(result.recoveries, 0);
  assert.equal(result.classification.length, 6);
  for (const [i, expected] of result.expected.entries()) {
    const official = expected.ticks === null ? 'Racing at flag' : time(expected.ticks);
    const penalty = expected.recoveries ? ' (+' + expected.recoveries*3 + 's)' : '';
    assert.deepEqual(result.classification[i], {
      id:expected.id, driver:(i+1) + '.  ' + expected.name + '  #' + expected.number, time:official + penalty
    });
  }
  if (attack) {
    assert.equal(result.expected[0].name,'Player');
    assert.equal(result.places.length,6,'player should pass every position on the track');
    assert(result.expected.some(e => e.ticks === null),'unfinished drivers must have truthful results');
  } else {
    assert(result.expected.every(e => e.ticks !== null),'all six should finish with this keyboard replay');
  }
  report('Race complete, checked six classifications and ' + result.splits.length + ' splits at ' + result.time);
  if (process.env.EVIDENCE_DIR) {
    await screenshot(scenic ? (attack ? 'ridge-win' : 'ridge-finished') : attack ? 'win' : 'finished');
  }
  await page.locator('#restart').click({force: true});
  assert.equal(await page.locator('body').getAttribute('data-phase'), 'grid');
  assert.equal(await page.locator('body').getAttribute('data-course'),scenic ? 'ridge' : 'speedway');
  await page.keyboard.press('Escape');
  await page.locator(scenic ? '#choose-speedway' : '#choose-ridge').click({force:true});
  assert.equal(await page.locator('body').getAttribute('data-course'),scenic ? 'speedway' : 'ridge');
  assert(loaded.has(new URL('./tracks/redline-ridge.json',url).pathname));
  assert.deepEqual(failures, []);
  console.log(JSON.stringify({browser:browser.version(), url:url.href, ...result}, null, 2));
} finally {
  clearTimeout(stallTimer);
  await browser.close();
}
