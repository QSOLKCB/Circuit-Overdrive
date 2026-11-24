// SPDX-License-Identifier: Apache-2.0
// Open laboratory strip. Each patch is an exact finite plane or quarter cylinder
// extruded along X. This fixture has no racing rules or gameplay entry point.
import {add,clamp,dot,finiteVector,length,scale,subtract} from '../../vendor/vanillajs/modules/math/index.js';

const halfWidth=7, radius=36, turnLength=radius*Math.PI/2;
const epsilon=1e-8, grazing=1e-12;
const layout=[
  ['entry-floor',45],['upturn'],['ascending-wall',24],['invert'],
  ['ceiling',112],['downturn'],['descending-wall',24],['level'],['exit-floor',35],
];
const patches=[];
let start=0, point=[0,0,0], tangent=[0,0,-1], normal=[0,1,0];
for(const [id,straight] of layout) {
  const bent=straight===undefined, span=bent ? turnLength : straight;
  patches.push({id,start,span,bent,point,tangent,normal});
  if(bent) {
    point=add(point,scale(add(tangent,normal),radius));
    [tangent,normal]=[normal,scale(tangent,-1)];
  } else point=add(point,scale(tangent,span));
  start+=span;
}
const totalLength=start;
const sections=Object.freeze(patches.map(p=>Object.freeze({id:p.id,start:p.start,end:p.start+p.span})));

function bounded(value,low,high,name) {
  if(!Number.isFinite(value) || value<low || value>high) throw RangeError('Invalid proof '+name);
  return value;
}

function patchFrame(p,along,offset) {
  let centre,heading,up;
  if(p.bent) {
    const angle=along/radius, sine=Math.sin(angle), cosine=Math.cos(angle);
    centre=add(p.point,add(scale(p.tangent,radius*sine),scale(p.normal,radius*(1-cosine))));
    heading=add(scale(p.tangent,cosine),scale(p.normal,sine));
    up=subtract(scale(p.normal,cosine),scale(p.tangent,sine));
  } else {
    centre=add(p.point,scale(p.tangent,along));
    heading=p.tangent.slice();
    up=p.normal.slice();
  }
  centre[0]=offset;
  return {point:centre,normal:up,tangent:heading,lateral:[1,0,0],station:p.start+along,offset,id:p.id,material:'magnetic'};
}

function frame(station,offset=0) {
  bounded(station,0,totalLength,'station');
  bounded(offset,-halfWidth,halfWidth,'offset');
  const patch=patches.find(p=>station<=p.start+p.span);
  return patchFrame(patch,station-patch.start,offset);
}

function intersectPatch(p,origin,direction,maxDistance) {
  const delta=subtract(origin,p.point);
  const forward=dot(delta,p.tangent), height=dot(delta,p.normal);
  const df=dot(direction,p.tangent), dh=dot(direction,p.normal);
  let distance,along;
  if(p.bent) {
    // Cylinder centre is radius metres above the entry deck in its local frame.
    // The larger quadratic root is the ray leaving the tube interior, the only
    // side that faces an inward-facing tyre. Exact tangencies carry no support.
    const radial=height-radius, a=df*df+dh*dh;
    const b=forward*df+radial*dh, c=forward*forward+radial*radial-radius*radius;
    const discriminant=b*b-a*c;
    if(a===0 || discriminant<=0) return null;
    const root=Math.sqrt(discriminant);
    if(root/radius<=grazing) return null;
    // Rationalise the outward/near-zero root to avoid subtracting nearly equal numbers.
    distance=b>0 ? -c/(b+root) : (root-b)/a;
    along=radius*Math.atan2(forward+df*distance,-(radial+dh*distance));
  } else {
    if(dh>=-grazing) return null;
    distance=-height/dh;
    along=forward+df*distance;
  }
  const offset=origin[0]+direction[0]*distance;
  if(distance< -epsilon || distance>maxDistance+epsilon || along< -epsilon ||
    along>p.span+epsilon || Math.abs(offset)>halfWidth+epsilon) return null;
  return {...patchFrame(p,clamp(along,0,p.span),clamp(offset,-halfWidth,halfWidth)),
    distance:clamp(distance,0,maxDistance)};
}

function probe(origin,direction,maxDistance,hint) {
  // Each probe considers exactly nine one-sided, stationary patches. A previous
  // wheel frame breaks a shared-edge tie within 10 nanometres. A distinct
  // intersection beyond that tolerance wins solely by distance along the ray.
  origin=finiteVector(origin,3,'probe origin');
  for(const component of origin) bounded(component,-4096,4096,'probe coordinate');
  direction=finiteVector(direction,3,'probe direction');
  if(Math.abs(length(direction)-1)>1e-9) throw RangeError('Proof probe needs a unit direction');
  bounded(maxDistance,0,64,'probe range');
  let nearest=null;
  for(const p of patches) {
    const hit=intersectPatch(p,origin,direction,maxDistance);
    if(hit && (!nearest || hit.distance<nearest.distance-epsilon ||
      (Math.abs(hit.distance-nearest.distance)<=epsilon && hit.id===hint?.id))) nearest=hit;
  }
  return nearest;
}

export const proofSurface=Object.freeze({length:totalLength,halfWidth,sections,frame,probe});
