// SPDX-License-Identifier: Apache-2.0
import {clamp, quatMultiply} from '../vendor/vanillajs/modules/math/index.js';

const angleDifference=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const follow=(from,to,rate,dt)=>from+(to-from)*(-Math.expm1(-rate*dt));

export function lookAt(eye,target,roll=0) {
  const dx=target[0]-eye[0],dy=target[1]-eye[1],dz=target[2]-eye[2];
  const yaw=Math.atan2(-dx,-dz)/2, pitch=Math.atan2(dy,Math.hypot(dx,dz))/2;
  const rotation=quatMultiply([0,Math.sin(yaw),0,Math.cos(yaw)],[Math.sin(pitch),0,0,Math.cos(pitch)]);
  return quatMultiply(rotation,[0,0,Math.sin(roll/2),Math.cos(roll/2)]);
}

export function showroom(p,aspect,course) {
  const narrow=aspect<1.08;
  const offset=narrow ? 1.28/Math.max(.4,aspect) : 1;
  const f=course.project(p.x,p.z);
  const eye=[p.x+(-3.7*f.rx+4.25*f.tx)*offset,p.groundY+1.5*offset,
    p.z+(-3.7*f.rz+4.25*f.tz)*offset];
  const distance=Math.hypot(eye[0]-p.x,eye[2]-p.z);
  const fov=narrow ? .80 : .68;
  const shift=narrow ? 0 : Math.min(3.75,.40*aspect*distance*Math.tan(fov/2));
  const target=[p.x+(p.z-eye[2])*shift/distance,p.groundY+(narrow ? -.42 : .96),
    p.z-(p.x-eye[0])*shift/distance];
  return {eye,target,fov,roll:0};
}

export function createChaseCamera(course) {
  let initialized=false, lastX=0,lastZ=0, direction=0,speed=0,high=0,roll=0,traffic=0;
  const view={eye:[0,0,0],target:[0,0,0],fov:.88,roll:0};
  return {
    reset(){ initialized=false; },
    update(p,poses,options={}) {
      if (![p.x,p.y,p.z,p.yaw,p.groundY,p.speed].every(Number.isFinite)) {
        throw RangeError('Invalid chase camera pose');
      }
      const dt=Number.isFinite(options.dt)?clamp(options.dt,0,.1):0;
      const reset=!initialized || Math.hypot(p.x-lastX,p.z-lastZ)>12;
      const preset=options.camera==='high'?1:0;
      const reduced=!!options.reducedMotion;
      const road=course.project(p.x,p.z);
      // Blend toward travel during a slide, with a bounded angle even in reverse.
      let travel=p.yaw;
      if (Number.isFinite(p.vx) && Number.isFinite(p.vz) && Math.hypot(p.vx,p.vz)>3) {
        const delta=angleDifference(Math.atan2(-p.vx,-p.vz),p.yaw);
        if(Math.abs(delta)<1.45) travel+=clamp(delta,-.48,.48)*.60;
      }
      if(reset){direction=travel;speed=p.speed;high=preset;roll=0;traffic=0;}
      direction+=clamp(angleDifference(travel,direction)*(-Math.expm1(-10*dt)),-2.8*dt,2.8*dt);
      speed=follow(speed,clamp(p.speed,0,65),3.6,dt);
      high=follow(high,preset,5,dt);
      let near=0;
      for (const rival of poses) {
        if(rival===p || rival.finished || !Number.isFinite(rival.x) || !Number.isFinite(rival.z)) continue;
        const dx=rival.x-p.x,dz=rival.z-p.z;
        near=Math.max(near,clamp((11-Math.hypot(dx,dz))/7,0,1));
      }
      traffic=follow(traffic,near,4,dt);
      // Lift and open the framing slightly on side-by-side approaches.
      const stunt=course.id==='skyway';
      const range=6.20+high*3.65+speed*.009+traffic*.35+(stunt ? 1.4 : 0);
      const height=2.31+high*2.74+traffic*.22;
      const fx=-Math.sin(direction),fz=-Math.cos(direction);
      const back=course.project(p.x-range*fx,p.z-range*fz);
      const lane=clamp(back.lateral,1.35-course.barrierOffset,course.barrierOffset-1.35);
      const supported=course.sample(back.s,lane);
      view.eye[0]=supported.x;view.eye[2]=supported.z;
      const heave=clamp(p.y-p.groundY-.5,-.15,.24);
      // The Skyway launch deck falls away under the chassis. Keep the full
      // flight and the upcoming catch face in frame while the camera follows.
      const flight=stunt ? clamp(p.y-p.groundY-.5,0,24) : 0;
      view.eye[1]=supported.y+height+heave*.25+flight;
      const ahead=course.sample(road.s+6.5+speed*.32,road.lateral);
      const bend=angleDifference(Math.atan2(road.x-ahead.x,road.z-ahead.z),direction);
      // Curve preview is strongest when the chassis faces along the road. A
      // reversing/spinning car keeps its own view rather than snapping forward.
      const preview=direction+(Math.abs(bend)<1.35?clamp(bend,-.42,.42)*.52:0);
      const look=6.4+speed*.052, x=p.x-look*Math.sin(preview), z=p.z-look*Math.cos(preview);
      view.target[0]=x;view.target[2]=z;
      view.target[1]=course.project(x,z).y+.98+high*.15+heave*.18+flight*.92;
      roll=follow(roll,reduced?0:clamp(road.bank*.13,-.044,.044),4,dt);
      view.roll=reduced?0:roll;
      view.fov=.864+(reduced?0:.125*speed/65)+traffic*.023;
      if(stunt && !reduced) view.fov+=clamp((speed-30)/35,0,1)*.07;
      initialized=true;lastX=p.x;lastZ=p.z;
      return view;
    }
  };
}
