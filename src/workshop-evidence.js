// SPDX-License-Identifier: Apache-2.0
// Transient, untrusted test evidence. Never part of the ownership save protocol.
import {parseProvingReplay,serializeProvingReplay} from './proving-replay.js';
import {identifyVehicleBuild,stockVehicleBuild} from './vehicle-builds.js';
import {garageRecord,garageArray} from './garage-data.js';

export const WORKSHOP_EVIDENCE_SLOT='circuit-overdrive.workshop-evidence.v1';
export const WORKSHOP_EVIDENCE_BYTES=4*1024*1024;
const source=()=>globalThis.document?.querySelector('meta[name="game-revision"]')?.content||null;
function cache(text){
  if(typeof text!=='string'||new TextEncoder().encode(text).length>WORKSHOP_EVIDENCE_BYTES)throw RangeError('Test evidence exceeds 4 MiB');
  const data=garageRecord(JSON.parse(text),['version','entries'],'Workshop evidence');
  if(data.version!==1)throw TypeError('Unsupported workshop evidence');
  return garageArray(data.entries,0,12,'Workshop evidence entries').map(value=>{
    const entry=garageRecord(value,['mode','recording'],'Workshop evidence entry');
    if(!['stock','current','proposed'].includes(entry.mode))throw TypeError('Unknown test configuration');
    return entry;
  });
}
export function retainWorkshopRecording(recording,mode,storage=globalThis.sessionStorage){
  if(!recording.ownedVehicleId)return false;
  const accepted=JSON.parse(serializeProvingReplay(recording));
  if(!['stock','current','proposed'].includes(mode))throw TypeError('Unknown test configuration');
  if(mode==='stock'&&JSON.stringify(accepted.build)!==JSON.stringify(stockVehicleBuild(accepted.modelId)))throw TypeError('Stock evidence requires the original stock build');
  let entries=[];
  try{const old=storage.getItem(WORKSHOP_EVIDENCE_SLOT);if(old)entries=cache(old);}catch{/* Untrusted transient evidence is replaceable. */}
  entries=entries.filter(e=>e.recording?.ownedVehicleId!==accepted.ownedVehicleId||e.recording?.testId!==accepted.testId||e.mode!==mode);
  entries.push({mode,recording:accepted});entries=entries.slice(-12);
  const text=JSON.stringify({version:1,entries});cache(text);storage.setItem(WORKSHOP_EVIDENCE_SLOT,text);return true;
}
export function createWorkshopEvidence(){
  const host=document.createElement('section');host.className='garage-tools';host.id='garage-machine-comparisons';
  const heading=document.createElement('h3');heading.textContent='Measured build comparisons';
  const status=document.createElement('p');status.id='garage-machine-status';status.setAttribute('role','status');
  const verify=document.createElement('button');verify.id='garage-machine-verify';verify.type='button';verify.textContent='Verify measured tests';
  const results=document.createElement('div');results.id='garage-machine-results';results.style.width='100%';
  const note=document.createElement('p');note.textContent='Return from the Proving Grounds to verify your recorded tests. Evidence is temporary and separate from garage saves. Every displayed result is re-simulated for this source and build.';
  host.append(heading,status,verify,results,note);
  let car=null,view=null,key=null,epoch=0;
  verify.onclick=async()=>{
    const token=++epoch,selected=car,revision=source();verify.disabled=true;results.replaceChildren();
    try{
      if(!selected||!revision)throw Error('Select an owned car in a source-stamped package.');
      const entries=cache(sessionStorage.getItem(WORKSHOP_EVIDENCE_SLOT)??'{"version":1,"entries":[]}')
        .filter(e=>e.recording?.ownedVehicleId===selected.ownedVehicleId&&e.recording?.modelId===selected.modelId);
      if(!entries.length)throw Error('No retained tests for this owned car. Drive or compare it at the Proving Grounds.');
      const current=await identifyVehicleBuild(selected.modelId,selected.build,revision),stock=await identifyVehicleBuild(selected.modelId,stockVehicleBuild(selected.modelId),revision),accepted=[];
      for(const entry of entries){
        status.textContent='Reconstructing '+entry.mode+' · '+entry.recording.testId+' from accepted commands…';
        const tape=await parseProvingReplay(JSON.stringify(entry.recording),revision,
          {yieldTask:()=>new Promise(resolve=>setTimeout(resolve,0)),cancelled:()=>token!==epoch});
        if(token!==epoch)return;
        if(entry.mode==='stock'&&tape.buildDigest!==stock.buildDigest)throw Error('A stock-labelled recording contains a different build.');
        accepted.push({mode:entry.mode,tape});
      }
      const table=document.createElement('table'),head=table.createTHead().insertRow();
      for(const name of ['Measured test','Stock','Current / original build','Proposed']){const th=document.createElement('th');th.scope='col';th.textContent=name;head.append(th);}
      const body=table.createTBody();
      for(const [test,label,metric,unit] of [['acceleration','0–100 km/h','accelerationSeconds','s'],['braking','Reached 100 to stop','brakingDistanceM','m'],
        ['slalom','Slalom','slalomSeconds','s'],['handling','Handling','handlingSeconds','s']]){
        const row=body.insertRow();row.insertCell().textContent=label;
        for(const mode of ['stock','current','proposed']){
          const item=accepted.find(e=>e.mode===mode&&e.tape.testId===test),cell=row.insertCell();
          if(!item){cell.textContent='Not measured';continue;}
          const value=item.tape.result.metrics[metric];
          cell.textContent=item.tape.result.status==='completed'&&Number.isFinite(value)?value.toFixed(3)+' '+unit:item.tape.result.status;
          cell.textContent+=' · '+item.tape.driver;
          if(mode==='current'&&item.tape.buildDigest!==current.buildDigest)cell.textContent+=' · Original build';
          cell.title='Build '+item.tape.buildDigest+' · Recipe '+item.tape.recipeDigest+' · '+item.tape.ticks+' accepted ticks · '+item.tape.driver;
        }
      }
      results.append(table);
      const policy=document.createElement('p');policy.textContent='Acceleration reference runs use identical full-throttle commands. Braking, slalom and handling use deterministic feedback; commands can differ. Original-build results are historical measurements, not the newly fitted build.';results.append(policy);
      status.textContent='Verified '+accepted.length+' source-bound test recordings for '+selected.ownedVehicleId+'.';
    }catch(error){if(token===epoch)status.textContent='Evidence unavailable: '+error.message;}
    finally{if(token===epoch)verify.disabled=!car||view.busy;}
  };
  return {host,render(nextView,nextCar){
    view=nextView;car=nextCar;host.hidden=!car||view.migrationRequired;
    if(key!==car){key=car;epoch++;results.replaceChildren();status.textContent=car?'Select Verify to reconstruct retained results for '+car.ownedVehicleId+'.':'';}
    verify.disabled=!car||view.busy||['CONFLICT','STORAGE UNAVAILABLE'].includes(view.status);
  }};
}
