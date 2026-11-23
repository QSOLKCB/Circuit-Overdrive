// SPDX-License-Identifier: Apache-2.0
// Browser integration fixtures. Gamepads are synthetic reports in navigator;
// touch uses Chromium's input pipeline, with real pointer targeting and capture.
export async function installReplayController(page, source) {
  if (source === 'keyboard') return;
  if (source === 'touch') {
    await page.addInitScript(() => {
      const fingers = new Set();
      window.touchReport = {trustedPresses:0, maxFingers:0, untrustedPresses:0};
      window.addEventListener('pointerdown',event => {
        if (event.pointerType!=='touch' || !event.target.dataset?.touch) return;
        if (event.isTrusted) window.touchReport.trustedPresses++;
        else window.touchReport.untrustedPresses++;
        fingers.add(event.pointerId);
        window.touchReport.maxFingers = Math.max(fingers.size,window.touchReport.maxFingers);
      },true);
      const release=event => fingers.delete(event.pointerId);
      window.addEventListener('pointerup',release,true);
      window.addEventListener('pointercancel',release,true);
    });
    const session = await page.context().newCDPSession(page);
    let fingersDown = false;
    await page.exposeFunction('sendReplayTouches',async points => {
      if (fingersDown) await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      if (points.length) await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points});
      fingersDown = points.length > 0;
    });
    return;
  }
  await page.addInitScript(source => {
    // The unknown devices deliberately have different physical layouts. The
    // wheel uses a non-zero centre, asymmetric limits and reversed brake travel.
    const wheel = source === 'wheel', standard = source === 'standard';
    const pad = {index:1, id:'Race test '+source, mapping:standard?'standard':'', connected:true,
      axes:wheel?[.2,-1,1]:standard?[0,0,0,0]:[],
      buttons:Array.from({length:standard?17:8},()=>({value:0,pressed:false}))};
    Object.defineProperty(navigator,'getGamepads',{value:()=>[null,pad]});
    const button = (index,value) => { pad.buttons[index]={value,pressed:value>.5}; };
    window.replayConfirm = pressed => button(standard?0:5,Number(pressed));
    window.writePadControls = ({steer, throttle, brake}) => {
      if (standard) {
        // Invert the fixture's known deadzones when requesting an intermediate
        // position. Exported commands must contain the resulting analog sample.
        const trigger = v => v ? .02+.98*v : 0;
        pad.axes[0]=steer;
        button(7,trigger(throttle)); button(6,trigger(brake));
      } else if (wheel) {
        pad.axes[0]=steer<0 ? -.8 : steer>0 ? .95 : .2;
        const pedal = v => v ? .02+.98*v : 0;
        pad.axes[1]=-1+2*pedal(throttle);
        pad.axes[2]=1-2*pedal(brake);
      } else {
        button(0,Number(steer<0)); button(3,Number(steer>0));
        button(4,throttle); button(1,brake);
      }
    };
  },source);
}

export async function selectReplayController(page, source) {
  if (source === 'keyboard' || source === 'touch') return;
  if (source !== 'standard') {
    await page.evaluate(async source => {
      const {saveProfile,TUNING}=await import('./src/profiles.js');
      const button=index=>({type:'button',index,rest:0,full:1});
      const axis=(index,rest,full)=>({type:'axis',index,rest,full});
      const wheel=source==='wheel';
      const saved=saveProfile(navigator.getGamepads()[1],{
        family:wheel?'wheel':'generic',
        steering:wheel ? {left:axis(0,.2,-.8),right:axis(0,.2,.95)} : {left:button(0),right:button(3)},
        throttle:wheel ? axis(1,-1,1) : button(4), brake:wheel ? axis(2,1,-1) : button(1),
        actions:{confirm:button(5),pause:button(7),camera:button(6)},tuning:{...TUNING}
      });
      if (!saved) throw Error('Controller replay profile did not persist');
    },source);
    await page.reload(); // Ensure selection reads the saved profile from browser storage.
    await page.evaluate(() => window.advanceFrame());
  }
  await page.locator('#controllers').click({force:true});
  await page.selectOption('#driver-device','pad-1');
  await page.locator('#use-device').click({force:true});
  if (await page.locator('#controller-dialog').isVisible()) throw Error('Controller selection failed');
}

export async function armReplayController(page, source) {
  if (source === 'keyboard') return page.keyboard.press('w');
  if (source === 'touch') return page.locator('#touch-arm').tap({force:true});
  await page.evaluate(() => {
    window.advanceFrame(0); // Poll neutral on the freshly selected grid.
    window.replayConfirm(true); window.advanceFrame(0);
    window.replayConfirm(false); window.advanceFrame(0);
  });
}

export async function verifyReplayDownload(page, result, courseName, required) {
  const save = page.locator('#save-drive');
  if (!await save.count()) {
    if (required) throw Error('This build must expose the finished replay');
    return;
  }
  const [download] = await Promise.all([
    page.waitForEvent('download'), save.click({force:true})
  ]);
  const assert = (await import('node:assert/strict')).default;
  const {readFile,stat} = await import('node:fs/promises');
  const {replayCommands} = await import('../src/replay.js');
  const {createRace,startRace,stepRace,recoverCar} = await import('../src/sim.js');
  const course = courseName==='ridge' ? (await import('../src/ridge.js')).ridge : (await import('../src/track.js')).track;
  assert.equal(download.suggestedFilename(),'circuit-overdrive-'+courseName+'-replay.json');
  const path=await download.path();
  assert((await stat(path)).size < 12*1024*1024, 'export exceeds the 30-minute command limit');
  const data=JSON.parse(await readFile(path,'utf8'));
  assert.equal(data.course,course.id);
  assert.deepEqual(Object.keys(data).sort(),['course','runs','seed','ticks','version']);
  const race=createRace(data.seed,course);
  startRace(race);
  let ticks=0, analog=0;
  for (const {command,recover} of replayCommands(data)) {
    assert.notEqual(race.phase,'finished','extra tick after flag');
    if (recover) assert(recoverCar(race));
    if ([command.steer,command.throttle,command.brake].some(v => v!==0 && Math.abs(v)<1)) analog++;
    stepRace(race,command);
    ticks++;
  }
  assert.equal(race.phase,'finished');
  assert.equal(ticks,data.ticks);
  assert.equal(race.player.elapsedTicks,result.expectedTicks);
  assert.deepEqual(course.closed ? race.player.lapTicks : race.player.splitTicks,result.expectedSplits);
  assert.deepEqual(race.order.map(e=>({id:e.id,name:e.name,number:e.number,ticks:e.finishTicks,recoveries:e.recoveries})),result.expected);
  return {ticks, runs:data.runs.length, analogTicks:analog, finishers:race.order.filter(e=>e.finishTicks!==null).length};
}
