// SPDX-License-Identifier: Apache-2.0
// Real DOM and local storage with synthetic Gamepad API reports.
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN || undefined,
  args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
  const page=await browser.newPage({viewport:{width:1000,height:700}}), errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    window.padFixture=[
      {id:'Test digital USB',index:0,axes:[],mapping:'',connected:true},
      {id:'Test combined wheel',index:1,axes:[.08,.1],mapping:'',connected:true},
      {id:'Test standard pad',index:2,axes:[0,0],mapping:'standard',connected:true}
    ].map(p=>({...p,buttons:Array.from({length:p.mapping==='standard'?17:12},()=>({value:0,pressed:false}))}));
    Object.defineProperty(navigator,'getGamepads',{value:()=>[...window.padFixture]});
  });
  const id=s=>page.locator('#'+s), click=s=>id(s).click();
  const url=process.argv[2] || 'http://127.0.0.1:8000/';
  await page.goto(url);
  await page.waitForFunction(()=>document.body.dataset.phase==='menu' && !document.getElementById('overlay').offsetWidth);
  const configure=async index=>{
    await click('controllers');
    await id('driver-device').selectOption('pad-'+index);
    await page.locator('#profile-settings summary').click();
  };
  let index=0;
  async function frame(axes=[],buttons=[]) {
    await page.evaluate(async({index,axes,buttons})=>{
      const pad=window.padFixture[index];
      pad.axes=axes;
      pad.buttons=Array.from({length:12},(_,i)=>({value:Number(buttons.includes(i)),pressed:buttons.includes(i)}));
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    },{index,axes,buttons});
  }
  const capture=async(axes,buttons)=>{await frame(axes,buttons);await click('profile-capture');};
  const record=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('circuit-overdrive.controller-profiles')));
  await configure(index);
  assert(await id('use-device').isDisabled());
  await click('profile-calibrate'); await capture([],[]); // neutral
  await frame([],[7,3]); await click('profile-capture');
  assert.match(await id('profile-message').textContent(),/choose an observed movement/i);
  await id('profile-candidates').selectOption('button-7'); await click('profile-capture');
  await capture([],[2]); await capture([],[]); // right, centred
  await capture([],[4]); await capture([],[4]); // overlapping pedal rejected
  assert.match(await id('profile-message').textContent(),/Shared pedals/);
  await capture([],[3]); await capture([],[0]); await capture([],[9]);
  for (let n=0;n<7;n++) await click('profile-skip');
  assert.equal(await record(),null);
  await frame([],[4,7]); assert.match(await id('profile-preview').textContent(),/Steer -1.00 · Throttle 100%/);
  await click('profile-save'); assert.match(await id('profile-message').textContent(),/Release/);
  assert.equal(await record(),null);
  await frame([],[]); await click('profile-save');
  assert.equal((await record()).devices.length,1);
  assert(await id('use-device').isEnabled());
  await id('profile-remap-action').selectOption('camera'); await click('profile-remap');
  await capture([],[]); await capture([],[1]); await frame([],[]); await click('profile-save');
  assert.equal((await record()).devices[0].profile.actions.camera.index,1);
  await click('use-device');
  await page.reload(); await configure(index);
  await frame([],[1]); assert.match(await id('profile-preview').textContent(),/camera/);
  await frame([],[]); await click('profile-defaults');
  assert.equal((await record()).devices.length,1);
  await click('profile-save'); assert.equal((await record()).devices.length,0);
  assert(await id('use-device').isDisabled());
  await click('close-controller');

  index=1; await configure(index); await id('profile-family').selectOption('wheel');
  await click('profile-calibrate'); await capture([.08,.1],[]);
  await capture([.9,.1],[]); await capture([-.8,.1],[]); await capture([.08,.1],[]);
  await capture([.08,-.9],[]); await capture([.08,.95],[]);
  await capture([.08,.1],[1]); await capture([.08,.1],[6]);
  for (let n=0;n<7;n++) await click('profile-skip');
  await frame([.08,.1],[]); assert(await id('profile-decreasing-throttle').isChecked());
  await id('profile-invert-steer').check();
  await id('profile-brakeRange').fill('0.5');
  await frame([.9,.53],[]); assert.match(await id('profile-preview').textContent(),/Steer 1.00 · Throttle 0% · Brake 100%/);
  await frame([.08,.1],[]); await click('profile-save');
  assert(await id('use-device').isEnabled());
  const saved=(await record()).devices[0].profile;
  assert.equal(saved.throttle.index,saved.brake.index); assert.equal(saved.tuning.invertSteer,true);
  await click('use-device');
  // Replace the object between animation frames, as snapshot-based Gamepad
  // implementations can. Calibration clicks must inspect the live slot.
  await configure(index);
  await id('profile-remap-action').selectOption('camera'); await click('profile-remap');
  await capture([.08,.1],[]);
  const ended=await page.evaluate(()=>{
    const pad=window.padFixture[1];
    window.padFixture[1]={...pad,buttons:pad.buttons.map((b,i)=>i===4 ? {value:1,pressed:true} : b)};
    document.getElementById('profile-capture').click();
    return document.getElementById('profile-step').closest('fieldset').hidden;
  });
  assert.equal(ended,true);
  await frame([.08,.1],[]);
  const refused=await page.evaluate(()=>{
    const pad=window.padFixture[1];
    window.padFixture[1]={...pad,axes:[.08,-.9]};
    document.getElementById('profile-save').click();
    return document.getElementById('profile-message').textContent;
  });
  assert.match(refused,/Release/);
  assert.equal((await record()).devices[0].profile.actions.camera,undefined);
  await frame([.08,.1],[]); await click('profile-save');
  assert.equal((await record()).devices[0].profile.actions.camera.index,4);
  for (const [name,button] of [['drift',10],['boost',11],['dodgeLeft',7],['dodgeRight',8]]) {
    await id('profile-remap-action').selectOption(name); await click('profile-remap');
    await capture([.08,.1],[]); await capture([.08,.1],[button]);
    await frame([.08,.1],[]); await click('profile-save');
    const saved=await record();
    assert.equal(saved.version,4);
    assert.equal(saved.devices[0].profile.actions[name].index,button);
  }
  await frame([.08,.1],[10,11]);
  assert.match(await id('profile-preview').textContent(),/drift, boost/);
  await frame([.08,.1],[]);

  // A different id with identical dimensions cannot inherit an active wheel's
  // ownership, even when the browser has not delivered its disconnect event.
  const changed=await page.evaluate(()=>{
    window.padFixture[1]={...window.padFixture[1],id:'Replacement wheel'};
    document.getElementById('profile-save').click();
    return document.getElementById('profile-message').textContent;
  });
  assert.match(changed,/controller changed/);
  await frame([.08,.1],[]);
  assert(await id('use-device').isDisabled());
  await click('close-controller'); await id('start').focus();
  await frame([.08,.1],[1]); await frame([.08,.1],[]);
  assert.equal(await page.locator('body').getAttribute('data-phase'),'menu');
  assert.equal((await record()).devices.length,1);

  // The owner can browse expanded settings. A button being learned must
  // never activate Capture, shift focus, or dismiss the dialog by itself.
  await click('controllers'); await id('driver-device').selectOption('pad-2'); await click('use-device');
  async function ownerButton(button) {
    await page.evaluate(async button=>{
      const pad=window.padFixture[2];
      const frames=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      await frames();
      pad.buttons[button]={value:1,pressed:true}; await frames();
      pad.buttons[button]={value:0,pressed:false}; await frames();
    },button);
  }
  const summary=page.locator('#profile-settings summary');
  const focused=el=>el.evaluate(node=>document.activeElement===node);
  await click('controllers');
  await ownerButton(13); assert(await focused(summary));
  await ownerButton(13); assert(await focused(id('use-device')),'collapsed editor controls are skipped');
  await ownerButton(12); await ownerButton(0);
  assert(await id('profile-settings').evaluate(el=>el.open));
  await ownerButton(13); assert(await focused(id('profile-family')),'owner browses an expanded editor');
  await ownerButton(1); assert(!(await id('controller-dialog').isVisible()));

  await click('controllers'); await summary.click(); await id('profile-calibrate').focus();
  await ownerButton(0);
  assert(!(await id('profile-capture').isVisible()),'owner Confirm cannot start learning its own buttons');
  assert.match(await id('profile-message').textContent(),/click, tap or Enter/);
  await click('profile-calibrate');
  const prompt=await id('profile-step').textContent();
  for (const button of [0,1,13]) await ownerButton(button);
  assert.equal(await id('profile-step').textContent(),prompt);
  assert(await focused(id('profile-capture')),'own raw inputs leave capture and focus untouched');
  await summary.click(); await ownerButton(0);
  assert(await id('profile-settings').evaluate(el=>el.open));
  assert(!(await id('profile-capture').isVisible()),'collapsing discards the unfinished capture');
  await ownerButton(1); assert(!(await id('controller-dialog').isVisible()));

  await configure(1); await id('profile-calibrate').focus(); await ownerButton(0);
  assert(await id('profile-capture').isVisible(),'the owner can calibrate a second device');
  await ownerButton(0); assert.match(await id('profile-step').textContent(),/fully left/);
  await ownerButton(1); assert(!(await id('controller-dialog').isVisible()));
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({browser:browser.version(),url,syntheticReports:['12-button digital','asymmetric wheel with shared pedal axis','standard owner'],
    checks:['ambiguous capture','overlapping pedal rejection','live normalized preview','neutral save gate','remap','reload','restore defaults','brake range','invert steering','explicit use','fresh report between frames','same-slot replacement while editing','expanded editor pad navigation','owner capture isolation','second-device calibration']}));
} finally { await browser.close(); }
