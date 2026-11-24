// SPDX-License-Identifier: Apache-2.0
// Arena authoring, placement checks and the enclosure guard. X/Z are metres.
import {crashBarrier,crashCar,DERBY_IMPACT_LIMITS,labRecipe} from './crash-impact.js';
import {derbyDamageWorld,stepDerbyTick} from './crash-damage.js';
import {FIELD} from './field.js';

export const DERBY_ARENA_RULES=1;
const radius=labRecipe.chassis.width/2,tip=labRecipe.chassis.length/2-radius;
const stations=[-tip,0,tip],tolerance=1e-7,spawnClearance=.5,passage=8;
const firstFixture=80;

function segment(x1,z1,x2,z2) {
  const dx=x2-x1,dz=z2-z1;
  return {x1,z1,x2,z2,dx,dz,length:Math.hypot(dx,dz)};
}
function side({x1,z1,dx,dz},x,z) {
  return dx*(z-z1)-dz*(x-x1);
}
function pointDistance({x1,z1,dx,dz,length},x,z) {
  const t=Math.max(0,Math.min(1,((x-x1)*dx+(z-z1)*dz)/(length*length)));
  return Math.hypot(x-x1-t*dx,z-z1-t*dz);
}
function segmentDistance(a,b) {
  const alongA=side(a,b.x1,b.z1)*side(a,b.x2,b.z2);
  const alongB=side(b,a.x1,a.z1)*side(b,a.x2,a.z2);
  const disjoint=(p,q,u,v)=>Math.max(p,q)<Math.min(u,v) || Math.max(u,v)<Math.min(p,q);
  if (alongA<=0 && alongB<=0 && !disjoint(a.x1,a.x2,b.x1,b.x2) && !disjoint(a.z1,a.z2,b.z1,b.z2)) return 0;
  return Math.min(pointDistance(a,b.x1,b.z1),pointDistance(a,b.x2,b.z2),
    pointDistance(b,a.x1,a.z1),pointDistance(b,a.x2,a.z2));
}

function pointInside(arena,x,z,clearance) {
  for (let i=0;i<arena.boundary.length;i++) {
    const wall=arena.fixtures[i];
    if (side(wall,x,z)/wall.length<clearance-tolerance) return false;
  }
  return true;
}
export function arenaContainsCar(arena,car) {
  if (!car) return false;
  const {x,z,yaw}=car;
  if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(yaw)) return false;
  const s=Math.sin(yaw),c=Math.cos(yaw);
  return stations.every(u=>pointInside(arena,x+u*s,z+u*c,radius));
}
function featureCentres({x,z,yaw}) {
  const s=Math.sin(yaw),c=Math.cos(yaw);
  return stations.map(u=>[x+u*s,z+u*c]);
}
function verifySpawns(arena) {
  if (arena.spawns.length!==FIELD.length) throw RangeError('Arena requires the six driver IDs');
  const centres=arena.spawns.map((car,i)=>{
    if (car.id!==FIELD[i].id || !arenaContainsCar(arena,car)) throw RangeError('Invalid arena spawn');
    return featureCentres(car);
  });
  for (let i=0;i<centres.length;i++) for (const [x,z] of centres[i]) {
    for (const fixture of arena.fixtures) {
      if (pointDistance(fixture,x,z)<radius+fixture.r+spawnClearance)
        throw RangeError('Arena spawn touches a fixture');
    }
    for (let j=0;j<i;j++) for (const [a,b] of centres[j]) {
      if (Math.hypot(x-a,z-b)<2*radius+spawnClearance) throw RangeError('Arena spawns overlap');
    }
  }
}
function verifyPassages(walls,obstacles,routes) {
  for (const [i,obstacle] of obstacles.entries()) {
    for (const wall of walls) {
      const distance=Math.min(side(wall,obstacle.x1,obstacle.z1),side(wall,obstacle.x2,obstacle.z2))/wall.length;
      if (distance-wall.r-obstacle.r<passage) throw RangeError('Arena obstacle is too close to a wall');
    }
    for (let j=0;j<i;j++) if (segmentDistance(obstacles[j],obstacle)-obstacles[j].r-obstacle.r<passage)
      throw RangeError('Arena obstacles block a passage');
  }
  for (const route of routes) {
    if (route.length<2) throw RangeError('Arena route requires two points');
    for (let i=1;i<route.length;i++) {
      const lane=segment(...route[i-1],...route[i]);
      if (lane.length<=tolerance) throw RangeError('Arena route has a zero-length leg');
      for (const wall of walls) {
        const distance=Math.min(side(wall,lane.x1,lane.z1),side(wall,lane.x2,lane.z2))/wall.length;
        if (distance-wall.r<passage/2) throw RangeError('Arena route depends on space outside the wall');
      }
      for (const obstacle of obstacles) if (segmentDistance(lane,obstacle)-obstacle.r<passage/2)
        throw RangeError('Arena route touches an obstacle');
    }
  }
}
function checkedPoint(point,dimensions) {
  if (!Array.isArray(point) || point.length!==dimensions ||
      [...point].some(value=>!Number.isFinite(value) || Math.abs(value)>100))
    throw RangeError('Invalid arena point');
  return Object.freeze([...point]);
}

// Validate the authored convex loop, then use exactly its edges for the capsules.
function defineArena({id,name,surface,boundary,wallMaterials,obstacles=[],lanes,eye,target,routes}) {
  const wallCount=boundary.length;
  if (wallCount<3 || wallCount!==wallMaterials.length || wallCount+obstacles.length>DERBY_IMPACT_LIMITS.fixtures)
    throw RangeError('Invalid arena fixture count');
  if (!['asphalt','concrete'].includes(surface)) throw RangeError('Invalid arena surface');
  const points=Object.freeze(boundary.map(point=>checkedPoint(point,2)));
  const walls=points.map(([x,z],i)=>{
    const next=(i+1)%wallCount,material=wallMaterials[i];
    const wall=crashBarrier(firstFixture+i,x,z,...points[next],material==='steel'?.48:.7,material);
    if (points.some(([a,b],j)=>j!==i && j!==next && side(wall,a,b)<=tolerance))
      throw RangeError('Arena boundary must be strictly convex and counterclockwise');
    return wall;
  });
  const protectedFixtures=obstacles.map((shape,i)=>crashBarrier(firstFixture+wallCount+i,...shape,'steel'));
  const xs=points.map(([x])=>x),zs=points.map(([,z])=>z);
  const bounds=Object.freeze({minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs)});
  const arena={id,name,rules:DERBY_ARENA_RULES,surface,
    boundary:points,
    fixtures:Object.freeze([...walls,...protectedFixtures]),
    spawns:Object.freeze(lanes.flatMap(([x1,z1,x2,z2],i)=>[
      Object.freeze(crashCar(i*2,{x:x1,z:z1})),
      Object.freeze(crashCar(i*2+1,{x:x2,z:z2,yaw:Math.PI}))])),
    camera:Object.freeze({eye:checkedPoint(eye,3),target:checkedPoint(target,3),bounds}),
    routes:Object.freeze(routes.map(route=>Object.freeze(route.map(point=>checkedPoint(point,2)))))};
  if (eye[1]<=target[1] || !pointInside(arena,target[0],target[2],0))
    throw RangeError('Invalid arena overview camera');
  verifySpawns(arena);
  verifyPassages(walls,protectedFixtures,arena.routes);
  return Object.freeze(arena);
}

const crucible=defineArena({id:'crucible',name:'The Crucible',surface:'asphalt',
  boundary:[[-27,-31],[27,-31],[39,-19],[39,19],[27,31],[-27,31],[-39,19],[-39,-19]],
  wallMaterials:['concrete','steel','concrete','steel','concrete','steel','concrete','steel'],
  lanes:[[-15,22,-14.3,-21],[0,18,.35,-17],[15,20,14.8,-22]],
  eye:[0,58,51],target:[0,0,0],routes:[[[0,-22],[0,22]],[[-28,0],[28,0]]]});
const ironPit=defineArena({id:'iron-pit',name:'Iron Pit',surface:'concrete',
  boundary:[[-26,-26],[18,-26],[29,-15],[28,18],[18,26],[-19,26],[-28,16],[-30,-12]],
  wallMaterials:['concrete','steel','concrete','steel','concrete','steel','concrete','steel'],
  obstacles:[[-13,-3,-12,2,1.15],[12,0,13,5,1.15]],
  lanes:[[-9,20,-8.65,-20],[-.2,17,.5,-16],[8.5,20,9,-19]],
  eye:[0,51,47],target:[0,0,0],routes:[
    [[0,-17],[-19,-13],[-20,11],[0,18]],
    [[0,-17],[0,18]],
    [[0,-17],[19,-12],[20,13],[0,18]]
  ]});
export const DERBY_ARENAS=Object.freeze({[crucible.id]:crucible,[ironPit.id]:ironPit});

export function createDerbyArenaWorld(id,revision=null) {
  if (typeof id!=='string' || !Object.hasOwn(DERBY_ARENAS,id)) throw RangeError('Unknown derby arena');
  const arena=DERBY_ARENAS[id],world=derbyDamageWorld(arena.spawns,arena.fixtures,revision);
  Object.defineProperty(world,'arena',{value:arena,enumerable:true});
  return world;
}

function checkArena(world,stage) {
  for (const car of world.cars) {
    const {x,z,yaw,vx,vz,spin}=car;
    const valid=[x,z,yaw,vx,vz,spin].every(Number.isFinite) && Number.isFinite(Math.hypot(vx,vz,spin));
    const reason=!valid ? 'invalid-motion' : !arenaContainsCar(world.arena,car) ? 'outside-arena' : null;
    if (reason) {
      const receipt=Object.freeze({reason,tick:world.tick,carId:car.id,stage});
      Object.defineProperty(world,'technicalStop',{value:receipt,writable:false,configurable:false});
      return;
    }
  }
}
export function stepDerbyArena(world,commands) {
  if (!world?.arena || DERBY_ARENAS[world.arena.id]!==world.arena) throw TypeError('Expected a derby arena world');
  if (world.technicalStop) throw Error('Derby arena stopped; create a fresh world');
  checkArena(world,'before-step');
  if (world.technicalStop) return {commands:[],contacts:[],stats:null,technicalStop:world.technicalStop};
  const result=stepDerbyTick(world,commands);
  if (!world.technicalStop) checkArena(world,'after-step');
  return {...result,technicalStop:world.technicalStop};
}
