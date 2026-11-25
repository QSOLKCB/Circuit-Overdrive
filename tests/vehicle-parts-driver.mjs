// SPDX-License-Identifier: Apache-2.0
// Development-only controlled physical evidence. No storage, rewards, renderer
// or position playback: every accepted motion comes from pinned vehicle3d.
import {createVehicle} from '../vendor/vanillajs/modules/vehicle3d/index.js';
import {rotate} from '../vendor/vanillajs/modules/math/index.js';
import {GARAGE_CATALOG} from '../src/garage-catalog.js';
import {compileVehicleBuild,stockVehicleBuild,stockUpgradeBuild} from '../src/vehicle-builds.js';

const freeze=value=>{
  if(value&&typeof value==='object'){
    for(const child of Object.values(value))freeze(child);
    Object.freeze(value);
  }
  return value;
};
export const PART_TEST_RULES=freeze({
  id:'co-014c-controlled-parts-v1',step:1/60,seed:0,friction:1,
  startingPose:'Identical stock-equilibrium origin, yaw 0, zero pitch/roll for each model; test-specific initial velocity.',
  straight:{ticks:720,velocity:[0,0,0],command:{throttle:1,brake:0,steer:0},
    sampleTicks:[0,60,120,180,240,360,480,600,720],thresholdMps:100/3.6,
    crossing:'First 100 km/h crossing linearly interpolated between consecutive accepted horizontal speeds; null if not reached within 720 calls.'},
  braking:{maxTicks:360,velocity:[0,0,-100/3.6],command:{throttle:0,brake:1,steer:0},
    stopMps:.1,policy:'Full brake from declared exact initial horizontal speed to first accepted speed <=0.1 m/s. Report accepted path length and stop tick; no terminal pose assignment.'},
  corner:{ticks:240,velocity:[0,0,-18],command:{throttle:0,brake:0,steer:.65},
    sampleTicks:[0,1,3,6,12,30,60,120,180,240]},
  steering:{ticks:180,velocity:[0,0,-10],command:{throttle:0,brake:0,steer:.35},
    sampleTicks:[0,1,3,6,12,30,60,120,180]},
  bump:{ticks:240,velocity:[0,0,-8],command:{throttle:0,brake:0,steer:0},
    geometry:'h(z)=0.04*sin(pi*(-z-8)/4)^2 for -12<z<-8; h=0 elsewhere. Normal is normalized [0,1,-dh/dz].',
    heightM:.04,startZ:-8,endZ:-12,sampleTicks:[0,30,60,90,120,150,180,210,240]},
  comparison:'Straight/corner/steering/bump runs use identical complete timed command streams and explicit initial poses/velocities. Braking uses an identical deterministic stop policy with potentially different accepted lengths. Heading change sums shortest consecutive accepted heading differences to unwrap the reported angle.',
});
const STEP=PART_TEST_RULES.step;
const speed=state=>Math.hypot(state.velocity[0],state.velocity[2]);
const heading=state=>{const f=rotate(state.orientation,[0,0,-1]);return Math.atan2(f[0],-f[2]);};
const required=(condition,message)=>{if(!condition)throw Error(message);};
const plane={sampleSurface(){return {height:0,normal:[0,1,0],friction:1,surfaceId:'parts-level-dry-v1'};},barriers:[]};
const bump={sampleSurface(x,z){
  const u=(-z-8)/4,inside=u>0&&u<1;
  const height=inside?.04*Math.sin(Math.PI*u)**2:0;
  const gradient=inside?-.01*Math.PI*Math.sin(2*Math.PI*u):0;
  const length=Math.hypot(1,gradient);
  return {height,normal:[0,1/length,-gradient/length],friction:1,surfaceId:'parts-cosine-bump-v1'};
},barriers:[]};

export function proposedPartBuild(modelId,slot=null,partId=null,tuning={}){
  const draft=JSON.parse(JSON.stringify(stockUpgradeBuild(modelId,stockVehicleBuild(modelId))));
  if(slot){
    draft.parts[slot]=partId;
    if(!draft.inventory[slot].includes(partId))draft.inventory[slot].push(partId);
    draft.inventory[slot].sort();
  }
  Object.assign(draft.tuning,tuning);
  return compileVehicleBuild(modelId,draft).build;
}
function snapshot(state){
  return {solverSubsteps:state.tick,position:state.position.slice(),velocity:state.velocity.slice(),
    orientation:state.orientation.slice(),angularVelocity:state.angularVelocity.slice(),
    speedMps:speed(state),headingRadians:heading(state),steeringRadians:state.steering,
    gear:state.gear,rpm:state.rpm,shiftRemaining:state.shiftRemaining,
    grounded:state.wheels.map(w=>w.grounded),compressionM:state.wheels.map(w=>w.compression),
    loadsN:state.wheels.map(w=>w.load),lateralSpeedsMps:state.wheels.map(w=>w.lateralSpeed)};
}
function stockOrigin(modelId){
  const r=compileVehicleBuild(modelId,stockVehicleBuild(modelId)).recipe;
  return [0,r.wheel.radius+r.suspension.restLength-r.mass*9.81/(4*r.suspension.spring),0];
}
function run(vehicle,modelId,test,world){
  const policy=PART_TEST_RULES[test];
  let state=vehicle.spawn({position:stockOrigin(modelId),yaw:0,pitch:0,roll:0,velocity:policy.velocity.slice()});
  const start=snapshot(state),samples=[{acceptedTick:0,state:start}],shifts=[];
  const diagnostics={acceptedTicks:0,minUpY:1,minGrounded:4,maxAngularSpeed:0,maxAbsVerticalSpeedMps:0,
    maxCompressionM:0,minCompressionM:Infinity,maxWheelLoadN:0,lateralSlipIntegralM:0,maxHorizontalAccelerationMps2:0};
  let crossing=null,pathM=0,brakeDone=false,maxY=state.position[1],minY=state.position[1],headingChange=0;
  const ticks=policy.ticks??policy.maxTicks;
  for(let tick=1;tick<=ticks;tick++){
    const previous=state;
    state=vehicle.step(state,policy.command,world,STEP);
    required(!state.truncated,modelId+' '+test+' solver truncation');
    required(!state.needsRecovery,modelId+' '+test+' recovery/limit state');
    required(state.contacts.length===0,modelId+' '+test+' unexpected barrier contact');
    for(const key of ['position','velocity','orientation','angularVelocity']){
      required(state[key].every(Number.isFinite),modelId+' '+test+' non-finite '+key);
    }
    required(state.position.every(x=>Math.abs(x)<1900),modelId+' '+test+' left bounded measurement area');
    diagnostics.acceptedTicks++;
    diagnostics.minUpY=Math.min(diagnostics.minUpY,rotate(state.orientation,[0,1,0])[1]);
    diagnostics.minGrounded=Math.min(diagnostics.minGrounded,state.wheels.filter(w=>w.grounded).length);
    diagnostics.maxAngularSpeed=Math.max(diagnostics.maxAngularSpeed,Math.hypot(...state.angularVelocity));
    diagnostics.maxAbsVerticalSpeedMps=Math.max(diagnostics.maxAbsVerticalSpeedMps,Math.abs(state.velocity[1]));
    diagnostics.maxCompressionM=Math.max(diagnostics.maxCompressionM,...state.wheels.map(w=>w.compression));
    diagnostics.minCompressionM=Math.min(diagnostics.minCompressionM,...state.wheels.map(w=>w.compression));
    diagnostics.maxWheelLoadN=Math.max(diagnostics.maxWheelLoadN,...state.wheels.map(w=>w.load));
    diagnostics.lateralSlipIntegralM+=state.wheels.reduce((sum,w)=>sum+Math.abs(w.lateralSpeed),0)/4*STEP;
    diagnostics.maxHorizontalAccelerationMps2=Math.max(diagnostics.maxHorizontalAccelerationMps2,
      Math.hypot(state.velocity[0]-previous.velocity[0],state.velocity[2]-previous.velocity[2])/STEP);
    maxY=Math.max(maxY,state.position[1]);minY=Math.min(minY,state.position[1]);
    pathM+=Math.hypot(state.position[0]-previous.position[0],state.position[2]-previous.position[2]);
    const angle=heading(state)-heading(previous);
    headingChange+=Math.atan2(Math.sin(angle),Math.cos(angle));
    if(state.gear!==previous.gear)shifts.push({acceptedTick:tick,from:previous.gear,to:state.gear,
      speedMps:speed(state),rpm:state.rpm});
    if(test==='straight'&&crossing===null&&speed(previous)<policy.thresholdMps&&speed(state)>=policy.thresholdMps){
      const fraction=(policy.thresholdMps-speed(previous))/(speed(state)-speed(previous));
      crossing={acceptedTick:tick,previousSpeedMps:speed(previous),nextSpeedMps:speed(state),fraction,
        elapsedSeconds:(tick-1+fraction)*STEP};
    }
    if(policy.sampleTicks?.includes(tick))samples.push({acceptedTick:tick,state:snapshot(state)});
    if(test==='braking'&&speed(state)<=policy.stopMps){brakeDone=true;break;}
  }
  return {start,terminal:snapshot(state),samples,shifts,pathM,crossing,
    brakeCompleted:test==='braking'?brakeDone:null,verticalRangeM:maxY-minY,
    headingChangeRadians:headingChange,diagnostics};
}

export function measurePartVehicle(modelId,build,{short=false}={}){
  const accepted=compileVehicleBuild(modelId,build),vehicle=createVehicle(accepted.recipe);
  return {modelId,build:accepted.build,recipe:accepted.recipe,canonicalRecipe:accepted.canonicalRecipe,
    rulesVersion:accepted.rulesVersion,engineRevision:accepted.engineRevision,
    straight:short?null:run(vehicle,modelId,'straight',plane),
    braking:short?null:run(vehicle,modelId,'braking',plane),
    corner:run(vehicle,modelId,'corner',plane),steering:run(vehicle,modelId,'steering',plane),
    bump:run(vehicle,modelId,'bump',bump)};
}

export function partVariants(modelId='cinder-two'){
  return [
    {slot:'engine',partId:'street',build:proposedPartBuild(modelId,'engine','street')},
    {slot:'intake',partId:'duct',build:proposedPartBuild(modelId,'intake','duct')},
    {slot:'exhaust',partId:'flow',build:proposedPartBuild(modelId,'exhaust','flow')},
    {slot:'gearbox',partId:'short',build:proposedPartBuild(modelId,'gearbox','short')},
    {slot:'finalDrive',partId:'adjustable',build:proposedPartBuild(modelId,'finalDrive','adjustable',{finalDrive:4})},
    {slot:'tyres',partId:'performance',build:proposedPartBuild(modelId,'tyres','performance')},
    {slot:'suspension',partId:'adjustable',build:proposedPartBuild(modelId,'suspension','adjustable',{spring:2,damper:2,travel:0})},
    {slot:'steering',partId:'quick',build:proposedPartBuild(modelId,'steering','quick',{steering:2})},
    {slot:'paint',partId:'seafoam',build:proposedPartBuild(modelId,'paint','seafoam')},
    {slot:'engine',partId:'performance',build:proposedPartBuild(modelId,'engine','performance')},
    {slot:'engine',partId:'competition',build:proposedPartBuild(modelId,'engine','competition')},
    {slot:'gearbox',partId:'long',build:proposedPartBuild(modelId,'gearbox','long')},
    {slot:'tyres',partId:'touring',build:proposedPartBuild(modelId,'tyres','touring')},
    {slot:'tyres',partId:'economy',build:proposedPartBuild(modelId,'tyres','economy')}
  ];
}

export function measurePartsComparison(modelId='cinder-two'){
  return {rules:PART_TEST_RULES,modelId,
    stock:measurePartVehicle(modelId,proposedPartBuild(modelId)),
    variants:partVariants(modelId).map(variant=>({...variant,result:measurePartVehicle(modelId,variant.build)}))};
}

export function extremePartBuild(modelId,kind){
  const draft=JSON.parse(JSON.stringify(proposedPartBuild(modelId)));
  const choices=kind==='responsive'?{
    engine:'street',intake:'duct',exhaust:'flow',gearbox:'short',finalDrive:'adjustable',tyres:'performance',suspension:'adjustable',steering:'quick'
  }:{gearbox:'long',finalDrive:'adjustable',tyres:'economy',suspension:'adjustable',steering:'quick'};
  for(const [slot,id] of Object.entries(choices)){
    draft.parts[slot]=id;if(!draft.inventory[slot].includes(id))draft.inventory[slot].push(id);draft.inventory[slot].sort();
  }
  Object.assign(draft.tuning,kind==='responsive'?{finalDrive:4,spring:2,damper:2,travel:2,steering:2}:
    {finalDrive:-4,spring:-2,damper:-2,travel:-2,steering:-2});
  return compileVehicleBuild(modelId,draft).build;
}

export function measurePartsEndurance(){
  return GARAGE_CATALOG.flatMap(({modelId})=>['responsive','soft-long'].map(kind=>({kind,
    result:measurePartVehicle(modelId,extremePartBuild(modelId,kind),{short:true})})));
}
