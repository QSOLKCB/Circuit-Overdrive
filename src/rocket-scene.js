// SPDX-License-Identifier: Apache-2.0
import {LitRenderer} from '../vendor/vanillajs/modules/render-lit/index.js';
import {add,clamp,length,quatInterpolate,quatMultiply,rotate,subtract} from '../vendor/vanillajs/modules/math/index.js';
import {orbitalBatches} from './orbital-scene.js';
import {box,lettering,quad,triangle} from './geometry.js';
import {FIELD,PLAYER_ID} from './field.js';
import {lookAt} from './camera.js';

const light={ambient:.70,sunDirection:[-.55,.73,-.4],sunColor:[.99,.83,.72],skyTop:[.035,.056,.153],
  skyBottom:[.63,.42,.50],fogColor:[.50,.41,.53],fogDensity:.0012,near:.15,far:1100};
const identity=(x,y,z)=>[x,y,z], trim=[.11,.15,.22], bright=[.93,.96,.84];
function racer(d) {
  const out=[],color=[1,3,5].map(i=>parseInt(d.color.slice(i,i+2),16)/255);
  // Five cross-sections form a blunt wedge nose, pilot canopy and twin nozzle deck.
  const hull=[[-2.15,.53,-.12],[-1.45,.81,.14],[-.34,.88,.25],[.87,.86,.22],[1.97,.76,.08]];
  for(let i=1;i<hull.length;i++) {
    const [z,w,h]=hull[i-1],[Z,W,H]=hull[i];
    quad(out,[-w,h,z],[w,h,z],[W,H,Z],[-W,H,Z],color,[0,1,0]);
    for(const sign of [-1,1])
      quad(out,[sign*w,-.24,z],[sign*w,h,z],[sign*W,H,Z],[sign*W,-.24,Z],color);
  }
  box(out,identity,[0,-.19,0],[1.52,.18,3.99],trim);
  for(const side of [-1,1]) {
    const front=[side*.56,.19,-1.16],peak=[side*.34,.64,-.06],aft=[side*.37,.57,.52],rear=[side*.60,.17,1.05];
    quad(out,front,peak,aft,rear,[.13,.37,.49]);
    quad(out,[side*.72,.20,1.65],[side*.82,.88,1.43],[side*.82,.82,1.95],[side*.72,.13,1.99],color);
    box(out,identity,[side*.51,.02,1.98],[.42,.37,.4],trim);
    box(out,identity,[side*.51,.04,2.186],[.31,.22,.04],[.14,.92,.92]);
    box(out,identity,[side*.50,-.06,-2.12],[.26,.11,.08],bright);
    quad(out,[side*.26,.154,-1.43],[side*.40,.154,-1.43],[side*.24,-.106,-2.11],[side*.14,-.106,-2.11],bright);
  }
  quad(out,[-.56,.19,-1.16],[.56,.19,-1.16],[.34,.64,-.06],[-.34,.64,-.06],[.16,.47,.59]);
  quad(out,[-.34,.64,-.06],[.34,.64,-.06],[.37,.57,.52],[-.37,.57,.52],color);
  quad(out,[-.37,.57,.52],[.37,.57,.52],[.60,.17,1.05],[-.60,.17,1.05],[.09,.21,.33]);
  // Livery numbers are visible from the chase camera and either flank.
  lettering(out,String(d.number),.070,(u,v)=>[u,.665,-v+.42],bright);
  for(const side of [-1,1]) {
    box(out,identity,[side*.876,.0,-.03],[.032,.26,.58],trim);
    lettering(out,String(d.number),.041,(u,v)=>[side*.896,v-.11,-side*u-.03],bright);
  }
  box(out,identity,[0,.75,1.78],[1.95,.09,.34],color);
  return new Float32Array(out);
}
function wheel() {
  const out=[];
  for(let i=0;i<12;i++) {
    const rim=(x,a,r)=>[x,Math.sin(a)*r,Math.cos(a)*r], a=i*Math.PI/6,b=(i+1)*Math.PI/6;
    quad(out,rim(-.13,a,.32),rim(.13,a,.32),rim(.13,b,.32),rim(-.13,b,.32),[.075,.08,.11]);
    for(const x of [-.13,.13]) {
      quad(out,rim(x,a,.32),rim(x,b,.32),rim(x,b,.20),rim(x,a,.20),trim);
      triangle(out,rim(x,a,.20),rim(x,b,.20),[x,0,0],i%3 ? [.33,.54,.58] : bright);
    }
  }
  return new Float32Array(out);
}
function plume() {
  const out=[];
  for(const side of [-1,1]) for(let i=0;i<8;i++) {
    const p=a=>[side*.51+.15*Math.cos(a),.04+.10*Math.sin(a),2.20];
    triangle(out,p(i*Math.PI/4),p((i+1)*Math.PI/4),[side*.51,.04,3.7],i%2 ? [.1,.92,.96] : [.53,.72,1]);
  }
  return new Float32Array(out);
}
const matrix=(q,at)=>[...rotate(q,[1,0,0]),0,...rotate(q,[0,1,0]),0,...rotate(q,[0,0,1]),0,...at,1];

export function createRocketCamera() {
  let orientation,previous,follow,preset;
  return (p,{mode,camera,dt,reducedMotion})=>{
    const pos=[p.x,p.y,p.z], q=p.orientation;
    if(mode==='menu') {
      orientation=null;
      const eye=add(pos,rotate(q,[3.7,1.9,-5.8]));
      const target=add(pos,rotate(q,[1.45,.18,.86]));
      return {eye,q:lookAt(eye,target),fov:.79};
    }
    const reset=!orientation || follow!==p.id || length(subtract(pos,previous))>6 || (dt===0 && camera!==preset);
    orientation=reset ? q : quatInterpolate(orientation,q,1-Math.exp(-clamp(dt,0,.12)*14));
    previous=pos; follow=p.id; preset=camera;
    const high=camera==='high',pitch=high ? -.27 : -.16;
    const eye=add(pos,rotate(orientation,[0,high ? 4.7 : 2.30,high ? 10.4 : 7.2]));
    return {eye,q:quatMultiply(orientation,[Math.sin(pitch/2),0,0,Math.cos(pitch/2)]),
      fov:reducedMotion ? .94 : .89+.10*clamp(p.speed/65,0,1)};
  };
}
export function createRocketScene(canvas,course,pixelRatio) {
  const renderer=new LitRenderer(canvas,{profile:'high',pixelRatio});
  try {
    const world=orbitalBatches(course).map(b=>({mesh:renderer.mesh(b.vertices),material:b.material}));
    const cars=FIELD.map(d=>renderer.mesh(racer(d))),tyre=renderer.mesh(wheel()),jet=renderer.mesh(plume());
    let cameraRig=createRocketCamera(),lastContact=false,landingTicks=0,dodgeTicks=0;
    const resetEffects=()=>{cameraRig=createRocketCamera();lastContact=false;landingTicks=dodgeTicks=0;};
    return {resetEffects,dispose:()=>renderer.dispose(),
      observe(race,reduced) {
        const b=race.player.vehicle;
        if(!reduced && b.grounded && !lastContact && race.player.previousBody?.airTicks>2) landingTicks=9;
        else landingTicks=Math.max(0,landingTicks-1);
        if(!reduced && b.dodgeApplied) dodgeTicks=8; else dodgeTicks=Math.max(0,dodgeTicks-1);
        lastContact=b.grounded;
      },
      draw(poses,{mode='racing',camera='chase',followId=PLAYER_ID,dt=1/60,reducedMotion=false,reducedEffects=false}={}) {
        if(renderer.lost) return;
        const p=poses[followId],view=cameraRig(p,{mode,camera,dt,reducedMotion});
        renderer.begin(view.eye,view.q,{...light,fov:view.fov});
        for(const batch of world) renderer.draw(batch.mesh,{material:batch.material});
        for(const car of poses) {
          if(car.id!==followId && (mode==='menu' || car.finished)) continue;
          const q=car.orientation,pos=[car.x,car.y,car.z],root=matrix(q,pos);
          const flash=car.id===PLAYER_ID && !reducedEffects && (landingTicks||dodgeTicks);
          renderer.draw(cars[car.id],{matrix:root,material:{roughness:.42,metalness:.22,emission:flash ? .38 : car.attached ? .18 : .10}});
          const spin=car.wheelSpin/2;
          for(let i=0;i<4;i++) {
            const steer=i<2 ? -car.steering*.18 : 0;
            const turn=quatMultiply([0,Math.sin(steer),0,Math.cos(steer)],[Math.sin(spin),0,0,Math.cos(spin)]);
            const local=[i%2 ? .79 : -.79,-.46+car.compression[i],i<2 ? -1.29 : 1.29];
            renderer.draw(tyre,{matrix:matrix(quatMultiply(q,turn),add(pos,rotate(q,local))),material:{roughness:.66}});
          }
          if(car.boosting && !reducedEffects) renderer.draw(jet,{matrix:root,material:{emission:1.2}});
        }
      }};
  } catch(error) {renderer.dispose();throw error;}
}
