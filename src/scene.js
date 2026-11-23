// SPDX-License-Identifier: Apache-2.0
import { LitRenderer } from '../vendor/vanillajs/modules/render-lit/index.js';
import { vehicleDraws } from '../vendor/vanillajs/modules/scenic3d/index.js';
import { clamp, cross, multiplyMatrices, normalize, quatMultiply, rotate } from '../vendor/vanillajs/modules/math/index.js';
import { ridgeBatches } from './ridge-scene.js';
import { speedwayBatches } from './speedway.js';
import { touringMeshes } from './touring-car.js';
import { track } from './track.js';
import { PLAYER_ID } from './field.js';
import { carRecipe, rideHeight } from './sim.js';

const bodyHeightScale=.92;
const staticCompression=carRecipe.wheel.radius+carRecipe.suspension.restLength-rideHeight;

const LIGHT = {
  ambient:.49, sunDirection:[-.62,.84,-.44], sunColor:[1,.93,.82],
  skyTop:[.105,.49,.83], skyBottom:[.68,.85,.94], fogColor:[.68,.82,.86], fogDensity:.00125,
  near:.13, far:1650
};
const RIDGE_LIGHT = {...LIGHT, ambient:.54, skyTop:[.13,.40,.63], skyBottom:[.81,.85,.79],
  sunDirection:[-.55,.83,-.30], fogColor:[.68,.76,.74], fogDensity:.00094};
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
  return columnMatrix(rotate(q,[1.037,0,0]),rotate(q,[0,bodyHeightScale,0]),rotate(q,[0,0,.898]),
    [p.x+down[0],p.y+down[1],p.z+down[2]]);
}

function showroom(p, aspect, course) {
  const narrow=aspect<1.08;
  // Position the car above the menu on portrait screens and alongside it in landscape.
  const offset=narrow ? 1.28/Math.max(.4,aspect) : 1;
  const f=course.project(p.x,p.z);
  const eye=[p.x+(-3.65*f.rx+4.55*f.tx)*offset,p.groundY+1.72*offset,
    p.z+(-3.65*f.rz+4.55*f.tz)*offset];
  const distance=Math.hypot(eye[0]-p.x,eye[2]-p.z);
  const fov=narrow ? .80 : .69;
  const shift=narrow ? 0 : Math.min(3.75, .40*aspect*distance*Math.tan(fov/2));
  const target=[p.x+(p.z-eye[2])*shift/distance,p.groundY+(narrow ? -.4 : 1.14),
    p.z-(p.x-eye[0])*shift/distance];
  return {eye,target,fov};
}

function chase(p, direction, high, course) {
  const forward=[-Math.sin(direction),0,-Math.cos(direction)];
  const distance=high ? 10.8 : 6.7+Math.min(p.speed,62)*.01;
  const eye=[p.x-distance*forward[0],p.y-rideHeight+(high ? 5.6 : 2.85),p.z-distance*forward[2]];
  // Pull an oblique chase position back inside the rails during a slide.
  const projected=course.project(eye[0],eye[2]);
  const safe=clamp(projected.lateral,1.1-course.barrierOffset,course.barrierOffset-1.1);
  eye[0]+=projected.rx*(safe-projected.lateral);
  eye[2]+=projected.rz*(safe-projected.lateral);
  if(!course.closed) {
    const safeRoad=course.sample(projected.s,safe);
    eye[1]+=safeRoad.y-p.groundY;
  }
  eye[1]=Math.max(eye[1],projected.y+1.4);
  const target=[p.x+forward[0]*5.6,p.y-rideHeight+.99,p.z+forward[2]*5.6];
  if(!course.closed) target[1]+=course.project(target[0],target[2]).y-p.groundY;
  return {eye,target,fov:.88+Math.min(p.speed/60,1)*.11};
}

// Test a horizontal frustum against each retained 3D bounding sphere. The sky
// and valley panorama stay in one persistent batch independent of the vehicle.
function visible(bounds,eye,forward,horizontalSlope,far) {
  if(!bounds) return true;
  const x=bounds.x-eye[0], y=bounds.y-eye[1], z=bounds.z-eye[2];
  const depth=x*forward[0]+y*forward[1]+z*forward[2];
  if(depth < -bounds.r || depth > far+bounds.r) return false;
  const lateral=Math.abs(x*forward[2]-z*forward[0])/Math.hypot(forward[0],forward[2]);
  return lateral <= depth*horizontalSlope+bounds.r*Math.hypot(1,horizontalSlope);
}

export function createScene(canvas,course=track) {
  const renderer=new LitRenderer(canvas,{profile:'high',pixelRatio:1});
  let world,car,shadow;
  try {
    const batches=course.closed ? speedwayBatches() : ridgeBatches(course);
    world=batches.map(({vertices,material,bounds})=>({mesh:renderer.mesh(vertices),material,bounds}));
    car=touringMeshes(renderer);
    shadow=renderer.mesh(shadowVertices);
  } catch (error) {
    renderer.dispose();
    throw error;
  }
  const wheels = new Array(4);
  const glass = car.visual.parts.find(part => part.id === 'windows');
  function drawCar(p,livery) {
    const road=course.project(p.x,p.z);
    const shadowRight=normalize(cross(road.normal,[Math.sin(p.yaw),0,Math.cos(p.yaw)]));
    const shadowMatrix=columnMatrix(shadowRight,road.normal,cross(shadowRight,road.normal),
      [p.x,road.y+.032,p.z]);
    renderer.draw(shadow,{matrix:shadowMatrix,material:shadowMaterial});

    const root=carMatrix(p);
    const parts=vehicleDraws(car.visual,{steer:-p.steering,wheelSpin:p.wheelSpin,brake:p.brake??0});
    wheels.fill(null);
    for(const {part,matrix,material} of parts) {
      if(part.id==='windows')continue;
      let transform = root;
      if (part.wheel !== null) {
        if (!wheels[part.wheel]) {
          // The rig is authored at resting ride height. Both tyre and alloy
          // follow their own interpolated suspension travel from that reference.
          matrix[13] += (p.compression[part.wheel]-staticCompression)/bodyHeightScale;
          wheels[part.wheel] = multiplyMatrices(root,matrix);
        }
        transform = wheels[part.wheel];
      }
      renderer.draw(car.mesh.get(part.id),{
        matrix:transform,
        material:part.id==='body' ? livery.material : material
      });
    }
    renderer.draw(car.stripes,{matrix:root,material:PAINT});
    renderer.draw(livery.trim,{matrix:root,material:PAINT});
    renderer.draw(car.lamps,{matrix:root,material:{roughness:.26,emission:.32+1.3*(p.brake??0)}});
    return root;
  }
  const glassDraws=[];
  let direction, lastMode;
  return {
    draw(poses,{mode='racing',camera='chase',dt=1/60}={}) {
      if(renderer.lost)return;
      const p = poses[PLAYER_ID];
      if(direction===undefined || lastMode==='menu' || mode==='countdown') direction=p.yaw;
      const delta=Math.atan2(Math.sin(p.yaw-direction),Math.cos(p.yaw-direction));
      direction+=delta*(1-Math.exp(-clamp(dt,0,.1)*12));
      const aspect=canvas.clientWidth/Math.max(1,canvas.clientHeight);
      const view=mode==='menu' ? showroom(p,aspect,course) : chase(p,direction,camera==='high',course);
      lastMode=mode;
      const light=course.closed ? LIGHT : RIDGE_LIGHT;
      renderer.begin(view.eye,lookAt(view.eye,view.target),{...light,fov:view.fov});
      const forward=normalize(view.target.map((v,i)=>v-view.eye[i]));
      const horizontalSlope=aspect*Math.tan(view.fov/2);
      for(const row of world) if(visible(row.bounds,view.eye,forward,horizontalSlope,light.far))
        renderer.draw(row.mesh,{material:row.material});

      glassDraws.length = 0;
      for (const pose of poses) {
        if (pose.id !== PLAYER_ID && (mode === 'menu' || pose.finished)) continue;
        // Avoid submitting a whole car when its bounding sphere is behind the camera.
        const dx=pose.x-view.eye[0], dy=pose.y-view.eye[1], dz=pose.z-view.eye[2];
        const depth=dx*(view.target[0]-view.eye[0])+dy*(view.target[1]-view.eye[1])+dz*(view.target[2]-view.eye[2]);
        if (depth < -60) continue;
        const matrix = drawCar(pose, car.liveries[pose.id]);
        glassDraws.push({matrix,depth});
      }
      glassDraws.sort((a,b) => b.depth-a.depth);
      for (const {matrix} of glassDraws) renderer.draw(car.mesh.get('windows'),{matrix,material:glass.material});
    },
    dispose(){renderer.dispose();}
  };
}
