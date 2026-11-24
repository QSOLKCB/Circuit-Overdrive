// SPDX-License-Identifier: Apache-2.0
// Digital steering and pedals only. This driver can be applied on the keyboard
// and on an independent fixed-step race without changing either vehicle.
export function skywayIntent(entrant,course) {
  const p=entrant.current, n=entrant.nitro;
  const lane=2.1, target=course.sample(p.s+9+p.speed*.53,lane);
  const a=Math.atan2(target.x-p.x,p.z-target.z)+p.yaw;
  const error=Math.atan2(Math.sin(a),Math.cos(a));
  const bend=course.driftZone(p.s),cruise=p.s>1740?24:bend?31:35;
  // Initiate one deliberate slide through the first drift entry, then
  // countersteer by the actual heading error and rejoin the centre line.
  const steer=p.s>169 && p.s<187 ? 1 : Math.abs(error)<.023 ? 0 : Math.sign(error);
  return {throttle:p.speed<cruise ? 1 : 0,brake:p.speed>cruise+2 ? 1 : 0,steer,
    drift:bend && !n.airborne,boost:!bend && course.rampAt(p.s)<0 && n.energy>0};
}

// Lead the race on the main lane, then take the legal outer apron at the finish.
export function skywayGateIntent(entrant,course,overfly=false) {
  const p=entrant.current, lane=!overfly && p.s>=1780 ? 13.7 : 2;
  const cruise=overfly ? 50 : 43;
  const target=course.sample(p.s+8+p.speed*.46,lane);
  const heading=Math.atan2(target.x-p.x,p.z-target.z)+p.yaw;
  const error=Math.atan2(Math.sin(heading),Math.cos(heading));
  return {throttle:Number(p.speed<cruise),brake:Number(p.speed>cruise+2),
    steer:Math.abs(error)<.028 ? 0 : Math.sign(error),drift:false,
    boost:entrant.nitro.energy>0 && p.s>(overfly ? 100 : 1500)};
}
