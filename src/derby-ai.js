// SPDX-License-Identifier: Apache-2.0
import {clamp,seededRandom} from '../vendor/vanillajs/modules/math/index.js';
import {labCondition,neutralLab} from './crash-damage.js';
import {FIELD,PLAYER_ID} from './field.js';

const square=(x,z)=>x*x+z*z;
const heading=(dx,dz)=>Math.atan2(-dx,-dz);
const angle=(from,to)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));

export function createDerbyDrivers(seed) {
  const random=seededRandom(seed);
  return FIELD.map(({id})=>id===PLAYER_ID ? null : {
    flank:random()<.5 ? -1 : 1,
    lead:.22+.3*random(),
    commitment:.86+.10*random(),
    target:null,
    backing:0
  });
}

function nearestOn(fixture,x,z) {
  const {dx,dz,length,x1,z1}=fixture;
  const t=clamp(((x-x1)*dx+(z-z1)*dz)/(length*length),0,1);
  return [x1+t*dx,z1+t*dz];
}

function guideInside(arena,x,z) {
  // The same wall edges bound the chase goal and the physical chassis.
  for (let index=0;index<arena.boundary.length;index++) {
    const wall=arena.fixtures[index],nx=-wall.dz/wall.length,nz=wall.dx/wall.length;
    const offset=4+wall.r-((x-wall.x1)*nx+(z-wall.z1)*nz);
    if (offset>0) {x+=offset*nx; z+=offset*nz;}
  }
  return [x,z];
}

function clearance(arena,x,z) {
  let result=Infinity;
  for (const fixture of arena.fixtures) {
    const [px,pz]=nearestOn(fixture,x,z);
    result=Math.min(result,Math.hypot(x-px,z-pz)-fixture.r);
  }
  return result;
}

function solidAhead(arena,car,fx,fz,distance) {
  // Earliest entry of a 2.35 m wide forward corridor. Walls and the end caps
  // of the pillars are sampled at bounded intervals strictly below its width.
  for (let offset=2;offset<=distance;offset+=1.5) {
    if (clearance(arena,car.x+fx*offset,car.z+fz*offset)<1.175) return offset;
  }
  return Infinity;
}

function routeClear(car,x,z,obstacles) {
  const dx=x-car.x,dz=z-car.z,length=Math.hypot(dx,dz);
  if (length<3) return true;
  // Project a short series of test points onto the interior capsule axes.
  // This is route selection only. The continuous solver owns every contact.
  const probes=Math.min(12,Math.ceil(length/3));
  for (let i=1;i<=probes;i++) {
    const a=car.x+dx*i/probes,b=car.z+dz*i/probes;
    for (const obstacle of obstacles) {
      const [px,pz]=nearestOn(obstacle,a,b);
      if (square(a-px,b-pz)<(obstacle.r+2.1)**2) return false;
    }
  }
  return true;
}

function detour(arena,car,x,z) {
  const obstacles=arena.fixtures.slice(arena.boundary.length);
  if (!obstacles.length || routeClear(car,x,z,obstacles)) return [x,z];
  let best=Infinity,goal=[x,z];
  for (const route of arena.routes) for (const [a,b] of route) {
    const distance=Math.hypot(a-car.x,b-car.z);
    const cost=distance+Math.hypot(x-a,z-b)+Math.abs(angle(car.yaw,heading(a-car.x,b-car.z)))*4;
    if (distance>3 && cost<best && routeClear(car,a,b,obstacles)) {
      best=cost; goal=[a,b];
    }
  }
  return goal;
}

function targetOf(car,cars,active,previous,commitment) {
  let target=null,best=Infinity;
  for (const other of cars) {
    if (other.id===car.id || !active[other.id]) continue;
    const dx=other.x-car.x,dz=other.z-car.z;
    const alignment=Math.abs(angle(car.yaw,heading(dx,dz)));
    const cost=(Math.hypot(dx,dz)+alignment*5)*(other.id===previous ? commitment : 1);
    // The arena provides the field in driver-ID order.
    if (cost<best) {best=cost; target=other;}
  }
  return target;
}

export function derbyAICommand(driver,car,cars,active,arena) {
  if (!active[car.id]) {driver.target=null; return neutralLab;}
  const target=targetOf(car,cars,active,driver.target,driver.commitment);
  driver.target=target?.id ?? null;
  if (!target) return neutralLab;

  const fx=-Math.sin(car.yaw),fz=-Math.cos(car.yaw);
  const forward=car.vx*fx+car.vz*fz;
  const distance=Math.hypot(target.x-car.x,target.z-car.z);
  const offset=clamp((distance-9)*.18,0,2.7)*driver.flank;
  const lead=Math.min(driver.lead,distance/45);
  let [x,z]=guideInside(arena,target.x+target.vx*lead+Math.cos(target.yaw)*offset,
    target.z+target.vz*lead-Math.sin(target.yaw)*offset);
  [x,z]=detour(arena,car,x,z);

  // Obstacle avoidance also includes wrecks. A stricken car still receives
  // and transfers impulses if it enters the real chassis sweep.
  for (const wreck of cars) {
    if (active[wreck.id]) continue;
    const dx=wreck.x-car.x,dz=wreck.z-car.z;
    const along=dx*fx+dz*fz,side=-dx*fz+dz*fx;
    if (along>0 && along<10 && Math.abs(side)<2.8) {
      const turn=side===0 ? driver.flank : Math.sign(side);
      [x,z]=guideInside(arena,x+fz*turn*5,z-fx*turn*5);
      break;
    }
  }

  const condition=labCondition(car.damage);
  const error=angle(car.yaw,heading(x-car.x,z-car.z));
  const hazard=solidAhead(arena,car,fx,fz,Math.min(16,5+Math.max(0,forward)*.75));
  const rearClear=clearance(arena,car.x-fx*4,car.z-fz*4)>1.9;
  if (driver.backing===0 && hazard<=5 && rearClear && Math.abs(error)>.65)
    driver.backing=55;
  if (driver.backing>0) {
    driver.backing=rearClear && Math.abs(error)>.23 ? driver.backing-1 : 0;
    if (driver.backing>0)
      return {throttle:0,brake:1,steer:clamp(error*1.8/condition.steer,-1,1)};
  }

  const steer=clamp(-error*1.7/condition.steer,-1,1);
  const turnSpeed=Math.max(7.5,23-9.5*Math.abs(error))*Math.max(.73,condition.grip);
  const desired=Math.min(turnSpeed,hazard===Infinity ? turnSpeed : Math.max(5,hazard*1.2));
  if (forward>desired+1)
    return {throttle:0,brake:clamp((forward-desired)*.12,0,1),steer};
  const demand=clamp((desired-forward)*.16+.22,0,1);
  return {throttle:clamp(demand/condition.drive,0,1),brake:0,steer};
}
