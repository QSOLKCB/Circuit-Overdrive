// SPDX-License-Identifier: Apache-2.0
import {LitRenderer} from '../vendor/vanillajs/modules/render-lit/index.js';
import {lookAt} from './camera.js';
import {GARAGE_CATALOG, garageModel} from './garage-catalog.js';
import {GARAGE_BAY_POSITIONS, GARAGE_PREVIEW_POSITION, garageGeometry, garageVehicleGeometry} from './garage-geometry.js';

const material={
  floor:{roughness:.94,pattern:'asphalt',patternScale:.6},
  structure:{roughness:.77},details:{roughness:.48,metalness:.12},lights:{emission:.55,roughness:.45},
  shell:{roughness:.29,metalness:.20},trim:{roughness:.45,metalness:.18},
  glass:{roughness:.13,metalness:.34},lamps:{emission:.35},tyres:{roughness:.95},rims:{roughness:.28,metalness:.58}
};
const LIGHT={ambient:.84,sunDirection:[-.43,.84,-.48],sunColor:[.91,.88,.76],
  skyTop:[.065,.10,.13],skyBottom:[.18,.25,.26],fogColor:[.15,.20,.21],fogDensity:0,
  near:.08,far:85,fov:.76,exposure:1.12};
const transform=([x,y,z])=>[1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1];
const positions=[GARAGE_PREVIEW_POSITION,...GARAGE_BAY_POSITIONS];
const matrices=positions.map(transform);
const shadowVertices=new Float32Array([
  [-1.25,-2.75,0,0],[1.25,-2.75,1,0],[1.25,2.75,1,1],
  [1.25,2.75,1,1],[-1.25,2.75,0,1],[-1.25,-2.75,0,0]
].flatMap(([x,z,u,v])=>[x,.015,z,0,1,0,1,1,1,u,v]));
const shadowMaterial={color:[.025,.035,.04],pattern:'shadow',opacity:.70};
const cameras={front:{eye:[6,3.4,-11.7],target:[0,1,-4.5]},
  side:{eye:[9.1,2.7,-4.3],target:[0,.92,-4.5]},
  rear:{eye:[-5.7,3.3,2.3],target:[0,1,-4.5]},
  bays:{eye:[14,11,-19],target:[0,.65,1.4]}};
export const GARAGE_CAMERAS=Object.freeze(Object.keys(cameras));

// A caller owns the canvas lifecycle: recreate this scene after restoration.
// No animation clock, simulation state or save mutation is owned by the scene.
export function createGarageScene(canvas,pixelRatio=1) {
  const renderer=new LitRenderer(canvas,{profile:'high',pixelRatio});
  try {
    const geometry=garageGeometry();
    const upload=parts=>Object.entries(parts).map(([name,vertices])=>({name,mesh:renderer.mesh(vertices)}));
    const workshop=upload(geometry.workshop),vehicles=new Map(geometry.vehicles.map(({modelId,parts})=>[modelId+':factory',upload(parts)]));
    // At most six original models × four finite finishes. Cache each accepted
    // variant once; selection never allocates an unbounded stream of meshes.
    function vehicleMeshes(modelId,paintId) {
      const key=modelId+':'+paintId;
      if(!vehicles.has(key))vehicles.set(key,upload(garageVehicleGeometry(modelId,paintId)));
      return vehicles.get(key);
    }
    const shadow=renderer.mesh(shadowVertices);
    return {
      stats:()=>renderer.stats(),dispose:()=>renderer.dispose(),
      draw({garage=null,modelId=GARAGE_CATALOG[0].modelId,ownedVehicleId=null,camera='front'}={}) {
        if(renderer.lost)return;
        garageModel(modelId);
        if(!GARAGE_CAMERAS.includes(camera))throw RangeError('Unknown garage camera');
        const preset=cameras[camera],rect=canvas.getBoundingClientRect(),aspect=rect.width/Math.max(1,rect.height);
        // Narrow viewports pull back immediately. There is no automatic orbit,
        // camera interpolation, or motion needing a reduced-motion exception.
        const factor=Math.max(1,.94/Math.max(.25,aspect));
        const eye=preset.eye.map((v,i)=>preset.target[i]+(v-preset.target[i])*factor);
        renderer.begin(eye,lookAt(eye,preset.target),LIGHT);
        for(const {name,mesh} of workshop)renderer.draw(mesh,{material:material[name]});
        const ids=[modelId,...GARAGE_BAY_POSITIONS.map((_,i)=>garage?.bays[i]?.modelId??null)];
        const inspected=garage?.bays.find(car=>car?.ownedVehicleId===ownedVehicleId&&car.modelId===modelId);
        const paints=[inspected?.build?.parts.paint??'factory',...GARAGE_BAY_POSITIONS.map((_,i)=>garage?.bays[i]?.build?.parts.paint??'factory')];
        for(let i=0;i<ids.length;i++)if(ids[i])renderer.draw(shadow,{matrix:matrices[i],material:shadowMaterial});
        for(let i=0;i<ids.length;i++) {
          if(!ids[i])continue;
          const parts=vehicleMeshes(ids[i],paints[i]);
          if(!parts)throw RangeError('Unknown owned garage model');
          for(const {name,mesh} of parts)renderer.draw(mesh,{matrix:matrices[i],material:material[name]});
        }
      }
    };
  } catch(error) { renderer.dispose();throw error; }
}
