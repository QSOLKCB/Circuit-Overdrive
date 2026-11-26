// SPDX-License-Identifier: Apache-2.0
// Real desktop pointer/keyboard navigation plus an explicitly separate check of
// the production controller menu policy. No garage or simulation state injection.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

export async function runProvingMenuEntryChecks(page,base){
  base=new URL(base);
  const viewport=page.viewportSize(),target=new URL('proving-ground.html',base).href;
  assert(viewport&&viewport.width>=1440&&viewport.height>=900,'Exercise the desktop pointer policy, outside the mobile override');
  const raw=()=>page.evaluate(()=>localStorage.getItem('circuit-overdrive.garage.v1'));
  let source;
  async function stamp(){
    const value=(await page.locator('meta[name="game-revision"]').getAttribute('content'))||null;
    if(process.env.SOURCE_SHA)assert.equal(value,process.env.SOURCE_SHA);
    if(source===undefined)source=value;else assert.equal(value,source);
  }
  async function menu(){
    await page.goto(base.href);
    await page.waitForFunction(()=>document.body.dataset.phase==='menu'&&!document.getElementById('enter-garage').disabled);
    await stamp();assert.equal(await raw(),null,'Menu admission cannot create a garage');
  }
  async function admitted(){
    await page.waitForURL(target);
    await page.waitForFunction(()=>{
      try{const t=JSON.parse(document.getElementById('pg-telemetry').textContent);
        return t.modelId==='cinder-two'&&t.ownedVehicleId===null&&t.ticks===0&&t.paused;}
      catch{return false;}
    });
    await stamp();assert.equal(await raw(),null,'Free facility admission cannot create ownership or money');
    const telemetry=JSON.parse(await page.locator('#pg-telemetry').textContent());
    assert.equal(telemetry.buildMode,'stock');
    assert.equal(await page.locator('#pg-arm').isEnabled(),true);
    return {url:page.url(),modelId:telemetry.modelId,ownedVehicleId:telemetry.ownedVehicleId,
      buildMode:telemetry.buildMode,ticks:telemetry.ticks,paused:telemetry.paused,garage:null};
  }
  await menu();
  // Normal Playwright hit testing must pass. A forced or DOM-synthetic click
  // would bypass the inherited pointer-events regression being tested here.
  await page.locator('#enter-proving-ground').click({timeout:5000});
  const pointer=await admitted();

  await menu();await page.locator('#enter-garage').focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'enter-proving-ground');
  await page.keyboard.press('Enter');const keyboard=await admitted();

  await menu();await page.locator('#enter-garage').focus();
  const moduleUrl=new URL('src/controller-menu.js',base).href;
  const policy=await page.evaluate(async url=>{
    const {menuAction}=await import(url),handled=menuAction('down');
    return {handled,focused:document.activeElement.id};
  },moduleUrl);
  assert.deepEqual(policy,{handled:true,focused:'enter-proving-ground'});
  await page.evaluate(async url=>{const {menuAction}=await import(url);menuAction('confirm');},moduleUrl);
  const controllerPolicy=await admitted();
  return {source,sourceBound:source!==null,viewport,pointer,keyboard,controllerPolicy,
    controllerPolicyScope:'Production menuAction navigation/confirmation invoked on the real page DOM; this is not physical gamepad-device certification.'};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
  const base=new URL(process.argv[2]||'http://127.0.0.1:8773/Circuit-Overdrive/');
  const native=process.env.NATIVE_GL==='1',evidence=process.env.EVIDENCE_DIR,errors=[];
  const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||undefined,
    args:native?[]:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1080}});
    await context.route('**/*',route=>{
      const url=route.request().url();
      if(url.startsWith(base.href)||url.startsWith('data:')||url.startsWith('blob:'))return route.continue();
      errors.push('Unexpected network request '+url);return route.abort();
    });
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    page.on('response',response=>{if(response.status()>=400)errors.push(response.status()+' '+response.url());});
    const observations=await runProvingMenuEntryChecks(page,base);assert.deepEqual(errors,[]);
    const report={kind:'proving-menu-entry-v1',browser:browser.version(),url:base.href,
      rendererMode:native?'Native Chrome requested':'Software WebGL functional navigation check',...observations,errors};
    if(evidence){await mkdir(evidence,{recursive:true});await writeFile(join(evidence,'proving-menu-entry.json'),JSON.stringify(report,null,2)+'\n');}
    console.log(JSON.stringify(report,null,2));
  }finally{await browser.close();}
}
