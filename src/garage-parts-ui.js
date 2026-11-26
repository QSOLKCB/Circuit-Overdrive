// SPDX-License-Identifier: Apache-2.0
// Owned-car workshop. Only the existing review callback can request a write.
import {PART_SLOTS, vehicleParts, vehiclePart} from './vehicle-parts.js';
import {stockUpgradeBuild} from './vehicle-builds.js';
import {MACHINE_SHOP_SECTIONS,machineShopOverview,machineShopProposal,machineShopSpecificationRows} from './machine-shop.js';

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
  const host=node('section',undefined,'counter');host.className='garage-tools machine-shop';host.hidden=true;
  const identity=node('p',undefined,'identity'),installed=node('p',undefined,'installed'),description=node('p',undefined,'description');
  const slot=node('select',undefined,'slot'),part=node('select',undefined,'part'),tuning=new Map();
  const tuneLabels=new Map(),sections=new Map();
  const field=(label,control)=>{const el=node('label',label);el.htmlFor=control.id;host.append(el,control);return el;};
  const buildLabel=node('p',undefined,'build'),balance=node('p',undefined,'credits'),repairs=node('p',undefined,'repairs');
  const sectionHeading=node('h4',undefined,'section-title');
  const acceptedSpecs=node('details',undefined,'specs'),overviewTable=node('table');
  acceptedSpecs.append(node('summary','Accepted chassis specifications'),overviewTable);
  const installedDetails=node('details',undefined,'inventory');installedDetails.append(node('summary','Installed parts and this car’s inventory'),installed);
  const inventory=node('ul',undefined,'owned-parts');installedDetails.append(inventory);
  host.append(node('h3','The Machine Shop'),identity,buildLabel,balance,repairs,
    node('p','Pristine condition. Benchmarks do not assign persistent damage or create a repair bill.'),acceptedSpecs,installedDetails);
  const navigation=node('div',undefined,'sections');navigation.className='machine-shop-sections';navigation.setAttribute('role','group');navigation.setAttribute('aria-label','Workshop sections');
  for(const [key,label] of MACHINE_SHOP_SECTIONS){
    slot.append(new Option(label,key));const button=node('button',label,'section-'+key);button.type='button';
    button.addEventListener('click',()=>{slot.value=key;choices();part.focus();});sections.set(key,button);navigation.append(button);
  }
  host.append(navigation,sectionHeading);field('Workshop section',slot);field('Part to fit',part);
  for(const [key,label] of Object.entries(labels)) {
    const select=node('select',undefined,key),limit=key==='finalDrive'?4:2;
    for(let n=-limit;n<=limit;n++)select.append(new Option(String(n),String(n)));
    tuning.set(key,select);tuneLabels.set(key,field(label,select));
  }
  const cost=node('p',undefined,'cost'),button=node('button','Review fitting','review');button.type='button';
  const preview=node('p',undefined,'preview');preview.setAttribute('role','status');
  const specifications=node('table',undefined,'specifications');
  host.append(description,preview,specifications,
    node('p','Specifications describe the compiled machine. Acceleration, braking and handling require a measured Proving Grounds test.'),
    cost,button,node('p','Review fitting opens a separate confirmation. Parts belong to this owned car. No refunds or part resale; refitting owned parts still costs fitting. Paint is cosmetic.'));
  let view=null,car=null,build=null,key=null,overview=null,quote=null;
  function table(element,rows,proposedRows=null){
    element.replaceChildren();const head=element.createTHead().insertRow();
    for(const label of proposedRows?['Specification','Accepted','Proposed']:['Specification','Accepted']){
      const cell=document.createElement('th');cell.scope='col';cell.textContent=label;head.append(cell);
    }
    const body=element.createTBody();
    rows.forEach(([label,value],index)=>{const row=body.insertRow();row.insertCell().textContent=label;row.insertCell().textContent=value;
      if(proposedRows)row.insertCell().textContent=proposedRows[index][1];});
  }
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
    quote=machineShopProposal(view.state,car.ownedVehicleId,slot.value,part.value,intent.tuning);
    description.textContent=selected.description;
    if(quote.accepted){
      const {partCost,fittingCost,cost:total,alreadyOwned,creditsAfter}=quote.receipt;
      cost.textContent='Part '+partCost+' + fitting '+fittingCost+' = '+total+' credits. Balance after fitting: '+creditsAfter+'. '+(alreadyOwned?'Already owned by this car.':'Purchase and fit to this car.');
      preview.textContent='Proposed only · '+selected.name+' for '+car.ownedVehicleId+'. '+quote.detail;
    }else{
      cost.textContent=quote.detail;
      preview.textContent=(quote.reason==='already-fitted'?'Current accepted configuration. ':'Fitting unavailable: ')+quote.detail+' No saved changes.';
    }
    const rows=machineShopSpecificationRows(overview.recipe,slot.value);
    table(specifications,rows,quote.proposed?machineShopSpecificationRows(quote.proposed.recipe,slot.value):null);
    button.disabled=!quote.accepted||view.busy||view.migrationRequired||!['SAVED','UNSAVED','IMPORT REJECTED'].includes(view.status);
  }
  function configureTuning() {
    const canTune=adjustable();
    for(const [name,input] of tuning) {
      input.disabled=view.busy||tuneSlots[name]!==slot.value||!canTune;
      input.value=String(tuneSlots[name]===slot.value&&!canTune?0:build.tuning[name]);
      input.hidden=tuneLabels.get(name).hidden=tuneSlots[name]!==slot.value;
    }
    for(const [key,button] of sections)button.setAttribute('aria-pressed',String(key===slot.value));
    sectionHeading.textContent=MACHINE_SHOP_SECTIONS.find(([key])=>key===slot.value)[1];
    price();
  }
  function choices() {
    part.replaceChildren(...vehicleParts(slot.value).map(item=>new Option(item.name+' · '+item.price+' credits',item.id)));
    part.value=build.parts[slot.value];configureTuning();
  }
  slot.addEventListener('change',choices);part.addEventListener('change',configureTuning);
  for(const input of tuning.values())input.addEventListener('change',price);
  button.addEventListener('click',()=>{if(!button.disabled&&quote?.accepted)review(quote.action);});
  return {host,render(nextView,nextCar) {
    view=nextView;car=nextCar;
    host.hidden=!car||view.migrationRequired;
    if(host.hidden){key=null;return;}
    overview=machineShopOverview(view.state,car.ownedVehicleId);
    build=stockUpgradeBuild(car.modelId,car.build);
    identity.textContent='Model: '+overview.model.displayName+' · Owned ID: '+car.ownedVehicleId;
    buildLabel.textContent='Build: Current accepted configuration · rules '+car.build.rulesVersion+' · garage revision '+view.state.revision;
    balance.textContent='Current credits: '+view.state.credits;repairs.textContent=overview.repairs;
    installed.textContent=PART_SLOTS.map(s=>s+': '+vehiclePart(s,build.parts[s]).name).join(' · ');
    inventory.replaceChildren(...PART_SLOTS.map(s=>node('li',MACHINE_SHOP_SECTIONS.find(([key])=>key===s)[1]+': '+build.inventory[s].map(id=>vehiclePart(s,id).name).join(', '))));
    table(overviewTable,machineShopSpecificationRows(overview.recipe,'overview'));
    if(key!==car){key=car;choices();}
    const blocked=view.busy||['CONFLICT','STORAGE UNAVAILABLE'].includes(view.status);
    slot.disabled=part.disabled=blocked;
    for(const control of sections.values())control.disabled=blocked;
    for(const [name,input] of tuning)input.disabled=blocked||tuneSlots[name]!==slot.value||!adjustable();
    price();
  }};
}
