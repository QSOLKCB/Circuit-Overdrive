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
      {id:'Test combined wheel',index:1,axes:[.08,.1],mapping:'',connected:true}
    ].map(p=>({...p,buttons:Array.from({length:12},()=>({value:0,pressed:false}))}));
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
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({browser:browser.version(),url,syntheticReports:['12-button digital','asymmetric wheel with shared pedal axis'],
    checks:['ambiguous capture','overlapping pedal rejection','live normalized preview','neutral save gate','remap','reload','restore defaults','brake range','invert steering','explicit use']}));
} finally { await browser.close(); }
