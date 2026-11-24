// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import {derbyDamageWorld,neutralLab,newDamage,resolveLabTick,stepDerbyTick} from '../src/crash-damage.js';
import {crashCar,DERBY_IMPACT_LIMITS,DRIVE_CAP,LAB_STEP,labRecipe} from '../src/crash-impact.js';
import {arenaContainsCar,createDerbyArenaWorld,DERBY_ARENAS,stepDerbyArena} from '../src/derby-arenas.js';
import {FIELD} from '../src/field.js';
import {buildDerbyArenaGeometry} from '../src/derby-arena-scene.js';
import {LIT_PROFILES,LIT_VERTEX_FLOATS} from '../vendor/vanillajs/modules/render-lit/index.js';

const revision='b'.repeat(40);
const radius=labRecipe.chassis.width/2, reach=labRecipe.chassis.length/2;
const tip=reach-radius, stations=[-tip,0,tip];
const idle=Array(FIELD.length).fill(neutralLab);
const close=(actual,expected,tolerance=1e-7)=>assert(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
const dot=([x,z],[a,b])=>x*a+z*b;
const cross=([x,z],[a,b])=>x*b-z*a;
const sub=([x,z],[a,b])=>[x-a,z-b];
const normal=([x,z])=>{const length=Math.hypot(x,z);return [x/length,z/length];};
const add=([x,z],[a,b],scale)=>[x+a*scale,z+b*scale];
const ends=({x1,z1,x2,z2})=>[[x1,z1],[x2,z2]];
const cyclic=(items,i)=>items[(i+1)%items.length];

function distanceToSegment(point,a,b) {
  const edge=sub(b,a), delta=sub(point,a);
  const u=Math.min(1,Math.max(0,dot(delta,edge)/dot(edge,edge)));
  return Math.hypot(...sub(delta,add([0,0],edge,u)));
}

function discs({x,z,yaw}) {
  const forward=[Math.sin(yaw),Math.cos(yaw)];
  return stations.map(offset=>add([x,z],forward,offset));
}

function clearance(car,fixture) {
  const [a,b]=ends(fixture);
  return Math.min(...discs(car).map(p=>distanceToSegment(p,a,b)-radius-fixture.r));
}

function enclosurePlanes(arena) {
  const points=arena.boundary;
  const winding=Math.sign(points.reduce((sum,a,i)=>sum+cross(a,cyclic(points,i)),0));
  return points.map((a,i)=>{
    const edge=normal(sub(cyclic(points,i),a));
    const inward=[-winding*edge[1],winding*edge[0]];
    return p=>dot(sub(p,a),inward);
  });
}

function enclosure(arena) {
  const planes=enclosurePlanes(arena);
  return p=>Math.min(...planes.map(distance=>distance(p)));
}

function safeRoute(points,arena) {
  // Reserve a full circumscribed chassis. Sample every 25 cm including the
  // ends and reserve another 13 cm for the maximum distance to a sample.
  const inside=enclosure(arena), margin=reach+.13;
  for(const [i,from] of points.slice(0,-1).entries()) {
    const delta=sub(points[i+1],from), slices=Math.ceil(Math.hypot(...delta)*4);
    assert(slices>0);
    for(let j=0;j<=slices;j++) {
      const p=add(from,delta,j/slices);
      assert(inside(p)>margin);
      for(const fixture of arena.fixtures)
        assert(distanceToSegment(p,...ends(fixture))>margin+fixture.r);
    }
  }
}

test('the two immutable arenas have distinct footprints, surfaces and viewpoints',()=>{
  assert.deepEqual(Object.keys(DERBY_ARENAS).sort(),['crucible','iron-pit']);
  assert(Object.isFrozen(DERBY_ARENAS));
  const [crucible,iron]=[DERBY_ARENAS.crucible,DERBY_ARENAS['iron-pit']];
  assert.equal(crucible.name,'The Crucible');
  assert.equal(iron.name,'Iron Pit');
  assert.notDeepEqual(crucible.boundary,iron.boundary);
  assert.notDeepEqual(crucible.camera,iron.camera);
  assert.equal(crucible.surface,'asphalt');
  assert.equal(iron.surface,'concrete');
  const area=({boundary})=>Math.abs(boundary.reduce((sum,p,i)=>sum+cross(p,cyclic(boundary,i)),0))/2;
  assert(area(iron)<area(crucible));
  assert.equal(crucible.boundary.length,8);
  assert.equal(iron.fixtures.length-iron.boundary.length,2);
  assert.throws(()=>createDerbyArenaWorld('unknown',revision));
});

for(const [id,arena] of Object.entries(DERBY_ARENAS)) {
  test(`${id} closes every physical boundary edge and spawns the complete field with real clearance`,()=>{
    assert.equal(arena.id,id);
    assert.equal(arena.rules,1);
    assert(Object.isFrozen(arena)&&Object.isFrozen(arena.boundary)&&Object.isFrozen(arena.fixtures));
    const xs=arena.boundary.map(([x])=>x),zs=arena.boundary.map(([,z])=>z);
    assert.deepEqual(arena.camera.bounds,{minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs)});
    const [x,y,z]=arena.camera.target;
    assert(arena.camera.eye[1]>y);
    assert(enclosure(arena)([x,z])>reach);
    assert(arena.fixtures.length<=DERBY_IMPACT_LIMITS.fixtures);
    assert.equal(new Set(arena.fixtures.map(fixture=>fixture.id)).size,arena.fixtures.length);
    const inside=enclosure(arena);
    for(const [i,point] of arena.boundary.entries()) {
      assert(Object.isFrozen(point));
      const fixture=arena.fixtures[i];
      assert.deepEqual(ends(fixture),[point,cyclic(arena.boundary,i)]);
      assert(fixture.r>0);
      assert(inside(point)>=-1e-8);
    }
    for(const fixture of arena.fixtures.slice(arena.boundary.length)) {
      assert.equal(fixture.material,'steel');
      for(const end of ends(fixture))assert(inside(end)>fixture.r);
    }

    const world=createDerbyArenaWorld(id,revision), fresh=createDerbyArenaWorld(id,revision);
    assert.equal(world.arena,arena);
    assert.equal(world.revision,revision);
    assert.equal(world.discipline,'derby');
    assert.deepEqual(world.barriers,arena.fixtures);
    assert.equal(world.pairs.filter(pair=>!pair.wall).length,15);
    assert.equal(world.pairs.filter(pair=>pair.wall).length,FIELD.length*arena.fixtures.length);
    assert.deepEqual(world.cars.map(car=>car.id),FIELD.map(driver=>driver.id));
    assert.deepEqual(world.cars.map(({damage,...pose})=>pose),arena.spawns);
    assert.equal(new Set(world.cars.map(car=>car.damage)).size,FIELD.length);
    for(const [i,car] of world.cars.entries()) {
      assert(Object.isFrozen(arena.spawns[i]));
      assert.notEqual(car,fresh.cars[i]);
      assert.notEqual(car.damage,fresh.cars[i].damage);
      assert.deepEqual(car.damage,newDamage());
      assert.equal(Math.hypot(car.vx,car.vz,car.spin),0);
      assert(arenaContainsCar(arena,car));
      for(const p of discs(car))assert(inside(p)>radius+.1);
      for(const fixture of arena.fixtures)assert(clearance(car,fixture)>.1);
      for(const other of world.cars.slice(i+1))for(const a of discs(car))for(const b of discs(other))
        assert(Math.hypot(...sub(a,b))>2*radius+.1);
    }
    const step=stepDerbyArena(world,idle);
    assert.equal(world.tick,1);
    assert.equal(step.technicalStop,null);
    assert.deepEqual(step.contacts,[]);
    for(const [i,{x,z,yaw,vx,vz,spin,damage}] of world.cars.entries()) {
      assert.deepEqual([x,z,yaw],[fresh.cars[i].x,fresh.cars[i].z,fresh.cars[i].yaw]);
      assert.equal(Math.hypot(vx,vz,spin),0);
      assert.deepEqual(damage,newDamage());
    }
  });

  test(`${id} has routes clear for a turning chassis`,()=>{
    assert(arena.routes.length>=2);
    for(const path of arena.routes)safeRoute(path,arena);
    if(id==='iron-pit') {
      const obstacles=arena.fixtures.slice(arena.boundary.length);
      const [west,east]=obstacles.slice().sort((a,b)=>a.x1-b.x1);
      const inside=enclosure(arena), maxWallWidth=Math.max(...arena.fixtures.slice(0,arena.boundary.length).map(wall=>wall.r));
      for(const obstacle of obstacles)for(const point of ends(obstacle))
        assert(inside(point)-maxWallWidth-obstacle.r>8);
      assert(Math.min(east.x1,east.x2)-Math.max(west.x1,west.x2)-west.r-east.r>8);
      const alternatives=arena.routes.filter(path=>JSON.stringify(path[0])===JSON.stringify(arena.routes[0][0]) &&
        JSON.stringify(path.at(-1))===JSON.stringify(arena.routes[0].at(-1)));
      assert(alternatives.length>=2,'alternate routes connect the same ends');
      assert.notDeepEqual(alternatives[0],alternatives[1]);
    }
  });

  test(`${id} catches a near-cap strike against every fixed capsule`,()=>{
    const count=arena.boundary.length, inside=enclosure(arena);
    const centre=arena.boundary.reduce((sum,p)=>add(sum,p,1/count),[0,0]);
    // Rounding the components of an oblique 120 m/s vector can exceed the
    // authority's launch cap by an ulp. Stay within 1e-11 m/s of the cap.
    const speed=DRIVE_CAP-1e-11;
    const gap=.625;
    for(const [i,fixture] of arena.fixtures.entries()) {
      const [a,b]=ends(fixture), midpoint=add(a,sub(b,a),.5), axis=normal(sub(b,a));
      let inward=[-axis[1],axis[0]];
      if(i<count && dot(sub(centre,midpoint),inward)<0)inward=add([0,0],inward,-1);
      const [x,z]=add(midpoint,inward,reach+fixture.r+gap), [nx,nz]=inward;
      const car=crashCar(0,{x,z,yaw:Math.atan2(nx,nz),vx:-nx*speed,vz:-nz*speed});
      assert(inside([x,z])>reach);
      assert(arenaContainsCar(arena,car));
      close(clearance(car,fixture),gap);
      const world=derbyDamageWorld([car],arena.fixtures,revision);
      const {stats,contacts}=resolveLabTick(world);
      assert(!stats.limited,`${fixture.id} reached a solver stop`);
      const entry=contacts.find(hit=>hit.newImpact);
      assert(entry,`${fixture.id} produced no accepted impact`);
      assert.deepEqual(entry.participants,[0,fixture.id]);
      assert.equal(entry.kind,'fixed');
      assert.equal(entry.material,fixture.material);
      assert.equal(entry.sites[0].zone,'front');
      close(entry.time,gap/speed);
      close(entry.closing,speed,1e-4);
      close(entry.normalImpulse,1.14*1200*speed,1e-3);
      assert(entry.sites[0].damage.front>0);
      const [body]=world.cars;
      assert(dot([body.vx,body.vz],inward)>0);
      assert(clearance(body,fixture)>0);
      assert(arenaContainsCar(arena,body));
    }
  });

  test(`${id} diagonal corner approaches hit adjacent capsules instead of tunnelling`,()=>{
    const count=arena.boundary.length;
    const centre=arena.boundary.reduce((sum,p)=>add(sum,p,1/count),[0,0]);
    for(const [i,corner] of arena.boundary.entries()) {
      const inward=normal(sub(centre,corner)), yaw=Math.atan2(...inward);
      const fixtureIds=[arena.fixtures[i].id,arena.fixtures[(i+count-1)%count].id];
      const speed=DRIVE_CAP-1e-11;
      let low=0, high=10;
      for(let k=0;k<40;k++) {
        const distance=(low+high)/2, [x,z]=add(corner,inward,distance);
        if(Math.min(...arena.fixtures.map(fixture=>clearance({x,z,yaw},fixture)))>.5)high=distance;
        else low=distance;
      }
      const [x,z]=add(corner,inward,high);
      const [vx,vz]=add([0,0],inward,-speed);
      const world=derbyDamageWorld([crashCar(0,{x,z,yaw,vx,vz})],arena.fixtures,revision);
      assert(arenaContainsCar(arena,world.cars[0]));
      const {contacts,stats}=resolveLabTick(world);
      assert(!stats.limited);
      assert(contacts.some(hit=>hit.newImpact&&fixtureIds.includes(hit.participants[1])&&hit.time<LAB_STEP));
      assert(arenaContainsCar(arena,world.cars[0]));
    }
  });

  test(`${id} completes repeated six-driver stress ticks with identical ordered and permuted receipts`,t=>{
    const inside=enclosure(arena), ticks=480, rounds=4;
    let vehicleImpulses=0, fixtureImpulses=0, passPeak=0, samplePeak=0;
    const drivers=new Set();
    for(let round=0;round<rounds;round++) {
      const world=createDerbyArenaWorld(id,revision);
      const reversed=derbyDamageWorld([...arena.spawns].reverse(),[...arena.fixtures].reverse(),revision);
      for(let tick=0;tick<ticks;tick++) {
        const commands=FIELD.map(({id})=>({throttle:1,brake:0,
          steer:round===0 || tick<100+22*round ? 0 : Math.sin((Math.floor(tick/25)+id+round)*.63)*.45}));
        const {stats,contacts,technicalStop}=stepDerbyArena(world,commands);
        const reference=stepDerbyTick(reversed,commands);
        assert.equal(technicalStop,null,`round ${round}, tick ${tick+1} must stay contained`);
        assert.equal(stats.limited,false);
        assert.equal(stats.accepted,contacts.length);
        assert(stats.rejectedPairs<=stats.pairChecks);
        assert(stats.passes<=DERBY_IMPACT_LIMITS.passes && stats.sweepSamples<=DERBY_IMPACT_LIMITS.sweepSamples);
        assert(stats.pairChecks<=stats.passes*(15+6*arena.fixtures.length));
        assert.deepEqual(stats,reference.stats);
        assert.deepEqual(contacts,reference.contacts);
        assert.deepEqual(world.cars,reversed.cars);
        assert.deepEqual(world.pairs,reversed.pairs);
        for(const car of world.cars)for(const p of discs(car))assert(inside(p)>=radius-1e-7);
        for(const hit of contacts) {
          assert(hit.normalImpulse>0 && hit.dissipated>=0);
          if(hit.kind==='vehicle')vehicleImpulses++;
          else fixtureImpulses++;
          for(const site of hit.sites)drivers.add(site.id);
        }
        passPeak=Math.max(passPeak,stats.passes);
        samplePeak=Math.max(samplePeak,stats.sweepSamples);
      }
      assert.equal(world.tick,ticks);
    }
    assert.equal(drivers.size,FIELD.length);
    assert(vehicleImpulses>0 && fixtureImpulses>0);
    t.diagnostic(`${rounds*ticks} ticks in each ordering; ${vehicleImpulses} vehicle and ${fixtureImpulses} fixture impulses; peak ${passPeak} passes / ${samplePeak} sweep samples`);
  });

  test(`${id} holds an out-of-enclosure world without consuming the next tick`,()=>{
    const wall=arena.fixtures[0],inside=enclosure(arena);
    const protruding={x:(wall.x1+wall.x2)/2,z:wall.z1+radius+.25,yaw:0};
    assert(inside([protruding.x,protruding.z])>radius,'only the outer chassis feature crosses the limit');
    for(const invalid of [{x:arena.camera.bounds.maxX+2*reach},protruding]) {
      const world=createDerbyArenaWorld(id,revision);
      const [car]=world.cars;
      Object.assign(car,invalid);
      const pose=structuredClone(world.cars);
      assert.equal(arenaContainsCar(arena,car),false);
      const step=stepDerbyArena(world,idle);
      assert.equal(world.tick,0);
      assert.deepEqual(world.cars,pose);
      assert.deepEqual(step.contacts,[]);
      assert.deepEqual(step.technicalStop,{reason:'outside-arena',tick:0,carId:0,stage:'before-step'});
      assert.equal(world.technicalStop,step.technicalStop);
      assert.throws(()=>stepDerbyArena(world,idle));
    }
  });

  test(`${id} holds invalid motion before velocity can contaminate the six-car field`,()=>{
    for(const invalid of [{vx:NaN},{vz:Infinity},{spin:-Infinity}]) {
      const world=createDerbyArenaWorld(id,revision);
      Object.assign(world.cars[2],invalid);
      const original=structuredClone(world);
      assert(arenaContainsCar(arena,world.cars[2]));
      const step=stepDerbyArena(world,idle);
      assert.equal(world.tick,0);
      assert.deepEqual(world.cars,original.cars);
      assert.deepEqual(world.pairs,original.pairs);
      assert.deepEqual(step,{commands:[],contacts:[],stats:null,
        technicalStop:{reason:'invalid-motion',tick:0,carId:2,stage:'before-step'}});
      assert.equal(world.technicalStop,step.technicalStop);
      assert(Object.isFrozen(world.technicalStop));
      assert.throws(()=>stepDerbyArena(world,idle));
    }
  });

  test(`${id} retained collision mesh follows the authority capsule footprint and top height`,()=>{
    const geometry=buildDerbyArenaGeometry(arena), stride=LIT_VERTEX_FLOATS;
    assert.equal(geometry.fixtures.length,arena.fixtures.length);
    let vertices=0;
    for(const batch of [geometry.floor,geometry.scenery,geometry.paint,geometry.lights,
      ...geometry.fixtures.map(fixture=>fixture.vertices)]) {
      assert(batch instanceof Float32Array);
      assert.equal(batch.length%(3*stride),0);
      assert(batch.every(Number.isFinite));
      vertices+=batch.length/stride;
    }
    assert(vertices>1000 && vertices<LIT_PROFILES.high.maxVertices);
    // Foreground solids derive only from fixtures. Other above-ground mesh
    // triangles must be separable from the playable floor by a boundary edge.
    const planes=enclosurePlanes(arena);
    for(const batch of [geometry.scenery,geometry.lights])for(let k=0;k<batch.length;k+=3*stride) {
      const triangle=Array.from({length:3},(_,j)=>batch.slice(k+j*stride,k+j*stride+3));
      if(triangle.every(([,y])=>y<0))continue;
      assert(planes.some(distance=>triangle.every(([x,,z])=>distance([x,z])<0)));
    }
    for(const [i,mesh] of geometry.fixtures.entries()) {
      const fixture=arena.fixtures[i];
      assert.equal(mesh.id,fixture.id);
      assert.equal(mesh.material,fixture.material);
      assert(mesh.height>.9);
      const [a,b]=ends(fixture), outline=[];
      for(let k=0;k<mesh.vertices.length;k+=3*stride) {
        const triangle=Array.from({length:3},(_,j)=>mesh.vertices.slice(k+j*stride,k+j*stride+3));
        const top=triangle.every(([,y])=>Math.abs(y-mesh.height)<1e-5);
        for(const [x,y,z] of triangle) {
          assert(y===0 || Math.abs(y-mesh.height)<1e-5);
          assert(distanceToSegment([x,z],a,b)<=fixture.r+1e-5);
          if(!top) {
            close(distanceToSegment([x,z],a,b),fixture.r,1e-5);
            outline.push([x,z]);
          }
        }
      }
      assert(outline.length>100);
      for(let k=0;k<64;k++) {
        const u=[Math.cos(k*Math.PI/32),Math.sin(k*Math.PI/32)];
        const analytic=Math.max(dot(a,u),dot(b,u))+fixture.r;
        const rendered=Math.max(...outline.map(p=>dot(p,u)));
        assert(analytic-rendered<=fixture.r*(1-Math.cos(Math.PI/48))+1e-5);
        assert(rendered<=analytic+1e-5);
      }
    }
  });
}
