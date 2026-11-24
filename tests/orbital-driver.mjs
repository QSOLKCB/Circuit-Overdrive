// SPDX-License-Identifier: Apache-2.0
import {dot,length,rotate,subtract} from '../vendor/vanillajs/modules/math/index.js';
import {orbital} from '../src/orbital.js';

// Independent digital pilot. Each returned command can be issued by the
// keyboard. Feedback uses the driver's accepted world transform and velocity.
export function orbitalDrive(e) {
  const v=e.vehicle,s=e.current.s,speed=length(v.velocity), lead=10+.28*speed;
  const gap=orbital.sections.find(p=>p.kind==='air'), lane=s>gap.end ? 3.5 : 7.2;
  const target=orbital.frame(s+lead,lane),delta=subtract(target.point,v.position);
  const right=rotate(v.orientation,[1,0,0]),forward=rotate(v.orientation,[0,0,-1]);
  const error=Math.atan2(dot(delta,right),dot(delta,forward));
  const air=v.airTicks>0, wanted=target.id==='escape-bank' ? 29 : 34;
  const boost=!air && s>gap.start-38 && s<gap.start-20;
  const inTransfer=s>gap.start-2 && s<gap.end+38;
  return {throttle:!air && (boost || speed<wanted) ? 1 : 0,brake:!air && !boost && speed>wanted+1 ? 1 : 0,
    steer:!air && !inTransfer && Math.abs(error)>.028 ? Math.sign(error) : 0,boost,
    dodge:air && v.airTicks===8 && s>gap.start-2 && s<gap.end ? -1 : 0};
}
