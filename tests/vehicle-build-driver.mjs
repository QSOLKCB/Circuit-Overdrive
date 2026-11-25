// SPDX-License-Identifier: Apache-2.0
// Development-only physical measurements. No garage writes, game rewards or
// production performance badges; every motion below comes from vehicle3d.
import {createVehicle} from '../vendor/vanillajs/modules/vehicle3d/index.js';
import {rotate} from '../vendor/vanillajs/modules/math/index.js';
import {compileVehicleBuild, stockVehicleBuild} from '../src/vehicle-builds.js';

const freeze=value=>{
  if(value && typeof value==='object'){
    for(const child of Object.values(value))freeze(child);
    Object.freeze(value);
  }
  return value;
};
export const STOCK_TEST_RULES = freeze({
  id:'co-014a-stock-physical-v1', step:1/60, seed:0,
  surfaceId:'forge-level-dry-v1', friction:1,
  acceleration:{thresholdMps:100/3.6, maxTicks:1500,
    command:{throttle:1, brake:0, steer:0}, crossing:'linear interpolation of consecutive accepted horizontal speeds'},
  braking:{thresholdMps:.1, maxTicks:600,
    command:{throttle:0, brake:1, steer:0},
    start:'unaltered accepted state immediately after the first acceleration threshold crossing',
    result:'horizontal path length to the first accepted state at or below 0.1 m/s; exact initial speed is reported'},
  steering:{initialVelocity:[0,0,-10], settleTicks:60, ticks:180,
    settleCommand:{throttle:0, brake:0, steer:0}, command:{throttle:0, brake:0, steer:.35}},
  support:{ticks:120, command:{throttle:0, brake:0, steer:0}},
});

const STEP=STOCK_TEST_RULES.step;
const world={sampleSurface(){return {height:0,normal:[0,1,0],friction:1,surfaceId:STOCK_TEST_RULES.surfaceId};},barriers:[]};
const speed=state=>Math.hypot(state.velocity[0],state.velocity[2]);
const heading=state=>{const f=rotate(state.orientation,[0,0,-1]);return Math.atan2(f[0],-f[2]);};
const require=(condition,message)=>{if(!condition)throw Error(message);};

function snapshot(state){
  return {solverSubsteps:state.tick,position:state.position.slice(),orientation:state.orientation.slice(),
    velocity:state.velocity.slice(),angularVelocity:state.angularVelocity.slice(),
    speedMps:speed(state),steering:state.steering,headingRadians:heading(state),
    gear:state.gear,rpm:state.rpm,shiftRemaining:state.shiftRemaining,
    compression:state.wheels.map(w=>w.compression),loadsN:state.wheels.map(w=>w.load),
    lateralSpeedsMps:state.wheels.map(w=>w.lateralSpeed),grounded:state.wheels.map(w=>w.grounded)};
}

// Validate every accepted step, not merely the terminal measurements. The
// engine also validates its state on entry and exit. Its flag is not ignored.
function checkedStep(vehicle,state,command,diagnostics){
  const next=vehicle.step(state,command,world,STEP);
  require(!next.truncated,'Stock physical test encountered solver truncation');
  require(!next.needsRecovery,'Stock physical test encountered recovery/limit state');
  require(next.contacts.length===0,'Unexpected barrier contact on clear test surface');
  for(const field of ['position','orientation','velocity','angularVelocity']){
    require(next[field].every(Number.isFinite),'Non-finite '+field);
  }
  require(next.position.every(x=>Math.abs(x)<1900),'Physical test left bounded measurement area');
  diagnostics.acceptedTicks++;
  diagnostics.minimumUpY=Math.min(diagnostics.minimumUpY,rotate(next.orientation,[0,1,0])[1]);
  diagnostics.maxAngularSpeed=Math.max(diagnostics.maxAngularSpeed,Math.hypot(...next.angularVelocity));
  diagnostics.maxSpeedMps=Math.max(diagnostics.maxSpeedMps,speed(next));
  diagnostics.minimumGrounded=Math.min(diagnostics.minimumGrounded,next.wheels.filter(w=>w.grounded).length);
  return next;
}

export function measureStockVehicle(modelId){
  const accepted=compileVehicleBuild(modelId,stockVehicleBuild(modelId));
  const vehicle=createVehicle(accepted.recipe);
  const diagnostics={acceptedTicks:0,minimumUpY:1,maxAngularSpeed:0,maxSpeedMps:0,minimumGrounded:4};
  const advance=(state,command)=>checkedStep(vehicle,state,command,diagnostics);
  let supported=vehicle.spawn();
  const spawn=snapshot(supported);
  for(let i=0;i<STOCK_TEST_RULES.support.ticks;i++)supported=advance(supported,STOCK_TEST_RULES.support.command);
  const support={acceptedTicks:STOCK_TEST_RULES.support.ticks,state:snapshot(supported),
    totalLoadN:supported.wheels.reduce((sum,w)=>sum+w.load,0),weightN:accepted.recipe.mass*9.81};

  let state=vehicle.spawn(),crossing=null,accelerationTicks=0;
  const shifts=[];
  for(let i=0;i<STOCK_TEST_RULES.acceleration.maxTicks;i++){
    const previous=state;
    state=advance(state,STOCK_TEST_RULES.acceleration.command);
    accelerationTicks++;
    if(state.gear!==previous.gear)shifts.push({acceptedTick:accelerationTicks,from:previous.gear,to:state.gear,
      speedMps:speed(state),rpm:state.rpm,shiftRemaining:state.shiftRemaining});
    if(speed(state)>=STOCK_TEST_RULES.acceleration.thresholdMps){
      const fraction=(STOCK_TEST_RULES.acceleration.thresholdMps-speed(previous))/(speed(state)-speed(previous));
      crossing={previousSpeedMps:speed(previous),nextSpeedMps:speed(state),fraction,
        elapsedSeconds:(accelerationTicks-1+fraction)*STEP};
      break;
    }
  }
  const acceleration={completed:crossing!==null,acceptedTicks:accelerationTicks,crossing,shifts,
    start:spawn,terminal:snapshot(state)};

  let braking=null;
  if(crossing){
    const start=snapshot(state);
    let ticks=0,distanceM=0;
    for(;ticks<STOCK_TEST_RULES.braking.maxTicks;){
      const previous=state;
      state=advance(state,STOCK_TEST_RULES.braking.command);
      ticks++;
      distanceM+=Math.hypot(state.position[0]-previous.position[0],state.position[2]-previous.position[2]);
      if(speed(state)<=STOCK_TEST_RULES.braking.thresholdMps)break;
    }
    braking={completed:speed(state)<=STOCK_TEST_RULES.braking.thresholdMps,acceptedTicks:ticks,
      elapsedSeconds:ticks*STEP,distanceM,start,terminal:snapshot(state)};
  }

  state=vehicle.spawn({velocity:STOCK_TEST_RULES.steering.initialVelocity.slice()});
  const steeringSpawn=snapshot(state);
  for(let i=0;i<STOCK_TEST_RULES.steering.settleTicks;i++)state=advance(state,STOCK_TEST_RULES.steering.settleCommand);
  const steeringStart=snapshot(state);
  for(let i=0;i<STOCK_TEST_RULES.steering.ticks;i++)state=advance(state,STOCK_TEST_RULES.steering.command);
  const steering={acceptedTicks:STOCK_TEST_RULES.steering.settleTicks+STOCK_TEST_RULES.steering.ticks,
    spawn:steeringSpawn,start:steeringStart,terminal:snapshot(state),
    headingChangeRadians:heading(state)-steeringStart.headingRadians,
    lateralDisplacementM:state.position[0]-steeringStart.position[0]};
  return {modelId,rulesId:STOCK_TEST_RULES.id,rulesVersion:accepted.rulesVersion,
    engineRevision:accepted.engineRevision,canonicalBuild:accepted.canonicalBuild,
    canonicalRecipe:accepted.canonicalRecipe,support,acceleration,braking,steering,diagnostics};
}
