// SPDX-License-Identifier: Apache-2.0
// Model-space impact presentation for a low-poly car with -Z forward.
import {LIT_VERTEX_FLOATS} from '../vendor/vanillajs/modules/render-lit/index.js';

export const IMPACT_PANEL_ZONES=Object.freeze(['front','rear','left','right']);
export const IMPACT_PANEL_VERTEX_LIMIT=8192;
const vertex=LIT_VERTEX_FLOATS, triangle=vertex*3;
const typedLength=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Float32Array.prototype),'length').get;
const prepared=new WeakMap();
const clamp=value=>Math.max(0,Math.min(1,value));
const ramp=(value,start,end)=>clamp((value-start)/(end-start));
const fold=value=>1-2*Math.abs(value-Math.round(value));

function cleanVertices(source) {
  const typed=source instanceof Float32Array && Object.getPrototypeOf(source)===Float32Array.prototype;
  if(!typed && (!Array.isArray(source) || Object.getPrototypeOf(source)!==Array.prototype))
    throw TypeError('Expected an ordinary vertex array or Float32Array');
  const length=typed ? typedLength.call(source) : source.length;
  if(length%triangle || length/vertex>IMPACT_PANEL_VERTEX_LIMIT)
    throw RangeError('Impact panel vertex budget or triangle format exceeded');
  if(Reflect.ownKeys(source).length!==length+(typed?0:1))
    throw TypeError('Impact panel vertices must be dense data');
  const out=new Float32Array(length);
  for(let i=0;i<length;i++){
    const field=typed ? null : Object.getOwnPropertyDescriptor(source,String(i));
    if(!typed && (!field || !Object.hasOwn(field,'value')))
      throw TypeError('Impact panel vertices must be dense data');
    const value=typed ? source[i] : field.value, slot=i%vertex;
    const colour=slot>=6 && slot<=8;
    if(!Number.isFinite(value) || (colour ? value<0 || value>1 : Math.abs(value)>10000))
      throw RangeError('Invalid impact panel vertex component');
    out[i]=value;
    if(slot===5){
      const length=Math.hypot(out[i-2],out[i-1],out[i]);
      if(length<.5 || length>1.5)throw RangeError('Impact panel normals must be near-unit');
    }
  }
  return out;
}

// Only the door bay flexes sideways. The falloff stops inboard of both
// wheel openings and below the windows. The rocker and the glass stay fixed.
function surfaceZone(x,y,z) {
  const width=Math.abs(x);
  if(y<.87 && (width<.70 || Math.abs(z)>1.74)){
    if(z<-.95)return 'front';
    if(z>1.48)return 'rear';
  }
  if(y<.852 && width>.68 && y>.31 && z>-.91 && z<.92)return x<0?'left':'right';
  return null;
}

function deformation(x,y,z,zone) {
  if(surfaceZone(x,y,z)!==zone)return [0,0,0,0,0];
  if(zone==='left' || zone==='right'){
    const bay=Math.min(ramp(z,-.91,-.43),1-ramp(z,.38,.92));
    const shoulder=Math.min(ramp(y,.31,.55),1-ramp(y,.69,.852));
    const hem=ramp(Math.abs(x),.68,.89);
    const pleat=fold(1.45*z+2.25*y+.24);
    const crease=bay*shoulder*hem;
    return [-Math.sign(x)*.127*crease*(.43+.57*pleat),0,0,crease*pleat,crease];
  }

  const end=zone==='front'?-1:1, longitudinal=end*z;
  const width=Math.abs(x);
  const depth=ramp(longitudinal,end<0?.95:1.48,2.16);
  const wheelDepth=ramp(longitudinal,1.74,2.16);
  const wing=ramp(width,.55,.70);
  const cabin=1-ramp(y,.84,.87);
  const weight=cabin*(depth+(wheelDepth-depth)*wing);
  const pleat=fold(2.15*depth+.94*x+1.05*x*x+(end<0?0:.23));
  const ridges=4*pleat*(1-pleat);
  const deck=ramp(y,.40,.70);
  // The existing fascia and deck share an edge with different subdivisions.
  // Fade the folds to a common translation at that edge to preserve its seam.
  const shoulder=1-ramp(longitudinal,2.02,2.16);
  const vertical=weight*(.016+shoulder*deck*((end<0?.32:.13)*pleat-(end<0?.14:.055)));
  const compression=weight*(end<0?.32:.25);
  return [0,vertical,-end*compression,weight*(.40+.60*ridges),weight*pleat];
}

function triangleNormal(source,i) {
  const a=i+vertex,b=a+vertex;
  const ax=source[a]-source[i],ay=source[a+1]-source[i+1],az=source[a+2]-source[i+2];
  const bx=source[b]-source[i],by=source[b+1]-source[i+1],bz=source[b+2]-source[i+2];
  return [ay*bz-az*by,az*bx-ax*bz,ax*by-ay*bx];
}

function makePanel(source,zone,paint,exposedMetal) {
  const clean=new Float32Array(source);
  const fields=new Float32Array(clean.length/vertex*5);
  for(let i=0,j=0;i<clean.length;i+=vertex,j+=5)
    fields.set(deformation(clean[i],clean[i+1],clean[i+2],zone),j);

  // POSITION = clean + strength * delta. For a triangle, the projected
  // oriented area is quadratic in strength. Check its whole [0,1] range,
  // including its interior minimum if present, once at construction.
  const limit=new Float64Array(clean),mid=new Float64Array(clean);
  for(let i=0,j=0;i<clean.length;i+=vertex,j+=5)for(let k=0;k<3;k++){
    limit[i+k]+=fields[j+k];
    mid[i+k]+=fields[j+k]*.5;
  }
  for(let i=0;i<clean.length;i+=triangle){
    const rest=triangleNormal(clean,i);
    const dot=normal=>normal[0]*rest[0]+normal[1]*rest[1]+normal[2]*rest[2];
    const area=dot(rest),atLimit=dot(triangleNormal(limit,i)),atMid=dot(triangleNormal(mid,i));
    const quadratic=2*(atLimit+area-2*atMid),linear=atLimit-area-quadratic;
    const t=quadratic>0 ? clamp(-linear/(2*quadratic)) : 1;
    const min=Math.min(area,atLimit,quadratic*t*t+linear*t+area);
    if(min<=area*.08 || area<=1e-16)
      throw RangeError('Impact panel deformation would collapse or reverse a triangle ('+zone+' at '+i/triangle+')');
  }
  const panel=Object.freeze({zone,clean});
  prepared.set(panel,{fields,paint,exposedMetal});
  return panel;
}

/**
 * Partition a lit triangle batch without changing the clean triangles.
 * Shared source positions use the same displacement. On the boundary of
 * a zone that displacement is zero, so fixed neighbours remain attached.
 */
export function createImpactPanelGeometry(source,{paint=[1,1,1],exposedMetal=false}={}) {
  if(!Array.isArray(paint) || paint.length!==3 || ![0,1,2].every(i=>Number.isFinite(paint[i]) && paint[i]>=0 && paint[i]<=1))
    throw RangeError('Impact panel paint must contain three unit colour components');
  const clean=cleanVertices(source);
  const fixed=[], groups={front:[],rear:[],left:[],right:[]};
  for(let i=0;i<clean.length;i+=triangle){
    let zone=null;
    for(let j=i;j<i+triangle;j+=vertex){
      const next=surfaceZone(clean[j],clean[j+1],clean[j+2]);
      if(next && zone && next!==zone)throw RangeError('Triangle spans independent impact zones');
      if(next)zone=next;
    }
    const target=zone ? groups[zone] : fixed;
    for(let j=i;j<i+triangle;j++)target.push(clean[j]);
  }
  const panels={};
  for(const zone of IMPACT_PANEL_ZONES)
    panels[zone]=groups[zone].length ? makePanel(groups[zone],zone,paint.slice(),exposedMetal) : null;
  return Object.freeze({fixed:new Float32Array(fixed),panels:Object.freeze(panels)});
}

export function deformImpactPanel(panel,damage) {
  const state=prepared.get(panel);
  if(!state)throw TypeError('Expected an impact panel from createImpactPanelGeometry');
  if(!Number.isInteger(damage) || damage<0 || damage>1000)
    throw RangeError('Impact panel damage must be an integer from 0 to 1000');
  const {clean}=panel;
  if(damage===0)return clean;
  const {fields,paint,exposedMetal}=state, strength=Math.sqrt(damage/1000);
  const exposed=ramp(damage,480,800);
  const out=new Float32Array(clean);
  for(let i=0,j=0;i<out.length;i+=vertex,j+=5){
    for(let k=0;k<3;k++)out[i+k]+=strength*fields[j+k];
    if(exposedMetal){
      const lip=fields[j+3], ridge=fields[j+4];
      const blend=clamp(exposed*lip*1.7);
      const scrape=.11*strength*lip;
      const steel=.15+.40*ridge;
      for(let k=0;k<3;k++){
        const tint=clean[i+6+k]*paint[k];
        const worn=tint+(Math.min(1,tint*.8+.18)-tint)*scrape;
        out[i+6+k]=worn+(steel*(.88+k*.11)-worn)*blend;
      }
    }
  }
  for(let i=0;i<out.length;i+=triangle){
    const moved=[i,i+vertex,i+2*vertex].some(j=>out[j]!==clean[j] || out[j+1]!==clean[j+1] || out[j+2]!==clean[j+2]);
    if(!moved)continue;
    const rest=triangleNormal(clean,i),face=triangleNormal(out,i),length=Math.hypot(...face);
    for(let j=i;j<i+triangle;j+=vertex){
      const bx=clean[j+3],by=clean[j+4],bz=clean[j+5];
      const toward=bx*rest[0]+by*rest[1]+bz*rest[2];
      const sign=toward<0?-1:1;
      // Retain the pressed-car lighting normal at glancing damage and
      // resolve the actual folded facets as accepted damage grows.
      const blend=Math.min(1,.25+strength),scale=sign*blend/length;
      const nx=bx*(1-blend)+face[0]*scale,ny=by*(1-blend)+face[1]*scale,nz=bz*(1-blend)+face[2]*scale;
      const normalLength=Math.hypot(nx,ny,nz);
      out[j+3]=nx/normalLength;out[j+4]=ny/normalLength;out[j+5]=nz/normalLength;
    }
  }
  return out;
}
