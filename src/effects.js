// SPDX-License-Identifier: Apache-2.0
import {seededRandom} from '../vendor/vanillajs/modules/math/index.js';
import {FIELD} from './field.js';

// All effects are instances of one retained XZ quad. The renderer's soft radial
// mask supplies a translucent edge for airborne dust and tyre smoke.
const QUAD = new Float32Array([
  [-.5,-.5,0,0], [.5,-.5,1,0], [.5,.5,1,1],
  [.5,.5,1,1], [-.5,.5,0,1], [-.5,-.5,0,0],
].flatMap(([x,z,u,v]) => [x,0,z,0,1,0,1,1,1,u,v]));
const SMOKE = {color:[.78,.82,.85],pattern:'shadow',opacity:.42};
const DUST = {color:[.69,.49,.27],pattern:'shadow',opacity:.46};
const SPARK = {color:[1,.64,.22],emission:2,opacity:.9,roughness:1};
const EXHAUST = {color:[.18,.96,1],emission:2,opacity:.84,roughness:1};
const RUBBER = {color:[.025,.029,.031],opacity:.42,roughness:1};
const MARK_LIFE = 540; // 9 s of racing time; overwritten sooner under heavy traffic
const pointOK = p => p?.length === 3 && p.every(Number.isFinite);
const saturate = n => Math.max(0,Math.min(1,n));

export function createDrivingEffects(renderer) {
  const quad = renderer.mesh(QUAD);
  const particles = Array.from({length:22}, () => ({born:-1}));
  const marks = Array.from({length:26}, () => ({born:-1,matrix:new Float64Array(16)}));
  // Anchors are private copies: a recovering vehicle must never leave a stripe
  // joining its previous position to its new tyre patches.
  const history = FIELD.map(() => ({
    wheels:Array.from({length:4}, () => ({anchored:false,carry:0})), recoveries:0, sparkAfter:0
  }));
  const matrix = new Float64Array(16);
  const visible = [];
  const drawOptions = {matrix,material:RUBBER};
  // Draw-local opacity changes cannot leak across two independently owned scenes.
  const smoke = {...SMOKE}, dust = {...DUST}, spark = {...SPARK}, exhaust={...EXHAUST}, rubber = {...RUBBER};
  let nextParticle = 0, nextMark = 0, tick = 0, lastField = null, reduced = false;
  let random = seededRandom(27);

  function clearWheel(w) { w.anchored=false; w.carry=0; }
  function reset() {
    for (const p of particles) p.born=-1;
    for (const m of marks) m.born=-1;
    for (const car of history) {
      car.wheels.forEach(clearWheel);
      car.recoveries=0; car.sparkAfter=0;
    }
    nextParticle=0; nextMark=0; tick=0; lastField=null;
    random=seededRandom(27);
  }
  function puff(kind,x,y,z,vx,vz,strength) {
    const p=particles[nextParticle];
    nextParticle=(nextParticle+1)%particles.length;
    p.kind=kind;
    p.born=tick;
    p.x=x; p.y=y+.12; p.z=z;
    p.vx=vx + random()-.5; p.vz=vz + random()-.5;
    p.vy=.65+random()*.65;
    p.size=.28+.34*strength; p.life=26+Math.floor(random()*15);
    if (kind==='exhaust') { p.life=8; p.vy=.12; p.size=.48; }
    if (kind==='spark') {
      p.life=8+Math.floor(random()*7);
      p.size=.045+random()*.045;
      p.vy=1+random()*2.2;
    }
  }
  function streak(anchor,wheel) {
    const [x,y,z]=wheel.contactPoint;
    if (anchor.anchored) {
      const dx=x-anchor.x, dy=y-anchor.y, dz=z-anchor.z;
      const distance=Math.hypot(dx,dy,dz);
      if (distance<.76) return;
      if (distance<3.0) {
        const [nx,ny,nz]=wheel.normal;
        const sx=dy*nz-dz*ny, sy=dz*nx-dx*nz, sz=dx*ny-dy*nx;
        const crossLength=Math.hypot(sx,sy,sz);
        if (crossLength>.1) {
          const mark=marks[nextMark];
          nextMark=(nextMark+1)%(reduced ? 12 : marks.length);
          const m=mark.matrix, w=.21/crossLength;
          m[0]=sx*w; m[1]=sy*w; m[2]=sz*w;
          m[4]=nx; m[5]=ny; m[6]=nz;
          m[8]=dx; m[9]=dy; m[10]=dz;
          m[12]=(x+anchor.x)/2+nx*.026;
          m[13]=(y+anchor.y)/2+ny*.026;
          m[14]=(z+anchor.z)/2+nz*.026;
          m[15]=1; mark.born=tick;
        }
      }
    }
    anchor.anchored=true; anchor.x=x; anchor.y=y; anchor.z=z;
  }
  function wheelContact(e,wheel,h) {
    const p=e.current, state=e.vehicle;
    if (!wheel.grounded || !(wheel.load>0) || !pointOK(wheel.contactPoint) ||
        !pointOK(wheel.normal) || wheel.normal[1]<.35 || !Number.isFinite(wheel.slip) ||
        !Number.isFinite(wheel.lateralSpeed)) {
      clearWheel(h); return;
    }
    const asphalt=wheel.surfaceId==='asphalt', shoulder=wheel.surfaceId==='apron';
    const slip=saturate(Math.max((wheel.slip-15)/46,(Math.abs(wheel.lateralSpeed)-1.85)/3));
    const brake=state.brake>.7 && p.speed>8;
    if (asphalt && (slip>.14 || brake)) streak(h,wheel);
    else h.anchored=false;
    if (reduced || (!shoulder && !(asphalt && slip>0))) { h.carry=0; return; }
    const strength=shoulder ? saturate((p.speed-3)/28) : slip;
    // Fractional per-wheel emission lets a sustained slide build a plume.
    h.carry+=(shoulder ? 14 : 18)*strength/60;
    if (h.carry<1) return;
    h.carry-=1;
    const [x,y,z]=wheel.contactPoint;
    puff(shoulder?'dust':'smoke',x,y,z,state.velocity[0]*.06,state.velocity[2]*.06,strength);
  }
  function railImpact(e,h,course) {
    if (reduced || !e.vehicle.contacts.includes('guardrail') || tick<h.sparkAfter) return;
    const p=e.current, speedLost=e.previous.speed-p.speed;
    if (!(speedLost>.85) || !Number.isFinite(p.s) || !Number.isFinite(p.lateral)) return;
    const edge=Math.sign(p.lateral)*(course.barrierOffset-.12);
    let road;
    if (!course.closed && p.s-course.startS<3) road=course.sample(course.startS,p.lateral);
    else if (!course.closed && course.endS-p.s<3) road=course.sample(course.endS,p.lateral);
    else road=course.sample(p.s,edge);
    h.sparkAfter=tick+12;
    for(let j=0;j<Math.min(4,Math.ceil(speedLost));j++) {
      puff('spark',road.x,road.y+.35,road.z,e.vehicle.velocity[0]*.21,e.vehicle.velocity[2]*.21,1);
    }
  }
  function observe(race,reducedEffects=false) {
    if (lastField!==race.entrants || race.elapsedTicks<tick || reduced!==reducedEffects) {
      reset(); lastField=race.entrants; reduced=reducedEffects;
    }
    if (race.phase!=='racing' || !Number.isSafeInteger(race.elapsedTicks) || race.elapsedTicks<=tick) return;
    tick=race.elapsedTicks;
    const player=race.player.current;
    for (const e of race.entrants) {
      const h=history[e.id];
      // Reserve the small shared pools for the visible pack and player.
      const dx=e.current.x-player.x, dz=e.current.z-player.z;
      if (dx*dx+dz*dz>10000 || e.finishTicks!==null || e.vehicle.tick===0 || e.recoveries!==h.recoveries ||
          !pointOK(e.vehicle.velocity) || !Number.isFinite(e.current.speed)) {
        h.wheels.forEach(clearWheel); h.recoveries=e.recoveries; continue;
      }
      railImpact(e,h,race.course);
      if (e.nitro && !reduced) {
        const p=e.current;
        if (e.nitro.boosting && tick%3===0) {
          const backX=Math.sin(p.yaw),backZ=Math.cos(p.yaw);
          for (const side of [-.60,.60]) puff('exhaust',p.x+2.3*backX+side*backZ,
            p.y-.21,p.z+2.3*backZ-side*backX,backX*7,backZ*7,.80);
        }
        if (e.nitro.landed && e.nitro.lastAirTicks>=8) {
          for (const wheel of e.vehicle.wheels) if (wheel.grounded && pointOK(wheel.contactPoint)) {
            const [x,y,z]=wheel.contactPoint;
            puff('dust',x,y,z,e.vehicle.velocity[0]*.14,e.vehicle.velocity[2]*.14,1);
          }
        }
      }
      if (e.current.speed>3) {
        for (let i=0;i<4;i++) wheelContact(e,e.vehicle.wheels[i],h.wheels[i]);
      } else h.wheels.forEach(clearWheel);
    }
  }
  function draw(eye,forward,reducedEffects=false) {
    if (!pointOK(eye) || !pointOK(forward)) return;
    drawOptions.material=rubber;
    for (const mark of marks) {
      const age=tick-mark.born, m=mark.matrix;
      if (mark.born<0 || age>=MARK_LIFE) continue;
      const dx=m[12]-eye[0],dy=m[13]-eye[1],dz=m[14]-eye[2];
      if (dx*dx+dy*dy+dz*dz>8100 || dx*forward[0]+dy*forward[1]+dz*forward[2]<-2) continue;
      rubber.opacity=.42*Math.min(1,(MARK_LIFE-age)/120);
      drawOptions.matrix=m; renderer.draw(quad,drawOptions);
    }
    if (reducedEffects) return;
    const horizontal=Math.hypot(forward[0],forward[2]);
    if (horizontal<.001) return;
    const rx=-forward[2]/horizontal, rz=forward[0]/horizontal;
    visible.length=0;
    for (const p of particles) {
      const age=tick-p.born;
      if (p.born<0 || age>=p.life) continue;
      const t=age/60;
      p.drawX=p.x+t*p.vx; p.drawZ=p.z+t*p.vz;
      p.drawY=p.y+t*p.vy-(p.kind==='spark' ? 4*t*t : 0);
      const dx=p.drawX-eye[0],dy=p.drawY-eye[1],dz=p.drawZ-eye[2];
      p.depth=dx*forward[0]+dy*forward[1]+dz*forward[2];
      if (p.depth>0 && dx*dx+dy*dy+dz*dz<6400) visible.push(p);
    }
    visible.sort((a,b)=>b.depth-a.depth);
    drawOptions.matrix=matrix;
    matrix[4]=-rz; matrix[5]=0; matrix[6]=rx; matrix[15]=1;
    for (const p of visible) {
      const age=(tick-p.born)/p.life, isSpark=p.kind==='spark';
      const size=p.size+(isSpark ? 0 : 1.4*age);
      const mat=isSpark ? spark : p.kind==='exhaust' ? exhaust : p.kind==='dust' ? dust : smoke;
      mat.opacity=(isSpark ? .93 : .49)*(1-age);
      matrix[0]=rx*size; matrix[2]=rz*size;
      matrix[9]=isSpark ? .14 : size*(p.kind==='exhaust' ? .26 : .76);
      matrix[12]=p.drawX; matrix[13]=p.drawY; matrix[14]=p.drawZ;
      drawOptions.material=mat; renderer.draw(quad,drawOptions);
    }
  }
  return {observe,draw,reset};
}
