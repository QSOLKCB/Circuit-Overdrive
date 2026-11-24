// SPDX-License-Identifier: Apache-2.0
// Replay-only presentation interpolation. Never mutates a race, checkpoint or
// authored tick. The observer reuses six output objects and wheel arrays.
import {quatInterpolate} from '../vendor/vanillajs/modules/math/index.js';
import {FIELD} from './field.js';
const SMOOTH=Object.freeze(['x','y','z','groundY','roll','pitch','speed','steering']);
const ANGLES=Object.freeze(['yaw','wheelSpin']);
export function createReplayPoses() {
  return FIELD.map(driver=>({id:driver.id,compression:new Array(4)}));
}
export function interpolateReplayPoses(race,poses,alpha) {
  if(!Number.isFinite(alpha)||alpha<0||alpha>1)
    throw RangeError('Invalid replay interpolation alpha');
  if(!race?.entrants || race.entrants.length!==FIELD.length ||
     !Array.isArray(poses)||poses.length!==FIELD.length)
    throw TypeError('Replay requires a complete six-car presentation');
  for(const driver of race.entrants){
    const b=driver.current,p=poses[driver.id];
    const a=race.course.id==='orbital' && driver.finishTicks!==null ? b : driver.previous;
    if(!p||p.id!==driver.id)throw RangeError('Replay pose order mismatch');
    p.vx=driver.vehicle.velocity[0];
    p.vy=driver.vehicle.velocity[1];
    p.vz=driver.vehicle.velocity[2];
    if (race.course.id==='orbital') {
      p.orientation=quatInterpolate(a.orientation,b.orientation,alpha);
      if (!p.orientation.every(Number.isFinite)) throw RangeError('Non-finite Rocket spectator orientation');
      p.s=a.s+(b.s-a.s)*alpha;
      p.boosting=driver.vehicle.boosting;
      p.attached=driver.vehicle.attached;
      p.airborne=!driver.vehicle.grounded;
    } else {
      p.orientation=null; p.attached=false;
      p.boosting=!!driver.nitro?.boosting;
      p.airborne=!!driver.nitro?.airborne;
    }
    p.gear=b.gear;
    p.rpm=b.rpm;
    p.brake=b.brake;
    p.finished=driver.finishTicks!==null;
    for(let wheel=0;wheel<4;wheel++)
      p.compression[wheel]=a.compression[wheel]+
        (b.compression[wheel]-a.compression[wheel])*alpha;
    for(const key of SMOOTH)p[key]=a[key]+(b[key]-a[key])*alpha;
    for(const key of ANGLES){
      const delta=Math.atan2(Math.sin(b[key]-a[key]),Math.cos(b[key]-a[key]));
      p[key]=a[key]+delta*alpha;
    }
    if(![p.x,p.y,p.z,p.yaw,p.roll,p.pitch,p.groundY,...p.compression].every(Number.isFinite))
      throw RangeError('Replay pose is non-finite');
  }
  return poses;
}
