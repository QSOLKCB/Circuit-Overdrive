// SPDX-License-Identifier: Apache-2.0
// Host the static package first. Chromium delivers actual multi-pointer browser
// events from CDP; the Android-sized viewport is desktop emulation.
import assert from 'node:assert/strict';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = new URL(process.argv[2] || 'http://127.0.0.1:8000/').href;
const native = process.env.NATIVE_GL === '1';
const browser = await chromium.launch({executablePath:process.env.CHROME_BIN,
  args:native ? ['--enable-gpu','--use-angle=gl'] : ['--use-angle=swiftshader','--enable-unsafe-swiftshader']});

try {
  const landscape = {width:844,height:390}, portrait = {width:390,height:844};
  const context = await browser.newContext({viewport:landscape,hasTouch:true,isMobile:true,deviceScaleFactor:2});
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const errors = [];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('requestfailed',r=>errors.push(r.url()+' '+r.failure()?.errorText));
  page.on('request',r=>{if (!r.url().startsWith(url)) errors.push(r.url());});
  page.on('response',r=>{if (r.status() >= 400) errors.push(r.status()+' '+r.url());});
  await page.addInitScript(()=>{
    window.touchCounts = {down:0,cancel:0,lost:0,secondary:0};
    for(const [event,key] of [['pointerdown','down'],['pointercancel','cancel'],['lostpointercapture','lost']]) {
      window.addEventListener(event,e=>{
        if (e.isTrusted && e.pointerType==='touch' && e.target.closest?.('#touch-controls')) {
          window.touchCounts[key]++;
          if (key==='down' && !e.isPrimary) window.touchCounts.secondary++;
        }
      },true);
    }
  });
  const phase = name => page.waitForFunction(v=>document.body.dataset.phase===v,name);
  const tap = selector => page.locator(selector).tap();
  const selector = name => '[data-touch="'+name+'"]';
  const down = async (id,name)=>{
    const rect=await page.locator(selector(name)).boundingBox();
    assert(rect && rect.width >= 44 && rect.height >= 44,'reachable 44 px control '+name);
    return {id,x:rect.x+rect.width/2,y:rect.y+rect.height/2,radiusX:5,radiusY:5,force:.75};
  };
  const send = (type,touchPoints=[])=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints});
  const held = async (...names) => {
    await page.waitForFunction(wanted=>[...document.querySelectorAll('[data-touch].held')]
      .map(el=>el.dataset.touch).sort().join()===wanted.join(),names.sort(),{timeout:4000});
  };
  const safeLayout = () => page.evaluate(()=>{
    const instruments=['.timing','.course','.dash'];
    const controls=Array.from(document.querySelectorAll('[data-touch]'));
    const rects=[...instruments.map(s=>document.querySelector(s)),...controls].map(el=>el.getBoundingClientRect());
    const clipped=rects.some(r=>r.width<1 || r.left<0 || r.right>innerWidth || r.top<0 || r.bottom>innerHeight);
    const overlap=rects.some((r,i)=>rects.slice(i+1).some(s=>r.left<s.right && r.right>s.left && r.top<s.bottom && r.bottom>s.top));
    const hittable=controls.every(el=>{
      const r=el.getBoundingClientRect();
      return r.width>=44 && r.height>=44 && document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el;
    });
    if (clipped || overlap || !hittable) {
      return rects.map((r,i)=>[instruments[i]||controls[i-instruments.length].dataset.touch, r.x,r.y,r.width,r.height]).map(row=>row.join(' ')).join(' | ');
    }
    return 'clear';
  });
  await page.goto(url);
  await phase('menu');
  await tap('#choose-ridge');
  await tap('#start');
  await phase('grid');
  await tap('#touch-arm');
  await phase('racing');
  assert.equal(await page.getAttribute('body','data-input'),'touch');
  assert.equal(await safeLayout(),'clear','landscape controls and instruments');
  let gas=await down(1,'throttle'), right=await down(2,'right');
  await send('touchStart',[gas,right]);
  await held('right','throttle');
  await page.waitForFunction(()=>Number(document.querySelector('#speed').textContent)>12);
  // Chromium derives per-ID releases when that contact disappears. Moving a
  // still-captured finger outside releases only its original control.
  await send('touchMove',[gas,{...right,y:right.y-100}]);
  await held('throttle');
  await send('touchEnd');
  await held();
  const brake=await down(1,'brake'), left=await down(2,'left');
  await send('touchStart',[brake,left]);
  await held('brake','left');
  await send('touchCancel');
  await phase('paused');
  await held();
  await tap('#continue'); await phase('racing');
  await tap(selector('recover'));
  await page.waitForFunction(()=>document.querySelector('#feedback').textContent.includes('Recovered'));
  await page.waitForTimeout(400);
  assert(Number(await page.textContent('#speed'))<3,'explicit resume and recovery left pedals neutral');

  gas=await down(1,'throttle');
  await send('touchStart',[gas]);
  await held('throttle');
  await send('touchStart',[gas,await down(2,'pause')]); // secondary thumb must pause
  await phase('paused'); await held(); await send('touchEnd');
  await tap('#continue'); await phase('racing');
  await send('touchStart',[gas]);
  await page.setViewportSize(portrait);
  await phase('paused'); await held(); await send('touchEnd');
  await tap('#continue'); await phase('racing');
  assert.equal(await safeLayout(),'clear','portrait controls and instruments');
  await tap(selector('camera'));
  if (process.env.EVIDENCE_DIR) await page.screenshot({path:process.env.EVIDENCE_DIR+'/touch-portrait.png'});
  await tap('#settings'); await phase('paused');
  assert(await page.locator('#options').isVisible());
  await tap('#close-settings'); await phase('paused');
  await tap('#continue'); await phase('racing');
  await send('touchStart',[await down(1,'throttle')]);
  await held('throttle');
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await phase('paused'); await held(); await send('touchEnd');
  await tap('#restart'); await phase('grid');
  await tap('#touch-arm'); await phase('countdown'); await held();
  await page.setViewportSize(landscape);
  await phase('paused');
  await tap('#continue'); await phase('racing');
  if (process.env.EVIDENCE_DIR) await page.screenshot({path:process.env.EVIDENCE_DIR+'/touch-landscape.png'});
  const report=await page.evaluate(()=>{
    const gl=document.querySelector('#world').getContext('webgl');
    const gpu=gl.getExtension('WEBGL_debug_renderer_info');
    return {events:window.touchCounts, renderer:gpu ? gl.getParameter(gpu.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      backing:[gl.drawingBufferWidth,gl.drawingBufferHeight],effects:document.body.dataset.effects};
  });
  assert(report.events.down>=8 && report.events.secondary>=3 && report.events.cancel>=1);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({url,browser:browser.version(),landscape,portrait,device:'desktop Chromium touch emulation',...report},null,2));
} finally { await browser.close(); }
