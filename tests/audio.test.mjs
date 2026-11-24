// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_VOLUMES, TouringAudio, TouringVoice} from '../src/audio.js';
import {createRace} from '../src/sim.js';
import {track} from '../src/track.js';
import {ridge} from '../src/ridge.js';

const engine = {engine:1,effects:0}, effects = {engine:0,effects:1};
function entrant({rpm=3000,speed=30,slip=0,lateral=0,grounded=true,brake=0,surfaceId='asphalt'}={}) {
  const p=createRace().player;
  Object.assign(p.vehicle,{rpm,velocity:[0,0,-speed],brake,tick:12});
  for (const wheel of p.vehicle.wheels) Object.assign(wheel,{grounded,load:grounded ? 2943 : 0,
    slip,lateralSpeed:lateral,longitudinalSpeed:speed,surfaceId});
  return p;
}
const rms = samples => Math.sqrt(samples.reduce((sum,v)=>sum+v*v,0)/samples.length);
const difference = (a,b) => rms(a.map((v,i)=>v-b[i]));
const peak = samples => samples.reduce((x,v)=>Math.max(x,Math.abs(v)),0);
function sound(p,levels,throttle=1,course=track) {
  const voice=new TouringVoice(), pcm=new Float32Array(8192);
  voice.accept(p,{throttle},course);
  for(let i=0;i<3;i++) voice.write(pcm,levels);
  return pcm;
}
function magnitude(samples,hz) {
  let re=0,im=0;
  for(let i=0;i<samples.length;i++) {
    const phase=2*Math.PI*i*hz/48000;
    re+=samples[i]*Math.cos(phase);
    im+=samples[i]*Math.sin(phase);
  }
  return 2*Math.hypot(re,im)/samples.length;
}

test('Ignition V8 follows measured RPM, pedal load and the shift interruption with mix headroom',()=>{
  for(const rpm of [850,3100,6300]) {
    const full=sound(entrant({rpm}),engine);
    const firing=rpm*8/120;
    assert(magnitude(full,firing)>.10);
    assert(magnitude(full,firing)>4*magnitude(full,firing*1.24));
    assert(magnitude(full,firing*.5)>.1,'low exhaust bank contributes at half firing frequency');
    assert(peak(full)<.8);
    assert(rms(full)>1.35*rms(sound(entrant({rpm}),engine,0)));
  }
  const p=entrant(), original=structuredClone(p);
  const steady=new TouringVoice(), changing=new TouringVoice();
  const a=new Float32Array(3072), b=new Float32Array(3072);
  for(const voice of [steady,changing]) {voice.accept(p,{throttle:1},track);voice.write(a,engine);}
  p.vehicle.gear=2;p.vehicle.shiftRemaining=.12;
  changing.accept(p,{throttle:1},track);
  steady.write(a,engine);changing.write(b,engine);
  assert(difference(a,b)>.018,'shift transient and clutch lift change PCM');
  original.vehicle.gear=2;original.vehicle.shiftRemaining=.12;
  assert.deepEqual(p,original,'reading audio telemetry preserves the full entrant');
});

test('effects respond to grounded tyre slip, shoulders, brake, contact, speed and tunnel acoustics',()=>{
  const coasting=sound(entrant(),effects);
  const hard=sound(entrant({slip:32,lateral:8}),effects);
  assert(rms(hard)>4*rms(coasting));
  assert(rms(sound(entrant({surfaceId:'apron'}),effects))>2*rms(coasting));
  assert(rms(sound(entrant({brake:1}),effects))>rms(coasting));
  assert.deepEqual(sound(entrant({grounded:false,slip:32,lateral:8}),effects),
    sound(entrant({grounded:false}),effects));
  assert(rms(sound(entrant({speed:50}),effects))>rms(coasting));
  assert.equal(peak(sound(entrant({speed:0}),effects)),0);
  assert.equal(peak(sound(entrant({slip:40,lateral:12}),{engine:0,effects:0})),0);
  const p=entrant({rpm:5100});
  p.current.s=(ridge.features.tunnel[0]+ridge.features.tunnel[1])/2;
  assert(difference(sound(p,engine,1,ridge),sound(p,engine,1,track))>.01);

  const strike=new TouringVoice(), control=new TouringVoice();
  const a=new Float32Array(6144), b=new Float32Array(6144);
  for(const voice of [control,strike]) {voice.accept(p,{},track);voice.write(a,effects);}
  p.vehicle.velocity[0]=6;p.vehicle.tick+=2;
  control.accept(p,{},track);
  p.vehicle.contacts=['guardrail'];
  strike.accept(p,{},track);
  control.write(a,effects);strike.write(b,effects);
  assert(difference(a,b)>.03,'a new physical impact starts a decaying strike');
  p.vehicle.tick+=2;p.vehicle.velocity[0]=0;
  strike.accept(p,{},track);p.vehicle.contacts=[];control.accept(p,{},track);
  for(let i=0;i<3;i++){control.write(a,effects);strike.write(b,effects);}
  assert(difference(a,b)<.0001,'continuous railing does not retrigger the strike');
  const loud=sound(entrant({rpm:6650,brake:1,slip:45,lateral:9,speed:60}),{engine:1,effects:1});
  assert(peak(loud)<.9 && loud.every(Number.isFinite));
});

function device() {
  const ctx={state:'suspended', currentTime:0, buffers:[], sources:[], destination:{}, closed:0};
  const ramps=[];
  ctx.gain={value:0,cancelAndHoldAtTime(){},linearRampToValueAtTime(v,t){ramps.push([v,t]);}};
  ctx.ramps=ramps;
  ctx.createGain=()=>({gain:ctx.gain,connect(){},disconnect(){}});
  ctx.resume=async()=>{ctx.state='running';};
  ctx.close=async()=>{ctx.closed++;ctx.state='closed';};
  ctx.createBuffer=(channels,length,rate)=>{
    assert.equal(channels,1);
    const pcm=new Float32Array(length);
    const buffer={getChannelData:()=>pcm,duration:length/rate};
    ctx.buffers.push(buffer);
    return buffer;
  };
  ctx.createBufferSource=()=>{
    const source={start(t){this.startTime=t;},stop(t){this.stopTime=t;},connect(){},disconnect(){}};
    ctx.sources.push(source);
    return source;
  };
  ctx.advance=seconds=>{
    ctx.currentTime+=seconds;
    for(const s of ctx.sources) if(s.onended && ctx.currentTime>Math.min(s.startTime+s.buffer.duration,s.stopTime??Infinity)) s.onended();
  };
  return ctx;
}

test('gesture-owned device schedules one pooled stream, smooths master, fades on stop and resumes cleanly',async()=>{
  const ctx=device(), p=entrant({slip:30});
  let opened=0;
  const audio=new TouringAudio({contextFactory:()=>{opened++;return ctx;}});
  audio.setVolume('master',.6);
  assert(audio.update(p,{},track));
  assert.equal(opened,0);
  assert(await audio.start());
  audio.update(p,{throttle:.7},track);
  assert.equal(opened,1);
  assert.equal(ctx.ramps.at(-1)[0],.6);
  assert.equal(ctx.buffers.length,4);
  for(let i=0;i<120;i++){ctx.advance(1/60);p.vehicle.tick+=2;assert(audio.update(p,{},track));}
  assert(ctx.sources.length>=31 && ctx.sources.length<=35);
  assert(ctx.sources.filter(s=>s.onended).length<=4);
  assert(ctx.sources.some(s=>peak(s.buffer.getChannelData(0))>0));
  audio.setVolume('master',0);
  assert.equal(ctx.ramps.at(-1)[0],0);
  audio.setVolume('master',DEFAULT_VOLUMES.master);
  audio.stop();
  assert.equal(ctx.ramps.at(-1)[0],0);
  const active=ctx.sources.filter(s=>s.onended);
  assert(active.every(s=>s.stopTime-ctx.currentTime<.02));
  const count=ctx.sources.length;
  audio.update(p,{},track);ctx.advance(.2);
  assert.equal(ctx.sources.length,count);
  assert(await audio.start());
  assert(audio.update(p,{},track));
  assert.equal(ctx.buffers.length,4);
  assert.equal(opened,1);
  assert(ctx.sources.length>count);
  assert.throws(()=>audio.setVolume('engine',NaN),RangeError);
  assert.throws(()=>audio.setVolume('unknown',1),RangeError);
});

test('stop revokes pending starts; refused or interrupted devices remain optional and retryable',async()=>{
  const ctx=device(), p=entrant();
  let finish;
  ctx.resume=()=>new Promise(resolve=>{finish=()=>{ctx.state='running';resolve();};});
  const audio=new TouringAudio({contextFactory:()=>ctx});
  const pending=audio.start();
  audio.stop();finish();
  assert.equal(await pending,false);
  assert(audio.update(p,{},track));
  assert.equal(ctx.sources.length,0);
  const again=audio.start();finish();
  assert(await again);assert(audio.update(p,{},track));
  ctx.state='interrupted';
  assert.equal(audio.update(p,{},track),false);
  assert.equal(ctx.closed,1);

  let attempts=0;
  const recovered=device();
  const retry=new TouringAudio({contextFactory:()=>{
    if(++attempts===1) throw Error('Device refused');
    return recovered;
  }});
  assert.equal(await retry.start(),false);
  assert.equal(retry.update(p,{},track),false);
  assert.equal(attempts,1);
  assert(await retry.start());
  assert(retry.update(p,{},track));
  assert(peak(recovered.sources[0].buffer.getChannelData(0))>0);
});

test('Nitro effects synthesize only accepted transitions and stay on the effects bus',()=>{
  const base={energy:1000,charging:false,boosting:false,airborne:false,launch:false,landed:false,rewarded:false,stunts:0};
  function hear(change, levels=effects, sameTick=false) {
    const p=entrant(),voice=new TouringVoice(), out=new Float32Array(3072);
    p.nitro={...base};
    voice.accept(p,{},track); voice.write(out,levels);
    if (!sameTick) p.vehicle.tick+=2;
    Object.assign(p.nitro,change);
    voice.accept(p,{drift:true,boost:true},track); voice.write(out,levels);
    return out;
  }
  const silent=hear({});
  for(const change of [{charging:true},{boosting:true},{boosting:true,energy:0},{launch:true},
    {airborne:true},{rewarded:true,stunts:1}]) {
    const pcm=hear(change);
    assert(pcm.every(Number.isFinite) && peak(pcm)<.9);
    assert(difference(pcm,silent)>.001);
    assert.deepEqual(hear(change,engine),hear({},engine));
  }
  assert.deepEqual(hear({landed:true}),silent);
  assert.deepEqual(hear({launch:true},effects,true),silent);
  assert(difference(hear({boosting:true}),hear({boosting:true,energy:0}))>.001);
});

test('the landing thump waits for settled wheels and Nitro tones clear on a course switch',()=>{
  const p=entrant(), testVoice=new TouringVoice(), reference=new TouringVoice();
  const a=new Float32Array(3072), b=new Float32Array(3072);
  function accept(stunt) {
    p.vehicle.tick+=2;
    p.nitro=stunt && {energy:5000,stunts:0,...stunt};
    testVoice.accept(p,{},track);
    delete p.nitro;
    reference.accept(p,{},track);
    testVoice.write(a,effects);reference.write(b,effects);
  }
  accept({landed:true}); assert.deepEqual(a,b);
  for(let i=0;i<4;i++) { accept({}); assert.deepEqual(a,b); }
  accept({rewarded:true,stunts:1}); assert(difference(a,b)>.01);
  accept({stunts:1,charging:true,airborne:true}); assert(difference(a,b)>.01);
  accept(null); assert.deepEqual(a,b);
  accept({}); assert.deepEqual(a,b);
});

test('Rocket sound consumes accepted body events, isolated from the engine bus and silent control requests',async()=>{
  const {createRocketBody,stepRocketBody,NEUTRAL_ROCKET}=await import('../src/rocket-dynamics.js');
  const {proofSurface:course}=await import('./fixtures/rocket-proof-surface.mjs');
  const orbital={id:'orbital'}, voidSurface={probe:()=>null};
  const start=createRocketBody(course.frame(8));
  start.position[1]+=4;
  const floating=stepRocketBody(start,NEUTRAL_ROCKET,voidSurface);
  const eventBody=stepRocketBody(floating,{...NEUTRAL_ROCKET,dodge:1},voidSurface);
  assert.equal(eventBody.dodgeApplied,1);
  function blocks(before,after,command,levels,repeat=false) {
    const v=new TouringVoice(), out=new Float32Array(3072);
    const entrant=vehicle=>({vehicle,current:{rpm:3250,gear:3},pairContact:false,contact:false});
    v.accept(entrant(before),NEUTRAL_ROCKET,orbital); v.write(out,levels);
    v.accept(entrant(after),command,orbital);
    if (repeat) v.accept(entrant(after),command,orbital);
    v.write(out,levels);
    assert(out.every(Number.isFinite) && peak(out)<1);
    return out;
  }
  const noDodge={...eventBody,dodgeApplied:0};
  assert(difference(blocks(floating,eventBody,NEUTRAL_ROCKET,effects),blocks(floating,noDodge,NEUTRAL_ROCKET,effects))>.001);
  assert.deepEqual(blocks(floating,eventBody,NEUTRAL_ROCKET,engine),blocks(floating,noDodge,NEUTRAL_ROCKET,engine));
  assert.deepEqual(blocks(floating,noDodge,{...NEUTRAL_ROCKET,dodge:1,boost:true,assist:true},effects),
    blocks(floating,noDodge,NEUTRAL_ROCKET,effects));
  assert.deepEqual(blocks(floating,eventBody,NEUTRAL_ROCKET,effects,true),blocks(floating,eventBody,NEUTRAL_ROCKET,effects));
  const flipped={...eventBody,dodgeApplied:-1};
  assert(difference(blocks(floating,eventBody,NEUTRAL_ROCKET,effects),blocks(floating,flipped,NEUTRAL_ROCKET,effects))>.001);
});
