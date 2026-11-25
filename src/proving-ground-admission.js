// SPDX-License-Identifier: Apache-2.0
// Read-only selection authority. No slot write, transaction, reward or damage.
import {validateGarage} from './garage.js';
import {garageModel} from './garage-catalog.js';
import {garageRecord} from './garage-data.js';
import {compileVehicleBuild,stockVehicleBuild,stockUpgradeBuild} from './vehicle-builds.js';
import {vehiclePart} from './vehicle-parts.js';

export function admitProvingSelection(garage, value) {
  const selection=garageRecord(value,['mode','ownedVehicleId','modelId','slot','partId'],'Proving selection');
  if(!['current','stock','proposed'].includes(selection.mode))throw TypeError('Unknown proving build mode');
  let car=null,state=null;
  if(selection.ownedVehicleId!==null){
    if(typeof selection.ownedVehicleId!=='string'||!/^car-[0-9]{6}$/.test(selection.ownedVehicleId))throw TypeError('Invalid proving owned ID');
    state=validateGarage(garage);
    car=state.bays.find(car=>car?.ownedVehicleId===selection.ownedVehicleId);
    if(!car)throw RangeError('Select an actually owned car before this test');
  }
  if(selection.mode==='current'&&!car)throw RangeError('Current build requires an accepted owned vehicle');
  const model=garageModel(car?.modelId??selection.modelId);
  let build=selection.mode==='stock'?stockVehicleBuild(model.modelId):car?.build??stockVehicleBuild(model.modelId);
  if(selection.mode==='proposed'){
    vehiclePart(selection.slot,selection.partId);
    const prior=stockUpgradeBuild(model.modelId,build);
    const draft={...prior,parts:{...prior.parts,[selection.slot]:selection.partId},tuning:{...prior.tuning},
      inventory:Object.fromEntries(Object.entries(prior.inventory).map(([slot,ids])=>[slot,ids.slice()]))};
    if(!draft.inventory[selection.slot].includes(selection.partId))draft.inventory[selection.slot].push(selection.partId);
    if(selection.slot==='finalDrive'&&selection.partId==='stock')draft.tuning.finalDrive=0;
    if(selection.slot==='suspension'&&selection.partId==='stock')for(const key of ['spring','damper','travel'])draft.tuning[key]=0;
    if(selection.slot==='steering'&&selection.partId==='stock')draft.tuning.steering=0;
    build=compileVehicleBuild(model.modelId,draft).build;
  }else if(selection.slot!==null||selection.partId!==null)throw TypeError('Only a proposed simulation accepts a part choice');
  const accepted=compileVehicleBuild(model.modelId,build);
  return Object.freeze({mode:selection.mode,scope:selection.mode==='current'?'owned-saved-build':selection.mode+'-simulation',
    modelId:model.modelId,ownedVehicleId:car?.ownedVehicleId??null,garageRevision:state?.revision??null,
    build:accepted.build,recipe:accepted.recipe});
}
