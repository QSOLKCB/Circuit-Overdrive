// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';

// Drive the regular keyboard path from the grid through a missed wall gate and
// a penalised retry. Inspection observes accepted race state without setting it.
export async function verifyRocketGrip(browser,base,pilotSource,directory) {
  const page=await browser.newPage({viewport:{width:720,height:460}});
  try {
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route(new URL('tests/orbital-driver.mjs',base).href,route=>
      route.fulfill({contentType:'application/javascript',body:pilotSource}));
    await page.route(new URL('src/main.js',base).href,async route=>{
      const response=await route.fetch();
      await route.fulfill({response,body:await response.text()+'\nwindow.gripRace=()=>race;'});
    });
    await page.addInitScript(()=>{
      let frame,timestamp=0;
      requestAnimationFrame=fn=>{frame=fn;return 1;};
      window.gripFrame=ticks=>frame(timestamp+=ticks*1000/60);
    });
    await page.goto(base.href);
    await page.locator('#choose-orbital').click();
    await page.locator('#start').click();
    await page.keyboard.press('w');
    assert.equal(await page.locator('body').getAttribute('data-phase'),'countdown');
    const stations=await page.evaluate(async()=>{
      const {FixedClock}=await import('./vendor/vanillajs/modules/time/index.js');
      const {orbitalDrive}=await import('./tests/orbital-driver.mjs');
      const advance=FixedClock.prototype.advance,race=window.gripRace(),p=race.player;
      const canvas=document.getElementById('world'),gl=canvas.getContext('webgl'),pixel=new Uint8Array(4);
      const [approach,wall,ceiling]=race.course.gates.slice(2,5).map(gate=>gate.s);
      const held=new Set();
      const wheelCount=()=>p.vehicle.wheels.filter(w=>w.contact&&w.load>0).length;
      const snapshot=()=>({station:p.distance,gate:p.nextGate,missed:p.missedGate,elapsed:p.elapsedTicks,
        recoveries:p.recoveries,wheels:wheelCount(),airTicks:p.vehicle.airTicks,attached:p.vehicle.attached});
      const approachGrip={airborneTicks:0,wallTicks:0,ceilingTicks:0,peakSpeed:0};
      let retry=false;
      function key(code,press) {
        if(held.has(code)===press)return;
        if(press)held.add(code);else held.delete(code);
        canvas.dispatchEvent(new KeyboardEvent(press?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
      }
      FixedClock.prototype.advance=function(dt,update) {
        return advance.call(this,dt,h=>{
          const c=orbitalDrive(p),accelerate=p.distance>=approach+19;
          key('KeyW',accelerate||!!c.throttle);key('KeyS',!accelerate&&!!c.brake);
          key('KeyA',c.steer<0);key('KeyD',c.steer>0);key('ShiftLeft',accelerate);
          // Space and Recover are sent by the browser's keyboard, so only
          // accepted controls can engage grip or rewind progress.
          update(h);
          if(retry && p.distance>=wall-24 && p.distance<=ceiling+1) {
            const body=p.vehicle;
            approachGrip.airborneTicks+=Number(wheelCount()===0);
            approachGrip.wallTicks+=Number(body.attached&&body.contactFrame?.id==='antenna-wall');
            approachGrip.ceilingTicks+=Number(body.attached&&body.contactFrame?.id==='inverted-spine');
            approachGrip.peakSpeed=Math.max(approachGrip.peakSpeed,Math.hypot(...body.velocity));
          }
        });
      };
      window.gripSnapshot=snapshot;
      window.runGrip=phase=>{
        retry=phase==='retry';
        const reached=phase==='prompt' ? ()=>p.distance>=approach+9 :
          retry ? ()=>p.nextGate>=5 : ()=>p.missedGate;
        for(let frame=0;frame<180&&!reached();frame++) {
          window.gripFrame(10);
          if(frame%12===0)gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
        }
        if(!reached())throw Error('Rocket grip test stalled during '+phase);
        return {...snapshot(),...approachGrip};
      };
      return {approach,wall,ceiling};
    });
    const prompt=await page.evaluate(()=>window.runGrip('prompt'));
    assert.equal(prompt.gate,3);
    assert(prompt.wheels>0);
    assert.equal(await page.locator('#feedback').textContent(),'Hold Space for wall and ceiling grip');
    assert.match(await page.locator('#rocket-assist').textContent(),/Assist off/);
    if(directory)await page.screenshot({path:directory+'/orbital-assist-prompt.png'});
    const missed=await page.evaluate(()=>window.runGrip('missed'));
    assert(missed.station>stations.wall && missed.airTicks>0 && missed.wheels===0 && !missed.attached);
    assert.equal(missed.gate,3);
    assert.equal(missed.recoveries,0);
    assert.equal(await page.locator('#rocket-nav').textContent(),'Gate 3 missed');
    assert.equal(await page.locator('#feedback').textContent(),'Gate 3 missed · R to retry (+3 s)');
    if(directory)await page.screenshot({path:directory+'/orbital-missed-wall-gate.png'});
    await page.keyboard.press('r');
    const recovered=await page.evaluate(()=>{window.gripFrame(1);return window.gripSnapshot();});
    assert.equal(recovered.recoveries,1);
    assert.equal(recovered.gate,3);
    assert.equal(recovered.elapsed,missed.elapsed+181);
    assert(recovered.station<=stations.approach&&!recovered.missed);
    await page.keyboard.down('Space');
    const retried=await page.evaluate(()=>window.runGrip('retry'));
    await page.keyboard.up('Space');
    assert(retried.station>=stations.ceiling && retried.wallTicks>0 && retried.ceilingTicks>0);
    assert.equal(retried.airborneTicks,0);
    assert.equal(retried.recoveries,1);
    assert.equal(retried.gate,5);
    assert(!retried.missed);
    assert.deepEqual(errors,[]);
    return {prompt,missed,recovered,retried};
  } finally { await page.close(); }
}
