// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';

// A mistimed turn misses a gate. After a penalised retry, drive the wall,
// park on the ceiling, then take the transfer with ordinary driving controls.
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
    const layout=await page.evaluate(async()=>{
      const {FixedClock}=await import('./vendor/vanillajs/modules/time/index.js');
      const {orbitalDrive}=await import('./tests/orbital-driver.mjs');
      const advance=FixedClock.prototype.advance,race=window.gripRace(),p=race.player;
      const canvas=document.getElementById('world'),gl=canvas.getContext('webgl'),pixel=new Uint8Array(4);
      const ceiling=race.course.sections.find(section=>section.kind==='ceiling');
      const gap=race.course.sections.find(section=>section.kind==='air');
      const held=new Set();
      const snapshot=()=>{
        const b=p.vehicle;
        return {station:p.distance,gate:p.nextGate,missed:p.missedGate,elapsed:p.elapsedTicks,
          recoveries:p.recoveries,wheels:b.wheels.filter(w=>w.contact&&w.load>0).length,
          speed:Math.hypot(...b.velocity),section:b.contactFrame?.id,attached:b.attached,
          position:b.position.slice(),energy:b.energy};
      };
      const counts={wall:0,ceiling:0,lostGrip:0,flight:0,landed:false};
      let phase='miss';
      function key(code,press) {
        if(held.has(code)===press)return;
        if(press)held.add(code);else held.delete(code);
        canvas.dispatchEvent(new KeyboardEvent(press?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
      }
      FixedClock.prototype.advance=function(dt,update) {
        return advance.call(this,dt,h=>{
          const c=orbitalDrive(p);
          // Enter the opening right-hand bend at full power with left lock.
          const attacking=phase==='miss' && p.distance>=81;
          const stopped=phase==='brake' || phase==='park';
          const steering=attacking && p.distance>=82 && p.distance<=145 ? -1 : stopped ? 0 : c.steer;
          key('KeyW',!stopped && (phase!=='miss' || attacking || !!c.throttle));
          key('KeyS',phase==='miss' && !attacking && !!c.brake);
          key('KeyA',steering<0);key('KeyD',steering>0);key('ShiftLeft',attacking);
          update(h);
          if(phase==='miss')return;
          const b=p.vehicle,id=b.contactFrame?.id;
          if(b.attached && id==='antenna-wall') counts.wall++;
          if(b.attached && id===ceiling.id) counts.ceiling++;
          if(p.distance>=race.course.gates[3].s && p.distance<ceiling.end && !b.attached) counts.lostGrip++;
          if(p.distance>=gap.start && !b.attached && b.wheels.every(w=>!w.contact) && b.airTicks) counts.flight++;
          if(counts.flight && id==='catch-deck' && b.wheels.every(w=>w.contact && w.load>0)) counts.landed=true;
        });
      };
      window.gripSnapshot=snapshot;
      window.runGrip=next=>{
        phase=next;
        const start=p.elapsedTicks;
        const reached=()=>phase==='miss' ? p.missedGate : phase==='ceiling' ? p.distance>=ceiling.start+28 :
          phase==='brake' ? Math.hypot(...p.vehicle.velocity)<.01 :
          phase==='park' ? p.elapsedTicks-start>=180 : p.finishTicks!==null;
        for(let frame=0;frame<440&&!reached();frame++) {
          window.gripFrame(6);
          if(frame%12===0)gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
        }
        if(!reached())throw Error('Rocket drive stalled during '+phase+' '+JSON.stringify(snapshot()));
        return {...snapshot(),...counts};
      };
      return {missGate:race.course.gates[1].s,start:race.course.gates[0].s,ceiling:ceiling.id};
    });
    const run=phase=>page.evaluate(phase=>window.runGrip(phase),phase);
    const missed=await run('miss');
    assert(missed.station>layout.missGate && missed.missed && missed.gate===1 && missed.recoveries===0);
    assert.equal(await page.locator('#rocket-nav').textContent(),'Gate 1 missed');
    assert.equal(await page.locator('#feedback').textContent(),'Gate 1 missed · R to retry (+3 s)');
    if(directory)await page.screenshot({path:directory+'/orbital-missed-bank-gate.png'});
    await page.keyboard.press('r');
    const recovered=await page.evaluate(()=>{window.gripFrame(1);return window.gripSnapshot();});
    assert(recovered.station<=layout.start && !recovered.missed && recovered.gate===1);
    assert.equal(recovered.elapsed,missed.elapsed+181);
    const onCeiling=await run('ceiling');
    assert(onCeiling.attached && onCeiling.wall>0 && onCeiling.section===layout.ceiling);
    await page.keyboard.down('s');
    const stopped=await run('brake');
    await page.keyboard.up('s');
    const parked=await run('park');
    assert.equal(parked.section,layout.ceiling);
    assert(parked.attached && parked.wheels===4 && parked.speed<.15 && parked.elapsed-stopped.elapsed>=180);
    assert(Math.hypot(...parked.position.map((v,i)=>v-stopped.position[i]))<.15,JSON.stringify({stopped,parked}));
    assert.equal(await page.locator('#rocket-grip').textContent(),'Grip active');
    if(directory)await page.screenshot({path:directory+'/orbital-parked-inverted.png'});
    const finish=await run('finish');
    assert(finish.gate===9 && finish.recoveries===1 && !finish.missed && finish.landed);
    assert(finish.wall>30 && finish.ceiling>180 && finish.lostGrip===0 && finish.flight>20);
    assert.equal(finish.energy,recovered.energy,'wall, ceiling, relaunch and jump use no boost fuel');
    assert.deepEqual(errors,[]);
    return {missed,recovered,onCeiling,stopped,parked,finish};
  } finally { await page.close(); }
}
