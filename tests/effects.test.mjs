// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {litNormalMatrix,validateLitMaterial} from '../vendor/vanillajs/modules/render-lit/index.js';
import {createDrivingEffects} from '../src/effects.js';
import {createRace,startRace,stepRace} from '../src/sim.js';

const eye=[0,1,8], forward=[0,0,-1];
function capture() {
  const draws=[], quad={};
  let uploads=0;
  const effects=createDrivingEffects({
    mesh(vertices) {
      assert.equal(vertices.length,6*11); uploads++;
      return quad;
    },
    draw(mesh,{matrix,material}) {
      assert.equal(mesh,quad);
      // The real renderer rejects singular transforms and out-of-range materials.
      litNormalMatrix(matrix); validateLitMaterial(material);
      const kind=material.emission ? 'spark' : material.pattern==='shadow'
        ? material.color[0]>material.color[2] ? 'dust' : 'smoke' : 'mark';
      draws.push({kind,matrix:[...matrix],alpha:material.opacity});
    }
  });
  return {effects,get uploads(){return uploads;}, render(at=eye,dir=forward,reduced=false) {
    draws.length=0;
    effects.draw(at,dir,reduced);
    return draws.slice();
  }};
}

// Short synthetic telemetry lets us isolate each wheel/surface combination.
// The end-to-end drive below checks those combinations against the actual solver.
function telemetry() {
  const wheels=Array.from({length:4},()=>({
    grounded:true,load:2500,slip:0,lateralSpeed:0,surfaceId:'asphalt',contactPoint:[0,0,0],normal:[0,1,0]
  }));
  const entrant={id:5,finishTicks:null,recoveries:0,current:{x:0,z:0,speed:24,s:0,lateral:0}, previous:{speed:24},
    vehicle:{tick:1,velocity:[0,0,-24],wheels,brake:0,contacts:[]}};
  const race={phase:'racing',elapsedTicks:0,player:entrant,entrants:[entrant],
    course:{closed:true,barrierOffset:12,sample:(s,l)=>({x:l,y:0,z:-s})}};
  return {race,entrant,wheels,advance(effects,n=1,reduced=false) {
    for(let i=0;i<n;i++) {
      race.elapsedTicks++;
      entrant.current.s+=.4;
      wheels.forEach((w,j)=>{ w.contactPoint[2]=-entrant.current.s+(j<2 ? -1:1); });
      effects.observe(race,reduced);
    }
  }, camera:()=>[0,2,8-entrant.current.s]};
}

test('grounded wheel slip, heavy braking and apron contact select the corresponding effects',()=>{
  for (const [surface,slip,brake,loaded,grounded,kinds] of [
    ['asphalt',0,0,true,true,[]], ['asphalt',75,0,true,true,['mark','smoke']],
    ['asphalt',0,1,true,true,['mark']], ['apron',0,0,true,true,['dust']],
    ['asphalt',75,1,true,false,[]], ['apron',75,1,false,true,[]],
  ]) {
    const f=telemetry(), c=capture();
    for(const w of f.wheels) Object.assign(w,{surfaceId:surface,slip,grounded,load:loaded?2500:0});
    f.entrant.vehicle.brake=brake;
    f.advance(c.effects,20);
    const seen=new Set(c.render(f.camera()).map(d=>d.kind));
    assert.deepEqual([...seen].sort(),kinds);
  }
});

test('guardrail sparks require accepted impact and speed loss, and remain brief at rest',()=>{
  const f=telemetry(), c=capture();
  f.entrant.previous.speed=25; f.entrant.current.speed=0;
  f.entrant.vehicle.contacts=['car:1'];
  f.advance(c.effects);
  assert.equal(c.render().length,0);
  f.entrant.vehicle.contacts=['guardrail'];
  f.advance(c.effects);
  const sparks=c.render().filter(d=>d.kind==='spark');
  assert.equal(sparks.length,4);
  f.entrant.previous.speed=0;
  f.advance(c.effects,17);
  assert.equal(c.render().length,0);
});

test('effects freeze while paused, expire on racing ticks, and reset across recovery/quality/grid changes',()=>{
  const f=telemetry(), c=capture();
  f.wheels.forEach(w=>{w.slip=99;});
  f.advance(c.effects,25);
  const before=c.render(f.camera());
  assert(before.length>0 && before.every(d=>d.alpha>0 && d.alpha<=1));
  f.race.phase='paused';
  c.effects.observe(f.race);
  assert.deepEqual(c.render(f.camera()),before);
  f.race.phase='racing';
  f.entrant.recoveries++;
  f.entrant.vehicle.tick=0;
  f.advance(c.effects);
  f.entrant.vehicle.tick=1;
  f.wheels.forEach(w=>{w.slip=0;});
  f.advance(c.effects,550);
  assert.equal(c.render(f.camera()).length,0);
  f.wheels.forEach(w=>{w.slip=99;});
  f.advance(c.effects,80,true);
  const reduced=c.render(f.camera(),forward,true);
  assert(reduced.length>0 && reduced.length<=12 && reduced.every(d=>d.kind==='mark'));
  c.effects.observe({...f.race,entrants:[f.entrant],phase:'countdown',elapsedTicks:0});
  assert.deepEqual(c.render(f.camera()),[]);
  c.effects.reset(); assert.equal(c.uploads,1);
});

test('invalid wheel and camera samples cannot submit non-finite presentation geometry',()=>{
  const f=telemetry(), c=capture();
  f.wheels[0].slip=NaN;
  f.wheels[1].normal[0]=Infinity;
  f.wheels[2].contactPoint[0]=NaN;
  f.wheels[3].lateralSpeed=Infinity;
  f.entrant.vehicle.brake=1;
  f.advance(c.effects,60);
  assert.deepEqual(c.render(f.camera()),[]);
  assert.deepEqual(c.render([NaN,0,0]),[]);
  assert.deepEqual(c.render(eye,[0,Infinity,-1]),[]);
});

test('actual pack slip, shoulder and rail telemetry produce bounded effects without changing the replay',()=>{
  const race=createRace(), control=createRace(), c=capture(), seen=new Set();
  startRace(race); startRace(control);
  let busiest=0;
  for(let tick=0;tick<710;tick++) {
    const command={throttle:1,steer:tick>460?1:0};
    stepRace(race,command);
    stepRace(control,command);
    c.effects.observe(race);
    const p=race.player.current;
    const draws=c.render([p.x,p.y+6,p.z+7],[-Math.sin(p.yaw),0,-Math.cos(p.yaw)]);
    draws.forEach(d=>seen.add(d.kind));
    busiest=Math.max(draws.length,busiest);
  }
  assert.deepEqual([...seen].sort(),['dust','mark','smoke','spark']);
  assert(busiest>10 && busiest<=48);
  assert.equal(c.uploads,1);
  assert.deepEqual(race,control);
});
