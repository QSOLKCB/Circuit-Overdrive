// SPDX-License-Identifier: Apache-2.0
// Drive onto the outside apron from the Speedway grid. Run against the checkout
// or its static package; all instrumentation lives in the browser test context.
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url=new URL(process.argv[2] || 'http://127.0.0.1:8000/');
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN,
  args:process.env.NATIVE_GL==='1' ? ['--enable-gpu','--use-angle=gl'] :
    ['--use-angle=swiftshader','--enable-unsafe-swiftshader']});

async function drive(quality) {
  const page=await browser.newPage({viewport:{width:1280,height:720},reducedMotion:'reduce'});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    let next, now=0;
    const native=window.requestAnimationFrame.bind(window);
    window.present=()=>new Promise(done=>native(()=>native(done)));
    window.requestAnimationFrame=fn=>{next=fn;return 1;};
    window.frame=ticks=>{
      window.lastDraws={mark:0,smoke:0,dust:0,spark:0};
      now+=ticks*1000/60; next(now);
    };
  });
  if (process.env.EVIDENCE_DIR && quality==='full') {
    await page.exposeFunction('saveEffect',async name=>{
      await page.evaluate(async()=>{
        const gl=document.querySelector('#world').getContext('webgl');
        gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));
        await window.present();
      });
      await page.screenshot({path:process.env.EVIDENCE_DIR+'/effects-'+name+'.png'});
    });
  }
  await page.goto(url.href);
  if(process.argv.includes('--night')) await page.locator('#choose-night').click({force:true});
  await page.evaluate(async()=>{
    const {LitRenderer}=await import('./vendor/vanillajs/modules/render-lit/index.js');
    const draw=LitRenderer.prototype.draw;
    LitRenderer.prototype.draw=function(handle,options){
      const m=options?.material;
      if (m?.opacity<1 && m.color) {
        let kind;
        if (m.pattern==='shadow' && m.color[0]>.35) kind=m.color[0]>m.color[2]?'dust':'smoke';
        else if (m.emission===2 && m.color[0]===1) kind='spark';
        else if (m.roughness===1 && m.color[0]<.08) kind='mark';
        if(kind) {
          window.lastDraws[kind]++;
          if(window.omitEffect===kind) return;
        }
      }
      return draw.call(this,handle,options);
    };
    window.frame(0);
  });
  assert.equal(await page.locator('body').getAttribute('data-effects'),'reduced');
  if (quality==='full') {
    await page.locator('#settings').click({force:true});
    await page.locator('#effects-quality').selectOption('full');
    await page.locator('#close-settings').click({force:true});
  }
  assert.equal(await page.locator('body').getAttribute('data-effects'),quality);
  await page.locator('#sound').click({force:true});
  await page.locator('#start').click({force:true});
  await page.keyboard.down('w');
  await page.evaluate(()=>{
    window.frame(0);
    for(let i=0;i<12;i++) window.frame(15);
    if (document.body.dataset.phase!=='racing') throw Error('Countdown failed to reach green');
    for(let i=0;i<20;i++) window.frame(14);
  });
  await page.keyboard.down('d');
  const result=await page.evaluate(async quality=>{
    const peak={mark:0,smoke:0,dust:0,spark:0}, pixels={mark:0,smoke:0,dust:0,spark:0}, saved=new Set();
    const gl=document.querySelector('#world').getContext('webgl');
    const width=gl.drawingBufferWidth, height=gl.drawingBufferHeight;
    const first=new Uint8Array(width*height*4), second=new Uint8Array(first.length);
    // Draw the identical pose twice, suppressing just one translucent material.
    // This also catches particles drawn behind the wall or inside the chassis.
    function visiblePixels(kind) {
      window.frame(0);
      gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,first);
      window.omitEffect=kind; window.frame(0);
      gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,second);
      window.omitEffect=null; window.frame(0);
      let changed=0;
      for(let j=0;j<first.length;j+=4) {
        if(Math.abs(first[j]-second[j])+Math.abs(first[j+1]-second[j+1])+Math.abs(first[j+2]-second[j+2])>12) changed++;
      }
      return changed;
    }
    for(let i=0;i<150;i++) {
      window.frame(2);
      const d=window.lastDraws;
      for(const k of Object.keys(peak)) peak[k]=Math.max(peak[k],d[k]);
      if(quality==='full') {
        for(const kind of Object.keys(peak)) {
          if(d[kind]>0 && pixels[kind]<12) pixels[kind]=Math.max(pixels[kind],visiblePixels(kind));
        }
      }
      const shot=d.spark && pixels.spark>=12 ? 'contact' : d.dust>=3 && pixels.dust>=12 ? 'apron'
        : d.smoke>=5 && d.mark>=4 && pixels.smoke>=12 ? 'slide' : '';
      if(window.saveEffect && shot && !saved.has(shot)) {
        saved.add(shot);
        await window.saveEffect(shot);
      }
      if(i%20===0) await new Promise(resolve=>setTimeout(resolve,0));
    }
    return {peak,pixels,phase:document.body.dataset.phase,
      hud:['speed','gear','timer','lap','position'].map(id=>document.getElementById(id).textContent)};
  },quality);
  assert.equal(result.phase,'racing');
  assert.deepEqual(errors,[]);
  await page.close();
  return result;
}
try {
  const full=await drive('full'), reduced=await drive('reduced');
  assert(Object.values(full.peak).every(n=>n>0),'full renderer must draw all four effects');
  assert(Object.values(full.pixels).every(n=>n>=12),'full effects must contribute visible framebuffer pixels');
  assert(reduced.peak.mark>0 && reduced.peak.mark<=12);
  assert.deepEqual([reduced.peak.smoke,reduced.peak.dust,reduced.peak.spark],[0,0,0]);
  assert.deepEqual(full.hud,reduced.hud,'presentation quality must preserve the replay');
  console.log(JSON.stringify({browser:browser.version(),url:url.href,full,reduced},null,2));
} finally { await browser.close(); }
