// SPDX-License-Identifier: Apache-2.0
// Measure native animation intervals while the real game receives keyboard input.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {driverIntent} from './driver.mjs';
import {skywayIntent} from './skyway-driver.mjs';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = new URL(process.argv[2] || 'http://127.0.0.1:8000/');
const night = process.argv.includes('--night');
const reduced = process.argv.includes('--reduced');
const scenic = process.argv.includes('--ridge');
const championship = process.argv.includes('--championship');
const skyway = process.argv.includes('--skyway');
const orbital = process.argv.includes('--orbital');
assert(Number(championship)+Number(scenic)+Number(skyway)+Number(orbital)<=1 && !(night && (skyway || orbital)), 'Select a single course and discipline');
const browser = await chromium.launch({executablePath:process.env.CHROME_BIN,
  args:['--enable-gpu','--use-angle=gl']});
try {
  const page = await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror', error => errors.push(error.message));
  // The runner reads accepted poses to drive the keyboard and identify stations.
  // No benchmark hooks are shipped. The renderer and fixed clock run normally.
  await page.route(new URL('src/main.js',url).href,async route => {
    const response=await route.fetch();
    const source=await response.text();
    const draw=/scene\.draw\(poses,[^\n]+?\);/;
    assert(draw.test(source),'scene timing observation point');
    let observed=source.replace(draw,call=>'window.timeScene(canvas, race.player.distance, () => {'+call+'});');
    if (orbital) {
      const sample='const {command, camera:switchView, recover} = input.sample();';
      const step='stepRocketRace(race,command);';
      assert(observed.includes(sample) && observed.includes(step),'Rocket input and physics observations');
      observed=observed.replace(sample,"if (race.discipline==='rocket' && race.phase==='racing') window.orbitalPilot(race.player,canvas);\n"+sample)
        .replace(step,'window.timeRocketStep(race,()=>'+step.slice(0,-1)+');');
    }
    await route.fulfill({response,body:observed+'\nwindow.observeRace=()=>race;'});
  });
  // Use the rendered, interpolated car centres and actual camera frustum to
  // select six-car opening intervals. This observation exists only in the runner.
  await page.route(new URL('src/scene.js',url).href,async route => {
    const response=await route.fetch();
    const source=await response.text(), begin='lastMode=mode;';
    assert.ok(source.includes(begin),'camera observation point');
    await route.fulfill({response,body:source.replace(begin,
      begin+' window.frameCamera=view; window.frameCars=poses;')});
  });
  await page.addInitScript({content:'window.driveKeyboard = (' + driverIntent.toString() + ');'});
  if (skyway) await page.addInitScript({content:'window.driveSkyway = ('+skywayIntent.toString()+');'});
  // Time command submission separately from GPU execution. Sample GPU work
  // asynchronously and discard outstanding queries if the GPU clock is disjoint.
  await page.addInitScript(() => {
    const rows=window.sceneTiming=[];
    let ext, frames=0;
    const pending=[];
    window.timeScene=(canvas,station,draw)=>{
      const gl=canvas.getContext('webgl');
      if(ext===undefined) ext=gl.getExtension('EXT_disjoint_timer_query');
      if(ext && pending.length){
        if(gl.getParameter(ext.GPU_DISJOINT_EXT)){
          for(const item of pending.splice(0)) ext.deleteQueryEXT(item.query);
        }else while(pending.length && ext.getQueryObjectEXT(pending[0].query,ext.QUERY_RESULT_AVAILABLE_EXT)){
          const {row,query}=pending.shift();
          row.gpu=ext.getQueryObjectEXT(query,ext.QUERY_RESULT_EXT)/1e6;
          ext.deleteQueryEXT(query);
        }
      }
      const query=ext && frames++%8===0 && pending.length<4 && ext.createQueryEXT();
      if(query) ext.beginQueryEXT(ext.TIME_ELAPSED_EXT,query);
      const start=performance.now();
      draw();
      const row={station,cpu:performance.now()-start};
      if(query){
        ext.endQueryEXT(ext.TIME_ELAPSED_EXT);
        pending.push({query,row});
      }
      if(document.body.dataset.phase==='racing') rows.push(row);
    };
  });
  // Supply only the test pilot over the same origin. All game and vendor
  // modules, including the course geometry used by the pilot, come from the package.
  if (orbital) {
    const driver=await readFile(new URL('./orbital-driver.mjs',import.meta.url),'utf8');
    await page.route(new URL('tests/orbital-driver.mjs',url).href,route=>
      route.fulfill({contentType:'text/javascript',body:driver}));
    await page.addInitScript(()=>{
      window.rocketPhysics=[];
      window.timeRocketStep=(race,step)=>{
        const previous=race.player.vehicle, started=performance.now();
        step();
        const ms=performance.now()-started, player=race.player, body=player.vehicle;
        if(race.phase==='racing' && body.tick>previous.tick) window.rocketPhysics.push({station:player.distance,ms,
          racingCars:race.entrants.filter(e=>e.finishTicks===null).length,
          attached:body.attached,air:body.airTicks>0,landed:body.grounded && previous.airTicks>0,
          dodge:body.dodgeApplied,boost:body.boosting});
      };
    });
  }
  await page.goto(url.href);
  if (orbital) await page.evaluate(async()=>{
    const {orbitalDrive}=await import('./tests/orbital-driver.mjs');
    let held=new Set();
    window.orbitalPilot=(player,canvas)=>{
      const command=orbitalDrive(player), wanted=new Set();
      for(const [active,code] of [[command.throttle,'KeyW'],[command.brake,'KeyS'],[command.steer<0,'KeyA'],
        [command.steer>0,'KeyD'],[command.boost,'ShiftLeft'],[command.dodge<0,'KeyQ'],[command.dodge>0,'KeyE']]) {
        if(active) wanted.add(code);
      }
      const key=(type,code)=>canvas.dispatchEvent(new KeyboardEvent(type,{code,bubbles:true,cancelable:true}));
      for(const code of held) if(!wanted.has(code)) key('keyup',code);
      for(const code of wanted) if(!held.has(code)) key('keydown',code);
      held=wanted;
    };
  });
  await page.locator('#start').waitFor();
  const chromeHeight = await page.locator('#world').evaluate(canvas => innerHeight-canvas.clientHeight);
  await page.setViewportSize({width:1920,height:1080+chromeHeight});
  if (scenic) await page.locator('#choose-ridge').click();
  if (skyway) await page.locator('#choose-skyway').click();
  if (orbital) await page.locator('#choose-orbital').click();
  if (night) await page.locator('#choose-night').click();
  if (reduced) {
    await page.locator('#settings').click();
    await page.locator('#effects-quality').selectOption('reduced');
    await page.locator('#close-settings').click();
  }
  if (championship) {
    await page.locator('#enter-woc').click();
    await page.locator('#woc-new').click();
    await page.locator('#woc-grid').click();
  } else await page.locator('#start').click();
  await page.keyboard.press('w');
  await page.waitForFunction(() => document.body.dataset.phase === 'racing');
  const sample = await page.evaluate(async ({scenic,skyway,orbital}) => {
    const canvas=document.querySelector('#world'), gl=canvas.getContext('webgl');
    const debug=gl.getExtension('WEBGL_debug_renderer_info');
    const renderer=debug && gl.getParameter(debug.UNMASKED_RENDERER_WEBGL);
    const race=window.observeRace(), course=race.course;
    const segment=(first,last=first)=>[first===last ? first : first+' through '+last,
      course.sections.find(s=>s.id===first).start,course.sections.find(s=>s.id===last).end];
    const sections=orbital ? [
      segment('mass-driver'),segment('azimuth-bank','counterbank'),segment('radial-elbow'),segment('antenna-wall'),
      segment('crown-elbow'),segment('inverted-spine'),segment('return-elbow','earthward-wall'),
      segment('gravity-well','escape-bank'),segment('launch-apron','catch-deck')
    ] : skyway ? [
      ['six-car grid',-62,10],['copper drift bend',165,325],['boost straight',355,465],
      ['Copper Step launch and catch',475,555],['Signal Crown launch and catch',945,1040],
      ['final ramp approach and landing',1430,1580]
    ] : scenic ? [
      ['six-car start',-60,5],['open descent',400,565],['forest',860,1180],
      ['bridge',...course.features.bridge],['tunnel',...course.features.tunnel]
    ] : [['speedway six-car grid',-60,0],['six-car close racing',0,72],['speedway banked turn',180,263]];
    const intervals=sections.map(()=>[]);
    const simulationTicks=sections.map(()=>0), maxTicksPerFrame=sections.map(()=>0);
    let last, lastTick, previousSection, held=new Set();
    function allInView() {
      const {eye,target,fov,roll}=window.frameCamera;
      const dx=target[0]-eye[0],dy=target[1]-eye[1],dz=target[2]-eye[2];
      const horizontal=Math.hypot(dx,dz), length=Math.hypot(horizontal,dy);
      const rightX=-dz/horizontal, rightZ=dx/horizontal;
      const slope=Math.tan(fov/2), aspect=canvas.width/canvas.height;
      return window.frameCars.every(p=>{
        const x=p.x-eye[0], y=p.y-eye[1], z=p.z-eye[2];
        const depth=(x*dx+y*dy+z*dz)/length;
        const altitude=(horizontal*y-(x*dx+z*dz)*dy/horizontal)/length;
        const lateral=x*rightX+z*rightZ,c=Math.cos(roll),s=Math.sin(roll);
        return !p.finished && depth>.13 && Math.abs(lateral*c+altitude*s)<depth*slope*aspect &&
          Math.abs(altitude*c-lateral*s)<depth*slope;
      });
    }
    const deadline=performance.now()+250000;
    await new Promise((resolve,reject)=>{
      function frame(now) {
        if (race.phase !== 'racing' || performance.now()>deadline) {
          reject(Error('Frame test stopped at station '+race.player.current.s)); return;
        }
        const p=race.player.current;
        if (!orbital) {
          const intent=skyway ? window.driveSkyway(race.player,course) : window.driveKeyboard(p,30,0,course);
          const wanted=new Set();
          if (intent.throttle) wanted.add('KeyW');
          if (intent.brake) wanted.add('KeyS');
          if (intent.steer<0) wanted.add('KeyA');
          if (intent.steer>0) wanted.add('KeyD');
          if (intent.drift) wanted.add('Space');
          if (intent.boost) wanted.add('ShiftLeft');
          const key=(type,code)=>canvas.dispatchEvent(new KeyboardEvent(type,{code,bubbles:true,cancelable:true}));
          for(const code of held) if(!wanted.has(code)) key('keyup',code);
          for(const code of wanted) if(!held.has(code)) key('keydown',code);
          held=wanted;
        }
        const station=race.player.distance;
        let section=sections.findIndex(([,start,end])=>station>=start && station<end);
        if(!orbital && section===0 && !allInView()) section=-1;
        if(!orbital && !skyway && !scenic && section===1){
          const distances=race.entrants.filter(e=>e!==race.player)
            .map(e=>Math.hypot(e.current.x-p.x,e.current.z-p.z));
          if(p.speed<16 || Math.max(...distances)>50 || Math.min(...distances)>18) section=-1;
        }
        if (section>=0 && section===previousSection) {
          intervals[section].push(now-last);
          const ticks=race.elapsedTicks-lastTick;
          simulationTicks[section]+=ticks;
          maxTicksPerFrame[section]=Math.max(maxTicksPerFrame[section],ticks);
        }
        lastTick=race.elapsedTicks;
        last=now; previousSection=section;
        if (station>=sections.at(-1)[2]) resolve();
        else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
    const source=document.querySelector('meta[name=game-revision]').content;
    const n=race.player.nitro;
    return {renderer,source,profile:'high',effects:document.body.dataset.effects,width:gl.drawingBufferWidth,height:gl.drawingBufferHeight,
      ...(orbital ? {fieldSize:race.entrants.length,playerGates:race.player.nextGate,remainingEnergy:race.player.vehicle.energy,recoveries:race.player.recoveries} : {}),
      ...(skyway ? {fieldSize:race.entrants.length,nitro:{charged:n.chargedTotal,spent:n.spentTotal,
        launches:n.launches,landings:n.landings,stunts:n.stunts,recoveries:race.player.recoveries}} : {}),
      sections:sections.map(([section],i)=>{
        const sorted=intervals[i].sort((a,b)=>a-b), samples=sorted.length;
        const seconds=sorted.reduce((a,b)=>a+b,0)/1000;
        const percentile=f=>sorted[Math.ceil(samples*f)-1];
        const timing=window.sceneTiming.filter(row=>row.station>=sections[i][1] && row.station<sections[i][2]);
        const physics=(window.rocketPhysics||[]).filter(row=>row.station>=sections[i][1] && row.station<sections[i][2]);
        const costs=(field,rows=timing)=>{
          const values=rows.map(r=>r[field]).filter(Number.isFinite).sort((a,b)=>a-b);
          return values.length ? {samples:values.length,medianMs:values[Math.ceil(values.length*.5)-1],
            p95Ms:values[Math.ceil(values.length*.95)-1],maxMs:values.at(-1)} : null;
        };
        const activeTicks=key=>physics.filter(t=>t[key]).length;
        const rocket=orbital ? {physicsCpu:costs('ms',physics),minimumRacingCars:Math.min(...physics.map(t=>t.racingCars)),
          attachedTicks:activeTicks('attached'),
          airborneTicks:activeTicks('air'),landingTicks:activeTicks('landed'),
          boostTicks:activeTicks('boost'),dodgeTicks:activeTicks('dodge')} : {};
        return {section,samples,seconds,...rocket,cpuSubmission:costs('cpu'),gpuDraw:costs('gpu'),simulationTicks:simulationTicks[i],maxTicksPerFrame:maxTicksPerFrame[i],meanFps:samples/seconds,medianMs:percentile(.5),
          p95Ms:percentile(.95),maxMs:sorted.at(-1)};
      })};
  },{scenic,skyway,orbital});
  assert.deepEqual(errors,[]);
  assert(sample.renderer && !/swiftshader|llvmpipe|software/i.test(sample.renderer),'native GPU required: '+sample.renderer);
  assert.equal(sample.width,1920);
  assert.equal(sample.height,1080);
  assert(sample.sections.every(s=>s.samples>=60),'insufficient frame intervals');
  if(process.env.REPLAY_REVISION) assert.equal(sample.source,process.env.REPLAY_REVISION);
  if(skyway) {
    assert.equal(sample.fieldSize,6);
    assert(sample.nitro.charged>0 && sample.nitro.spent>0 && sample.nitro.landings>0,'timed an active stunt race');
  }
  if(orbital) {
    assert.equal(sample.fieldSize,6);
    assert.equal(sample.recoveries,0);
    assert(sample.sections.every(s=>s.minimumRacingCars===6),'all timing windows must exercise six unfinished cars');
    const wall=sample.sections.find(s=>s.section==='antenna-wall'), ceiling=sample.sections.find(s=>s.section==='inverted-spine');
    assert(wall.attachedTicks>60 && ceiling.attachedTicks>60,'timed physical surface attachment');
    const transfer=sample.sections.at(-1);
    assert(transfer.boostTicks && transfer.airborneTicks && transfer.dodgeTicks && transfer.landingTicks,'timed jump and catch');
  }
  console.log(JSON.stringify({browser:browser.version(),environment:night?'night':'day',event:championship?'Overdrive Opening Cup':'standalone',course:orbital?'orbital':skyway?'skyway':scenic?'ridge':'speedway',...sample},null,2));
} finally { await browser.close(); }
