// SPDX-License-Identifier: Apache-2.0
// Owned-build practice/measurement authority. No DOM, storage, race or damage
// authority. Every accepted motion comes from the immutable pinned solver.
import {createVehicle} from '../vendor/vanillajs/modules/vehicle3d/index.js';
import {rotate} from '../vendor/vanillajs/modules/math/index.js';
import {garageRecord,garageInteger} from './garage-data.js';
import {compileVehicleBuild,identifyVehicleBuild,stockVehicleBuild} from './vehicle-builds.js';

const freeze=value=>{
  if(value&&typeof value==='object'){
    for(const child of Object.values(value))freeze(child);
    Object.freeze(value);
  }
  return value;
};
const copy=value=>JSON.parse(JSON.stringify(value));
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const wrap=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));
const TAU=2*Math.PI;
export const PROVING_STEP=1/60;
export const PROVING_RULES=1;
export const PROVING_RECEIPT_BYTES=2*1024*1024;
const circle={center:[65,55],radius:32,corridorHalfWidth:6,start:[33,55]};
const circleGates=Array.from({length:8},(_,i)=>{
  const angle=Math.PI+(i+1)*TAU/8;
  return {id:'ring-'+(i+1),center:[65+32*Math.cos(angle),55+32*Math.sin(angle)],
    normal:[-Math.sin(angle),Math.cos(angle)],halfWidth:6,angle};
});
export const PROVING_TRACK=freeze({
  id:'machine-test-facility-v1',rulesVersion:PROVING_RULES,
  bounds:{minX:-125,maxX:125,minZ:-1345,maxZ:125},
  surface:{height:0,normal:[0,1,0],friction:1,surfaceId:'machine-facility-dry-asphalt-v1'},
  straight:{start:[0,0],halfWidth:16,endZ:-1300},
  slalom:{start:[-50,0],corridor:{minX:-64,maxX:-36,minZ:-190,maxZ:8},
    // Adjacent apertures are disjoint: a straight drive cannot claim a slalom.
    gates:[-46,-54,-46,-54,-46,-50].map((x,i)=>({id:'slalom-'+(i+1),center:[x,-30*(i+1)],normal:[0,-1],halfWidth:3}))},
  handling:{...circle,gates:circleGates},
  barriers:[
    {id:'west-runoff-wall',min:[-129,-5,-1349],max:[-125,6,129]},
    {id:'east-runoff-wall',min:[125,-5,-1349],max:[129,6,129]},
    {id:'south-runoff-wall',min:[-125,-5,-1349],max:[125,6,-1345]},
    {id:'north-runoff-wall',min:[-125,-5,125],max:[125,6,129]}
  ]
});
export const PROVING_TESTS=freeze({
  practice:{name:'Free practice',limitTicks:7200,policy:'Player commands; no money, settlement or persistent damage.'},
  acceleration:{name:'01 / Acceleration',limitTicks:900,
    policy:'Identical 900-call full-throttle tape; first 100 km/h crossing interpolates consecutive accepted horizontal-speed endpoints; null is valid non-completion.'},
  braking:{name:'02 / Braking',limitTicks:1800,
    policy:'From rest, reference driver accelerates to the first accepted speed >=100 km/h, then applies full brake to <=0.1 m/s. Exact over-threshold starting speed and accepted path are reported. Manual inputs are separately labelled.'},
  slalom:{name:'03 / Slalom',limitTicks:3600,
    policy:'Pass six ordered finite forward timing gates inside the declared corridor. Reference driver follows the authored line at 8 m/s using recipe-aware pure pursuit and speed feedback.'},
  handling:{name:'04 / Constant-radius handling',limitTicks:3600,
    policy:'Complete eight ordered radial timing gates around the 32 m reference circle within a +/-6 m corridor. Reference driver uses recipe-aware pure pursuit and 8 m/s speed feedback.'}
});
const world=Object.freeze({sampleSurface(x,z,maxY){
  const b=PROVING_TRACK.bounds;
  return x>=b.minX&&x<=b.maxX&&z>=b.minZ&&z<=b.maxZ&&maxY>=0?PROVING_TRACK.surface:null;
},barriers:PROVING_TRACK.barriers});
const speed=state=>Math.hypot(state.velocity[0],state.velocity[2]);
const heading=state=>{const f=rotate(state.orientation,[0,0,-1]);return Math.atan2(f[0],-f[2]);};

export function validateProvingCommand(value){
  const data=garageRecord(value,['throttle','brake','steer'],'Proving command');
  for(const key of ['throttle','brake','steer']){
    if(typeof data[key]!=='number'||!Number.isFinite(data[key])||data[key]<(key==='steer'?-1:0)||data[key]>1)throw RangeError('Invalid proving '+key);
    if(data[key]===0)data[key]=0;
  }
  return Object.freeze(data);
}
function startingPose(modelId,testId){
  const stock=compileVehicleBuild(modelId,stockVehicleBuild(modelId)).recipe;
  const p=testId==='slalom'?PROVING_TRACK.slalom.start:testId==='handling'?PROVING_TRACK.handling.start:PROVING_TRACK.straight.start;
  return {position:[p[0],stock.wheel.radius+stock.suspension.restLength-stock.mass*9.81/(4*stock.suspension.spring),p[1]],
    yaw:0,pitch:0,roll:0,velocity:[0,0,0]};
}
export function createProvingRun({modelId,build,ownedVehicleId=null,sourceRevision=null,testId='practice',seed=0,driver='manual'}){
  if(!Object.hasOwn(PROVING_TESTS,testId))throw RangeError('Unknown proving test');
  garageInteger(seed,0,0xffffffff,'Proving seed');
  if(!['manual','reference'].includes(driver))throw TypeError('Unknown proving driver');
  if(ownedVehicleId!==null&&(typeof ownedVehicleId!=='string'||!/^car-[0-9]{6}$/.test(ownedVehicleId)||ownedVehicleId==='car-000000'))throw TypeError('Invalid proving owned ID');
  if(sourceRevision!==null&&(typeof sourceRevision!=='string'||!/^[a-f0-9]{40}$/.test(sourceRevision)))throw TypeError('Invalid proving source');
  const accepted=compileVehicleBuild(modelId,build),solver=createVehicle(accepted.recipe),pose=startingPose(modelId,testId);
  const vehicle=solver.spawn(pose),halfExtent=Math.hypot(accepted.recipe.chassis.width,accepted.recipe.chassis.length,accepted.recipe.chassis.height)/2;
  for(const barrier of PROVING_TRACK.barriers){
    if(vehicle.position.every((value,i)=>value>barrier.min[i]-halfExtent&&value<barrier.max[i]+halfExtent))throw RangeError('Physical spawn overlaps a facility barrier');
  }
  const run={modelId,build:accepted.build,recipe:accepted.recipe,ownedVehicleId,sourceRevision,testId,seed,driver,
    vehicle,previous:vehicle,startingPose:freeze(copy(pose)),phase:'ready',ticks:0,result:null,
    commandsRLE:[],lastCommand:validateProvingCommand({throttle:0,brake:0,steer:0}),gatesPassed:0,gates:[],
    accelerationCrossing:null,braking:null,
    metrics:{accelerationSeconds:null,brakingDistanceM:null,brakingStartSpeedMps:null,slalomSeconds:null,handlingSeconds:null,
      headingChangeRadians:0,lateralSlipIntegralM:0,maxLateralAccelerationMps2:0,pathM:0},
    diagnostics:{minUpY:1,minGrounded:4,maxSpeedMps:0,maxAngularSpeed:0,maxWheelLoadN:0,maxCompressionM:0,
      barrierContactTicks:0,solverTruncated:false,needsRecovery:false}};
  Object.defineProperty(run,'solver',{value:solver});
  return run;
}
export function startProvingRun(run){
  if(run.phase!=='ready')throw RangeError('Proving run is not ready');
  run.phase='running';return run;
}
function finish(run,status,reason){
  run.phase='finished';
  run.result=freeze({status,reason,testId:run.testId,acceptedTicks:run.ticks,elapsedSeconds:run.ticks*PROVING_STEP,
    gatesPassed:run.gatesPassed,metrics:copy(run.metrics),diagnostics:copy(run.diagnostics)});
  return run;
}
export function stopProvingRun(run){
  if(run.phase!=='running')throw RangeError('No running practice to stop');
  return finish(run,run.testId==='practice'?'completed':'non-completion','stopped-by-player');
}
function trackPoint(z){
  const nodes=[{center:PROVING_TRACK.slalom.start},...PROVING_TRACK.slalom.gates];
  if(z>=0)return nodes[0].center;
  for(let i=1;i<nodes.length;i++){
    const a=nodes[i-1].center,b=nodes[i].center;
    if(z>=b[1]){const t=clamp((z-a[1])/(b[1]-a[1]),0,1);return [a[0]+(b[0]-a[0])*t,z];}
  }
  return [-50,z];
}
function follow(run,target,targetSpeed){
  const state=run.vehicle,r=run.recipe,delta=[target[0]-state.position[0],0,target[1]-state.position[2]],right=rotate(state.orientation,[1,0,0]);
  const distance2=delta[0]**2+delta[2]**2;
  const lateral=delta[0]*right[0]+delta[2]*right[2];
  const desiredAngle=Math.atan2(2*r.wheel.wheelbase*lateral,Math.max(1,distance2));
  const currentSpeed=speed(state),steer=clamp(desiredAngle*(1+currentSpeed*r.steering.speedReduction)/r.steering.maxAngle,-1,1);
  const error=targetSpeed-currentSpeed;
  return validateProvingCommand({throttle:clamp(error*.28,0,.7),brake:clamp(-error*.14,0,.4),steer});
}
export function referenceProvingCommand(run){
  if(run.testId==='braking')return validateProvingCommand(run.braking?{throttle:0,brake:1,steer:0}:{throttle:1,brake:0,steer:0});
  if(run.testId==='slalom')return follow(run,trackPoint(run.vehicle.position[2]-12),8);
  if(run.testId==='handling'){
    const [cx,cz]=PROVING_TRACK.handling.center;
    const angle=Math.atan2(run.vehicle.position[2]-cz,run.vehicle.position[0]-cx)+12/PROVING_TRACK.handling.radius;
    return follow(run,[cx+32*Math.cos(angle),cz+32*Math.sin(angle)],8);
  }
  return validateProvingCommand({throttle:1,brake:0,steer:0});
}
function recordCommand(run,command){
  const last=run.commandsRLE.at(-1);
  if(last&&['throttle','brake','steer'].every(key=>last[key]===command[key]))last.ticks++;
  else run.commandsRLE.push({ticks:1,...command});
}
function passage(previous,next,gate){
  const signed=state=>(state.position[0]-gate.center[0])*gate.normal[0]+(state.position[2]-gate.center[1])*gate.normal[1];
  const a=signed(previous),b=signed(next);
  if(!(a<0&&b>=0))return null;
  const fraction=-a/(b-a),x=previous.position[0]+(next.position[0]-previous.position[0])*fraction,
    z=previous.position[2]+(next.position[2]-previous.position[2])*fraction;
  const across=(x-gate.center[0])*(-gate.normal[1])+(z-gate.center[1])*gate.normal[0];
  return {fraction,x,z,inside:Math.abs(across)<=gate.halfWidth};
}
export function stepProvingRun(run,value){
  if(run.phase!=='running')throw RangeError('Proving run is not running');
  const command=validateProvingCommand(value);
  if(run.driver==='reference'){
    const expected=referenceProvingCommand(run);
    if(['throttle','brake','steer'].some(key=>command[key]!==expected[key]))throw TypeError('Command differs from declared reference policy');
  }
  let next;
  try{next=run.solver.step(run.vehicle,command,world,PROVING_STEP);}
  catch{return finish(run,'physical-failure','solver-rejected-state');}
  const previous=run.vehicle,priorSpeed=speed(previous),nextSpeed=speed(next);
  run.previous=previous;run.vehicle=next;run.lastCommand=command;run.ticks++;recordCommand(run,command);
  const d=run.diagnostics,m=run.metrics;
  d.minUpY=Math.min(d.minUpY,rotate(next.orientation,[0,1,0])[1]);
  d.minGrounded=Math.min(d.minGrounded,next.wheels.filter(w=>w.grounded).length);
  d.maxSpeedMps=Math.max(d.maxSpeedMps,nextSpeed);d.maxAngularSpeed=Math.max(d.maxAngularSpeed,Math.hypot(...next.angularVelocity));
  d.maxWheelLoadN=Math.max(d.maxWheelLoadN,...next.wheels.map(w=>w.load));d.maxCompressionM=Math.max(d.maxCompressionM,...next.wheels.map(w=>w.compression));
  d.barrierContactTicks+=Number(next.contacts.length>0);d.solverTruncated ||=next.truncated;d.needsRecovery ||=next.needsRecovery;
  const distance=Math.hypot(next.position[0]-previous.position[0],next.position[2]-previous.position[2]);
  m.pathM+=distance;m.headingChangeRadians+=wrap(heading(next)-heading(previous));
  m.lateralSlipIntegralM+=next.wheels.reduce((sum,w)=>sum+Math.abs(w.lateralSpeed),0)/4*PROVING_STEP;
  const right=rotate(next.orientation,[1,0,0]);
  m.maxLateralAccelerationMps2=Math.max(m.maxLateralAccelerationMps2,
    Math.abs((next.velocity[0]-previous.velocity[0])*right[0]+(next.velocity[2]-previous.velocity[2])*right[2])/PROVING_STEP);
  if(next.truncated||next.needsRecovery||!['position','velocity','orientation','angularVelocity'].every(key=>next[key].every(Number.isFinite)))return finish(run,'physical-failure','solver-limit-or-nonfinite');
  if(next.position[0]<-125||next.position[0]>125||next.position[2]<-1345||next.position[2]>125)return finish(run,'physical-failure','facility-enclosure');
  if(run.testId!=='practice'&&next.contacts.length)return finish(run,'invalid','barrier-contact');
  // A terminal stopping tick must remain inside the test corridor too.
  if(['acceleration','braking'].includes(run.testId)&&Math.abs(next.position[0])>PROVING_TRACK.straight.halfWidth)return finish(run,'invalid','straight-corridor');
  if(!run.accelerationCrossing&&priorSpeed<100/3.6&&nextSpeed>=100/3.6){
    const fraction=(100/3.6-priorSpeed)/(nextSpeed-priorSpeed);
    run.accelerationCrossing=freeze({acceptedTick:run.ticks,previousSpeedMps:priorSpeed,nextSpeedMps:nextSpeed,fraction});
    m.accelerationSeconds=(run.ticks-1+fraction)*PROVING_STEP;
    if(run.testId==='braking'){
      run.braking={startTick:run.ticks,startSpeedMps:nextSpeed,startPosition:next.position.slice(),pathM:0,fullBrakeCommands:true};
      m.brakingStartSpeedMps=nextSpeed;
    }
  }else if(run.testId==='braking'&&run.braking){
    run.braking.pathM+=distance;
    run.braking.fullBrakeCommands &&=command.throttle===0&&command.brake===1&&command.steer===0;
    if(nextSpeed<=.1){m.brakingDistanceM=run.braking.pathM;return finish(run,'completed','braked-to-stop');}
  }
  if(run.testId==='slalom'){
    const c=PROVING_TRACK.slalom.corridor;
    if(next.position[0]<c.minX||next.position[0]>c.maxX||next.position[2]>c.maxZ||next.position[2]<c.minZ)return finish(run,'invalid','slalom-boundary');
  }
  if(run.testId==='handling'){
    const h=PROVING_TRACK.handling,radial=Math.hypot(next.position[0]-h.center[0],next.position[2]-h.center[1]);
    if(Math.abs(radial-h.radius)>h.corridorHalfWidth)return finish(run,'invalid','handling-boundary');
  }
  if(run.testId==='slalom'||run.testId==='handling'){
    const gates=PROVING_TRACK[run.testId].gates,gate=gates[run.gatesPassed];
    const hit=passage(previous,next,gate);
    if(hit){
      if(!hit.inside)return finish(run,'invalid','missed-timing-gate');
      run.gates.push(freeze({id:gate.id,acceptedTick:run.ticks,fraction:hit.fraction,elapsedSeconds:(run.ticks-1+hit.fraction)*PROVING_STEP,position:[hit.x,hit.z]}));
      run.gatesPassed++;
      if(run.gatesPassed===gates.length){
        m[run.testId==='slalom'?'slalomSeconds':'handlingSeconds']=run.gates.at(-1).elapsedSeconds;
        return finish(run,'completed','all-timing-gates');
      }
    }
  }
  if(run.ticks===PROVING_TESTS[run.testId].limitTicks){
    if(run.testId==='practice')return finish(run,'completed','practice-limit');
    if(run.testId==='acceleration')return finish(run,m.accelerationSeconds===null?'non-completion':'completed',m.accelerationSeconds===null?'threshold-not-reached':'fixed-command-tape-complete');
    return finish(run,'non-completion','test-time-limit');
  }
  return run;
}

export async function provingReceipt(run){
  if(run.phase!=='finished'||!run.result)throw RangeError('Finish the proving run before exporting a receipt');
  if(!run.sourceRevision)throw TypeError('Receipt requires an exact source-stamped runtime');
  const identity=await identifyVehicleBuild(run.modelId,run.build,run.sourceRevision);
  const receipt={format:'circuit-overdrive.proving-receipt',version:1,sourceRevision:run.sourceRevision,
    engineRevision:identity.engineRevision,trackId:PROVING_TRACK.id,rulesVersion:PROVING_RULES,
    modelId:run.modelId,ownedVehicleId:run.ownedVehicleId,buildRulesVersion:run.build.rulesVersion,
    build:identity.build,buildDigest:identity.buildDigest,recipeDigest:identity.recipeDigest,
    canonicalRecipe:identity.canonicalRecipe,testId:run.testId,testRules:PROVING_TESTS[run.testId],
    seed:run.seed,step:PROVING_STEP,driver:run.driver,
    comparison:run.testId==='acceleration'&&run.driver==='reference'?'Identical fixed 900-call full-throttle tape.':
      run.driver==='reference'?'Deterministic feedback policy; accepted command streams can differ between builds.':'Manual accepted commands; this is not a controlled part-only comparison.',
    startingPose:run.startingPose,acceptedTicks:run.ticks,commandsRLE:copy(run.commandsRLE),
    accelerationCrossing:run.accelerationCrossing,braking:run.braking&&copy(run.braking),
    gates:copy(run.gates),result:run.result,terminalState:copy(run.vehicle),
    damage:'No persistent owned damage is assigned: vehicle3d barrier contacts supply no reviewed impact-energy-to-damage adapter.',
    recording:'Diagnostic receipt only; not a historical replay format or v7 playback admission.'};
  if(new TextEncoder().encode(JSON.stringify(receipt)).length>PROVING_RECEIPT_BYTES)throw RangeError('Proving receipt exceeds 2 MiB');
  return freeze(receipt);
}
