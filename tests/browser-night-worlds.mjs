// SPDX-License-Identifier: Apache-2.0
// Exercise the presentation interface independently of UI roll-out. Most frames
// are deliberately posed for inspection; the grid and recovered grid use sim poses.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=new URL(process.argv[2] || 'http://127.0.0.1:8000/Circuit-Overdrive/');
// A reference URL enables day pixel parity between two independently stamped packages.
const reference=process.argv.find(arg=>arg.startsWith('--day-reference='))?.slice('--day-reference='.length);
const evidence=process.env.EVIDENCE_DIR;
if(evidence) await mkdir(evidence,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN,
  args:process.env.NATIVE_GL==='1' ? ['--enable-gpu','--use-angle=gl'] :
    ['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
async function inspect(base,variant) {
  const page=await browser.newPage({viewport:{width:1024,height:576}});
  const url=new URL('night-world-inspection',base), errors=[], captures=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
    const request=route.request().url();
    assert(request.startsWith(base.href),'unexpected asset '+request);
    if(request!==url.href) return route.continue();
    return route.fulfill({contentType:'text/html',body:'<!doctype html><style>*{margin:0}canvas{width:1024px;height:576px}</style><canvas></canvas>'});
  });
  await page.goto(url.href);
  const source=await page.evaluate(async()=>{
    const response=await fetch('./index.html');
    const html=new DOMParser().parseFromString(await response.text(),'text/html');
    return html.querySelector('meta[name=game-revision]').content;
  });
  assert.match(source,/^[0-9a-f]{40}$/,'use a package assembled from an exact committed runtime');
  if(!reference && process.env.REPLAY_REVISION) assert.equal(source,process.env.REPLAY_REVISION);
  const environment=await page.evaluate(async variant=>{
    const {createScene}=await import('./src/scene.js');
    const {track}=await import('./src/track.js'), {ridge}=await import('./src/ridge.js');
    const {createRace,startRace,stepRace,recoverCar,rideHeight}=await import('./src/sim.js');
    const canvas=document.querySelector('canvas');
    let scene,course,race;
    window.openGrid=(grid,requested)=>{
      scene?.dispose();
      race=grid;
      course=grid.course;
      scene=createScene(canvas,course,1,requested);
    };
    window.openCourse=id=>window.openGrid(createRace(27,id==='speedway'?track:ridge),variant);
    window.photo=async(station,reverse,recovery)=>{
      if(recovery) {
        startRace(race);
        while(race.phase==='countdown') stepRace(race,{});
        if(!recoverCar(race) || race.player.recoveries!==1) throw Error('Recovery failed');
      }
      const field=race.entrants.map(e=>{
        const p={...e.current,id:e.id,finished:false};
        if(station===null || recovery) return p;
        const sample=course.sample(station+(e.id-race.player.id)*-9,e.id%2 ? 1.8 : -3.5);
        const [nx,ny,nz]=sample.normal;
        return {...p,x:sample.x,y:sample.y+rideHeight,z:sample.z,groundY:sample.y,
          s:sample.s,lateral:sample.lateral,yaw:sample.yaw+(reverse?Math.PI:0),
          pitch:Math.atan(-(nx*sample.tx+nz*sample.tz)/ny)*(reverse?-1:1),
          roll:sample.bank*(reverse?-1:1),speed:reverse?0:34};
      });
      scene.draw(field,{mode:station===null?'grid':'racing',dt:1/60});
      const gl=canvas.getContext('webgl'), pixels=new Uint8Array(canvas.width*canvas.height*4);
      gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      let bright=0,dark=0,roadBright=0;
      for(let i=0;i<pixels.length;i+=4) {
        const luma=.21*pixels[i]+.72*pixels[i+1]+.07*pixels[i+2];
        if(luma<55) dark++;
        if(luma>95) {bright++;if(i<pixels.length*.52) roadBright++;}
      }
      if(gl.getError()!==gl.NO_ERROR) throw Error('GL error after course draw');
      // Read/encode before awaiting the digest: presenting a frame can clear the backbuffer.
      const uri=variant==='night' ? canvas.toDataURL('image/webp',.91) : null;
      const hash=await crypto.subtle.digest('SHA-256',pixels);
      const rgba256=Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');
      return {uri,bright,dark,roadBright,rgba256,entrants:field.length,playerStation:field[race.player.id].s};
    };
    window.openCourse('speedway');
    const gl=canvas.getContext('webgl'), info=gl.getExtension('WEBGL_debug_renderer_info');
    return {renderer:info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL),version:gl.getParameter(gl.VERSION)};
  },variant);
  for(const [course,sections] of [
    ['speedway',[['grid',null],['bank',208],['backstraight',690],['recovered-grid',null,false,true]]],
    ['ridge',[['descent',430],['forest',1070],['bridge-entry',1792],['bridge',1915],['bridge-exit',2062],
      ['tunnel-entry',3052],['tunnel-inside',3137],['tunnel-exit',3231],['reverse-portal',3255,true]]]
  ]) {
    if(course==='ridge') await page.evaluate(()=>window.openCourse('ridge'));
    for(const [name,s,reverse=false,recovery=false] of sections) {
      const {uri,...stats}=await page.evaluate(args=>window.photo(...args),[s,reverse,recovery]);
      assert.equal(stats.entrants,6);
      if(variant==='night') assert(stats.dark>50000);
      assert(stats.bright>650 && stats.roadBright>120,JSON.stringify({course,name,...stats}));
      const file=course+'-'+name+'.webp';
      if(uri) {
        const data=Buffer.from(uri.split(',')[1],'base64');
        if(evidence) await writeFile(join(evidence,file),data);
        stats.sha256=createHash('sha256').update(data).digest('hex');
      }
      captures.push({file,reverse,recovery,...stats});
    }
  }
  if(variant==='night') {
    const [day,fromNight]=await page.evaluate(async()=>{
      const {skyway}=await import('./src/skyway.js');
      const {createRace}=await import('./src/sim.js');
      const grid=createRace(27,skyway), samples=[];
      for(const request of ['day','night']) {
        window.openGrid(grid,request);
        const {rgba256,bright}=await window.photo(null);
        samples.push({rgba256,bright});
      }
      return samples;
    });
    assert(day.bright>650,'Skyway grid must render visibly');
    assert.equal(fromNight.rgba256,day.rgba256,'Skyway inherits daylight when opened from Nightshift');
  }
  assert.deepEqual(errors,[]);
  await page.close();
  return {source,browser:browser.version(),viewport:[1024,576],...environment,
    poses:'Grid and recovery from simulation. Other captures are controlled placements on sampled course surfaces.',captures};
}
try {
  let report,filename;
  if(reference) {
    const baseline=await inspect(new URL(reference),'day'), candidate=await inspect(base,'day');
    assert.notEqual(candidate.source,baseline.source,'day parity requires two distinct source revisions');
    assert.equal(candidate.renderer,baseline.renderer);
    const hashes=frames=>frames.map(({file,rgba256})=>({view:file.replace('.webp',''),rgba256}));
    const views=hashes(candidate.captures);
    assert.deepEqual(views,hashes(baseline.captures),'day RGBA framebuffer differs from reference');
    report={baseline:baseline.source,candidate:candidate.source,renderer:candidate.renderer,browser:candidate.browser,
      viewport:candidate.viewport,bytesPerFrame:1024*576*4,entrants:6,views};
    filename='day-parity.json';
  } else {
    report=await inspect(base,'night');
    filename='world-inspection.json';
  }
  if(evidence) await writeFile(join(evidence,filename),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
