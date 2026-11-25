// SPDX-License-Identifier: Apache-2.0
// Small semantic parts counter; the complete Machine Shop is the later E gate.
import {PART_SLOTS, vehicleParts, vehiclePart} from './vehicle-parts.js';
import {stockUpgradeBuild} from './vehicle-builds.js';

const tuneSlots={finalDrive:'finalDrive',spring:'suspension',damper:'suspension',travel:'suspension',steering:'steering'};
const labels={finalDrive:'Final-drive steps (0.1 ratio)',spring:'Spring steps (10%)',
  damper:'Damper steps (10%)',travel:'Travel steps (0.01 m)',steering:'Steering steps (0.02 rad)'};
function node(tag,text,id) {
  const el=document.createElement(tag);
  if(text!==undefined)el.textContent=text;
  if(id)el.id='garage-parts-'+id;
  return el;
}
export function createGaragePartsUI(review) {
  const host=node('section',undefined,'counter');host.className='garage-tools';host.hidden=true;
  const identity=node('p',undefined,'identity'),installed=node('p',undefined,'installed'),description=node('p',undefined,'description');
  const slot=node('select',undefined,'slot'),part=node('select',undefined,'part'),tuning=new Map();
  const field=(label,control)=>{const el=node('label',label);el.htmlFor=control.id;host.append(el,control);};
  host.append(node('h3','Parts Counter'),identity,installed);
  for(const key of PART_SLOTS)slot.append(new Option(key.replace(/([A-Z])/g,' $1'),key));
  field('Part slot',slot);field('Fit a part',part);
  for(const [key,label] of Object.entries(labels)) {
    const select=node('select',undefined,key),limit=key==='finalDrive'?4:2;
    for(let n=-limit;n<=limit;n++)select.append(new Option(String(n),String(n)));
    tuning.set(key,select);field(label,select);
  }
  const cost=node('p',undefined,'cost'),button=node('button','Review fitting','review');button.type='button';
  host.append(description,cost,button,node('p','Parts belong to this owned car. No refunds or part resale; owned parts can be refitted for the stated fitting cost. Paint is cosmetic.'));
  let view=null,car=null,build=null,key=null;
  const adjustable = () => ['finalDrive','suspension'].includes(slot.value)?part.value==='adjustable':slot.value==='steering'&&part.value==='quick';
  function proposal() {
    const next={...build.tuning};
    for(const [name,input] of tuning)if(tuneSlots[name]===slot.value)next[name]=adjustable()?Number(input.value):0;
    return {type:'install',ownedVehicleId:car.ownedVehicleId,slot:slot.value,partId:part.value,
      tuning:next,expectedRevision:view.state.revision};
  }
  function price() {
    if(!car)return;
    const selected=vehiclePart(slot.value,part.value),intent=proposal();
    const changing=build.parts[slot.value]!==part.value;
    const owned=build.inventory[slot.value].includes(part.value);
    const purchase=owned?0:selected.price, fitting=changing?(slot.value==='paint'?10:20):10;
    const same=!changing&&Object.keys(tuneSlots).every(k=>intent.tuning[k]===build.tuning[k]);
    description.textContent=selected.description;
    cost.textContent=same?'Already fitted with these settings.':
      'Part '+purchase+' + fitting '+fitting+' = '+(purchase+fitting)+' credits. '+(owned?'Already owned by this car.':'Purchase and fit to this car.');
    button.disabled=same||view.busy||view.migrationRequired||!['SAVED','UNSAVED','IMPORT REJECTED'].includes(view.status)||view.state.credits<purchase+fitting;
  }
  function configureTuning() {
    const canTune=adjustable();
    for(const [name,input] of tuning) {
      input.disabled=view.busy||tuneSlots[name]!==slot.value||!canTune;
      input.value=String(tuneSlots[name]===slot.value&&!canTune?0:build.tuning[name]);
    }
    price();
  }
  function choices() {
    part.replaceChildren(...vehicleParts(slot.value).map(item=>new Option(item.name+' · '+item.price+' credits',item.id)));
    part.value=build.parts[slot.value];configureTuning();
  }
  slot.addEventListener('change',choices);part.addEventListener('change',configureTuning);
  for(const input of tuning.values())input.addEventListener('change',price);
  button.addEventListener('click',()=>{if(!button.disabled)review(proposal());});
  return {host,render(nextView,nextCar) {
    view=nextView;car=nextCar;
    host.hidden=!car||view.migrationRequired;
    if(host.hidden){key=null;return;}
    build=stockUpgradeBuild(car.modelId,car.build);
    identity.textContent='Owned ID: '+car.ownedVehicleId+' · '+car.modelId;
    installed.textContent=PART_SLOTS.map(s=>s+': '+vehiclePart(s,build.parts[s]).name).join(' · ');
    if(key!==car){key=car;choices();}
    const blocked=view.busy||['CONFLICT','STORAGE UNAVAILABLE'].includes(view.status);
    slot.disabled=part.disabled=blocked;
    for(const [name,input] of tuning)input.disabled=blocked||tuneSlots[name]!==slot.value||!adjustable();
    price();
  }};
}
