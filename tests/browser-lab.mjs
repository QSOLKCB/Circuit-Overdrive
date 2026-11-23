// SPDX-License-Identifier: Apache-2.0
// Real browser, synthetic Gamepad API reports. All game reads use the public UI.
import assert from 'node:assert/strict';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({executablePath:process.env.CHROME_BIN,
  args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
  const url = process.argv[2] || 'http://127.0.0.1:8000/';
  const page = await browser.newPage({viewport:{width:800,height:550}});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    function pad(index, id, mapping, axes, count) {
      return {index, id, mapping, axes, connected:true, buttons:Array.from({length:count}, () => ({pressed:false,value:0}))};
    }
    window.pads = [pad(0,'<Test> pad','standard',[0,0],17), null, pad(2,'Test wheel','',[.2,.1],4)];
    Object.defineProperty(navigator,'getGamepads',{value:() => window.pads});
    let next, time = 0;
    window.requestAnimationFrame = callback => { next = callback; return 1; };
    window.advance = (frames=1) => { for (let i=0; i<frames; i++) next(time += 1000/60); };
  });
  await page.goto(url);
  const id = name => page.locator('#' + name);
  const click = name => id(name).click({force:true});
  const content = name => id('lab-' + name).textContent();
  const phase = () => page.locator('body').getAttribute('data-phase');
  const tick = n => page.evaluate(n => window.advance(n), n);
  const inputs = async () => Promise.all(['steer','throttle','brake'].map(content));
  const device = id('driver-device');
  const openLab = async () => {
    await page.locator('#controller-lab summary').click({force:true});
    await id('lab-readings').waitFor({state:'visible'});
    await tick();
  };
  await id('start').waitFor({state:'visible'});
  await page.evaluate(async () => {
    const {TUNING, saveProfile} = await import('./src/profiles.js');
    const axis = (index,rest,full) => ({type:'axis',index,rest,full});
    const button = index => ({type:'button',index,rest:0,full:1});
    saveProfile(window.pads[2],{family:'wheel',steering:{left:axis(0,.2,-.8),right:axis(0,.2,1)},
      throttle:axis(1,.1,-.9),brake:axis(1,.1,.9),actions:{confirm:button(0),pause:button(2)},
      tuning:{...TUNING,deadzone:.2,invertSteer:true,throttleRange:.5}});
    window.advance();
  });
  const saved = await page.evaluate(() => localStorage.getItem('circuit-overdrive.controller-profiles'));
  await click('start'); await page.keyboard.press('w'); await tick(184);
  assert.equal(await phase(),'racing');
  await click('controllers'); await device.selectOption('pad-0'); await openLab();
  assert.equal(await phase(),'paused');
  const clock = await id('timer').textContent();
  assert.equal(await content('owner'),'Keyboard');
  assert.match(await content('device'), /Connected · Slot 1 · <Test> pad · standard/);
  assert.equal(await content('neutral'),'Yes');
  assert.match(await content('calibration'), /Default standard profile\nDeadzone 0.12/);
  await page.evaluate(() => {
    pads[0].axes[0]=.56; pads[0].buttons[7].value=.51; pads[0].buttons[6].value=.265;
    window.advance(61);
  });
  assert.deepEqual(await inputs(),['0.50','0.50','0.25']);
  assert.match(await content('axes'), /A0 0.56/);
  assert.match(await content('buttons'), /B7 0.51/);
  assert.equal(await content('neutral'),'No');
  await device.selectOption('pad-2'); await tick();
  assert.match(await content('calibration'), /Saved wheel profile\nDeadzone 0.2.*Inverted/);
  assert.match(await content('calibration'), /Accelerator axis 1 \(0.10 → -0.90\) · Travel 50%/);
  await page.evaluate(() => { pads[2].axes=[.68,-.155]; window.advance(); });
  assert.deepEqual(await inputs(),['-0.50','0.50','0.00']);
  await page.evaluate(() => { pads[2].axes=[.2,.508]; window.advance(); });
  assert.deepEqual(await inputs(),['0.00','0.00','0.50']);
  await page.evaluate(() => { pads[2].axes=[.2,.1]; pads[2].buttons[0]={value:1,pressed:true}; window.advance(); });
  assert.equal(await content('neutral'),'No','a held mapped action prevents neutral');
  await page.evaluate(() => { pads[2].axes[1]=NaN; window.advance(); });
  assert.match(await content('axes'), /A1 unreadable/);
  assert.equal(await content('neutral'),'Unavailable');
  assert.deepEqual(await inputs(),['—','—','—']);
  // A different unknown device appearing in the same slot cannot inherit the calibration.
  await page.evaluate(() => { pads[2]={...pads[2],id:'Replacement',axes:[0,0]}; window.advance(); });
  assert.equal(await device.inputValue(),'disconnected');
  assert(await id('use-device').isDisabled());
  await device.selectOption('pad-2'); await tick();
  assert.match(await content('device'), /Connected · Slot 3 · Replacement/);
  assert.equal(await content('calibration'),'No usable profile');
  assert.deepEqual(await inputs(),['—','—','—']);
  assert.equal(await content('owner'),'Keyboard');
  assert.equal(await id('timer').textContent(),clock);
  assert.equal(await id('speed').textContent(),'0');
  assert.equal(await page.evaluate(() => localStorage.getItem('circuit-overdrive.controller-profiles')),saved);

  // Once explicitly selected, the owner's controls must remain inspection inputs.
  await device.selectOption('pad-0'); await click('use-device');
  await page.evaluate(() => {
    pads[0].axes[0]=0; pads[0].buttons[7].value=0; pads[0].buttons[6].value=0; window.advance(2);
  });
  await click('controllers');
  // The summary opens synchronously. Its native toggle event (and the focus
  // transfer to the readings) can arrive after the next gamepad samples.
  const openedFromPad = await page.evaluate(() => {
    const summary = document.querySelector('#controller-lab summary');
    const buttons = pads[0].buttons;
    const press = i => { buttons[i]={value:1,pressed:true}; };
    const release = i => { buttons[i]={value:0,pressed:false}; };
    summary.focus(); window.advance();
    press(0); window.advance();
    const opened = summary.parentElement.open && document.activeElement === summary;
    release(0); window.advance();
    press(7); press(0); press(13); window.advance(5);
    return opened;
  });
  assert(openedFromPad,'owner opened the lab while the native toggle event was pending');
  assert.equal(await content('owner'),'Gamepad · Slot 1');
  assert.equal(await content('neutral'),'No');
  assert(await id('lab-readings').isVisible());
  assert.equal(await id('timer').textContent(),clock);
  await page.evaluate(() => {
    for (const i of [0,7,13]) pads[0].buttons[i]={value:0,pressed:false};
    window.advance(); pads[0].buttons[9]={value:1,pressed:true}; window.advance();
  });
  assert(!(await id('lab-readings').isVisible()),'owner can leave the readings with Pause');
  assert(await id('controller-dialog').isVisible());
  assert.equal(await phase(),'paused');
  await page.evaluate(() => {
    pads[0].buttons[9]={value:0,pressed:false}; window.advance();
    pads[0].buttons[13]={value:1,pressed:true}; window.advance();
    pads[0].buttons[13]={value:0,pressed:false}; window.advance();
  });
  assert.equal(await page.evaluate(() => document.activeElement.id),'driver-device','D-pad navigates the picker again');
  await openLab();
  await page.evaluate(() => { pads[0]=null; window.advance(2); });
  assert.match(await content('device'), /Disconnected/);
  assert.equal(await content('owner'),'Gamepad · No active slot');
  assert.equal(await content('neutral'),'Unavailable');
  await click('close-controller'); await click('continue'); await tick(5);
  assert.equal(await phase(),'paused');
  assert.equal(await id('timer').textContent(),clock);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({browser:browser.version(), url, syntheticReports:['standard pad','calibrated combined-pedal wheel','unmapped replacement'],
    checks:['owner / preview separation','raw and normalized channels','neutral and held actions','paused clock','invalid sample','slot replacement','disconnect','explicit pad exit']}));
} finally { await browser.close(); }
