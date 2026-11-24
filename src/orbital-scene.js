// SPDX-License-Identifier: Apache-2.0
import {RAIL_THICKNESS} from './rocket-contact.js';
import {orbital} from './orbital.js';
import {box,lettering,quad,triangle} from './geometry.js';
import {add,scale} from '../vendor/vanillajs/modules/math/index.js';

const deck=[.18,.23,.29], panel=[.21,.27,.33], iron=[.09,.16,.23], steel=[.29,.41,.48],
  aqua=[.16,.95,.87], amber=[1,.52,.12], white=[.91,.95,.82], magenta=[.9,.22,.51];
const raised=(f,h)=>add(f.point,scale(f.normal,h));
const axes=f=>(x,y,z)=>f.point.map((v,i)=>v+f.lateral[i]*x+f.normal[i]*y+f.tangent[i]*z);

function sign(out,f,word,color) {
  const at=axes(f);
  for(const side of [-1,1]) {
    box(out,at,[side*15,3.7,0],[.82,7.5,1.4],steel);
    box(out,at,[side*15,4,0],[1.02,2,1.6],color);
  }
  box(out,at,[0,7.5,0],[31,1.7,1.3],iron);
  lettering(out,word,.24,(x,y)=>at(x,y+6.91,-.68),color);
}
// A tilted axle and four swept blades mounted outside the supported ribbon.
function turbine(out,f,side) {
  const at=axes(f), hub=side*23;
  box(out,at,[hub,-3.4,0],[1.2,7,1.4],steel);
  for(let i=0;i<12;i++) {
    const blade=(a,r,z)=>at(hub+Math.cos(a)*r,Math.sin(a)*r,z);
    const a=i*Math.PI/6,b=(i+1)*Math.PI/6;
    quad(out,blade(a,5.55,0),blade(b,5.55,0),blade(b,5.85,0),blade(a,5.85,0),aqua);
    if(i%3===0) quad(out,blade(a,.45,-.3),blade(a+.63,5.3,.35),blade(a+1.04,5.2,0),blade(a+.7,.5,-.3),steel);
  }
}

export function orbitalBatches(course=orbital) {
  const batches=[];
  const mesh=(kind,out,material)=>{
    if(out.length) batches.push({kind,vertices:new Float32Array(out),material});
  };
  // Road triangle winding and diagonal are identical to the wheel-ray mesh.
  const asphalt=[], works=[], lamps=[];
  for(let i=0;i<course.rows.length-1;i++) {
    const a=course.rows[i],b=course.rows[i+1];
    if(!a.connected) continue;
    const color=Math.floor(a.station/12)%2===0 ? deck : panel;
    triangle(asphalt,a.left,a.right,b.right,color);
    triangle(asphalt,a.left,b.right,b.left,color);
    for(const side of [-1,1]) {
      const l=side*course.railOffset;
      const p=course.frame(a.station,l),q=course.frame(b.station,l);
      quad(works,p.point,q.point,raised(q,course.railHeight),raised(p,course.railHeight),iron);
      const outside=(f,x)=>add(raised(f,course.railHeight),scale(f.lateral,x*side));
      quad(lamps,raised(p,course.railHeight),raised(q,course.railHeight),outside(q,RAIL_THICKNESS),outside(p,RAIL_THICKNESS),
        Math.floor(a.station/6)%4===0 ? white : side===1 ? amber : aqua);
      quad(works,outside(p,RAIL_THICKNESS),outside(q,RAIL_THICKNESS),
        add(q.point,scale(q.lateral,side*RAIL_THICKNESS)),add(p.point,scale(p.lateral,side*RAIL_THICKNESS)),steel);
      const px=course.frame(a.station,side*12.8),qx=course.frame(b.station,side*12.8);
      quad(works,raised(px,.025),raised(qx,.025),add(raised(qx,.025),scale(qx.lateral,.16)),
        add(raised(px,.025),scale(px.lateral,.16)),white);
    }
    if(i%7<3) for(const offset of [-4.5,4.5]) {
      const p=course.frame(a.station,offset),q=course.frame(b.station,offset);
      quad(works,raised(p,.025),raised(q,.025),add(raised(q,.025),scale(q.lateral,.16)),
        add(raised(p,.025),scale(p.lateral,.16)),steel);
    }
    if(i%13===0) {
      const at=axes(course.frame(a.station));
      box(works,at,[0,-1.05,0],[30,1.3,1.5],iron);
      for(const side of [-1,1]) box(lamps,at,[side*14.5,-.65,0],[.65,.55,1.7],magenta);
    }
    if(i%92===35) turbine(works,course.frame(a.station),i%2 ? -1 : 1);
  }
  for(const [index,g] of course.gates.entries()) {
    const word=index===0 ? 'SPINE' : index===course.gates.length-1 ? 'FINISH' : 'GATE'+index;
    sign(works,g,word,index===0 || index===course.gates.length-1 ? amber : aqua);
    if(index===0 || index===course.gates.length-1) {
      const at=axes(g);
      for(let i=0;i<26;i++) for(let j=0;j<2;j++)
        quad(works,at(i-13,.035,j),at(i-12,.035,j),at(i-12,.035,j+1),at(i-13,.035,j+1),(i+j)%2 ? white : iron,g.normal);
    }
  }
  // Distant facets stay beneath the lowest occupied deck. Inversion exposes
  // their full silhouette, giving the driver an external reference for roll.
  const horizon=[];
  for(let j=0;j<36;j++) {
    const a=j*Math.PI/18,b=(j+1)*Math.PI/18;
    const ring=(q,r,y)=>[Math.cos(q)*r,y,-180+Math.sin(q)*r];
    const left=ring(a,540,-32),right=ring(b,540,-32),peak=ring((a+b)/2,610,10+37*Math.sin(j*1.73)**2);
    triangle(horizon,left,right,[0,-32,-180],[.10,.16,.23]);
    triangle(horizon,left,peak,right,j%2 ? [.24,.27,.42] : [.33,.28,.42]);
  }
  // The far relay array belongs to the landscape. Each tower has a tapered
  // mast, two service decks and a beacon, visible beneath the suspended return.
  for(let i=0;i<24;i++) {
    const angle=i*Math.PI/12, x=390*Math.cos(angle),z=-210+400*Math.sin(angle);
    const at=(u,v,w)=>[x+u,-32+v,z+w], h=18+28*(.5+.5*Math.sin(4.7*i));
    box(horizon,at,[0,h/2,0],[5,h,5],iron);
    box(horizon,at,[0,h*.81,0],[13,3.1,11],steel);
    box(horizon,at,[0,h+3,0],[1.8,6,1.8],iron);
    box(horizon,at,[0,h+6.5,0],[2.5,1.2,2.5],amber);
  }
  // A ringed gas giant supplies a fixed horizon reference throughout the loop.
  const globe=(a,b)=>[-210+51*Math.cos(b)*Math.cos(a),133+51*Math.sin(b),-568+51*Math.cos(b)*Math.sin(a)];
  const stripes=[[.63,.44,.56],[.72,.55,.62],[.83,.68,.69],[.78,.59,.63]];
  for(let j=0;j<10;j++) for(let i=0;i<28;i++) {
    const a=i*Math.PI/14,b=a+Math.PI/14,lo=(j-5)*Math.PI/10,hi=lo+Math.PI/10;
    quad(horizon,globe(a,lo),globe(b,lo),globe(b,hi),globe(a,hi),stripes[j%4],[0,1,0]);
  }
  const ring=(a,r)=>[-210+r*Math.cos(a),133+.23*r*Math.cos(a)+.17*r*Math.sin(a),-568+r*Math.sin(a)];
  for(let i=0;i<48;i++) {
    const a=i*Math.PI/24,b=a+Math.PI/24;
    quad(horizon,ring(a,67),ring(b,67),ring(b,84),ring(a,84),[.72,.62,.69],[0,1,0]);
  }
  mesh('deck',asphalt,{roughness:.8});
  mesh('installation',works,{roughness:.65,emission:.14});
  mesh('strip-lights',lamps,{emission:1.0});
  mesh('landscape',horizon,{roughness:1});
  return batches;
}
