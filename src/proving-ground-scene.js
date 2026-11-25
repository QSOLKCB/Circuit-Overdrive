// SPDX-License-Identifier: Apache-2.0
// Presentation of accepted vehicle3d state only; no driving or timing authority.
import {LitRenderer} from '../vendor/vanillajs/modules/render-lit/index.js';
import {add,subtract,scale,rotate,quatMultiply,quatInterpolate} from '../vendor/vanillajs/modules/math/index.js';
import {lookAt} from './camera.js';
import {box,quad,lettering} from './geometry.js';
import {garageVehicleGeometry} from './garage-geometry.js';
import {compileVehicleBuild,stockVehicleBuild} from './vehicle-builds.js';
import {PROVING_TRACK} from './proving-ground.js';

const stockRecipes=new Map();
function stockRecipe(modelId) {
  if(!stockRecipes.has(modelId))stockRecipes.set(modelId,compileVehicleBuild(modelId,stockVehicleBuild(modelId)).recipe);
  return stockRecipes.get(modelId);
}
const mix=(a,b,t)=>a.map((value,i)=>value+(b[i]-value)*t);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const axis=(angle,index)=>[index===0?Math.sin(angle/2):0,index===1?Math.sin(angle/2):0,0,Math.cos(angle/2)];
function matrix(q,p) {
  const x=rotate(q,[1,0,0]),y=rotate(q,[0,1,0]),z=rotate(q,[0,0,1]);
  return [...x,0,...y,0,...z,0,...p,1];
}
function wheelHub(state,index,recipe) {
  // Upstream spawn creates empty, fully extended wheel records before its first
  // support query. On this declared horizontal plane only, present their bounded
  // static compression until the first accepted step. Never write it into state.
  if(state.tick===0 && state.wheels.every(w=>!w.grounded&&w.compression===0)) {
    const mount=add(state.position,rotate(state.orientation,[
      (index%2?1:-1)*recipe.wheel.track/2,0,(index<2?-1:1)*recipe.wheel.wheelbase/2]));
    const compression=clamp(recipe.suspension.restLength+recipe.wheel.radius-mount[1],0,recipe.suspension.travel);
    return add(mount,[0,-recipe.suspension.restLength+compression,0]);
  }
  return state.wheels[index].position;
}

/** Interpolate accepted snapshots; the body and each wheel have independent poses. */
export function vehicleDrawTransforms(run,alpha=1) {
  if(!Number.isFinite(alpha))throw RangeError('Invalid proving-ground interpolation');
  const t=clamp(alpha,0,1),state=run.vehicle,previous=run.previous??state,stock=stockRecipe(run.modelId);
  const position=mix(previous.position,state.position,t),orientation=quatInterpolate(previous.orientation,state.orientation,t);
  const steering=previous.steering+(state.steering-previous.steering)*t;
  // wheelSpin is wrapped by vehicle3d. Interpolate the shortest arc through ±π.
  const spinDelta=Math.atan2(Math.sin(state.wheelSpin-previous.wheelSpin),Math.cos(state.wheelSpin-previous.wheelSpin));
  const wheelSpin=previous.wheelSpin+spinDelta*t;
  const stockReference=stock.wheel.radius+stock.suspension.restLength-stock.mass*9.81/(4*stock.suspension.spring)+.03;
  const body=matrix(orientation,subtract(position,rotate(orientation,[0,stockReference,0])));
  const wheels=state.wheels.map((_,i)=>{
    // Solver positive steering points its -Z heading toward +X, hence -Y yaw.
    const turn=i<2?axis(-steering,1):[0,0,0,1];
    const q=quatMultiply(quatMultiply(orientation,turn),axis(wheelSpin,0));
    return matrix(q,mix(wheelHub(previous,i,run.recipe),wheelHub(state,i,run.recipe),t));
  });
  return {body,wheels,pose:{position,orientation,steering,wheelSpin}};
}

/** Keep each original wheel's authored triangles, recentered on its physical hub. */
export function provingVehicleGeometry(modelId,paintId='factory') {
  const parts=garageVehicleGeometry(modelId,paintId),recipe=stockRecipe(modelId),wheels=Array.from({length:4},()=>({tyres:[],rims:[]}));
  for(const name of ['tyres','rims'])for(let i=0;i<parts[name].length;i+=33) {
    const triangle=Array.from(parts[name].slice(i,i+33));
    const x=(triangle[0]+triangle[11]+triangle[22])/3,z=(triangle[2]+triangle[13]+triangle[24])/3;
    const index=(z<0?0:2)+(x<0?0:1);
    const center=[(index%2?1:-1)*recipe.wheel.track/2,recipe.wheel.radius+.03,(index<2?-1:1)*recipe.wheel.wheelbase/2];
    for(let v=0;v<33;v+=11)for(let k=0;k<3;k++)triangle[v+k]-=center[k];
    wheels[index][name].push(...triangle);
  }
  return {body:Object.fromEntries(['shell','trim','glass','lamps'].map(name=>[name,parts[name]])),
    wheels:wheels.map(parts=>Object.fromEntries(Object.entries(parts).map(([name,vertices])=>[name,new Float32Array(vertices)])))};
}

const at=(x,y,z)=>[x,y,z];
function patch(out,x0,z0,x1,z1,y,color) {
  quad(out,[x0,y,z0],[x0,y,z1],[x1,y,z1],[x1,y,z0],color,[0,1,0]);
}
function ring(out,cx,cz,inner,outer,color,y=.024) {
  for(let i=0;i<128;i++) {
    const a=i*Math.PI/64,b=(i+1)*Math.PI/64;
    const p=(r,t)=>[cx+Math.cos(t)*r,y,cz+Math.sin(t)*r];
    quad(out,p(inner,a),p(inner,b),p(outer,b),p(outer,a),color,[0,1,0]);
  }
}

/** Original industrial facility. Timing routes are painted; only shared AABBs are solid. */
export function provingGroundGeometry() {
  const batches={ground:[],asphalt:[],markings:[],barriers:[],scenery:[],signs:[]};
  const {ground,asphalt,markings,barriers,scenery,signs}=batches;
  patch(ground,-460,-1550,460,370,-.025,[.26,.29,.24]);
  patch(asphalt,-125,-1345,125,125,0,[.16,.19,.20]);
  patch(asphalt,-13,-1200,13,30,.009,[.12,.145,.155]);
  patch(asphalt,-63,-192,-37,16,.012,[.135,.16,.17]);
  ring(asphalt,65,55,26,38,[.125,.15,.16],.012);
  for(const x of [-12.7,12.7])patch(markings,x-.09,-1200,x+.09,30,.024,[.82,.82,.68]);
  for(let z=-1180;z<25;z+=20)patch(markings,-.07,z,.07,z+7,.025,[.75,.76,.66]);
  patch(markings,-12.8,0,12.8,.42,.026,[.89,.88,.73]);
  // Hundred-metre alternating side marks make distance legible without invented results.
  for(let i=1;i<=12;i++) {
    patch(markings,-13,-i*100-.4,-8,-i*100+.4,.027,[.9,.61,.22]);
    patch(markings,8,-i*100-.4,13,-i*100+.4,.027,[.9,.61,.22]);
    lettering(markings,String(i*100),.20,(x,y)=>[17+x,.028,-i*100-y],[.83,.83,.68]);
  }
  for(let z=-1050;z<-900;z+=8) {
    patch(markings,-12.5,z,-10.8,z+3,.029,[.85,.39,.22]);
    patch(markings,10.8,z,12.5,z+3,.029,[.85,.39,.22]);
  }
  for(const x of [-62,-38])for(let z=-190;z<14;z+=10)patch(markings,x-.08,z,x+.08,z+5,.025,[.63,.72,.69]);
  // Gate and corridor locations below are the same trusted content used by core.
  const slalom=PROVING_TRACK.slalom;
  for(const gate of slalom.gates) {
    const [x,z]=gate.center;
    patch(markings,x-gate.halfWidth,z-.20,x+gate.halfWidth,z+.20,.03,[.91,.66,.24]);
    for(const side of [-1,1])patch(markings,x+side*gate.halfWidth-.32,z-1.1,x+side*gate.halfWidth+.32,z+1.1,.031,[.91,.66,.24]);
  }
  const handling=PROVING_TRACK.handling;
  for(const r of [handling.radius-handling.corridorHalfWidth,handling.radius+handling.corridorHalfWidth])ring(markings,handling.center[0],handling.center[1],r-.10,r+.10,[.78,.81,.66],.027);
  for(const gate of handling.gates) {
    const [x,z]=gate.center,[nx,nz]=gate.normal,rx=-nz,rz=nx;
    quad(markings,[x-rx*gate.halfWidth-nx*.2,.030,z-rz*gate.halfWidth-nz*.2],
      [x-rx*gate.halfWidth+nx*.2,.030,z-rz*gate.halfWidth+nz*.2],
      [x+rx*gate.halfWidth+nx*.2,.030,z+rz*gate.halfWidth+nz*.2],
      [x+rx*gate.halfWidth-nx*.2,.030,z+rz*gate.halfWidth-nz*.2],[.40,.72,.72],[0,1,0]);
  }
  // These meshes match the accepted world's complete collision boxes exactly.
  for(const boundary of PROVING_TRACK.barriers) {
    const {min,max}=boundary;
    box(barriers,at,min.map((v,i)=>(v+max[i])/2),min.map((v,i)=>max[i]-v),[.49,.52,.49]);
  }
  // Every tall decorative fixture is beyond the solid facility perimeter.
  // It is scenery, unreachable by a valid test car; it introduces no hidden contacts.
  for(const side of [-1,1])for(let i=0;i<10;i++) {
    const x=side*(153+i%3*13),z=90-i*143,h=8+i%4*3;
    box(scenery,at,[x,h/2,z],[18,h,34],[.30+.025*(i%3),.34,.34]);
    box(scenery,at,[x,h+.45,z],[20,.9,36],[.19,.24,.25]);
    box(scenery,at,[x-side*10,h*.72,z],[.4,1.5,22],[.62,.68,.56]);
    if(i%2===0) {
      box(scenery,at,[x,15,z-24],[3,30,3],[.38,.41,.40]);
      box(scenery,at,[x,30.4,z-24],[4,.8,4],[.20,.26,.26]);
    }
  }
  box(scenery,at,[0,7,145],[65,14,15],[.32,.37,.37]);
  box(scenery,at,[0,14.6,145],[67,1.2,17],[.18,.25,.26]);
  box(signs,at,[0,8.9,137.4],[34,4.8,.2],[.085,.14,.15]);
  lettering(signs,'PROVING',.62,(x,y)=>[x,8.1+y,137.25],[.83,.75,.48]);
  return Object.fromEntries(Object.entries(batches).map(([name,vertices])=>[name,new Float32Array(vertices)]));
}

const materials={ground:{roughness:.98},asphalt:{roughness:.94,pattern:'asphalt',patternScale:.7},
  markings:{roughness:.85},barriers:{roughness:.85},scenery:{roughness:.80},signs:{roughness:.6},
  shell:{roughness:.29,metalness:.20},trim:{roughness:.45,metalness:.18},glass:{roughness:.13,metalness:.34},
  lamps:{emission:.35},tyres:{roughness:.95},rims:{roughness:.28,metalness:.58}};
const light={ambient:.69,sunDirection:[-.48,.82,-.29],sunColor:[.99,.91,.72],
  skyTop:[.17,.32,.40],skyBottom:[.61,.65,.59],fogColor:[.49,.57,.56],fogDensity:.0005,
  near:.10,far:1900,fov:.86,exposure:1.07};

// Caller owns restoration: dispose and recreate the retained scene after WebGL restore.
export function createProvingScene(canvas,run,pixelRatio=1) {
  const renderer=new LitRenderer(canvas,{profile:'high',pixelRatio});
  try {
    const modelId=run.modelId,paintId=run.build.parts.paint;
    const upload=parts=>Object.entries(parts).map(([name,vertices])=>({name,mesh:renderer.mesh(vertices)}));
    const facility=upload(provingGroundGeometry()),geometry=provingVehicleGeometry(modelId,paintId);
    const body=upload(geometry.body),wheels=geometry.wheels.map(upload);
    return {
      stats:()=>renderer.stats(),dispose:()=>renderer.dispose(),
      draw(current,{alpha=1,camera='chase',reducedMotion=false}={}) {
        if(renderer.lost)return;
        if(current.modelId!==modelId||current.build.parts.paint!==paintId)throw RangeError('Proving-ground scene requires its accepted model and paint');
        if(!['chase','high'].includes(camera))throw RangeError('Unknown proving-ground camera');
        const poses=vehicleDrawTransforms(current,alpha),{position,orientation}=poses.pose;
        // Follow horizontal accepted forward, leaving physical body pitch/roll on the car.
        const forward=rotate(orientation,[0,0,-1]),horizontal=Math.hypot(forward[0],forward[2]);
        const direction=horizontal>1e-8?[forward[0]/horizontal,0,forward[2]/horizontal]:[0,0,-1];
        const rect=canvas.getBoundingClientRect(),aspect=rect.width/Math.max(1,rect.height);
        const narrow=Math.max(1,.92/Math.max(.25,aspect)),high=camera==='high';
        const eye=add(position,add(scale(direction,-(high?13:7.2)*narrow),[0,(high?8.5:3.25)*narrow,0]));
        const target=add(position,add(scale(direction,high?5:7.5),[0,.25,0]));
        renderer.begin(eye,lookAt(eye,target),{...light,fov:reducedMotion ? .86 : .89});
        for(const {name,mesh} of facility)renderer.draw(mesh,{material:materials[name]});
        for(const {name,mesh} of body)renderer.draw(mesh,{matrix:poses.body,material:materials[name]});
        for(let i=0;i<4;i++)for(const {name,mesh} of wheels[i])renderer.draw(mesh,{matrix:poses.wheels[i],material:materials[name]});
      }
    };
  } catch(error) {renderer.dispose();throw error;}
}
