// SPDX-License-Identifier: Apache-2.0
import data from '../tracks/redline-ridge.json' with {type: 'json'};
import { bounded, centerAt, closestDistance } from './track.js';

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const radians = Math.PI / 180;

// Each bend has a constant-radius core and short, progressively tightening
// entry/exit arcs. Adjoining arcs share their exact endpoint and tangent.
export function buildRidge(data) {
  if (data?.version !== 1 || typeof data.name !== 'string' || !data.name.trim() ||
      data.name.length > 64 || !Array.isArray(data.legs) || !Array.isArray(data.elevation))
    throw TypeError('Invalid ridge course');
  bounded(data.legs.length, 2, 48, 'ridge leg count');
  const halfWidth = bounded(data.halfWidth, 7, 15, 'road width');
  const barrierOffset = bounded(data.barrierOffset, halfWidth + 1, halfWidth + 4, 'barrier offset');
  const startS = -64;
  const pieces = [];
  let s = startS, heading = bounded(data.headingDegrees, -180, 180, 'start heading') * radians;
  let x = bounded(data.origin[0], -1900, 1900, 'start x') + startS * Math.sin(heading);
  let z = bounded(data.origin[1], -1900, 1900, 'start z') - startS * Math.cos(heading);

  function add(length, curvature, bend = null) {
    const tx = Math.sin(heading), tz = -Math.cos(heading);
    const p = {s, start: {x,z}, length, heading, curvature, tx, tz, bend};
    if (curvature) p.center = {x: x - tz / curvature, z: z + tx / curvature};
    const end = centerAt(p, length);
    p.end = {x: end.x, z: end.z};
    const mid = centerAt(p, length / 2);
    // A disc of arc length / 2 about the midpoint contains the entire arc.
    p.midX = mid.x; p.midZ = mid.z;
    for (const v of [x,z,end.x,end.z,mid.x,mid.z]) bounded(v, -1950, 1950, 'ridge coordinate');
    pieces.push(p);
    s += length; heading += curvature * length; x = end.x; z = end.z;
  }
  add(-startS, 0);
  for (const [distance, degrees] of data.legs) {
    bounded(distance, 50, 700, 'leg length');
    bounded(degrees, -125, 125, 'leg deflection');
    if (!degrees) { add(distance, 0); continue; }
    const ramp = Math.min(30, distance / 5), k = degrees * radians / (distance - ramp);
    bounded(Math.abs(k), 0, 1 / 85, 'curvature');
    const bend = {start:s, end:s+distance, ramp, bank:clamp(-k * 16, -.16, .16)};
    for (let j = 0; j < 3; j++) add(ramp / 3, k * (j+.5)/3, bend);
    add(distance - 2*ramp, k, bend);
    for (let j = 2; j >= 0; j--) add(ramp / 3, k * (j+.5)/3, bend);
  }
  const length = bounded(s, 4000, 5000, 'sprint length');
  add(72, 0);
  const endS = s;
  const profile = data.elevation;
  bounded(profile.length, 3, 48, 'elevation sample count');
  const heights = profile.map(([station,y], i) => {
    bounded(station, i ? profile[i-1][0]+10 : startS, endS, 'elevation station');
    bounded(y, -100, 500, 'elevation');
    const [sa,ya] = profile[Math.max(0,i-1)], [sb,yb] = profile[Math.min(profile.length-1,i+1)];
    return {station,y, slope:i===0 || i===profile.length-1 ? 0 : bounded((yb-ya)/(sb-sa),-.12,.12,'grade')};
  });
  if (heights[0].station !== startS || heights.at(-1).station !== endS)
    throw RangeError('Elevation must cover the entire paved route');
  // Cubic Hermite interpolation keeps both elevation and tyre normal continuous.
  function elevation(station) {
    let i = 1;
    while (i < heights.length-1 && station > heights[i].station) i++;
    const a = heights[i-1], b = heights[i], span = b.station-a.station;
    const t = (station-a.station)/span, dy = b.y-a.y;
    const c = 3*dy-span*(2*a.slope+b.slope), d = span*(a.slope+b.slope)-2*dy;
    return {height:a.y + t*(span*a.slope+t*(c+t*d)), grade:a.slope+t*(2*c+3*d*t)/span};
  }
  function frame(piece, along, lateral) {
    const c = centerAt(piece, along), station = piece.s+along;
    const e = elevation(station), rx = -c.tz, rz = c.tx;
    let bank = 0, rate = 0;
    if (piece.bend) {
      const b = piece.bend, entry = station-b.start, exit = b.end-station;
      const f = clamp(Math.min(entry,exit)/b.ramp,0,1);
      bank = b.bank * f*f*(3-2*f);
      rate = b.bank * 6*f*(1-f)*(entry<exit ? 1 : -1)/b.ramp;
    }
    const crossSlope = Math.tan(bank), offset = clamp(lateral,-barrierOffset-2,barrierOffset+2);
    const grade = (e.grade+offset*rate*(1+crossSlope**2))/(1-offset*piece.curvature);
    const nx = -grade*c.tx-crossSlope*rx, nz = -grade*c.tz-crossSlope*rz;
    const norm = Math.hypot(nx,1,nz);
    return {x:c.x+rx*lateral, y:e.height+offset*crossSlope, z:c.z+rz*lateral, s:station,lateral,
      tx:c.tx,tz:c.tz,rx,rz,yaw:Math.atan2(-c.tx,-c.tz),bank,normal:[nx/norm,1/norm,nz/norm]};
  }
  function sample(distance,lateral=0) {
    const station = clamp(bounded(distance,-1e9,1e9,'distance'),startS,endS);
    bounded(lateral,-2000,2000,'lateral offset');
    let lo=0, hi=pieces.length-1;
    while (lo<hi) {
      const i=(lo+hi+1)>>1;
      if (pieces[i].s<=station) lo=i; else hi=i-1;
    }
    return frame(pieces[lo],station-pieces[lo].s,lateral);
  }
  // Conservative cell candidates for wheel queries. Even on distant terrain
  // this yields the global nearest arc, without relying on a previous station.
  const cells = new Map(), cellSize=96, diagonal=cellSize*Math.SQRT2;
  function project(x,z) {
    bounded(x,-4000,4000,'world x'); bounded(z,-4000,4000,'world z');
    const col=Math.floor(x/cellSize), row=Math.floor(z/cellSize), id=(col+50)*100+row+50;
    let nearby=cells.get(id);
    if (!nearby) {
      const cx=(col+.5)*cellSize, cz=(row+.5)*cellSize;
      let upper=Infinity;
      for (const p of pieces) upper=Math.min(upper,Math.hypot(cx-p.midX,cz-p.midZ));
      nearby=pieces.filter(p=>Math.hypot(cx-p.midX,cz-p.midZ)-p.length/2 <= upper+diagonal);
      cells.set(id,nearby);
    }
    let best=Infinity, nearest, along, lateral;
    for (const p of nearby) {
      const d=closestDistance(p,x,z), c=centerAt(p,d);
      const dx=x-c.x, dz=z-c.z, squared=dx*dx+dz*dz;
      if (squared<best) { best=squared; nearest=p; along=d; lateral=-dx*c.tz+dz*c.tx; }
    }
    return frame(nearest,along,lateral);
  }
  function sampleSurface(x,z,maxY) {
    bounded(maxY,-4000,4000,'surface ceiling');
    const p=project(x,z);
    if (p.y>maxY || Math.abs(p.lateral)>barrierOffset+2) return null;
    const excess=(x-p.x)*p.tx+(z-p.z)*p.tz;
    if (p.s<=startS+.000001 && excess<-.000001 || p.s>=endS-.000001 && excess>.000001) return null;
    const paved=Math.abs(p.lateral)<=halfWidth;
    return {height:p.y,normal:p.normal,friction:paved ? 1 : .82,surfaceId:paved ? 'asphalt' : 'apron'};
  }
  bounded(data.checkpoints.length,2,16,'checkpoint count');
  const gates=[0,...data.checkpoints,length].map((station,i) => {
    if (i) bounded(station,(i===1 ? 0 : data.checkpoints[i-2])+50,length,'checkpoint spacing');
    return Object.freeze(sample(station));
  });
  const features={};
  for (const name of ['bridge','tunnel']) {
    const [first,last]=data[name];
    bounded(first,0,length,'structure start'); bounded(last,first+20,length,'structure end');
    features[name]=Object.freeze([first,last]);
  }
  return Object.freeze({id:'ridge',name:data.name,closed:false,halfWidth,barrierOffset,startS,endS,length,
    sample,project,sampleSurface,gates:Object.freeze(gates),features:Object.freeze(features)});
}
export const ridge=buildRidge(data);
