// SPDX-License-Identifier: Apache-2.0
import {LitRenderer} from '../vendor/vanillajs/modules/render-lit/index.js';
import {box,lettering,quad,triangle} from './geometry.js';
import {bodyTransform,touringMeshes,wheelTransforms} from './touring-car.js';
import {rideHeight,carRecipe} from './sim.js';
import {lookAt} from './camera.js';
import {scenarios,latestImpact} from './crash-trial.js';
import {IMPACT_PANEL_ZONES,createImpactPanelGeometry,deformImpactPanel} from './impact-panels.js';

const zinc=[.45,.53,.54],ink=[.055,.085,.095],paint=[.95,.87,.66],orange=[1,.28,.045],teal=[.09,.46,.49];
const at=(x,y,z)=>[x,y,-z];
const light={ambient:.64,skyTop:[.15,.32,.40],skyBottom:[.90,.79,.63],sunColor:[1,.88,.66],
  sunDirection:[-.54,.8,.28],fogColor:[.74,.76,.69],fogDensity:.0017,near:.12,far:650,fov:.84};
function fixtureMesh(out,b) {
  const axis=Math.atan2(b.dz,b.dx),ring=[];
  for(const [x,z,start] of [[b.x2,b.z2,axis-Math.PI/2],[b.x1,b.z1,axis+Math.PI/2]])
    for(let i=0;i<=12;i++){const a=start+i*Math.PI/12;ring.push([x+b.r*Math.cos(a),z+b.r*Math.sin(a)]);}
  for(let i=0;i<ring.length;i++){
    const [x,z]=ring[i],[u,v]=ring[(i+1)%ring.length],h=1.48;
    quad(out,[x,0,z],[x,h,z],[u,h,v],[u,0,v],b.material==='steel'?teal:zinc);
    triangle(out,[b.x1,h,b.z1],[x,h,z],[u,h,v],paint,[0,1,0]);
  }
  const nx=-b.dz/b.length,nz=b.dx/b.length;
  for(let t=.05;t<.99;t+=.10) for(const side of [-1,1]){
    const mark=(u,y)=>[b.x1+b.dx*u+side*nx*(b.r+.005),y,b.z1+b.dz*u+side*nz*(b.r+.005)];
    quad(out,mark(t,.42),mark(t+.028,.42),mark(t+.045,1.05),mark(t+.017,1.05),orange);
  }
}
function facility(scenario) {
  const out=[];
  const block=(x,y,z,w,h,d,color)=>box(out,at,[x,y,-z],[w,h,d],color);
  block(0,-.22,-40,460,.35,530,[.26,.33,.32]);block(0,-.065,-44,48,.13,178,[.22,.26,.27]);
  for(let z=34;z> -131;z-=2){
    for(const x of [-9,9]) block(x,.02,z,z%10===0?1.5:.58,.025,.10,paint);
    if(z%8===2)block(0,.009,z,.10,.018,2.7,paint);
  }
  for(const x of [-11,11])block(x,.014,-45,.17,.025,172,orange);
  for(let z=-118;z<39;z+=12) for(const x of [-21,21]){
    block(x,.15,z,1.7,.3,.5,ink);block(x,2.5,z,.19,4.8,.19,zinc);
    block(x,4.85,z,1.4,.30,.5,ink);block(x,4.81,z+.26,1.18,.15,.04,paint);
  }
  for(const z of [-98,-53,4]){
    block(-31,1.9,z,8,3.8,7,ink);block(-31,5,z,10,2.5,9,zinc);
    block(-25.95,5.25,z,.15,1.1,7.5,teal);block(-31,6.4,z,11,.36,10,ink);
  }
  for(let i=0;i<8;i++){
    block(32+i%2*2,2,-115+i*17,13,4,12,[.40,.41,.36]);
    block(32+i%2*2,4.18,-115+i*17,13.6,.38,12.6,zinc);
  }
  block(0,3.6,-124,33,7.2,1.3,ink);
  lettering(out,'IMPACT',.44,(x,y)=>[x,2.2+y,-123.33],paint);
  const b=scenarios[scenario].fixture;if(b)fixtureMesh(out,b);
  for(const [z,text] of [[3,'20'],[-17,'40'],[-37,'60'],[-57,'80']]){
    lettering(out,text,.20,(x,y)=>[-6+x,.045,z-y],paint);
  }
  return new Float32Array(out);
}
function impactBody(renderer,raw,livery) {
  const zones=IMPACT_PANEL_ZONES.map(name=>({name,damage:0,parts:[]}));
  function layer(vertices,options) {
    const {fixed,panels}=createImpactPanelGeometry(vertices,options);
    const parts=[];
    if(fixed.length)parts.push({mesh:renderer.mesh(fixed)});
    for(const zone of zones){
      const panel=panels[zone.name];
      if(!panel)continue;
      const part={mesh:renderer.mesh(panel.clean),panel,zone};
      parts.push(part);
      zone.parts.push(part);
    }
    return parts;
  }
  const trim=new Float32Array(raw.detail.length+livery.graphics.length);
  trim.set(raw.detail);
  trim.set(livery.graphics,raw.detail.length);
  return {
    zones,paint:livery.paint,bakedPaint:{...livery.paint,color:[1,1,1]},
    shell:layer(raw.shell,{paint:livery.paint.color,exposedMetal:true}),
    trim:layer(trim),lamps:layer(raw.lamps),glass:renderer.mesh(raw.glass)
  };
}
function drawImpactBody(renderer,rig,damage,root) {
  // One canonical presentation per ledger value. This also covers seek,
  // pause, reset and context restoration without a separate animation clock.
  for(const zone of rig.zones){
    const value=damage[zone.name];
    if(value===zone.damage)continue;
    for(const {mesh,panel} of zone.parts)renderer.update(mesh,deformImpactPanel(panel,value));
    zone.damage=value;
  }
  for(const {mesh,zone} of rig.shell)
    renderer.draw(mesh,{matrix:root,material:zone?.damage?rig.bakedPaint:rig.paint});
  for(const {mesh} of rig.trim)renderer.draw(mesh,{matrix:root});
  const material={emission:.32*(1-damage.front/1000)};
  for(const {mesh} of rig.lamps)renderer.draw(mesh,{matrix:root,material});
}
export function createCrashScene(canvas,scenario,pixelRatio=1) {
  const renderer=new LitRenderer(canvas,{profile:'high',pixelRatio});
  try {
    const worldMesh=renderer.mesh(facility(scenario));
    const raw=touringMeshes({mesh:vertices=>vertices}),tyre=renderer.mesh(raw.tyre),rim=renderer.mesh(raw.rim);
    const cars=Array.from({length:scenario==='opposing'?2:1},(_,i)=>
      impactBody(renderer,raw,raw.liveries[i===0?5:0]));
    const sparkle=[];for(let i=0;i<8;i++){
      const a=2.4*i,r=.35+i*.09;
      triangle(sparkle,[0,.18,0],[Math.cos(a)*r,.36+i*.09,Math.sin(a)*r],[.08,.22,0],orange);
    }
    const sparks=renderer.mesh(new Float32Array(sparkle));
    const compression=Array(4).fill(carRecipe.wheel.radius+carRecipe.suspension.restLength-rideHeight);
    return {
      stats:()=>renderer.stats(),dispose:()=>renderer.dispose(),
      draw(trial,{camera='chase',follow=0,alpha=1,reducedMotion=false}={}) {
        if(renderer.lost)return;
        const poses=trial.world.cars.map((body,i)=>{
          const old=trial.previous[i],mix=(a,b)=>a+(b-a)*alpha;
          return {x:mix(old.x,body.x),z:mix(old.z,body.z),yaw:mix(old.yaw,body.yaw),
            y:rideHeight,pitch:0,roll:0,steering:body.spin*.20,wheelSpin:-(body.z+body.x)/carRecipe.wheel.radius,compression};
        });
        const p=poses[follow],s=Math.sin(p.yaw),c=Math.cos(p.yaw);
        const point=[p.x,.82,p.z],inspection=camera==='inspect' || camera==='high';
        let eye,target;
        if(camera==='fixture'){
          eye=[12,5,scenario==='opposing'?-20:-49];target=[0,1,scenario==='opposing'?-30:-55];
        } else if(inspection){
          eye=[p.x+5*c-5*s,2.75,p.z-5*s-5*c];target=point;
        } else {
          eye=[p.x+8*s,3.6,p.z+8*c];target=[p.x-3*s,.57,p.z-3*c];
        }
        renderer.begin(eye,lookAt(eye,target),light);renderer.draw(worldMesh);
        for(let i=0;i<poses.length;i++){
          const body=trial.world.cars[i],rig=cars[i],root=bodyTransform(poses[i]);
          drawImpactBody(renderer,rig,body.damage,root);
          for(const matrix of wheelTransforms(raw.rig,poses[i],root)){
            renderer.draw(tyre,{matrix,material:raw.tyreMaterial});renderer.draw(rim,{matrix,material:raw.rimMaterial});
          }
          renderer.draw(rig.glass,{matrix:root,material:{pattern:'glass',opacity:.80}});
        }
        const hit=latestImpact(trial,follow),age=hit ? trial.world.tick-hit.tick : 12;
        if(!reducedMotion && age<12 && hit.normalImpulse>500){
          const size=(1-age/12)*Math.min(1.7,hit.normalImpulse/16000);
          renderer.draw(sparks,{matrix:[size,0,0,0,0,size,0,0,0,0,size,0,hit.point[0],.64,hit.point[1],1],material:{emission:.9}});
        }
      }
    };
  } catch(error){renderer.dispose();throw error;}
}
