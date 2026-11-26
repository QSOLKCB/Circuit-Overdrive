// SPDX-License-Identifier: Apache-2.0
// Optional targeted browser regression. CDP controls scheduling at an actual
// replay-admission yield, then invokes the actual select control's change handler. No
// vehicle/build/command/result state is injected or replaced.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=new URL(process.argv[2]||'http://127.0.0.1:8772/Circuit-Overdrive/');
const expectStale=process.argv.includes('--expect-stale');
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||undefined,
  args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[];
try{
  const context=await browser.newContext({viewport:{width:1366,height:900}}),page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(new URL('proving-ground.html',base).href);
  const source=await page.locator('meta[name="game-revision"]').getAttribute('content');
  assert.match(source,/^[a-f0-9]{40}$/,'Use the source-stamped standalone package');
  if(process.env.SOURCE_SHA)assert.equal(source,process.env.SOURCE_SHA);
  await page.waitForFunction(()=>document.querySelector('#pg-telemetry').textContent!=='null');
  await page.locator('#pg-build-mode').selectOption('proposed');
  await page.locator('#pg-proposed-slot').selectOption('engine');
  await page.locator('#pg-proposed-part').selectOption('street');
  await page.locator('#pg-test').selectOption('acceleration');
  const session=await context.newCDPSession(page),scripts=[];
  session.on('Debugger.scriptParsed',event=>scripts.push(event));
  await session.send('Debugger.enable');
  const script=scripts.find(script=>script.url===new URL('src/proving-replay.js',base).href);
  assert(script,'Actual replay module must be loaded by the production page');
  const {scriptSource}=await session.send('Debugger.getScriptSource',{scriptId:script.scriptId});
  const lines=scriptSource.split('\n'),lineNumber=lines.findIndex(line=>line.includes('while(!playback.done)'));
  assert(lineNumber>=0,'Locate the actual admission loop');
  const columnNumber=lines[lineNumber].indexOf('await yieldTask()');
  assert(columnNumber>=0,'Pause immediately before the first admission yield');
  const {breakpointId}=await session.send('Debugger.setBreakpointByUrl',{
    url:script.url,lineNumber,columnNumber,condition:"tape.build.parts.engine === 'street'"});
  const paused=new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error('Proposed recording did not reach its admission yield')),30000);
    session.once('Debugger.paused',event=>{clearTimeout(timeout);resolve(event);});
  });
  await page.locator('#pg-compare').click();
  const event=await paused,frame=event.callFrames[0];
  await session.send('Debugger.removeBreakpoint',{breakpointId});
  const changed=await session.send('Debugger.evaluateOnCallFrame',{callFrameId:frame.callFrameId,
    expression:`(() => {
      const control=document.getElementById('pg-test');
      control.value='braking';control.onchange.call(control,new Event('change',{bubbles:true}));
      return {status:document.getElementById('pg-status').textContent,
        comparison:document.getElementById('pg-comparison').textContent,
        measurements:document.getElementById('pg-measurements').children.length};
    })()`,returnByValue:true});
  assert.equal(changed.exceptionDetails,undefined);
  assert.match(changed.result.value.status,/Selection changed/);
  assert.equal(changed.result.value.comparison,'null');
  assert.equal(changed.result.value.measurements,0);
  await session.send('Debugger.resume');
  // Await a task after the resumed cancellation check and its catch/finally.
  await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,100)));
  const observed=await page.evaluate(()=>({
    test:document.getElementById('pg-test').value,status:document.getElementById('pg-status').textContent,
    comparison:JSON.parse(document.getElementById('pg-comparison').textContent),
    measurements:document.getElementById('pg-measurements').children.length,
    garage:localStorage.getItem('circuit-overdrive.garage.v1')
  }));
  assert.equal(observed.test,'braking');
  assert.equal(observed.garage,null,'A free comparison never creates ownership');
  if(expectStale){
    assert.equal(observed.comparison.testId,'acceleration');
    assert.match(observed.status,/Comparison complete.*Proving replay admission cancelled/);
    assert.equal(observed.measurements,1);
  }else{
    assert.equal(observed.comparison,null,'Cancelled comparison must publish no obsolete result');
    assert.equal(observed.measurements,0,'Cancelled comparison must publish no obsolete table');
    assert.equal(observed.status,changed.result.value.status,'Cancellation must preserve the newer selection status');
  }
  assert.deepEqual(errors,[]);
  const report={source,browser:browser.version(),url:base.href,expectStale,
    scheduling:'Synthetic CDP pause at the proposed recording admission yield; the actual test select value is changed and its registered production onchange handler is invoked while paused (Chrome suppresses DOM event delivery under debugger pause). No simulation state or outcome injection.',
    beforeResume:changed.result.value,observed,errors};
  if(process.env.EVIDENCE_DIR){await mkdir(process.env.EVIDENCE_DIR,{recursive:true});
    await writeFile(join(process.env.EVIDENCE_DIR,'comparison-cancellation-browser.json'),JSON.stringify(report,null,2)+'\n');}
  console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
