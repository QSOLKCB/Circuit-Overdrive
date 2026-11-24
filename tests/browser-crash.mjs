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
  const context=await browser.newContext({viewport:{width:1100,height:760},acceptDownloads:true});
  const page=await context.newPage();
  const errors=[],results=[];
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
  for(const scenario of ['wall','glancing','opposing']){
    await page.goto(base.href);await page.locator('#enter-crash').click();
    await page.locator('#scenario').selectOption(scenario);
    const revision=await page.locator('meta[name=game-revision]').getAttribute('content');
    assert.match(revision,/^[a-f0-9]{40}$/);if(process.env.REPLAY_REVISION)assert.equal(revision,process.env.REPLAY_REVISION);
    assert.equal(await page.locator('#lab-tick').textContent(),'0');
    assert(await page.locator('#lab-arm').isEnabled(),await page.locator('#lab-status').textContent());
    await page.locator('#lab-arm').click();await page.keyboard.down('ArrowUp');
    await page.waitForFunction(()=>window.readTrial().firstImpact!==null,null,{timeout:60000});
    await page.waitForFunction(()=>window.readTrial().phase==='finished',null,{timeout:60000});
    await page.keyboard.up('ArrowUp');
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
    const hashes=await verifyCrashDownloads(page,base,live,revision,dir);
    results.push({scenario,revision,...hashes,ticks:live.ticks,result:live.result,impactTick:hit.tick,zone:face,
      impulse:hit.normalImpulse,screenshotSha256});
    await page.locator('#lab-reset').click();assert.equal(await page.locator('#lab-tick').textContent(),'0');
    assert.equal(await page.locator('#zone-'+face).getAttribute('data-damage'),'0');
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({browser:browser.version(),results},null,2));
}finally{await browser.close();}
