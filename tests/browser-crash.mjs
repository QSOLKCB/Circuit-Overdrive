// SPDX-License-Identifier: Apache-2.0
// Real keyboard events, normal requestAnimationFrame and the shipped FixedClock.
import assert from 'node:assert/strict';
import {verifyCrashDownloads} from './crash-browser-replay.mjs';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=new URL(process.argv[2]),dir=process.env.EVIDENCE_DIR;
if(dir)await mkdir(dir,{recursive:true});
const native=process.env.NATIVE_GL==='1';
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN,
  args:native?['--enable-gpu','--use-angle=gl']:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  const errors=[],results=[];
  let page;
  for(const scenario of ['wall','glancing','opposing']){
    if(page)await page.context().close();
    page=await browser.newPage({viewport:{width:1100,height:760},acceptDownloads:true});
    page.on('pageerror',err=>errors.push(err.message));
    await page.route('**/*',async route=>{
      const url=route.request().url();
      if(!url.startsWith(base.href)){errors.push('External request '+url);return route.abort();}
      if(url===new URL('src/crash-lab.js',base).href){
        const response=await route.fetch();
        return route.fulfill({response,body:await response.text()+'\nwindow.readTrial=()=>trial;'});
      }
      return route.continue();
    });
    await page.goto(base.href);await page.locator('#enter-crash').click();
    await page.waitForFunction(()=>typeof window.readTrial==='function' && !document.querySelector('#lab-arm').disabled);
    await page.locator('#scenario').selectOption(scenario);
    const revision=await page.locator('meta[name=game-revision]').getAttribute('content');
    assert.match(revision,/^[a-f0-9]{40}$/);if(process.env.REPLAY_REVISION)assert.equal(revision,process.env.REPLAY_REVISION);
    assert.equal(await page.locator('#lab-tick').textContent(),'0');
    assert(await page.locator('#lab-arm').isEnabled(),await page.locator('#lab-status').textContent());
    await page.bringToFront();
    await page.locator('#lab-arm').click();
    try{
      await page.waitForFunction(id=>window.readTrial().scenario===id && window.readTrial().phase==='running'
        && document.activeElement?.id==='lab-world' && !document.hidden,scenario);
      await page.keyboard.down('ArrowUp');
      await page.waitForFunction(()=>Math.hypot(window.readTrial().world.cars[0].vx,window.readTrial().world.cars[0].vz)>0);
      await page.waitForFunction(()=>window.readTrial().firstImpact!==null,null,{timeout:60000});
      await page.waitForFunction(()=>window.readTrial().phase==='finished',null,{timeout:60000});
    }catch(error){
      const state=await page.evaluate(()=>{
        const trial=window.readTrial(),car=trial.world.cars[0];
        return {scenario:trial.scenario,tick:trial.world.tick,result:trial.result,phase:trial.phase,
          status:document.querySelector('#lab-status').textContent,focus:document.activeElement?.id,
          hidden:document.hidden,velocity:[car.vx,car.vz],firstImpact:trial.firstImpact};
      });
      throw new Error('Browser drive stalled '+JSON.stringify(state),{cause:error});
    }finally{await page.keyboard.up('ArrowUp');}
    const live=await page.evaluate(()=>{
      const t=window.readTrial();return {scenario:t.scenario,seed:t.seed,ticks:t.world.tick,result:t.result,
        firstImpact:t.firstImpact,contacts:t.contacts,cars:t.world.cars};
    });
    assert.equal(live.scenario,scenario);
    assert(['settled','post-impact run complete','impact and run-off','vehicle disabled'].includes(live.result),live.result);
    const hit=live.contacts[0],car=live.cars[0],face=scenario==='glancing'?'right':'front';
    assert.equal(hit.revision,revision);assert(hit.closing>1 && hit.normalImpulse>0 && hit.dissipated>0);
    assert.equal(hit.sites[0].zone,face);assert.equal(live.cars.length,scenario==='opposing'?2:1);
    assert.equal(await page.locator('#zone-'+face).getAttribute('data-damage'),String(car.damage[face]));
    assert.equal(await page.locator('#lab-tick').textContent(),String(live.ticks));
    assert.match(await page.locator('#lab-status').textContent(),/Result/);
    await page.locator('#lab-camera').selectOption('inspect');
    const bytes=await page.screenshot(dir?{path:dir+'/'+scenario+'.png'}:{});
    const screenshotSha256=createHash('sha256').update(bytes).digest('hex');
    if(dir)await writeFile(dir+'/'+scenario+'-live.json',JSON.stringify({revision,screenshotSha256,...live}));
    if(scenario==='opposing'){
      await page.locator('#lab-follow').selectOption('1');
      await page.waitForFunction(()=>document.querySelector('#lab-strike').textContent.startsWith('Player test car'));
      assert.equal(await page.locator('#zone-front').getAttribute('data-damage'),String(live.cars[1].damage.front));
    }
    const hashes=await verifyCrashDownloads(page,base,live,revision,dir);
    results.push({scenario,revision,...hashes,ticks:live.ticks,result:live.result,impactTick:hit.tick,zone:face,
      impulse:hit.normalImpulse,screenshotSha256});
    await page.locator('#lab-reset').click();assert.equal(await page.locator('#lab-tick').textContent(),'0');
    assert.equal(await page.locator('#zone-'+face).getAttribute('data-damage'),'0');
  }
  // Exercise loss/restoration on the same real page, preserving an armed trial.
  await page.locator('#scenario').selectOption('wall');await page.locator('#lab-arm').click();
  await page.keyboard.down('ArrowUp');await page.waitForFunction(()=>window.readTrial().world.tick>=6);
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.keyboard.up('ArrowUp');
  const paused=await page.evaluate(()=>window.readTrial().world.tick);
  await page.waitForTimeout(120);assert.equal(await page.evaluate(()=>window.readTrial().world.tick),paused);
  await page.locator('#lab-arm').click();
  const beforeLoss=await page.evaluate(()=>{
    const t=window.readTrial();return {speed:Math.hypot(t.world.cars[0].vx,t.world.cars[0].vz),tick:t.world.tick};
  });
  await page.waitForFunction(t=>window.readTrial().world.tick>=t+5,beforeLoss.tick);
  assert(await page.evaluate(s=>{const c=window.readTrial().world.cars[0];return Math.hypot(c.vx,c.vz)<=s;},beforeLoss.speed));
  await page.evaluate(()=>{const gl=document.querySelector('#lab-world').getContext('webgl');
    window.loss=gl.getExtension('WEBGL_lose_context');window.loss.loseContext();});
  await page.waitForFunction(()=>document.querySelector('#lab-status').textContent==='Graphics suspended');
  const lostTick=await page.evaluate(()=>window.readTrial().world.tick);
  await page.evaluate(()=>window.loss.restoreContext());
  await page.waitForFunction(()=>document.querySelector('#lab-status').textContent.startsWith('Graphics restored'));
  assert.equal(await page.evaluate(()=>window.readTrial().world.tick),lostTick);
  await page.locator('#lab-arm').click();await page.waitForFunction(t=>window.readTrial().world.tick>t,lostTick);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({browser:browser.version(),results},null,2));
}finally{await browser.close();}
