// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import {observeDrivingCommands} from './browser-controller-driver.mjs';

// Ordinary two-thumb start. Only the delivered animation timestamps are controlled.
// The throttle and steering contacts stay with the shipped touch adapter.
export async function verifyRocketOpening(browser, url) {
  const page = await browser.newPage({viewport:{width:844,height:390},hasTouch:true,isMobile:true});
  try {
    const errors = [];
    page.on('pageerror',e=>errors.push(e.message));
    const cdp = await page.context().newCDPSession(page);
    await observeDrivingCommands(page);
    await page.route(new URL('src/main.js',url).href, async route=>{
      const response = await route.fetch();
      await route.fulfill({response,body:await response.text()+'\nwindow.openingRace=()=>race;'});
    });
    await page.addInitScript(()=>{
      let callback, timestamp=0;
      requestAnimationFrame = fn=>{callback=fn; return 1;};
      window.present = ticks=>callback(timestamp+=ticks*1000/60);
    });
    await page.goto(url.href);
    for (const id of ['choose-orbital','start','touch-arm']) await page.locator('#'+id).tap({force:true});
    assert.equal(await page.locator('body').getAttribute('data-phase'),'countdown');
    const point = async (name,id)=>{
      const box=await page.locator('[data-touch="'+name+'"]').boundingBox();
      assert(box && box.width>=44 && box.height>=44);
      return {id,x:box.x+box.width/2,y:box.y+box.height/2};
    };
    const gas=await point('throttle',1), steer=await point('right',2);
    const touch=(type,touchPoints=[])=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints});
    await page.evaluate(async ()=>{
      const {dot,rotate,subtract}=await import('./vendor/vanillajs/modules/math/index.js');
      const {FixedClock}=await import('./vendor/vanillajs/modules/time/index.js');
      const advance=FixedClock.prototype.advance;
      const race=window.openingRace();
      const observations=window.openingTrace={minClearance:Infinity,minUp:1,steerTicks:0,gasTicks:0,attachedTicks:0,contacts:0,gates:[]};
      FixedClock.prototype.advance=function(dt,update) {
        return advance.call(this,dt,h=>{
          const racing=race.phase==='racing';
          update(h);
          if (!racing) return;
          const p=race.player, b=p.vehicle;
          const road=race.course.projectNear(b.position,p.distance);
          observations.minClearance=Math.min(observations.minClearance,dot(subtract(b.position,road.point),road.normal));
          observations.minUp=Math.min(observations.minUp,dot(rotate(b.orientation,[0,1,0]),road.normal));
          const c=window.observedDrivingCommand;
          observations.steerTicks+=Number(c.steer===1);
          observations.gasTicks+=Number(c.throttle===1);
          observations.attachedTicks+=Number(b.attached);
          observations.contacts+=Number(p.contact);
          if(p.nextGate>observations.gates.length) observations.gates.push({tick:race.elapsedTicks,
            station:race.course.gates[p.nextGate-1].s,loaded:b.wheels.filter(w=>w.contact && w.load>0).length});
        });
      };
      window.driveToOpeningTick=target=>{
        for(let frames=0;race.elapsedTicks<target && frames<target+200;frames++)
          window.present(Math.min(6,target-race.elapsedTicks));
        if(race.elapsedTicks!==target) throw Error('Unexpected opening race tick '+race.elapsedTicks+' / '+target);
      };
    });
    const advanceTo=tick=>page.evaluate(n=>window.driveToOpeningTick(n),tick);
    await touch('touchStart',[gas]);
    await advanceTo(32);
    await touch('touchStart',[steer]);
    await advanceTo(62);
    await touch('touchEnd',[steer]);
    await advanceTo(330);
    await touch('touchEnd');
    const trace=await page.evaluate(()=>{
      const race=window.openingRace();
      return {...window.openingTrace,entrants:race.entrants.length,recoveries:race.player.recoveries,gate:race.player.nextGate};
    });
    assert.deepEqual(errors,[]);
    assert.equal(trace.entrants,6);
    assert.equal(trace.gasTicks,330);
    assert.equal(trace.steerTicks,30);
    assert(trace.attachedTicks>300);
    assert(trace.contacts<60,'the opening correction must clear traffic and rails within a second of contact');
    assert(trace.gate>=2 && trace.recoveries===0 && trace.minClearance>0 && trace.minUp>0,
      'The car must cross the start line and GATE1 upright and above the road after a half-second steering press: '+JSON.stringify(trace));
    assert.deepEqual(trace.gates.slice(0,2).map(g=>g.station),[0,123]);
    assert(trace.gates.every(g=>g.loaded>=2));
    return trace;
  } finally { await page.close(); }
}
