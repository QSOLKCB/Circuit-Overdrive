// SPDX-License-Identifier: Apache-2.0
// Host the static package first. Chromium delivers actual multi-pointer browser
// events from CDP; the Android-sized viewport is desktop emulation.
import assert from 'node:assert/strict';
import {installReplayController} from './browser-controller-driver.mjs';

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
  const insets = {landscape:{left:32,right:18,top:0,bottom:14},portrait:{left:0,right:0,top:38,bottom:22}};
  await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:insets.landscape});
  await installReplayController(page,'standard');
  const errors = [];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('requestfailed',r=>errors.push(r.url()+' '+r.failure()?.errorText));
  page.on('request',r=>{if (!r.url().startsWith(url)) errors.push(r.url());});
  page.on('response',r=>{if (r.status() >= 400) errors.push(r.status()+' '+r.url());});
  await page.addInitScript(()=>{
    window.audioReport = {contexts:0, gesture:false, blocks:0};
    window.AudioContext = class extends AudioContext {
      constructor(...args) {
        super(...args);
        window.audioReport.contexts++;
        window.audioReport.gesture = navigator.userActivation.isActive;
      }
    };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function(...args) {
      if (this.buffer?.getChannelData(0).some(sample => sample !== 0)) window.audioReport.blocks++;
      return start.apply(this,args);
    };
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
  const safeLayout = limits => page.evaluate(limits=>{
    const instruments=['.timing','.course','.dash'];
    const controls=Array.from(document.querySelectorAll('[data-touch]'));
    const rects=[...instruments.map(s=>document.querySelector(s)),...controls].map(el=>el.getBoundingClientRect());
    const clipped=rects.some(r=>r.width<1 || r.left<limits.left || r.right>innerWidth-limits.right ||
      r.top<limits.top || r.bottom>innerHeight-limits.bottom);
    const overlap=rects.some((r,i)=>rects.slice(i+1).some(s=>r.left<s.right && r.right>s.left && r.top<s.bottom && r.bottom>s.top));
    const hittable=controls.every(el=>{
      const r=el.getBoundingClientRect();
      return r.width>=44 && r.height>=44 && document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el;
    });
    if (clipped || overlap || !hittable) {
      return rects.map((r,i)=>[instruments[i]||controls[i-instruments.length].dataset.touch, r.x,r.y,r.width,r.height]).map(row=>row.join(' ')).join(' | ');
    }
    return 'clear';
  },limits);
  await page.goto(url);
  await phase('menu');
  await tap('#choose-ridge');
  await tap('#start');
  await phase('grid');
  assert.equal(await page.evaluate(()=>audioReport.contexts),0,'touch grid waits for an audio gesture');
  await tap('#touch-arm');
  await phase('racing');
  assert.equal(await page.getAttribute('body','data-input'),'touch');
  assert.equal(await safeLayout(insets.landscape),'clear','landscape controls, instruments and cutout clearance');
  await page.waitForFunction(()=>audioReport.gesture && audioReport.blocks>0);
  let gas=await down(1,'throttle'), right=await down(2,'right');
  await send('touchStart',[gas,right]);
  await held('right','throttle');
  await page.waitForFunction(()=>Number(document.querySelector('#speed').textContent)>12);
  // Lift the first finger while the second continues to steer. A new press
  // can reapply throttle. Dragging out of steering leaves that pedal held.
  await send('touchEnd',[gas]);
  await held('right');
  gas=await down(3,'throttle');
  await send('touchStart',[gas]);
  await held('right','throttle');
  await send('touchMove',[{...right,y:right.y-100}]);
  await held('throttle');
  await send('touchEnd');
  await held();
  const brake=await down(1,'brake'), left=await down(2,'left');
  await send('touchStart',[brake,left]);
  await held('brake','left');
  await send('touchEnd',[left]);
  await held('brake');
  await send('touchCancel');
  await phase('paused');
  await held();
  const stoppedBlocks = await page.evaluate(()=>audioReport.blocks);
  await page.waitForTimeout(160);
  assert.equal(await page.evaluate(()=>audioReport.blocks),stoppedBlocks,'paused touch audio stopped scheduling');
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
  await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:insets.portrait});
  await tap('#continue'); await phase('racing');
  assert.equal(await safeLayout(insets.portrait),'clear','portrait controls, instruments and cutout clearance');
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
  await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:insets.landscape});
  await tap('#continue'); await phase('racing');
  if (process.env.EVIDENCE_DIR) await page.screenshot({path:process.env.EVIDENCE_DIR+'/touch-landscape.png'});
  const report=await page.evaluate(()=>{
    const gl=document.querySelector('#world').getContext('webgl');
    const gpu=gl.getExtension('WEBGL_debug_renderer_info');
    const rect=gl.canvas.getBoundingClientRect();
    return {audio:window.audioReport, renderer:gpu ? gl.getParameter(gpu.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      backing:[gl.drawingBufferWidth,gl.drawingBufferHeight], expectedBacking:[Math.floor(rect.width*.75),Math.floor(rect.height*.75)],
      effects:document.body.dataset.effects};
  });
  assert.equal(report.effects,'reduced');
  assert.deepEqual(report.backing,report.expectedBacking,'coarse pointer selects the 75% mobile buffer');
  assert.equal(report.audio.contexts,1,'touch interruptions reuse the gesture-owned audio context');
  // Keep the old trigger held across source selection and resume.
  const useSource = async value => {
    await tap('#controllers'); await phase('paused');
    await page.selectOption('#driver-device',value);
    await tap('#use-device');
    assert.equal(await page.getAttribute('body','data-input'),value==='touch'?'touch':'gamepad');
    await tap('#continue'); await phase('racing');
  };
  await useSource('pad-1');
  // Resume clears the pad latch. Let the newly running simulation sample its
  // released controls before the next press reaches a fixed tick.
  const resumedAt = await page.textContent('#timer');
  await page.waitForFunction(time=>document.querySelector('#timer').textContent!==time,resumedAt);
  await page.evaluate(()=>writePadControls({steer:.25,throttle:1,brake:0}));
  await page.waitForFunction(()=>Number(document.querySelector('#speed').textContent)>12);
  await useSource('touch');
  await tap(selector('recover'));
  await page.waitForFunction(()=>document.querySelector('#feedback').textContent.includes('Recovered'));
  await page.waitForTimeout(400);
  assert(Number(await page.textContent('#speed'))<3,'held pad trigger must have no authority after handoff');
  await send('touchStart',[await down(1,'throttle')]);
  await page.waitForFunction(()=>Number(document.querySelector('#speed').textContent)>8);
  report.events = await page.evaluate(()=>window.touchCounts);
  // A real same-origin navigation generates a trusted pagehide/visibilitychange.
  // Keep the pedal pressed during navigation and observe the old document after
  // its own interruption handlers. A browser can either restore or reload it.
  await page.evaluate(()=>{
    document.addEventListener('visibilitychange',event=>{
      if (document.hidden) sessionStorage.setItem('touch-interruption',JSON.stringify({
        trusted:event.isTrusted, phase:document.body.dataset.phase, held:document.querySelectorAll('[data-touch].held').length
      }));
    });
  });
  await page.goto(new URL('./src/mobile.css',url).href);
  report.background = await page.evaluate(()=>JSON.parse(sessionStorage.getItem('touch-interruption')));
  assert.deepEqual(report.background,{trusted:true,phase:'paused',held:0},'backgrounding clears active touch input and pauses');
  await page.goBack();
  await page.waitForFunction(()=>document.body.dataset.phase==='paused' || (
    document.body.dataset.phase==='menu' && document.querySelector('#status').textContent==='Race selection'));
  report.returnPhase = await page.getAttribute('body','data-phase');
  report.handoff = ['synthetic standard gamepad','touch'];
  await held();
  assert(report.events.down>=8 && report.events.secondary>=3 && report.events.cancel>=1);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({url,browser:browser.version(),landscape,portrait,insets,device:'desktop Chromium touch emulation',...report},null,2));
} finally { await browser.close(); }
