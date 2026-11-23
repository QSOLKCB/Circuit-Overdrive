// SPDX-License-Identifier: Apache-2.0
// Measure native animation intervals while the real game receives keyboard input.
import assert from 'node:assert/strict';
import {driverIntent} from './driver.mjs';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = new URL(process.argv[2] || 'http://127.0.0.1:8000/');
const scenic = process.argv.includes('--ridge');
const championship = process.argv.includes('--championship');
assert(!(championship && scenic),'The championship measurement uses the Opening Cup');
const browser = await chromium.launch({executablePath:process.env.CHROME_BIN,
  args:['--enable-gpu','--use-angle=gl']});
try {
  const page = await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror', error => errors.push(error.message));
  // The runner reads accepted poses to drive the keyboard and identify stations.
  // No benchmark hooks are shipped. The renderer and fixed clock run normally.
  await page.route(new URL('src/main.js',url).href,async route => {
    const response=await route.fetch();
    await route.fulfill({response,body:await response.text()+'\nwindow.observeRace=()=>race;'});
  });
  // Use the rendered, interpolated car centres and actual camera frustum to
  // select six-car opening intervals. This observation exists only in the runner.
  await page.route(new URL('src/scene.js',url).href,async route => {
    const response=await route.fetch();
    const source=await response.text(), begin='lastMode=mode;';
    assert.ok(source.includes(begin),'camera observation point');
    await route.fulfill({response,body:source.replace(begin,
      begin+' window.frameCamera=view; window.frameCars=poses;')});
  });
  await page.addInitScript({content:'window.driveKeyboard = (' + driverIntent.toString() + ');'});
  await page.goto(url.href);
  await page.locator('#start').waitFor();
  const chromeHeight = await page.locator('#world').evaluate(canvas => innerHeight-canvas.clientHeight);
  await page.setViewportSize({width:1920,height:1080+chromeHeight});
  if (scenic) await page.locator('#choose-ridge').click();
  if (championship) {
    await page.locator('#enter-woc').click();
    await page.locator('#woc-new').click();
    await page.locator('#woc-grid').click();
  } else await page.locator('#start').click();
  await page.keyboard.press('w');
  await page.waitForFunction(() => document.body.dataset.phase === 'racing');
  const sample = await page.evaluate(async scenic => {
    const canvas=document.querySelector('#world'), gl=canvas.getContext('webgl');
    const debug=gl.getExtension('WEBGL_debug_renderer_info');
    const renderer=debug && gl.getParameter(debug.UNMASKED_RENDERER_WEBGL);
    const race=window.observeRace(), course=race.course;
    const sections=scenic ? [
      ['six-car start',-60,5],['open descent',400,565],['forest',860,1180],
      ['bridge',...course.features.bridge],['tunnel',...course.features.tunnel]
    ] : [['speedway six-car grid',-60,0],['six-car close racing',0,72],['speedway banked turn',180,263]];
    const intervals=sections.map(()=>[]);
    const simulationTicks=sections.map(()=>0), maxTicksPerFrame=sections.map(()=>0);
    let last, lastTick, previousSection, held=new Set();
    function allInView() {
      const {eye,target,fov,roll}=window.frameCamera;
      const dx=target[0]-eye[0],dy=target[1]-eye[1],dz=target[2]-eye[2];
      const horizontal=Math.hypot(dx,dz), length=Math.hypot(horizontal,dy);
      const rightX=-dz/horizontal, rightZ=dx/horizontal;
      const slope=Math.tan(fov/2), aspect=canvas.width/canvas.height;
      return window.frameCars.every(p=>{
        const x=p.x-eye[0], y=p.y-eye[1], z=p.z-eye[2];
        const depth=(x*dx+y*dy+z*dz)/length;
        const altitude=(horizontal*y-(x*dx+z*dz)*dy/horizontal)/length;
        const lateral=x*rightX+z*rightZ,c=Math.cos(roll),s=Math.sin(roll);
        return !p.finished && depth>.13 && Math.abs(lateral*c+altitude*s)<depth*slope*aspect &&
          Math.abs(altitude*c-lateral*s)<depth*slope;
      });
    }
    const deadline=performance.now()+250000;
    await new Promise((resolve,reject)=>{
      function frame(now) {
        if (race.phase !== 'racing' || performance.now()>deadline) {
          reject(Error('Frame test stopped at station '+race.player.current.s)); return;
        }
        const p=race.player.current;
        const intent=window.driveKeyboard(p,30,0,course), wanted=new Set();
        if (intent.throttle) wanted.add('KeyW');
        if (intent.brake) wanted.add('KeyS');
        if (intent.steer<0) wanted.add('KeyA');
        if (intent.steer>0) wanted.add('KeyD');
        const key=(type,code)=>canvas.dispatchEvent(new KeyboardEvent(type,{code,bubbles:true,cancelable:true}));
        for(const code of held) if(!wanted.has(code)) key('keyup',code);
        for(const code of wanted) if(!held.has(code)) key('keydown',code);
        held=wanted;
        const station=race.player.distance;
        let section=sections.findIndex(([,start,end])=>station>=start && station<end);
        if(section===0 && !allInView()) section=-1;
        if(!scenic && section===1){
          const distances=race.entrants.filter(e=>e!==race.player)
            .map(e=>Math.hypot(e.current.x-p.x,e.current.z-p.z));
          if(p.speed<16 || Math.max(...distances)>50 || Math.min(...distances)>18) section=-1;
        }
        if (section>=0 && section===previousSection) {
          intervals[section].push(now-last);
          const ticks=race.elapsedTicks-lastTick;
          simulationTicks[section]+=ticks;
          maxTicksPerFrame[section]=Math.max(maxTicksPerFrame[section],ticks);
        }
        lastTick=race.elapsedTicks;
        last=now; previousSection=section;
        if (station>=sections.at(-1)[2]) resolve();
        else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
    return {renderer,profile:'high',effects:document.body.dataset.effects,width:gl.drawingBufferWidth,height:gl.drawingBufferHeight,
      sections:sections.map(([section],i)=>{
        const sorted=intervals[i].sort((a,b)=>a-b), samples=sorted.length;
        const seconds=sorted.reduce((a,b)=>a+b,0)/1000;
        const percentile=f=>sorted[Math.ceil(samples*f)-1];
        return {section,samples,seconds,simulationTicks:simulationTicks[i],maxTicksPerFrame:maxTicksPerFrame[i],meanFps:samples/seconds,medianMs:percentile(.5),
          p95Ms:percentile(.95),maxMs:sorted.at(-1)};
      })};
  },scenic);
  assert.deepEqual(errors,[]);
  assert.equal(sample.width,1920);
  assert.equal(sample.height,1080);
  assert(sample.sections.every(s=>s.samples>=60),'insufficient frame intervals');
  console.log(JSON.stringify({browser:browser.version(),event:championship?'Overdrive Opening Cup':'standalone',course:scenic?'ridge':'speedway',...sample},null,2));
} finally { await browser.close(); }
