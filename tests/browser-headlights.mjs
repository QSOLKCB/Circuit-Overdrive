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
    assert.ok(pathname.startsWith(url.pathname),'request escaped the hosted subpath');
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
    const stats=[],images={},calibration={};
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
    // Keep the receiver and camera fixed on asphalt inside the grid straight.
    // Aim the source through the sample with constant incidence while varying
    // distance; then vary only its axis. This separately exercises distance,
    // angular penumbra, the hard outer boundary and nearby barrier response.
    const {perspective,viewMatrix,multiplyMatrices}=await import('./vendor/vanillajs/modules/math/index.js');
    function patchProbe(rows,eye,point) {
      const q=lookAt(eye,point);
      const handles=rows.map(b=>renderer.mesh(b.vertices)), pass=createHeadlightPass(gl,rows);
      const vp=multiplyMatrices(perspective(settings.fov,canvas.width/canvas.height,settings.near,settings.far),
        viewMatrix(eye,q));
      const clip=k=>vp[k]*point[0]+vp[k+4]*point[1]+vp[k+8]*point[2]+vp[k+12];
      const x=Math.floor((clip(0)/clip(3)+1)*canvas.width/2);
      const y=Math.floor((clip(1)/clip(3)+1)*canvas.height/2);
      const pixels=new Uint8Array(36);
      function red(lights) {
        renderer.begin(eye,q,settings);
        for(const [i,b] of rows.entries()) renderer.draw(handles[i],{material:b.material});
        pass.draw(lights,eye,q,settings,()=>true);
        gl.readPixels(x-1,y-1,3,3,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
        return pixels.filter((_,i)=>i%4===0).reduce((a,b)=>a+b,0)/9;
      }
      const baseline=red([]);
      return {gain:source=>red([source])-baseline,dispose(){
        pass.dispose(); for(const handle of handles) renderer.deleteMesh(handle);
      }};
    }
    const t=track.sample(20,2), asphaltPoint=[t.x,t.y,t.z];
    const unit=v=>{const length=Math.hypot(...v);return v.map(c=>c/length);};
    const ray=unit([t.tx,-.055,t.tz]);
    const target=patchProbe(asphalt,[t.x,t.y+8,t.z+2],asphaltPoint);
    function aimed(d,degrees=0) {
      const angle=degrees*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
      return {position:asphaltPoint.map((v,i)=>v-ray[i]*d),
        direction:[ray[0]*c+ray[2]*s,ray[1],ray[2]*c-ray[0]*s]};
    }
    const valid=aimed(12);
    for(const bad of [[valid,valid,valid],[{...valid,position:[0,Infinity,0]}],
      Array(1),[{...valid,position:[0,,0]}],[{...valid,direction:[0,0,'1']}],
      [{...valid,direction:[0,NaN,0]}],[{...valid,direction:[0,0,0]}]]) {
      let rejected=false;
      try { pass.draw(bad,[0,0,0],[0,0,0,1],settings,()=>true); }
      catch(error) { if(error instanceof RangeError) rejected=true; else throw error; }
      if(!rejected) throw Error('Malformed dynamic source reached the draw path');
    }
    calibration.distance=[10,30,50,66,74].map(d=>target.gain(aimed(d)));
    calibration.angle=[0,12,20,26,32].map(degrees=>target.gain(aimed(24,degrees)));
    target.dispose();
    const rail=track.sample(25,track.barrierOffset), wallPoint=[rail.x,rail.y+.50,rail.z];
    const within=track.sample(15,2), eye=[within.x,within.y+1.3,within.z];
    const detail=speedwayBatches().filter(b=>b.material.roughness===.89);
    const wall=patchProbe(detail,eye,wallPoint);
    const direction=unit(wallPoint.map((v,i)=>v-eye[i]));
    calibration.barrier=wall.gain({position:eye,direction});
    wall.dispose();
    pass.dispose(); renderer.dispose();
    const info=gl.getExtension('WEBGL_debug_renderer_info');
    return {images,stats,calibration,renderer:info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL)};
  });
  for(const row of sample.stats) {
    assert.ok(row.left.lit>800 && row.right.lit>800,'a substantial surface is lit');
    assert.ok(row.right.centre-row.left.centre>25,'rotating the source moves the bright region');
    assert.ok(row.translated.centre-row.left.centre>10,'translating the source moves the bright region');
    assert.equal(row.reversed.lit,0,'a reversed source leaves forward pavement dark');
    assert.equal(row.removed.lit,0,'removing the source restores baseline road pixels');
  }
  assert.ok(Math.abs(sample.stats[1].bank)>.05,'the second test is on a physical bank');
  if(process.env.NATIVE_GL==='1') assert.ok(sample.renderer && !/swiftshader|llvmpipe|software/i.test(sample.renderer));
  const {distance,angle,barrier}=sample.calibration;
  for(let i=1;i<distance.length;i++) assert.ok(distance[i-1]>distance[i]+2,'distance attenuation');
  assert.equal(distance.at(-1),0,'outside the finite beam range');
  assert.ok(Math.abs(angle[0]-angle[1])<4,'inner angular core');
  assert.ok(angle[1]>angle[2]+5 && angle[2]>angle[3]+5,'angular penumbra');
  assert.ok(angle[3]>0 && angle[4]===0,'outer cone boundary');
  assert.ok(barrier>20,'real vertical barrier responds to an aimed source');
  const {images,...measurement}=sample;
  measurement.browser=browser.version();
  measurement.modules=Object.fromEntries((await Promise.all(dependencies)).sort());
  const index=await page.request.get(url.href);
  assert.equal(index.status(),200);
  const source=(await index.text()).match(/<meta name="game-revision" content="([a-f0-9]{40})">/);
  measurement.sourceRevision=source?.[1] ?? null;
  if(process.env.REPLAY_REVISION) assert.equal(measurement.sourceRevision,process.env.REPLAY_REVISION);
  measurement.images=Object.fromEntries(Object.entries(images).map(([name,image])=>[
    name+'.webp',createHash('sha256').update(Buffer.from(image,'base64')).digest('hex')
  ]));
  const output=process.env.EVIDENCE_DIR;
  if(output) {
    await mkdir(output,{recursive:true});
    for(const [name,image] of Object.entries(images)) await writeFile(join(output,name+'.webp'),Buffer.from(image,'base64'));
    await writeFile(join(output,'headlight-proof.json'),JSON.stringify(measurement,null,2)+'\n');
  }
  console.log(JSON.stringify(measurement,null,2));
} finally { await browser.close(); }
