// SPDX-License-Identifier: Apache-2.0
// Probe real Speedway triangles in isolation. Camera and base lighting stay
// fixed throughout each sequence; no car, lamp sprite or HUD is submitted.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url=new URL(process.argv[2] || 'http://127.0.0.1:8000/');
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN,
  args:process.env.NATIVE_GL==='1'?['--enable-gpu','--use-angle=gl']:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
  const page=await browser.newPage();
  const dependencies=[];
  page.on('response',response=>{
    const {pathname,origin}=new URL(response.url());
    assert.equal(origin,url.origin);
    if(/\.(js|json)$/.test(pathname)) dependencies.push(response.body().then(data=>[
      pathname.slice(url.pathname.length),createHash('sha256').update(data).digest('hex')]));
  });
  await page.route(new URL('headlight-probe',url).href,route=>route.fulfill({contentType:'text/html',
    body:'<!doctype html><style>canvas{width:640px;height:360px}</style><canvas></canvas>'}));
  await page.goto(new URL('headlight-probe',url).href);
  const sample=await page.evaluate(async()=>{
    const {LitRenderer}=await import('./vendor/vanillajs/modules/render-lit/index.js');
    const {track}=await import('./src/track.js');
    const {speedwayBatches}=await import('./src/speedway.js');
    const {rideHeight}=await import('./src/sim.js');
    const {lookAt}=await import('./src/camera.js');
    const {headlightSource,createHeadlightPass}=await import('./src/headlights.js');
    const canvas=document.querySelector('canvas'), renderer=new LitRenderer(canvas), gl=renderer.gl;
    const asphalt=speedwayBatches().filter(b=>b.material.pattern==='asphalt');
    const meshes=asphalt.map(b=>renderer.mesh(b.vertices));
    const pass=createHeadlightPass(gl,asphalt);
    const settings={fov:.94,near:.13,far:450,ambient:.15,sunColor:[.035,.045,.069],
      skyTop:[.015,.02,.05],skyBottom:[.04,.05,.09],fogDensity:0};
    const stats=[],images={};
    for(const station of [0,210]) {
      const road=track.sample(station), beyond=track.sample(station+19);
      const eye=[road.x-9*road.tx,road.y+8,road.z-9*road.tz];
      const orientation=lookAt(eye,[beyond.x,beyond.y,beyond.z]);
      const src=(yaw,lateral=0)=>{
        const p=track.sample(station,lateral);
        return headlightSource({...p,y:p.y+rideHeight,pitch:0,roll:p.bank,yaw:p.yaw+yaw});
      };
      function raster(lights,save) {
        renderer.begin(eye,orientation,settings);
        for(const [i,b] of asphalt.entries()) renderer.draw(meshes[i],{material:b.material});
        pass.draw(lights,eye,orientation,settings,()=>true);
        const pixels=new Uint8Array(canvas.width*canvas.height*4);
        gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
        if(save) images[save]=canvas.toDataURL('image/webp',.90).split(',')[1];
        if(gl.getError()!==gl.NO_ERROR) throw Error('Headlight depth pass generated a WebGL error');
        return pixels;
      }
      const off=raster([],station?'bank-off':null);
      function gain(frame) {
        let energy=0,xSum=0,lit=0,peak=0;
        for(let i=0;i<off.length;i+=4) {
          const delta=frame[i]-off[i];
          if(delta<5) continue;
          energy+=delta; xSum+=(i/4%canvas.width)*delta; lit++;
          peak=Math.max(peak,delta);
        }
        return {lit,centre:xSum/energy,peak};
      }
      const left=gain(raster([src(.27)],station?'bank-left':null));
      const right=gain(raster([src(-.27)],station?'bank-right':null));
      const translated=gain(raster([src(.27,4)],null));
      const reversed=gain(raster([src(Math.PI)],null));
      const removed=gain(raster([],null));
      stats.push({station,bank:road.bank,left,right,translated,reversed,removed});
    }
    pass.dispose(); renderer.dispose();
    const info=gl.getExtension('WEBGL_debug_renderer_info');
    return {images,stats,renderer:info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL)};
  });
  for(const row of sample.stats) {
    assert.ok(row.left.lit>800 && row.right.lit>800,'a substantial surface is lit');
    assert.ok(row.right.centre-row.left.centre>25,'rotating the source moves the bright region');
    assert.ok(row.translated.centre-row.left.centre>10,'translating the source moves the bright region');
    assert.equal(row.reversed.lit,0,'a reversed source leaves forward pavement dark');
    assert.equal(row.removed.lit,0,'removing the source restores baseline road pixels');
  }
  assert.ok(Math.abs(sample.stats[1].bank)>.05,'the second test is on a physical bank');
  const {images,...measurement}=sample;
  measurement.browser=browser.version();
  measurement.modules=Object.fromEntries((await Promise.all(dependencies)).sort());
  const output=process.env.EVIDENCE_DIR;
  if(output) {
    await mkdir(output,{recursive:true});
    for(const [name,image] of Object.entries(images)) await writeFile(join(output,name+'.webp'),Buffer.from(image,'base64'));
    await writeFile(join(output,'headlight-proof.json'),JSON.stringify(measurement,null,2)+'\n');
  }
  console.log(JSON.stringify(measurement,null,2));
} finally { await browser.close(); }
