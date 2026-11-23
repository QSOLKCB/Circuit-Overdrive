// SPDX-License-Identifier: Apache-2.0
// Real browser and race lifecycle, synthetic browser Gamepad reports.
import assert from 'node:assert/strict';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({executablePath:process.env.CHROME_BIN,
  args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
  const page = await browser.newPage({viewport:{width:800,height:550}});
  const errors = [];
  page.on('pageerror', e=>errors.push(e.message));
  await page.addInitScript(() => {
    const pad = index => ({index, mapping:'standard', id:'Test pad '+index, connected:true,
      axes:[0,0,0,0], buttons:Array.from({length:17},()=>({value:0,pressed:false}))});
    window.reports = [null,pad(1),pad(2)];
    Object.defineProperty(navigator,'getGamepads',{value:()=>window.reports});
    window.press = (index,value) => { window.reports[1].buttons[index]={value,pressed:value>.5}; };
    let frame, time = 0;
    window.requestAnimationFrame = cb => { frame = cb; return 1; };
    window.tick = (n=1) => { for(let i=0;i<n;i++) frame(time+=1000/60); };
  });
  await page.goto(process.argv[2]);
  const tick = n => page.evaluate(n=>window.tick(n),n);
  const press = (i,v) => page.evaluate(([i,v])=>window.press(i,v),[i,v]);
  const phase = () => page.locator('body').getAttribute('data-phase');
  const click = id => page.locator('#'+id).click({force:true});
  await page.waitForFunction(()=>document.querySelector('#status').textContent==='Race selection');
  // Only the owning pad may operate the picker, even when another slot is highlighted.
  async function tapPad(slot, button) {
    await page.evaluate(([slot,button])=>{
      const buttons=window.reports[slot].buttons;
      window.tick(); // Fresh neutral before the next edge, including after modal transitions.
      buttons[button]={value:1,pressed:true}; window.tick();
      buttons[button]={value:0,pressed:false}; window.tick();
    },[slot,button]);
  }
  async function focusWithPad(id) {
    for (let i=0; i<16; i++) {
      if (await page.evaluate(()=>document.activeElement.id)===id) return;
      await tapPad(1,13); // D-pad down through visible controls.
    }
    assert.fail('Owner could not navigate to '+id);
  }
  const picker=page.locator('#controller-dialog'), device=page.locator('#driver-device');
  await click('controllers'); await device.selectOption('pad-1'); await click('use-device');
  await focusWithPad('controllers'); await tapPad(1,0);
  assert(await picker.isVisible(),'owner can open the picker');
  await tapPad(1,15);
  assert.equal(await device.inputValue(),'pad-2','owner can preview another slot with D-pad right');
  await tapPad(2,1); assert(await picker.isVisible(),'previewed pad cannot dismiss the picker');
  await tapPad(1,1); assert(!(await picker.isVisible()),'owner can dismiss with Back');
  await focusWithPad('controllers'); await tapPad(1,0);
  assert.equal(await device.inputValue(),'pad-1','Back preserved the original owner');
  await tapPad(1,15); await focusWithPad('close-controller'); await tapPad(1,0);
  assert(!(await picker.isVisible()),'owner can confirm Cancel');
  await focusWithPad('controllers'); await tapPad(1,0);
  assert.equal(await device.inputValue(),'pad-1','Cancel preserved the original owner');
  await tapPad(1,1);
  await click('controllers');
  await page.selectOption('#driver-device','pad-1');
  await press(0,1); await press(7,1); await click('use-device');
  await click('start'); await tick(3);
  assert.equal(await phase(),'grid');
  await page.keyboard.press('w'); assert.equal(await phase(),'grid');
  await press(0,0); await press(7,0); await tick(2);
  await press(0,1); await tick(2);
  assert.equal(await phase(),'countdown');
  await press(0,0); await tick(2);
  const advance = async steps => page.evaluate(steps=>{
    // Keep the accelerator within the ordinary bounded catch-up loop.
    for (let i=0; i<steps; i++) window.tick(1);
  },steps);
  await advance(183);
  assert.equal(await phase(),'racing');
  await press(7,.73); await page.evaluate(()=>{reports[1].axes[0]=.32;}); await advance(60);
  assert(Number(await page.locator('#speed').textContent())>0);
  await page.evaluate(()=>{window.removed=reports[1]; reports[1]=null; window.tick();});
  assert.equal(await phase(),'paused');
  const frozen = await page.locator('#timer').textContent();
  await page.evaluate(()=>{reports[2].buttons[9]={value:1,pressed:true}; reports[1]=window.removed; window.tick(3);});
  await click('continue'); await tick(2); assert.equal(await phase(),'paused');
  assert.equal(await page.locator('#timer').textContent(),frozen);
  await click('controllers'); await page.selectOption('#driver-device','pad-1'); await click('use-device');
  await tick(2); await click('continue'); assert.equal(await phase(),'paused','held pedals and steering must release first');
  await press(7,0); await page.evaluate(()=>{
    reports[1].axes[0]=0; window.tick(2);
    // A native dialog close notification can arrive after neutral was observed.
    document.querySelector('#controller-dialog').dispatchEvent(new Event('close'));
  });
  await press(9,1); await tick(2); assert.equal(await phase(),'racing');
  await press(9,0); await tick(2); await press(9,1); await tick(2);
  assert.equal(await phase(),'paused');
  const pausedTime = await page.locator('#timer').textContent();
  await press(9,0); await tick(2);
  await focusWithPad('controllers'); await tapPad(1,0); await tapPad(1,15);
  await tapPad(1,1);
  assert.equal(await phase(),'paused');
  assert.equal(await page.locator('#timer').textContent(),pausedTime,'browsing the picker keeps the race paused');
  await tapPad(1,9); assert.equal(await phase(),'racing','original pad resumes after Back');
  await tapPad(1,9); assert.equal(await phase(),'paused');
  await click('controllers'); await page.selectOption('#driver-device','keyboard'); await click('use-device');
  await click('continue'); assert.equal(await phase(),'racing');
  await page.keyboard.press('Escape'); assert.equal(await phase(),'paused');
  await click('courses'); await click('controllers');
  await page.selectOption('#driver-device','pad-1'); await click('use-device');
  await press(9,0); await tick(2);
  await press(0,1); await tick(2);
  assert.equal(await phase(),'grid','a confirm/pause-only wheel can launch the selected course');
  await press(0,0); await tick(2); await press(0,1); await tick(2);
  assert.equal(await phase(),'countdown');
  await press(0,0); await tick(2); await press(7,1);
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  assert.equal(await phase(),'paused');
  await tick(2); await click('continue'); assert.equal(await phase(),'paused');
  assert.deepEqual(errors,[]);
  // Losing a required track module leaves a readable HTML entry point even
  // on a browser that cannot start the main module graph.
  await page.route('**/tracks/overdrive-speedway.json', route=>route.abort());
  await page.reload();
  assert(await page.locator('#boot-note').isVisible());
  assert(await page.locator('#start').isDisabled());
  console.log('Chromium '+browser.version()+' · synthetic standard pad · owner-only picker navigation, Back and Cancel, held grid buttons, analog drive, disconnect under load, neutral reacquisition, gamepad pause/resume and keyboard handoff passed.');
} finally { await browser.close(); }
