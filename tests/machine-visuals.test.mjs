// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {GARAGE_CATALOG} from '../src/garage-catalog.js';
import {garageVehicleGeometry} from '../src/garage-geometry.js';
import {provingVehicleGeometry} from '../src/proving-ground-scene.js';

test('original tyre-pack rim styles retain physical wheel geometry and cosmetic-only spokes',()=>{
  for(const {modelId} of GARAGE_CATALOG){
    const stock=garageVehicleGeometry(modelId);
    for(const tyres of ['touring','performance','economy']){
      const parts=garageVehicleGeometry(modelId,'factory',{tyres,exhaust:'stock'});
      assert.deepEqual(parts.shell,stock.shell);assert.deepEqual(parts.tyres,stock.tyres);
      assert.notDeepEqual(parts.rims,stock.rims);assert.equal(parts.rims.length,stock.rims.length);
      for(let i=0;i<parts.rims.length;i+=11)assert.deepEqual(parts.rims.slice(i,i+3),stock.rims.slice(i,i+3));
      const live=provingVehicleGeometry(modelId,'factory',{tyres,exhaust:'stock'});
      assert.equal(live.wheels.length,4);assert(live.wheels.every(w=>w.rims.every(Number.isFinite)));
    }
  }
});
test('accepted flow-exhaust appearance adds original bounded tail pieces without changing tyres or panels',()=>{
  for(const {modelId} of GARAGE_CATALOG){
    const stock=garageVehicleGeometry(modelId),flow=garageVehicleGeometry(modelId,'factory',{tyres:'stock',exhaust:'flow'});
    for(const name of ['shell','tyres','rims','glass','lamps'])assert.deepEqual(flow[name],stock[name]);
    assert(flow.trim.length>stock.trim.length);assert(flow.trim.every(Number.isFinite));
    const stockZ=Math.max(...Array.from(stock.trim).filter((_,i)=>i%11===2)),flowZ=Math.max(...Array.from(flow.trim).filter((_,i)=>i%11===2));
    assert(flowZ-stockZ<.20);
  }
  assert.throws(()=>garageVehicleGeometry('cinder-two','factory',{tyres:'invented',exhaust:'stock'}),/Unknown/);
});
