// SPDX-License-Identifier: Apache-2.0
import { LitRenderer } from '../vendor/vanillajs/modules/render-lit/index.js';
import { vehicleDraws } from '../vendor/vanillajs/modules/scenic3d/index.js';
import { clamp, cross, multiplyMatrices, normalize, quatMultiply, rotate } from '../vendor/vanillajs/modules/math/index.js';
import { speedwayBatches } from './speedway.js';
import { touringMeshes } from './touring-car.js';
import { track } from './track.js';
import { rideHeight } from './sim.js';

const LIGHT = {
  ambient:.49, sunDirection:[-.62,.84,-.44], sunColor:[1,.93,.82],
  skyTop:[.105,.49,.83], skyBottom:[.68,.85,.94], fogColor:[.68,.82,.86], fogDensity:.00125,
  near:.13, far:1650
};
const PAINT = {roughness:.32,metalness:.18};
const shadowMaterial={color:[.025,.037,.045],pattern:'shadow',opacity:.75};
const shadowVertices=new Float32Array([
  [-1.60,-3.02,0,0], [1.60,-3.02,1,0], [1.60,3.02,1,1],
  [1.60,3.02,1,1], [-1.60,3.02,0,1], [-1.60,-3.02,0,0]
].flatMap(([x,z,u,v])=>[x,0,z,0,1,0,1,1,1,u,v]));

function lookAt(eye,target) {
  const [dx,dy,dz]=target.map((v,k)=>v-eye[k]);
  const yaw=Math.atan2(-dx,-dz)/2;
  const pitch=Math.atan2(dy,Math.hypot(dx,dz))/2;
  return quatMultiply([0,Math.sin(yaw),0,Math.cos(yaw)],[Math.sin(pitch),0,0,Math.cos(pitch)]);
}
function columnMatrix(x,y,z,origin) {
  return [...x,0,...y,0,...z,0,...origin,1];
}

function carMatrix(p) {
  const qYaw=[0,Math.sin(p.yaw/2),0,Math.cos(p.yaw/2)];
  const qPitch=[Math.sin(p.pitch/2),0,0,Math.cos(p.pitch/2)];
  const qRoll=[0,0,Math.sin(p.roll/2),Math.cos(p.roll/2)];
  const q=quatMultiply(quatMultiply(qYaw,qPitch),qRoll);
  const down=rotate(q,[0,.012-rideHeight,0]);
  // Fit the touring rig to the authoritative 4.4 x 1.95 m chassis.
  return columnMatrix(rotate(q,[1.037,0,0]),rotate(q,[0,.92,0]),rotate(q,[0,0,.898]),
    [p.x+down[0],p.y+down[1],p.z+down[2]]);
}

function showroom(p, aspect) {
  const narrow=aspect<1.08;
  // Position the car above the menu on portrait screens and alongside it in landscape.
  const offset=narrow ? 1.28/Math.max(.4,aspect) : 1;
  const eye=[p.x-3.65*offset,p.groundY+1.72*offset,p.z-4.55*offset];
  const distance=Math.hypot(eye[0]-p.x,eye[2]-p.z);
  const fov=narrow ? .80 : .69;
  const shift=narrow ? 0 : Math.min(3.75, .40*aspect*distance*Math.tan(fov/2));
  const target=[p.x+(p.z-eye[2])*shift/distance,p.groundY+(narrow ? -.4 : 1.14),
    p.z-(p.x-eye[0])*shift/distance];
  return {eye,target,fov};
}

function chase(p, direction, high) {
  const forward=[-Math.sin(direction),0,-Math.cos(direction)];
  const distance=high ? 10.8 : 6.7+Math.min(p.speed,62)*.01;
  const eye=[p.x-distance*forward[0],p.y-rideHeight+(high ? 5.6 : 2.85),p.z-distance*forward[2]];
  // Pull an oblique chase position back inside the rails during a slide.
  const projected=track.project(eye[0],eye[2]);
  const safe=clamp(projected.lateral,1.1-track.barrierOffset,track.barrierOffset-1.1);
  eye[0]+=projected.rx*(safe-projected.lateral);
  eye[2]+=projected.rz*(safe-projected.lateral);
  eye[1]=Math.max(eye[1],projected.y+1.4);
  const target=[p.x+forward[0]*5.6,p.y-rideHeight+.99,p.z+forward[2]*5.6];
  return {eye,target,fov:.88+Math.min(p.speed/60,1)*.11};
}

export function createScene(canvas) {
  const renderer=new LitRenderer(canvas,{profile:'high',pixelRatio:1});
  let world,car,shadow;
  try {
    world=speedwayBatches().map(({vertices,material})=>({mesh:renderer.mesh(vertices),material}));
    car=touringMeshes(renderer);
    shadow=renderer.mesh(shadowVertices);
  } catch (error) {
    renderer.dispose();
    throw error;
  }
  let direction, lastMode;
  return {
    draw(p,{mode='racing',camera='chase',dt=1/60}={}) {
      if(renderer.lost)return;
      if(direction===undefined || lastMode==='menu' || mode==='countdown') direction=p.yaw;
      const delta=Math.atan2(Math.sin(p.yaw-direction),Math.cos(p.yaw-direction));
      direction+=delta*(1-Math.exp(-clamp(dt,0,.1)*12));
      const view=mode==='menu' ? showroom(p,canvas.clientWidth/Math.max(1,canvas.clientHeight)) :
        chase(p,direction,camera==='high');
      lastMode=mode;
      renderer.begin(view.eye,lookAt(view.eye,view.target),{...LIGHT,fov:view.fov});
      for(const row of world)renderer.draw(row.mesh,{material:row.material});

      const road=track.project(p.x,p.z);
      const shadowRight=normalize(cross(road.normal,[Math.sin(p.yaw),0,Math.cos(p.yaw)]));
      const shadowMatrix=columnMatrix(shadowRight,road.normal,cross(shadowRight,road.normal),
        [p.x,road.y+.032,p.z]);
      renderer.draw(shadow,{matrix:shadowMatrix,material:shadowMaterial});

      const root=carMatrix(p);
      const parts=vehicleDraws(car.visual,{steer:-p.steering,wheelSpin:p.wheelSpin,brake:p.brake??0});
      for(const {part,matrix,material} of parts) {
        if(part.id==='windows')continue;
        renderer.draw(car.mesh.get(part.id),{
          matrix:part.wheel===null ? root : multiplyMatrices(root,matrix),
          material:part.id==='body' ? PAINT : material
        });
      }
      renderer.draw(car.trim,{matrix:root,material:PAINT});
      renderer.draw(car.lamps,{matrix:root,material:{roughness:.26,emission:.32+1.3*(p.brake??0)}});
      const glass=parts.find(row=>row.part.id==='windows');
      renderer.draw(car.mesh.get('windows'),{matrix:root,material:glass.material});
    },
    dispose(){renderer.dispose();}
  };
}
