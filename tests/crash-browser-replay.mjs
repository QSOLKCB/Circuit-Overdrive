// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {crashReceipt} from '../src/crash-replay.js';
import {createReplaySession} from '../src/replay-theatre-core.js';

export async function verifyCrashDownloads(page,base,live,revision,dir){
  async function save(id,name){
    const pending=page.waitForEvent('download');await page.locator(id).click();
    const download=await pending,bytes=[];
    assert.equal(download.suggestedFilename(),name);
    for await(const chunk of await download.createReadStream())bytes.push(chunk);
    const data=Buffer.concat(bytes);if(dir)await writeFile(dir+'/'+name,data);return JSON.parse(data);
  }
  const tape=await save('#lab-save','crash-'+live.scenario+'-replay.json');
  const receipt=await save('#lab-receipt','crash-'+live.scenario+'-receipt.json');
  assert.equal(tape.revision,revision);assert.equal(tape.ticks,live.ticks);
  function compareMeasurement(value,actual){
    if(typeof value==='number'){assert(Number.isFinite(actual) && Math.abs(value-actual)<=.50001e-6);return;}
    if(value && typeof value==='object'){
      assert.deepEqual(Object.keys(value),Object.keys(actual));
      for(const key of Object.keys(value))compareMeasurement(value[key],actual[key]);
    }else assert.equal(value,actual);
  }
  compareMeasurement(receipt.contacts,live.contacts);compareMeasurement(receipt.final.cars,live.cars);
  const node=createReplaySession(tape,revision);while(!node.finished)node.advance(61);
  const rebuilt=await crashReceipt(tape,node.race,'Node '+process.version);
  for(const key of ['inputSha256','contactsSha256','finalStateSha256'])assert.equal(rebuilt[key],receipt[key],live.scenario+' '+key);
  assert.equal(rebuilt.final.result,live.result);
  const theatre=await page.context().newPage();
  try{
    await theatre.route(new URL('src/replay-theatre.js',base).href,async route=>{
      const response=await route.fetch();
      return route.fulfill({response,body:await response.text()+'\nwindow.readReconstruction=()=>session.race;'});
    });
    await theatre.goto(new URL('replay-theatre.html',base).href);
    await theatre.locator('#replay-file').setInputFiles({name:'drive.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(tape))});
    await theatre.waitForFunction(()=>document.querySelector('#replay-status').textContent.startsWith('Loaded'));
    if(live.scenario==='opposing')await theatre.locator('#replay-follow').selectOption('1');
    async function seek(tick){
      await theatre.locator('#replay-seek').evaluate((el,t)=>{el.value=t;el.dispatchEvent(new Event('input'));},tick);
      await theatre.waitForFunction(t=>document.querySelector('#theatre-lab-state').textContent.includes('tick '+t+' ·'),tick);
    }
    await seek(live.ticks);assert.match(await theatre.locator('#theatre-lab-state').textContent(),new RegExp(live.result));
    if(live.scenario==='opposing')assert.match(await theatre.locator('#theatre-hit').textContent(),/^Player test car/);
    assert.equal(await theatre.locator('#theatre-impacts option').count(),receipt.impactIds.length);
    await theatre.locator('#theatre-impacts').selectOption(receipt.impactIds[0]);
    await theatre.locator('#theatre-hit-seek').click();
    await theatre.waitForFunction(t=>document.querySelector('#theatre-lab-state').textContent.includes('tick '+t+' ·'),live.firstImpact);
    await seek(live.firstImpact-1);assert.equal(await theatre.locator('#theatre-impacts option').count(),0);
    await seek(live.ticks);
    const rebuiltLive=await theatre.evaluate(()=>{
      const t=window.readReconstruction();return JSON.stringify([t.contacts,t.world.cars,t.result]);
    });
    assert.equal(rebuiltLive,JSON.stringify([live.contacts,live.cars,live.result]),'raw same-browser reconstruction');
  }finally{await theatre.close();await page.bringToFront();}
  return {inputSha256:receipt.inputSha256,finalStateSha256:receipt.finalStateSha256,
    contactsSha256:receipt.contactsSha256,rawTapeSha256:createHash('sha256').update(JSON.stringify(tape)).digest('hex')};
}
