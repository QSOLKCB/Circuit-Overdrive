// SPDX-License-Identifier: Apache-2.0
// Real requestAnimationFrame intervals through the standing start. No synthetic clock.
import assert from 'node:assert/strict';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({executablePath:process.env.CHROME_BIN,
  args:['--enable-gpu','--use-angle=gl']});
try {
  const page = await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  await page.goto(process.argv[2] || 'http://127.0.0.1:8000/');
  await page.locator('#start').waitFor();
  const chromeHeight = await page.locator('#world').evaluate(canvas => innerHeight-canvas.clientHeight);
  await page.setViewportSize({width:1920,height:1080+chromeHeight});
  await page.locator('#start').click();
  await page.keyboard.down('w');
  await page.waitForFunction(() => document.body.dataset.phase === 'racing');
  const sample = await page.evaluate(() => new Promise(resolve => {
    const canvas=document.querySelector('#world'), gl=canvas.getContext('webgl');
    const debug=gl.getExtension('WEBGL_debug_renderer_info');
    const renderer=debug && gl.getParameter(debug.UNMASKED_RENDERER_WEBGL);
    const deltas=[];
    let last;
    function sampleFrame(now) {
      if (last !== undefined) deltas.push(now-last);
      last=now;
      if (deltas.length<360) return requestAnimationFrame(sampleFrame);
      const seconds=deltas.reduce((a,b)=>a+b)/1000;
      deltas.sort((a,b)=>a-b);
      resolve({renderer,width:gl.drawingBufferWidth,height:gl.drawingBufferHeight,
        samples:deltas.length,seconds,meanFps:deltas.length/seconds,
        medianMs:deltas[179],p95Ms:deltas[341],maxMs:deltas.at(-1)});
    }
    requestAnimationFrame(sampleFrame);
  }));
  assert.equal(sample.width,1920);
  assert.equal(sample.height,1080);
  assert.equal(await page.locator('body').getAttribute('data-phase'),'racing');
  console.log(JSON.stringify({browser:browser.version(),...sample},null,2));
} finally { await browser.close(); }
