// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import {GARAGE_CATALOG} from '../src/garage-catalog.js';
import {garageVehicleGeometry} from '../src/garage-geometry.js';
import {compileVehicleBuild, stockVehicleBuild} from '../src/vehicle-builds.js';
import {createVehicle} from '../vendor/vanillajs/modules/vehicle3d/index.js';

// Independent measurements of the published original silhouettes. Body width
// excludes mirrors/tyre faces; roof height is measured from showroom floor.
const silhouettes = [
  ['cinder-two',4.25,1.75,1.51,.34,2.465],
  ['lilt',3.58,1.65,1.65,.32,2.0764],
  ['evening-line',4.85,1.86,1.44,.35,2.813],
  ['rivet-eight',4.68,2.02,1.51,.38,2.7144],
  ['yardhand',4.95,1.94,1.91,.41,2.871],
  ['glass-comet',4.38,1.96,1.28,.35,2.5404]
];
const close = (actual, expected, label) => assert(Math.abs(actual-expected)<1e-6,
  `${label}: ${actual} versus ${expected}`);
function points(vertices) {
  assert(vertices instanceof Float32Array);
  assert.equal(vertices.length%11,0);
  const result=[];
  for(let i=0;i<vertices.length;i+=11) result.push(Array.from(vertices.slice(i,i+3)));
  return result;
}
function bounds(rows) {
  assert(rows.length>0);
  return {min:[0,1,2].map(i=>Math.min(...rows.map(p=>p[i]))),
    max:[0,1,2].map(i=>Math.max(...rows.map(p=>p[i])))};
}
const surface={height:0,normal:[0,1,0],friction:1,surfaceId:'geometry-dry-plane-v1'};
const plane={sampleSurface:()=>surface,barriers:[]};

test('independent silhouette table covers exactly the six catalogue identities',()=>{
  assert.deepEqual(silhouettes.map(row=>row[0]).sort(),GARAGE_CATALOG.map(m=>m.modelId).sort());
});

for(const [modelId,length,width,roof,radius,wheelbase] of silhouettes) {
  test(`${modelId}: compiled footprint matches original wheel geometry and disclosed visual extensions`,()=>{
    const {recipe}=compileVehicleBuild(modelId,stockVehicleBuild(modelId));
    const groups=garageVehicleGeometry(modelId);
    close(recipe.chassis.length,length,'body length');
    close(recipe.chassis.width,width,'body width');
    close(recipe.wheel.track,width,'wheel track');
    close(recipe.wheel.wheelbase,wheelbase,'wheelbase');
    close(recipe.wheel.radius,radius,'wheel radius');
    const shell=bounds(points(groups.shell));
    close(shell.min[0],-width/2,'shell left');
    close(shell.max[0],width/2,'shell right');
    close(shell.min[2],-length/2,'shell nose');
    close(shell.max[2],length/2,'shell tail');
    const visual=bounds(Object.values(groups).flatMap(points));
    close(visual.min[0],-width/2-.215,'left mirror extension');
    close(visual.max[0],width/2+.215,'right mirror extension');
    close(visual.min[2],-length/2-.074,'front bumper extension');
    close(visual.max[2],length/2+.089,'rear plate extension');
    close(visual.min[1],.03,'static showroom ground gap');
    close(visual.max[1],roof,'roof height');
    // Body height is a dimensional/mass-distribution approximation. Its centred
    // box is not claimed to be a tight collision hull around the mount origin.
    assert(recipe.chassis.height>=roof-shell.min[1]);
    assert(recipe.chassis.height<roof);
    for(const side of [-1,1]) for(const axle of [-1,1]) {
      const tyre=bounds(points(groups.tyres).filter(p=>Math.sign(p[0])===side&&Math.sign(p[2])===axle));
      close((tyre.min[2]+tyre.max[2])/2,axle*wheelbase/2,'axle centre');
      close((tyre.min[1]+tyre.max[1])/2,radius+.03,'display hub height');
      close(tyre.max[2]-tyre.min[2],2*radius,'tyre diameter');
      close(side<0?tyre.min[0]:tyre.max[0],side*(width/2+.15),'outer tyre face');
      close(side<0?tyre.max[0]:tyre.min[0],side*(width/2-.12),'inner tyre face');
    }
  });

  test(`${modelId}: supported spawn, conservative cube containment and actual wall contact`,()=>{
    const {recipe}=compileVehicleBuild(modelId,stockVehicleBuild(modelId));
    const vehicle=createVehicle(recipe),spawn=vehicle.spawn();
    const compression=recipe.mass*9.81/(4*recipe.suspension.spring);
    assert(compression<recipe.suspension.travel*.9);
    assert(recipe.suspension.travel<=recipe.suspension.restLength);
    close(spawn.position[1],radius+recipe.suspension.restLength-compression,'supported origin');
    let supported=spawn;
    for(let i=0;i<120;i++) supported=vehicle.step(supported,{},plane,1/60);
    assert(supported.wheels.every(w=>w.grounded));
    assert(!supported.truncated&&!supported.needsRecovery);
    close(supported.wheels.reduce((sum,w)=>sum+w.load,0),recipe.mass*9.81,'static weight support');
    supported.wheels.forEach(w=>close(w.compression,compression,'static wheel compression'));
    const halfExtent=Math.hypot(recipe.chassis.width,recipe.chassis.length,recipe.chassis.height)/2;
    // Static visual translation removes its cosmetic 3 cm gap solely to check
    // containment; driving body/wheel transforms are a later integration gate.
    for(const p of Object.values(garageVehicleGeometry(modelId)).flatMap(points)) {
      const relative=[p[0],p[1]-.03-spawn.position[1],p[2]];
      assert(Math.hypot(...relative)<halfExtent,'conservative cube contains each static visual point in every orientation');
    }
    assert(halfExtent>width/2+.215,'cube has excess lateral clearance beyond visible mirrors');
    const world={...plane,barriers:[{id:'geometry-wall',min:[-20,-5,-21],max:[20,8,-20]}]};
    let state=vehicle.spawn({velocity:[0,0,-20]}),contact=false,contactGap=Infinity;
    for(let i=0;i<180;i++) {
      state=vehicle.step(state,{},world,1/60);
      contact ||= state.contacts.includes('geometry-wall');
      if(state.contacts.includes('geometry-wall')) contactGap=Math.min(contactGap,state.position[2]-(-20+halfExtent));
      assert(state.position[2]>=-20+halfExtent-1e-6,'wall blocks conservative cube before visible bumper');
      assert(!state.truncated&&!state.needsRecovery);
    }
    assert(contact,'actual pinned solver reached and contacted the wall');
    // Suspension/contact forces can move the chassis slightly away after the
    // sweep; an accepted contacting pose must approach its 1 µm skin closely.
    assert(contactGap>=0&&contactGap<1e-5,'accepted wall contact matches conservative cube within 10 µm');
  });
}
