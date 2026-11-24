// SPDX-License-Identifier: Apache-2.0
import {LitRenderer} from '../vendor/vanillajs/modules/render-lit/index.js';
import {lookAt} from './camera.js';
import {box,lettering,quad,triangle} from './geometry.js';
import {carRecipe,rideHeight} from './sim.js';
import {bodyTransform,touringMeshes,wheelTransforms} from './touring-car.js';

const at=(x,y,z)=>[x,y,-z];
const up=[0,1,0], chalk=[.84,.87,.79], charcoal=[.09,.11,.12];
const warning=[.99,.55,.11], steel=[.33,.39,.42], ice=[.62,.95,.91];
const compression=Array(4).fill(carRecipe.wheel.radius+carRecipe.suspension.restLength-rideHeight);
const palettes={
  crucible:{
    apron:[.23,.25,.25],floor:[.29,.32,.33],concrete:[.49,.49,.43],cap:[.72,.68,.56],
    metal:[.26,.35,.36],line:[.89,.70,.37],lamp:[1,.86,.55],
    light:{ambient:.56,skyTop:[.22,.40,.48],skyBottom:[.84,.68,.48],sunColor:[1,.83,.63],
      sunDirection:[-.44,.78,.36],fogColor:[.68,.61,.51],fogDensity:.002}
  },
  'iron-pit':{
    apron:[.18,.22,.26],floor:[.24,.29,.34],concrete:[.47,.53,.56],cap:[.72,.79,.81],
    metal:[.19,.35,.41],line:[.33,.86,.75],lamp:ice,
    light:{ambient:.61,skyTop:[.15,.31,.44],skyBottom:[.57,.73,.78],sunColor:[.83,.95,1],
      sunDirection:[.49,.76,.41],fogColor:[.48,.64,.70],fogDensity:.0022}
  }
};

function block(out,x,y,z,w,h,d,color) {
  box(out,at,[x,y,-z],[w,h,d],color);
}

function floorBand(out,a,b,width,color,y=.012) {
  const dx=b[0]-a[0],dz=b[1]-a[1],scale=width/(2*Math.hypot(dx,dz));
  const x=-dz*scale,z=dx*scale;
  quad(out,[a[0]-x,y,a[1]-z],[a[0]+x,y,a[1]+z],[b[0]+x,y,b[1]+z],[b[0]-x,y,b[1]-z],color,up);
}

function capsuleMesh(fixture,height,body,cap) {
  const {x1,z1,x2,z2,dx,dz,r}=fixture,segments=24;
  const axis=Math.atan2(dz,dx),ring=[],out=[];
  // Both straight sides span exactly one pair of tangency points. The two
  // semicircles are inscribed chords of the same capsules the solver uses.
  for(const [x,z,start] of [[x2,z2,axis-Math.PI/2],[x1,z1,axis+Math.PI/2]]){
    for(let i=0;i<=segments;i++){
      const angle=start+i*Math.PI/segments;
      ring.push([x+r*Math.cos(angle),z+r*Math.sin(angle)]);
    }
  }
  const centre=[(x1+x2)/2,height,(z1+z2)/2];
  for(let i=0;i<ring.length;i++){
    const [x,z]=ring[i],[u,v]=ring[(i+1)%ring.length];
    quad(out,[x,0,z],[x,height,z],[u,height,v],[u,0,v],body);
    triangle(out,centre,[x,height,z],[u,height,v],cap,up);
  }
  return new Float32Array(out);
}

function boundaryPaint(out,b,palette) {
  const mx=(b.x1+b.x2)/2,mz=(b.z1+b.z2)/2;
  let nx=-b.dz/b.length,nz=b.dx/b.length;
  if(mx*nx+mz*nz>0){nx=-nx;nz=-nz;}
  const point=(s,t)=>[b.x1+b.dx*s/b.length+nx*t,b.z1+b.dz*s/b.length+nz*t];
  floorBand(out,point(1,b.r+1.62),point(b.length-1,b.r+1.62),.11,palette.line);
  for(let s=2.2;s<b.length-2.2;s+=1.7){
    floorBand(out,point(s,b.r+.28),point(s+.78,b.r+1.32),.27,warning);
  }
}

function spawnPaint(out,spawns) {
  for(const {id,x,z,yaw} of spawns){
    const c=Math.cos(yaw),s=Math.sin(yaw);
    const point=(u,v)=>[x+c*u+s*v,z-s*u+c*v];
    for(const side of [-1,1]){
      floorBand(out,point(side*1.46,-2.6),point(side*1.46,2.6),.09,chalk);
      floorBand(out,point(side*.75,2.6),point(side*1.46,2.6),.09,chalk);
    }
    lettering(out,String(id+1),.19,(u,v)=>{const [px,pz]=point(u,3.82-v);return [px,.017,pz];},chalk);
  }
}

function fieldPaint(out,isIron,color) {
  if(isIron){
    for(const x of [-6.8,6.8]){
      for(let z=-14;z<14;z+=4)floorBand(out,[x,z],[x,z+2],.15,color);
      const inward=Math.sign(x);
      floorBand(out,[x,0],[x-inward*2.25,-1.38],.19,color);
      floorBand(out,[x,0],[x-inward*2.25,1.38],.19,color);
    }
    lettering(out,'PIT',.62,(x,z)=>[x,.014,1.54-z],color);
    return;
  }
  for(let i=0;i<40;i++){
    const a=i*Math.PI/20,b=(i+.65)*Math.PI/20;
    const p=(r,v)=>[r*Math.cos(v),r*Math.sin(v)];
    floorBand(out,p(9.6,a),p(9.6,b),.17,color);
  }
  floorBand(out,[-6,0],[-2.8,0],.19,color);
  floorBand(out,[2.8,0],[6,0],.19,color);
  lettering(out,'01',.66,(x,z)=>[x,.014,1.65-z],color);
}

function floodlight(scenery,lights,x,z,color) {
  block(scenery,x,.18,z,1.6,.36,1.6,charcoal);
  for(const side of [-1,1])block(scenery,x+side*.36,4.6,z,.18,9.2,.21,steel);
  for(const y of [1.5,3.1,4.7,6.3,7.9])block(scenery,x,y,z,.91,.1,.28,steel);
  block(scenery,x,9.05,z,3.2,.8,.62,charcoal);
  for(const side of [-1,1]){
    for(const offset of [-1.03,0,1.03])
      block(lights,x+offset,9.05,z+side*.324,.76,.43,.055,color);
  }
}

function grandstand(scenery,lights,palette) {
  // Stairs, roof and gantry are outside the continuous north wall.
  const z=-38;
  for(let i=0;i<6;i++){
    block(scenery,0,.36+i*.39,z-i*1.38,47,.72+i*.78,1.4,palette.concrete);
    block(scenery,0,.75+i*.78,z-i*1.38,46,.10,1.14,i%2?palette.metal:steel);
  }
  for(const x of [-20,-10,0,10,20]){
    block(scenery,x,4.25,z-8,.34,8.5,.44,steel);
    block(scenery,x,7.93,z-4,.27,.30,8.3,palette.metal);
    block(lights,x,7.76,z-2,2.1,.083,.25,palette.lamp);
  }
  block(scenery,0,8.3,z-4.5,49,.61,9.8,[.42,.30,.19]);
  block(scenery,0,7.62,z+.48,18,1.15,.3,charcoal);
  lettering(scenery,'ARENA',.17,(x,y)=>[x-2.9,7.17+y,z+.636],palette.lamp);
  lettering(scenery,'01',.17,(x,y)=>[x+3.1,7.17+y,z+.636],palette.lamp);
  for(const x of [-44,44])for(const row of [-24,25])floodlight(scenery,lights,x,row,palette.lamp);
  for(const x of [-19,19]){
    block(scenery,x,2.1,39,13,4.2,5.1,palette.metal);
    block(scenery,x,3.4,36.39,11.9,.31,.15,palette.line);
  }
}

function industrialPits(scenery,lights,palette) {
  // Two loading structures outside the arena carry fluorescent strips.
  for(const side of [-1,1]){
    const x=side*36.5;
    block(scenery,x,.42,0,5.2,.84,28,palette.concrete);
    for(const z of [-12,0,12]){
      block(scenery,x,4.2,z,.37,8.4,.63,steel);
      block(scenery,x+side*1.85,4.2,z,.37,8.4,.63,steel);
      block(scenery,x+side*.9,7.84,z,2.7,.41,.51,warning);
      block(lights,x-side*.32,7.7,z,.065,.34,1.28,palette.lamp);
    }
    block(scenery,x+side*.88,8.42,0,2.83,.47,28,palette.metal);
    block(scenery,x+side*.88,7.04,0,2.23,.29,27,steel);
    block(scenery,x+side*3.93,2.53,0,3.79,5.06,29,charcoal);
  }
  for(const z of [-32,33])for(const x of [-24,22])floodlight(scenery,lights,x,z,palette.lamp);
  block(scenery,-2,3.7,-34,23,7.4,4.5,palette.metal);
  block(scenery,-2,5.35,-31.72,14,2,.15,charcoal);
  lettering(scenery,'IRON',.25,(x,y)=>[x-4.3,4.70+y,-31.634],palette.lamp);
  lettering(scenery,'PIT',.25,(x,y)=>[x+.55,4.70+y,-31.634],palette.lamp);
}

export function buildDerbyArenaGeometry(arena) {
  const palette=palettes[arena.id],isIron=arena.id==='iron-pit';
  const floor=[],scenery=[],paint=[],lights=[];
  block(scenery,0,-.32,0,190,.48,190,palette.apron);
  const perimeter=arena.boundary.map(([x,z])=>[x,0,z]);
  for(let i=0;i<perimeter.length;i++)
    triangle(floor,[0,0,0],perimeter[i],perimeter[(i+1)%perimeter.length],palette.floor,up);
  spawnPaint(paint,arena.spawns);
  fieldPaint(paint,isIron,palette.line);
  const fixtures=arena.fixtures.map((fixture,index)=>{
    const wall=index<perimeter.length;
    if(wall)boundaryPaint(paint,fixture,palette);
    const height=(wall?(isIron?1.46:1.24):2.04)+index*.012;
    const body=fixture.material==='steel'?palette.metal:palette.concrete;
    const cap=wall?palette.cap:warning;
    return Object.freeze({id:fixture.id,material:fixture.material,height,
      vertices:capsuleMesh(fixture,height,body,cap)});
  });
  if(isIron)industrialPits(scenery,lights,palette);
  else grandstand(scenery,lights,palette);
  return Object.freeze({floor:new Float32Array(floor),scenery:new Float32Array(scenery),
    paint:new Float32Array(paint),lights:new Float32Array(lights),fixtures:Object.freeze(fixtures)});
}

const fieldOfView=.88;
const shadow=new Float32Array([
  [-1.48,-2.75,0,0],[1.48,-2.75,1,0],[1.48,2.75,1,1],
  [1.48,2.75,1,1],[-1.48,2.75,0,1],[-1.48,-2.75,0,0]
].flatMap(([x,z,u,v])=>[x,0,z,...up,1,1,1,u,v]));
const shadowMaterial={color:[.043,.047,.052],pattern:'shadow',opacity:.82};
const glassMaterial={pattern:'glass',opacity:.79,roughness:.24,metalness:.17};
const lampMaterial={pattern:'none',roughness:.25,emission:.42};
const trimMaterial={roughness:.54,metalness:.13};

function poseFor(car,previous,alpha) {
  const old=previous??car,lerp=(n)=>old[n]+(car[n]-old[n])*alpha;
  return {x:lerp('x'),z:lerp('z'),yaw:lerp('yaw'),y:rideHeight,pitch:0,roll:0,
    steering:car.spin*.20,wheelSpin:0,compression};
}

function raisedEye(arena,reverse,aspect) {
  const {target,eye}=arena.camera;
  const direction=reverse?-1:1;
  const vx=(eye[0]-target[0])*direction,vy=eye[1]-target[1],vz=(eye[2]-target[2])*direction;
  const range=Math.hypot(vx,vy,vz),h=Math.hypot(vx,vz),tangent=Math.tan(fieldOfView/2);
  const bx=vx/range,by=vy/range,bz=vz/range,rx=vz/h,rz=-vx/h;
  let distance=range;
  for(const [x,z] of arena.boundary){
    const dx=x-target[0],dz=z-target[2],depth=dx*bx+dz*bz-target[1]*by;
    const horizontal=Math.abs(dx*rx+dz*rz)/(tangent*aspect);
    const vertical=Math.abs(dx*by*rz-dz*by*rx-target[1]*h/range)/tangent;
    distance=Math.max(distance,depth+1.12*Math.max(horizontal,vertical)+2);
  }
  const scale=distance/range;
  return [target[0]+vx*scale,target[1]+vy*scale,target[2]+vz*scale];
}

export function createDerbyArenaScene(canvas,arena,pixelRatio=1) {
  const renderer=new LitRenderer(canvas,{profile:'high',pixelRatio});
  try {
    const geometry=buildDerbyArenaGeometry(arena);
    const floor=renderer.mesh(geometry.floor),scenery=renderer.mesh(geometry.scenery);
    const paint=renderer.mesh(geometry.paint),lights=renderer.mesh(geometry.lights);
    const fixtures=geometry.fixtures.map(f=>({mesh:renderer.mesh(f.vertices),material:f.material==='steel'
      ? {roughness:.42,metalness:.45} : {roughness:.94,metalness:.05}}));
    const car=touringMeshes(renderer),carShadow=renderer.mesh(shadow);
    const surface={pattern:arena.surface==='concrete'?'stone':'asphalt',patternScale:.38,roughness:.9};
    const frame={...palettes[arena.id].light,near:.14,far:500,fov:fieldOfView};
    return {
      stats:()=>renderer.stats(),
      dispose:()=>renderer.dispose(),
      draw(world,{camera='raised',alpha=1,previous=null}={}) {
        if(renderer.lost)return;
        const field=world.cars.map((body,i)=>({id:body.id,pose:poseFor(body,previous?.[i],alpha)}));
        const rect=canvas.getBoundingClientRect(),aspect=Math.max(.25,rect.width/Math.max(1,rect.height));
        const eye=raisedEye(arena,camera==='reverse',aspect),target=arena.camera.target;
        renderer.begin(eye,lookAt(eye,target),frame);
        renderer.draw(scenery);
        renderer.draw(floor,{material:surface});
        renderer.draw(paint);
        for(const {mesh,material} of fixtures)renderer.draw(mesh,{material});
        renderer.draw(lights,{material:{roughness:.52,emission:.65}});

        const glass=[];
        for(const {id,pose} of field){
          const root=bodyTransform(pose),livery=car.liveries[id];
          const shadowTransform=root.slice();shadowTransform[13]=.025;
          renderer.draw(carShadow,{matrix:shadowTransform,material:shadowMaterial});
          renderer.draw(car.shell,{matrix:root,material:livery.paint});
          renderer.draw(car.detail,{matrix:root,material:trimMaterial});
          renderer.draw(livery.graphics,{matrix:root,material:trimMaterial});
          renderer.draw(car.lamps,{matrix:root,material:lampMaterial});
          for(const matrix of wheelTransforms(car.rig,pose,root)){
            renderer.draw(car.tyre,{matrix,material:car.tyreMaterial});
            renderer.draw(car.rim,{matrix,material:car.rimMaterial});
          }
          const depth=(pose.x-eye[0])*(target[0]-eye[0])+(pose.z-eye[2])*(target[2]-eye[2]);
          glass.push({root,depth});
        }
        glass.sort((a,b)=>b.depth-a.depth);
        for(const {root} of glass)renderer.draw(car.glass,{matrix:root,material:glassMaterial});
      }
    };
  } catch(error){renderer.dispose();throw error;}
}
