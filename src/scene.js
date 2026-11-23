// SPDX-License-Identifier: Apache-2.0
import { createHeadlightPass, selectHeadlights } from './headlights.js';
import { LitRenderer } from '../vendor/vanillajs/modules/render-lit/index.js';
import { nightFrame, validateEnvironment } from './environment.js';
import { buildNightWorld, nightStars } from './night-fixtures.js';
import { cross, normalize } from '../vendor/vanillajs/modules/math/index.js';
import { ridgeBatches } from './ridge-scene.js';
import { speedwayBatches } from './speedway.js';
import { bodyTransform, wheelTransforms, touringMeshes } from './touring-car.js';
import { track } from './track.js';
import { PLAYER_ID } from './field.js';
import { createDrivingEffects } from './effects.js';
import { createChaseCamera, lookAt, showroom } from './camera.js';

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

function columnMatrix(x,y,z,origin) {
  return [...x,0,...y,0,...z,0,...origin,1];
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

export function createScene(canvas,course=track,pixelRatio=1,environment='day') {
  const night=validateEnvironment(environment)==='night';
  const light=night ? nightFrame(course) : course.closed ? LIGHT : RIDGE_LIGHT;
  const renderer=new LitRenderer(canvas,{profile:'high',pixelRatio});
  let world,car,shadow,effects,headlights,stars;
  try {
    const base=course.closed ? speedwayBatches() : ridgeBatches(course);
    const batches=night ? buildNightWorld(course,base) : base;
    world=batches.map(({vertices,material,bounds})=>({mesh:renderer.mesh(vertices),material,bounds}));
    car=touringMeshes(renderer,night);
    if(night) stars=renderer.mesh(nightStars(course));
    effects=createDrivingEffects(renderer);
    shadow=renderer.mesh(shadowVertices);
    if(night) headlights=createHeadlightPass(renderer.gl,batches);
  } catch (error) {
    renderer.dispose();
    throw error;
  }
  const glass={roughness:.22,metalness:.20,opacity:.79,pattern:'glass'};
  const trim={roughness:.42,metalness:.18};
  const cameraRig=createChaseCamera(course);
  function drawCar(p,livery) {
    const road=course.project(p.x,p.z);
    const shadowRight=normalize(cross(road.normal,[Math.sin(p.yaw),0,Math.cos(p.yaw)]));
    const shadowMatrix=columnMatrix(shadowRight,road.normal,cross(shadowRight,road.normal),
      [p.x,road.y+.032,p.z]);
    renderer.draw(shadow,{matrix:shadowMatrix,material:shadowMaterial});

    const root=bodyTransform(p);
    renderer.draw(car.shell,{matrix:root,material:livery.paint});
    renderer.draw(car.detail,{matrix:root,material:trim});
    renderer.draw(livery.graphics,{matrix:root,material:PAINT});
    if(car.projectors) renderer.draw(car.projectors,{matrix:root,material:{roughness:.25,emission:1.25}});
    renderer.draw(car.lamps,{matrix:root,material:{roughness:.24,emission:(night ? .54 : .29)+1.7*(p.brake??0)}});
    for(const matrix of wheelTransforms(car.rig,p,root)) {
      renderer.draw(car.tyre,{matrix,material:car.tyreMaterial});
      renderer.draw(car.rim,{matrix,material:car.rimMaterial});
    }
    return root;
  }
  const glassDraws=[];
  let lastMode,lastFollow=PLAYER_ID,lastCamera='chase';
  return {
    observe:effects.observe,
    resetEffects:effects.reset,
    draw(poses,{mode='racing',camera='chase',followId=PLAYER_ID,dt=1/60,reducedMotion=false,reducedEffects=false}={}) {
      if(renderer.lost)return;
      const p=poses[followId]??poses[PLAYER_ID];
      if(!p || !Number.isInteger(followId) || followId<0 || followId>=poses.length)
        throw RangeError('Invalid spectator camera target');
      // During paused spectator inspection there is no elapsed presentation
      // time to blend a new preset. Snap the camera without moving the cars.
      if(lastFollow!==followId || (lastCamera!==camera && dt===0) ||
         lastMode==='menu' || (mode==='grid' && lastMode!==mode))cameraRig.reset();
      lastFollow=followId;lastCamera=camera;
      const aspect=canvas.clientWidth/Math.max(1,canvas.clientHeight);
      const view=mode==='menu' ? showroom(p,aspect,course) :
        cameraRig.update(p,poses,{camera,dt:mode==='paused'?0:dt,reducedMotion});
      lastMode=mode;
      const orientation=lookAt(view.eye,view.target,view.roll), frame={...light,fov:view.fov};
      renderer.begin(view.eye,orientation,frame);
      if(stars) renderer.draw(stars,{
        matrix:columnMatrix([1,0,0],[0,1,0],[0,0,1],view.eye),
        material:{emission:1.25,opacity:.98}
      });
      const forward=normalize(view.target.map((v,i)=>v-view.eye[i]));
      const horizontalSlope=aspect*Math.tan(view.fov/2);
      for(const row of world) if(visible(row.bounds,view.eye,forward,horizontalSlope,light.far))
        renderer.draw(row.mesh,{material:row.material});

      if(headlights) {
        const sources=selectHeadlights(poses,p,reducedEffects,mode==='menu');
        headlights.draw(sources,view.eye,orientation,frame,
          cell=>visible(cell,view.eye,forward,horizontalSlope,light.far));
      }
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
      for (const {matrix} of glassDraws) renderer.draw(car.glass,{matrix,material:glass});
      if(mode==='racing' || mode==='paused' || mode==='finished') effects.draw(view.eye,forward,reducedEffects);
    },
    dispose(){
      // A restored context has already released the previous generation's handles.
      if(!renderer.lost) headlights?.dispose();
      renderer.dispose();
    }
  };
}
