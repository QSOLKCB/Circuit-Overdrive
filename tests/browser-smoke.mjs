// SPDX-License-Identifier: Apache-2.0
// Optional development tool. Set PLAYWRIGHT_MODULE to an installed Playwright ES entry.
import assert from 'node:assert/strict';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({
  executablePath:process.env.CHROME_BIN || undefined,
  args:['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const url = process.argv[2] || 'http://127.0.0.1:8000/';
const scenic = process.argv.includes('--ridge');
try {
  const context = await browser.newContext({viewport:{width:1280,height:720}});
  const page = await context.newPage();
  const failures = [], urls = [];
  page.on('pageerror', e => failures.push(String(e)));
  page.on('request', r => urls.push(r.url()));
  page.on('response', r => {if(r.status() >= 400) failures.push(r.url()+' '+r.status());});
  // Count real scheduled PCM buffers while leaving the audio device path intact.
  await page.addInitScript(() => {
    window.engineBuffers = 0;
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function(...args) {
      if (this.buffer?.getChannelData(0).some(sample => sample !== 0)) window.engineBuffers++;
      return start.apply(this, args);
    };
  });
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('#status').textContent === 'Race selection');
  if (scenic) await page.locator('#choose-ridge').click();
  const imageName = name => process.env.EVIDENCE_DIR + '/' + (scenic ? 'ridge-' : '') + name + '.png';
  if (process.env.EVIDENCE_DIR) await page.screenshot({path:imageName('menu')});
  const waitPhase = phase => page.waitForFunction(p => document.body.dataset.phase === p, phase);
  const id = name => page.locator('#'+name);
  await id('controls').click();
  assert(await id('help').isVisible());
  await page.keyboard.press('Escape');
  await id('sound').click();
  assert.equal(await id('sound').getAttribute('aria-pressed'), 'false');
  await id('start').click();
  await waitPhase('grid');
  assert(await id('world').evaluate(el => el === document.activeElement));
  await page.keyboard.down('ArrowUp');
  await waitPhase('countdown');
  await page.keyboard.press('Escape');
  await waitPhase('paused');
  await page.keyboard.up('ArrowUp');
  await id('sound').click();
  await id('continue').click();
  await waitPhase('countdown');
  await waitPhase('racing');
  await page.keyboard.down('w');
  await page.waitForFunction(() => Number(document.querySelector('#speed').textContent) >= 24);
  if (process.env.EVIDENCE_DIR) await page.screenshot({path:imageName('racing')});
  // Blur while held, then release in a different tab. A stale repeat cannot re-arm throttle.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await waitPhase('paused');
  const away = await page.context().newPage();
  await away.bringToFront();
  await away.keyboard.up('w');
  await away.close();
  await page.bringToFront();
  await id('continue').click();
  await waitPhase('racing');
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW',repeat:true})));
  await page.keyboard.press('r');
  await page.waitForFunction(() => document.querySelector('#feedback').textContent.includes('Recovered'));
  await page.waitForTimeout(550);
  assert(Number(await id('speed').textContent()) < 3, 'stale throttle after recovery');
  await page.keyboard.up('w'); // Synchronize the automation driver's per-page held-key state.
  await page.keyboard.press('c');
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(() => Number(document.querySelector('#speed').textContent) > 10);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.press('Escape');
  await id('restart').click();
  await waitPhase('grid');
  await page.keyboard.press('w');
  await waitPhase('countdown');
  await page.waitForFunction(() => document.querySelector('#timer').textContent === '0:00.000');
  assert.equal(await id('lap').textContent(), scenic ? '0' : '1');
  assert.equal(await page.locator('body').getAttribute('data-course'), scenic ? 'ridge' : 'speedway');
  const details = await page.evaluate(() => {
    const gl = document.querySelector('#world').getContext('webgl');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {renderer:ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),browser:navigator.userAgent};
  });
  assert(await page.evaluate(() => window.engineBuffers > 0), 'producer scheduled original non-silent engine PCM');
  await page.evaluate(() => {
    window.graphicsTest = document.querySelector('#world').getContext('webgl').getExtension('WEBGL_lose_context');
    window.graphicsTest.loseContext();
  });
  await waitPhase('error');
  await page.evaluate(() => window.graphicsTest.restoreContext());
  await waitPhase('paused');
  await id('continue').click();
  await waitPhase('countdown');
  assert.deepEqual(failures, []);
  assert(urls.every(s => s.startsWith(url) || s.startsWith('data:')));
  console.log(JSON.stringify({url,...details,requests:urls.length,failures},null,2));
  const unsupported = await browser.newPage();
  await unsupported.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type,...args) {
      return type.includes('webgl') ? null : original.call(this,type,...args);
    };
  });
  await unsupported.goto(url);
  await unsupported.waitForSelector('body[data-phase="error"] #panel-copy');
  assert((await unsupported.locator('#panel-copy').textContent()).includes('WebGL'));
  console.log('WebGL-unavailable fallback passed.');
  await unsupported.close();

  // Refused audio device creation must leave the player in control.
  const silent = await context.newPage();
  await silent.addInitScript(() => {
    window.AudioContext = class { constructor() { throw Error('Audio device unavailable'); } };
  });
  await silent.goto(url);
  await silent.locator('#start').click();
  await silent.keyboard.down('w');
  await silent.waitForFunction(() => document.body.dataset.phase === 'racing'
    && Number(document.querySelector('#speed').textContent) > 8);
  assert.equal(await silent.locator('#sound').getAttribute('aria-pressed'), 'false');
  console.log('Audio-device failure and held grid-start accelerator passed.');
} finally { await browser.close(); }
