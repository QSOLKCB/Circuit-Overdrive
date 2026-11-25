// SPDX-License-Identifier: Apache-2.0
// Serve the static game and pass its site URL. Browser events drive the UI;
// controlled frame timestamps keep the fixed-clock assertions repeatable.
import assert from 'node:assert/strict';
import {STANDARD_BUTTONS} from '../src/gamepad.js';
import {installReplayController,observeDrivingCommands} from './browser-controller-driver.mjs';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url=new URL('total-destruction.html',process.argv[2] || 'http://127.0.0.1:8000/');
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN,
  args:process.env.NATIVE_GL==='1' ? ['--enable-gpu','--use-angle=gl'] : ['--use-angle=swiftshader','--enable-unsafe-swiftshader']});

async function scenario(source,run){
  const page=await browser.newPage({viewport:{width:960,height:720}});
  page.setDefaultTimeout(8000);
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    let frame,timestamp=0;
    window.requestAnimationFrame=callback=>{frame=callback;return 1;};
    window.advanceFrame=(ticks=1)=>frame(timestamp+=ticks*1000/60);
  });
  try{
    await installReplayController(page,source);
    if(source==='keyboard')await observeDrivingCommands(page);
    const response=await page.goto(url.href);
    assert.equal(response?.status(),200);
    const phase=()=>page.locator('body').getAttribute('data-phase');
    const tick=()=>page.locator('body').getAttribute('data-tick');
    const focus=()=>page.evaluate(()=>document.activeElement.id);
    const advance=(count=1,ticks=1)=>page.evaluate(({count,ticks})=>{
      for(let i=0;i<count;i++)window.advanceFrame(ticks);
    },{count,ticks});
    await advance(1,0);
    assert.equal(await phase(),'menu');
    await run({page,phase,tick,focus,advance});
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
}

async function keyboard({page,phase,tick,focus,advance}){
  await page.locator('#derby-arm').click();
  assert.equal(await phase(),'grid');
  await page.locator('#derby-arm').click();
  assert.equal(await phase(),'countdown');
  await advance(37,5);
  assert.equal(await phase(),'running');
  assert.equal(await focus(),'derby-world');

  const throttle=()=>page.evaluate(()=>window.observedDrivingCommand.throttle);
  await page.keyboard.down('w');
  await advance();
  assert.equal(await throttle(),1);
  const beforeTab=await tick();
  await page.keyboard.press('Tab');
  assert.equal(await focus(),'derby-pause');
  await advance(3);
  assert.equal(await tick(),beforeTab,'Tab to Pause must stop accepted ticks while W is held');
  assert.equal(await phase(),'paused');

  await page.keyboard.press('Enter');
  assert.equal(await phase(),'running','Enter activates the focused Resume button');
  assert.equal(await focus(),'derby-world');
  await advance(2);
  assert.equal(await throttle(),0,'Resume clears the throttle held before Tab');
  await page.keyboard.up('w');
  await page.keyboard.down('w');
  await advance();
  assert.equal(await throttle(),1,'A fresh W press drives again');
  await page.keyboard.up('w');

  const pauseButton=page.locator('#derby-pause');
  await pauseButton.scrollIntoViewIfNeeded();
  const bounds=await pauseButton.boundingBox();
  assert(bounds);
  await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
  await page.mouse.down();
  await advance(3);
  await page.mouse.up();
  assert.equal(await phase(),'paused','A click spanning a frame pauses once');
  assert.equal(await focus(),'derby-pause','A mouse click leaves focus on Resume');
  const pausedTick=await tick();
  await advance(3);
  assert.equal(await tick(),pausedTick);
  await pauseButton.click();
  assert.equal(await phase(),'running','The mouse Resume button still works');
}

async function gamepad({page,phase,tick,focus,advance}){
  await page.locator('#derby-controller').click();
  await page.locator('#driver-device').selectOption('pad-1');
  await page.locator('#use-device').click();
  await advance();

  const press=action=>page.evaluate(index=>{
    const pad=navigator.getGamepads()[1];
    pad.buttons[index]={value:1,pressed:true};
    window.advanceFrame();
    pad.buttons[index]={value:0,pressed:false};
    window.advanceFrame();
  },STANDARD_BUTTONS[action]);
  async function moveTo(id){
    for(let i=0;i<8&&await focus()!==id;i++)await press('down');
    assert.equal(await focus(),id);
  }

  await press('confirm');
  assert.equal(await phase(),'grid');
  assert.equal(await focus(),'derby-world');
  await moveTo('derby-select');
  await press('confirm');
  assert.equal(await phase(),'menu','Confirm on Change arena returns to arena selection');
  assert.equal(await focus(),'derby-arena');

  await page.locator('#derby-arena').selectOption('iron-pit');
  await advance();
  await moveTo('derby-arm');
  await press('confirm');
  assert.equal(await phase(),'grid');
  assert.equal(await focus(),'derby-world');
  await press('confirm');
  assert.equal(await phase(),'countdown','Canvas confirmation still starts the round');
  await advance(37,5);
  assert.equal(await phase(),'running');
  assert(Number(await tick())>0);
  await press('pause');
  assert.equal(await phase(),'paused');

  await moveTo('derby-controller');
  await press('confirm');
  assert.equal(await phase(),'paused','Controller selection keeps the round paused');
  assert.equal(await page.locator('#controller-dialog').evaluate(dialog=>dialog.open),true);
  await page.locator('#close-controller').click();
  await advance();
  await moveTo('derby-pause');
  await press('confirm');
  assert.equal(await phase(),'running','Confirm activates the focused Resume button');
  await advance(); // The released pad re-arms on its first accepted sample.
  await press('pause');
  assert.equal(await phase(),'paused');
  assert(Number(await tick())>0);
  await moveTo('derby-restart');
  await press('confirm');
  assert.equal(await phase(),'grid','Confirm on Restart round resets the grid');
  assert.equal(await tick(),'0');
}

try{
  const failures=[];
  for(const [source,run] of [['keyboard',keyboard],['standard',gamepad]]){
    try{await scenario(source,run);}
    catch(error){failures.push(new Error(source+' derby input',{cause:error}));}
  }
  if(failures.length)throw new AggregateError(failures,'Derby input regressions failed');
  console.log(`Chromium ${browser.version()} · derby keyboard focus, Pause/Resume, and gamepad menu confirmation passed.`);
}finally{await browser.close();}
