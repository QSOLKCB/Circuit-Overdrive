// SPDX-License-Identifier: Apache-2.0
// Optional development check. Serve the checkout first and point this script at
// its URL. PLAYWRIGHT_MODULE and CHROME_BIN may identify existing installations.
import assert from 'node:assert/strict';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = new URL(process.argv[2] || 'http://127.0.0.1:8000/');
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
try {
  const page = await browser.newPage({viewport: {width: 640, height: 400}});
  const failures = [];
  page.on('pageerror', e => failures.push(e.message));
  page.on('response', r => { if (r.status() >= 400) failures.push(r.status() + ' ' + r.url()); });
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === url.origin) return route.continue();
    failures.push('Off-origin request ' + route.request().url());
    return route.abort();
  });

  // Control only the browser's animation timestamps. The game uses its actual
  // input listeners, FixedClock, simulation, WebGL draws and results screen.
  await page.addInitScript(() => {
    let now = 0, next;
    window.requestAnimationFrame = callback => { next = callback; return 1; };
    window.advanceFrame = (ticks = 0) => {
      if (!next) throw Error('No game frame scheduled');
      const callback = next;
      next = null;
      now += ticks * (1000 / 60);
      callback(now);
    };
  });
  await page.goto(url.href);
  await page.evaluate(() => window.advanceFrame());
  assert.equal(await page.locator('body').getAttribute('data-phase'), 'menu');
  await page.locator('#sound').click({force: true});
  await page.locator('#start').click({force: true});
  assert.equal(await page.locator('body').getAttribute('data-phase'), 'grid');
  await page.keyboard.press('w');

  const result = await page.evaluate(async () => {
    const {createRace, startRace, stepRace} = await import('./src/sim.js');
    const {driverIntent} = await import('./tests/driver.mjs');
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
    const shadow = createRace();
    startRace(shadow);
    for (let i = 0; i < 180; i++) stepRace(shadow);
    let held = new Set(), frameTicks = 0, frames = 0;
    function flush() {
      if (frameTicks) { window.advanceFrame(frameTicks); frames++; }
      frameTicks = 0;
    }
    function key(type, code) {
      canvas.dispatchEvent(new KeyboardEvent(type, {code, key:code.at(-1).toLowerCase(), bubbles:true, cancelable:true}));
    }
    for (let tick = 0; tick < 32000 && shadow.phase === 'racing'; tick++) {
      const intent = driverIntent(shadow.current);
      const wanted = new Set();
      if (intent.throttle) wanted.add('KeyW');
      if (intent.brake) wanted.add('KeyS');
      if (intent.steer < 0) wanted.add('KeyA');
      if (intent.steer > 0) wanted.add('KeyD');
      if (held.size !== wanted.size || [...held].some(code => !wanted.has(code))) {
        flush();
        for (const code of held) if (!wanted.has(code)) key('keyup', code);
        for (const code of wanted) if (!held.has(code)) key('keydown', code);
        held = wanted;
      }
      stepRace(shadow, intent);
      if (++frameTicks === 15) flush();
      if (tick % 360 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    flush();
    for (const code of held) key('keyup', code);
    return {
      phase: phase(), countdown, renderer, frames, lap: text('lap'), time: text('timer'),
      splits: [...document.querySelectorAll('#results li strong')].map(li => li.textContent),
      expectedTicks: shadow.elapsedTicks, expectedLapTicks: shadow.lapTicks, recoveries: shadow.recoveries
    };
  });
  const time = ticks => {
    const ms = Math.round(ticks * 1000 / 60);
    return Math.floor(ms / 60000) + ':' + String(Math.floor(ms / 1000) % 60).padStart(2, '0')
      + '.' + String(ms % 1000).padStart(3, '0');
  };
  assert.deepEqual(result.countdown, ['3','2','1']);
  assert.equal(result.phase, 'finished');
  assert.equal(result.lap, '3');
  assert.equal(result.splits.length, 3);
  assert.deepEqual(result.splits, result.expectedLapTicks.map(time));
  assert.equal(result.time, time(result.expectedTicks));
  assert.equal(result.recoveries, 0);
  if (process.env.EVIDENCE_DIR) {
    await page.screenshot({path:process.env.EVIDENCE_DIR + '/finished.png'});
  }
  await page.locator('#restart').click({force: true});
  assert.equal(await page.locator('body').getAttribute('data-phase'), 'grid');
  assert.deepEqual(failures, []);
  console.log(JSON.stringify({browser:browser.version(), url:url.href, ...result}, null, 2));
} finally {
  await browser.close();
}
