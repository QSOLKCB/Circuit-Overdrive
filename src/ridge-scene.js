// SPDX-License-Identifier: Apache-2.0
import { seededRandom } from '../vendor/vanillajs/modules/math/index.js';
import { box, lettering, local, quad, triangle } from './geometry.js';

const UP=[0,1,0], CREAM=[.96,.91,.73], GOLD=[1,.66,.13], INK=[.062,.102,.122];
const RUST=[.70,.19,.095], STEEL=[.51,.57,.55], STONE=[.43,.43,.385];
const ASPHALT=[.235,.253,.264], APRON=[.49,.44,.36], GRASS=[.34,.45,.23];
const ALLUVIAL_FLOOR=-24;
const ROCK=[.38,.36,.31], ROCK_LIGHT=[.55,.50,.43];

function vertex(course,s,l,h=0) {
  const p=course.sample(s,l);
  return [p.x,p.y+h,p.z];
}
function strip(out,course,a,b,l,r,h,tint) {
  if (l>r) [l,r]=[r,l];
  quad(out,vertex(course,a,l,h),vertex(course,a,r,h),vertex(course,b,r,h),vertex(course,b,l,h),tint);
}
function inside(s,range) { return s>=range[0] && s<range[1]; }

// Subdivide twisted pavement across the car and along its motion. Retain
// exactly these triangles for the full race, including the elevated deck.
function pavement(out,detail,c,a,b) {
  const bank=c.sample(a).bank, twist=Math.abs(bank-c.sample(b).bank)>.00002;
  const rows=twist ? 3 : 1, columns=twist ? 10 : bank ? 4 : 1, w=c.halfWidth;
  for(let i=0;i<rows;i++) {
    const from=a+(b-a)*i/rows, to=a+(b-a)*(i+1)/rows;
    for(let j=0;j<columns;j++) strip(out,c,from,to,w*(2*j/columns-1),w*(2*(j+1)/columns-1),0,ASPHALT);
    pavementEdges(out,detail,c,from,to);
  }
}
function pavementEdges(out,detail,c,a,b) {
  const w=c.halfWidth;
  // Continuous shoulder and physical rail, staggered centre dashes and reflectors.
  const rail=c.barrierOffset, tunnel=inside((a+b)/2,c.features.tunnel);
  for(const side of [-1,1]) {
    const lo=side*w, hi=side*rail;
    strip(out,c,a,b,lo,hi,.002,APRON);
    strip(detail,c,a,b,lo-.27*side,lo,.018,CREAM);
    const p=c.sample(a), normal=[-p.rx*side,0,-p.rz*side];
    const tint=tunnel ? [.28,.33,.34] : [.65,.70,.69];
    quad(detail,vertex(c,a,hi,.04),vertex(c,b,hi,.04),vertex(c,b,hi,.86),vertex(c,a,hi,.86),tint,normal);
    strip(detail,c,a,b,hi,hi+.32*side,.86,STEEL);
  }
  if(Math.floor((a+b)/2/6)%3===0) strip(detail,c,a,b,-.105,.105,.022,GOLD);
}
function checkLine(out,c,s) {
  for(let row=0;row<2;row++) for(let col=0;col<24;col++){
    const tile=c.halfWidth/12;
    strip(out,c,s+row*tile,s+(row+1)*tile,-c.halfWidth+col*tile,-c.halfWidth+(col+1)*tile,.032,
      (row+col)%2 ? CREAM : INK);
  }
}
function gantry(out,c,s,word) {
  const f=c.sample(s), at=(x,y,z)=>local(f,x,y,z), r=c.barrierOffset+1.8;
  for(const side of [-1,1]){
    box(out,at,[side*r,3.8,0],[.54,8,.68],RUST);
    box(out,at,[side*r,1.15,0],[1.5,2.4,1.8],INK);
  }
  box(out,at,[0,7.8,0],[2*r+1.2,2.45,1.0],INK);
  box(out,at,[0,9.04,0],[2*r+1.45,.20,1.12],RUST);
  for(const face of [-1,1]){
    const front=(x,y)=>at(-face*x,y,face*.52);
    lettering(out,word,.32,(x,y)=>front(x,7+y),CREAM);
    for(const side of [-1,1]) for(let i=0;i<3;i++){
      const x=side*(8.2+i*1.7);
      quad(out,front(x,6.95),front(x+.76,6.95),front(x+1.6,8.66),front(x+.84,8.66),GOLD);
    }
  }
}
function roadside(out,c,s,word,side,turn=0) {
  const p=c.sample(s,side*(c.barrierOffset+2.8)), at=(x,y,z)=>local(p,x,y,z);
  box(out,at,[0,1.9,0],[.23,4.9,.26],STEEL);
  box(out,at,[0,3.45,0],[5.1,2,.20],turn ? GOLD : [.065,.24,.27]);
  if(word) lettering(out,word,.21,(x,y)=>at(x,2.94+y,-.11),CREAM);
  else for(const x of [-1.48,.03,1.54]) {
    const pt=(u,v)=>at(x+turn*u,3.45+v,-.11);
    quad(out,pt(-.62,.8),pt(0,.8),pt(.67,0),pt(.05,0),INK);
    quad(out,pt(.05,0),pt(.67,0),pt(0,-.8),pt(-.62,-.8),INK);
  }
}

function cutaway(c,s) {
  const [a,b]=c.features.bridge;
  return Math.max(0,Math.min(1,(s-a+40)/40,(b+40-s)/40));
}
const OFFSETS=[0,6,19,40,68,85];
function hillside(c,s,side,i) {
  const f=c.sample(s,side*(c.barrierOffset+OFFSETS[i]));
  const wave=.5+.5*Math.sin(s*.018+Math.sin(s*.009)*1.5);
  const open=side===1 ? .34+.42*Math.sin(s*.0034) : .58+.4*Math.cos(s*.0032+.6);
  const fold=[0,1.3+wave*1.6,5+11*wave,11+21*wave,14+32*wave,0][i];
  const adjoining=f.y+fold*(1-2*open);
  const gorge=cutaway(c,s);
  const base=i===OFFSETS.length-1 ? ALLUVIAL_FLOOR : adjoining;
  return [f.x,base*(1-gorge)+ALLUVIAL_FLOOR*gorge,f.z];
}
// Interpolate actual terrain triangles for rooted trees and rocky outcrops.
function terrainCell(c,s,side,l,from,to) {
  const offset=l-c.barrierOffset;
  let i=0;
  while(i<OFFSETS.length-2 && offset>OFFSETS[i+1]) i++;
  const u=(offset-OFFSETS[i])/(OFFSETS[i+1]-OFFSETS[i]), v=(s-from)/(to-from);
  const a=hillside(c,from,side,i), b=hillside(c,from,side,i+1);
  const d=hillside(c,to,side,i), e=hillside(c,to,side,i+1);
  return a.map((x,k)=>u>v ? x+(b[k]-x)*u+(e[k]-b[k])*v : x+(d[k]-x)*v+(e[k]-d[k])*u);
}
function hillsideRow(out,c,a,b){
  for(const side of [-1,1]) for(let i=0;i<OFFSETS.length-1;i++){
    const p=hillside(c,a,side,i), q=hillside(c,a,side,i+1);
    const r=hillside(c,b,side,i+1), t=hillside(c,b,side,i);
    const exposed=i===2 && (Math.abs(p[1]-q[1])>9 || Math.cos(a*.008)>.79);
    const tone=exposed ? ROCK_LIGHT : i===4 ? ROCK : i===0 ? [.49,.48,.325] :
      Math.sin(a*.034+i)>.15 ? GRASS : [.30,.41,.215];
    // The same diagonal is also used for rooting trees, on both sides.
    if(side>0) quad(out,p,q,r,t,tone); else quad(out,p,t,r,q,tone);
  }
}
function fir(out,point,h,rng) {
  const [x,y,z]=point, r=h*(.16+.05*rng()), twist=rng()*Math.PI;
  const v=.8+rng()*.37, arms=5;
  for(let i=0;i<arms;i++){
    const a=twist+i*2*Math.PI/arms,b=twist+(i+1)*2*Math.PI/arms;
    const at=(angle,radius,height)=>[x+Math.cos(angle)*radius,y+height*h,z+Math.sin(angle)*radius];
    quad(out,at(b,.10*r,0),at(a,.10*r,0),at(a,.10*r,.33),at(b,.10*r,.33),[.28,.21,.145]);
    for(const [bottom,width,top,k] of [[.18,1,.76,.86],[.43,.71,1,1]]){
      triangle(out,at(b,r*width,bottom),at(a,r*width,bottom),at(a,0,top),[.093*v*k,.27*v*k,.178*v*k]);
    }
  }
}
function crag(out,point,h,rng){
  const [x,y,z]=point, ring=[], phase=rng()*5, cap=[x+h*.2,y+h,z-h*.13];
  for(let i=0;i<6;i++){
    const a=phase+i*Math.PI/3, r=h*(.68+.28*rng());
    ring.push([x+Math.sin(a)*r,y-h*.29,z+Math.cos(a)*r*1.4]);
  }
  for(let i=0;i<6;i++) triangle(out,ring[i],ring[(i+1)%6],cap,i%3===1 ? ROCK_LIGHT : ROCK);
}
function vegetation(out,c,a,b,rng) {
  if(cutaway(c,(a+b)/2)>.2 || inside((a+b)/2,c.features.tunnel)) return;
  const forest=(a>790 && a<1280) || (a>2350 && a<2710) || (a>3750 && a<4070);
  for(let i=0;i<(forest ? 7 : 2);i++) {
    const side=rng()<.52 ? -1 : 1, s=a+(b-a)*rng(), l=c.barrierOffset+5+rng()**1.28*59;
    const point=terrainCell(c,s,side,l,a,b);
    if (!forest && rng()<.34) crag(out,point,2.6+rng()*5.3,rng);
    else fir(out,point,(forest ? 12 : 8)+rng()*15,rng);
  }
}

function beam(out,a,b,thickness,color) {
  const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2], len=Math.hypot(dx,dy,dz);
  const side=Math.hypot(dx,dz);
  const u=side>.01 ? [-dz/side,0,dx/side] : [1,0,0];
  const v=[dy*u[2]/len,(dz*u[0]-dx*u[2])/len,-dy*u[0]/len];
  const ring=pt=>[[-1,-1],[1,-1],[1,1],[-1,1]].map(([p,q])=>pt.map((n,k)=>n+(u[k]*p+v[k]*q)*thickness/2));
  const p=ring(a), q=ring(b);
  for(let i=0;i<4;i++) quad(out,p[i],p[(i+1)%4],q[(i+1)%4],q[i],color);
}
function bridge(out,c,a,b) {
  const [start,end]=c.features.bridge, span=end-start, wall=c.barrierOffset;
  const point=(s,l,h)=>vertex(c,s,l,h);
  const height=s=>7.4+23*Math.sin(Math.PI*(s-start)/span);
  const panels=18;
  for(let i=0;i<panels;i++) {
    const s=start+i*span/panels,t=start+(i+1)*span/panels;
    if(s<a || s>=b) continue;
    const arch=height(s), nextArch=height(t);
    for(const side of [-1,1]){
      const l=side*(wall+1.2), here=(h)=>point(s,l,h), there=h=>point(t,l,h);
      beam(out,here(arch),there(nextArch),1.1,RUST);
      beam(out,here(-1.15),there(-1.15),2.0,[.40,.32,.28]);
      beam(out,here(.5),here(arch),.39,RUST);
      beam(out,here(i%2 ? 3 : arch),there(i%2 ? nextArch : 3),.44,RUST);
      if(i%6===0 || i===panels-1){
        const station=i===panels-1 ? t : s, p=c.sample(station,l);
        box(out,(x,y,z)=>local(p,x,y,z),[0,(ALLUVIAL_FLOOR-p.y)/2,0],
          [3.1,p.y-ALLUVIAL_FLOOR,4.8],[.47,.46,.39]);
      }
    }
    if(i%2===0) beam(out,point(s,-wall-1.2,arch),point(s,wall+1.2,arch),.70,RUST);
    if(i%4===1) beam(out,point(s,-wall-1.2,arch),point(t,wall+1.2,nextArch),.40,RUST);
  }
}

// A continuous vaulted tube, with rock only outside its empty opening. The
// side kerbs meet the same barrier planes used by the drivetrain's rail solver.
const INNER=[[-12.4,-.25],[-12.4,6.5],[-8.5,9.9],[0,11.5],[8.5,9.9],[12.4,6.5],[12.4,-.25]];
const OUTER=[[-47,-3],[-34,17],[-20,30],[0,35],[20,28],[31,14],[47,-3]];
function tunnel(out,c,a,b) {
  const [start,end]=c.features.tunnel, n=17;
  const at=(s,[l,h],factor=1)=>vertex(c,s,l*factor,h*factor);
  for(let j=0;j<n;j++){
    const s=start+(end-start)*j/n,t=start+(end-start)*(j+1)/n;
    if(s<a || s>=b)continue;
    const rock=s=>1+.18*Math.sin((s-start)*.024);
    for(let k=0;k<INNER.length-1;k++){
      const f=INNER[k],g=INNER[k+1],u=OUTER[k],v=OUTER[k+1];
      const color=j%4===0 ? [.26,.31,.31] : [.19,.235,.25];
      quad(out,at(s,f),at(s,g),at(t,g),at(t,f),color);
      quad(out,at(s,u,rock(s)),at(t,u,rock(t)),at(t,v,rock(t)),at(s,v,rock(s)),
        (j+k)%4===1 ? ROCK_LIGHT : ROCK);
      if(j===0 || j===n-1){
        const face=j ? t : s;
        quad(out,at(face,f),at(face,g),at(face,g,1.10),at(face,f,1.10),[.73,.68,.55]);
        quad(out,at(face,f,1.10),at(face,g,1.10),at(face,v,rock(face)),at(face,u,rock(face)),ROCK);
      }
    }
    if(j%2===0) for(const side of [-1,1]){
      const f=c.sample(s+3,side*11.9);
      box(out,(x,y,z)=>local(f,x,y,z),[0,6.4,0],[.54,.19,2.4],[.99,.84,.50]);
    }
  }
}

// Successive flanks of a glacial valley. The panorama uses its own world
// coordinates so terrain remains stationary as the car turns or changes lane.
function valley(c,rng) {
  const land=[], a=c.sample(0), b=c.sample(c.length), l=Math.hypot(b.x-a.x,b.z-a.z);
  const tx=(b.x-a.x)/l,tz=(b.z-a.z)/l,rx=-tz,rz=tx;
  const at=(s,r,h)=>[a.x+tx*s+rx*r,h,a.z+tz*s+rz*r];
  quad(land,at(-1650,-1800,ALLUVIAL_FLOOR),at(-1650,2150,ALLUVIAL_FLOOR),
    at(l+1650,2150,ALLUVIAL_FLOOR),at(l+1650,-1800,ALLUVIAL_FLOOR),[.29,.37,.235],UP);
  // Snow line follows each peak's relief and is separated into shaded facets.
  for(const side of [-1,1]) for(const distant of [true,false]) {
    const crest=[];
    for(let s=-1620;s<l+1800;s+=distant ? 155 : 111) {
      const edge=side>0 ? 445 : -95, d=distant ? 920 : 420;
      const width=d*(.76+.29*rng()), peak=(distant ? 310 : 95)+(distant ? 360 : 190)*rng();
      const foot=distant ? d*.49 : 50;
      crest.push([at(s,edge+side*foot,ALLUVIAL_FLOOR-.6),
        at(s+15,edge+side*width*.76,peak*(distant ? .61 : .48)),
        at(s+24*rng(),edge+side*width,peak)]);
    }
    for(let i=1;i<crest.length;i++){
      const [p,m,t]=crest[i-1], [q,n,u]=crest[i];
      const base=distant ? [.35,.42,.46] : [.24,.37,.295];
      triangle(land,p,q,m,base,UP);
      triangle(land,q,n,m,base.map(x=>x*.91),UP);
      triangle(land,m,n,t,distant ? [.58,.62,.62] : [.39,.44,.36],UP);
      triangle(land,n,u,t,distant ? [.90,.90,.82] : [.43,.47,.38],UP);
    }
  }
  // Transverse ridges close both ends of the valley beyond the paved runoff.
  for(const s of [-700,l+620]) for(let i=-7;i<=7;i++) {
    const w=190, r=i*w, h=145+220*rng(), apex=at(s,r,h);
    triangle(land,at(s+50,r-w,ALLUVIAL_FLOOR),apex,at(s-13,r+w,ALLUVIAL_FLOOR),
      [.35,.46,.42],UP);
  }
  // Braided meltwater follows the longitudinal valley; one lateral tributary
  // passes below the viaduct, visible through both sides of its steel arches.
  for(let s=-1200;s<l+1200;s+=48){
    const water=(s,r)=>at(s,455+32*Math.sin(s*.007)+r,ALLUVIAL_FLOOR+.28);
    quad(land,water(s,-13),water(s,13),water(s+48,13),water(s+48,-13),[.18,.48,.53],UP);
  }
  const gorge=c.sample((c.features.bridge[0]+c.features.bridge[1])/2);
  const water=(r,z)=>local(gorge,r,ALLUVIAL_FLOOR-gorge.y+.31,z);
  quad(land,water(-99,-13),water(250,-20),water(250,20),water(-99,10),[.20,.49,.54],UP);
  return land;
}

function batch(data,material,cull) {
  if(!data.length) return null;
  let bounds=null;
  if(cull) {
    let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
    for(let i=0;i<data.length;i+=11){
      minX=Math.min(minX,data[i]); maxX=Math.max(maxX,data[i]);
      minY=Math.min(minY,data[i+1]); maxY=Math.max(maxY,data[i+1]);
      minZ=Math.min(minZ,data[i+2]); maxZ=Math.max(maxZ,data[i+2]);
    }
    bounds={x:(minX+maxX)/2,y:(minY+maxY)/2,z:(minZ+maxZ)/2,r:Math.hypot(maxX-minX,maxY-minY,maxZ-minZ)/2};
  }
  return {vertices:new Float32Array(data),material,bounds};
}
export function ridgeBatches(c) {
  const rng=seededRandom(3003), batches=[batch(valley(c,rng),{roughness:1})];
  for(let a=c.startS;a<c.endS;a+=240) {
    const b=Math.min(a+240,c.endS), road=[], detail=[], land=[];
    for(let s=a;s<b;s+=6) pavement(road,detail,c,s,Math.min(s+6,b));
    for(let s=a;s<b;s+=12) {
      const end=Math.min(s+12,b);
      hillsideRow(land,c,s,end);
      vegetation(land,c,s,end,rng);
    }
    for(const s of [0,c.length]) if(s>=a && s<b) {
      checkLine(detail,c,s);
      gantry(detail,c,s,s===0 ? 'RIDGE' : 'FINISH');
    }
    for(const gate of c.gates.slice(1,-1)) if(gate.s>=a && gate.s<b)
      for(const side of [-1,1]) roadside(detail,c,gate.s,'S'+c.gates.indexOf(gate),side);
    for(let km=1;km<=4;km++) {
      const s=c.length-km*1000;
      if(s>=a && s<b) roadside(detail,c,s,km+'KM',1);
    }
    for(let s=110;s<c.length;s+=75) if(s>=a && s<b && !inside(s,c.features.tunnel)){
      const p=c.sample(s),q=c.sample(s+30), turn=p.rx*q.tx+p.rz*q.tz;
      if(Math.abs(turn)>.14) roadside(detail,c,s,'',-Math.sign(turn),Math.sign(turn));
    }
    for(const station of [c.startS,c.endS]) if(station===a || station===b && station===c.endS){
      const f=c.sample(station), at=(x,y,z)=>local(f,x,y,z);
      box(detail,at,[0,.45,station===c.startS ? -.25 : .25],[2*c.barrierOffset+.6,.90,.5],STEEL);
      for(let x=-10;x<=10;x+=4) box(detail,at,[x,.55,0],[1.1,.38,.04],GOLD);
    }
    bridge(detail,c,a,b); tunnel(detail,c,a,b);
    batches.push(batch(road,{roughness:.96,pattern:'asphalt',patternScale:.54},true),
      batch(detail,{roughness:.86},true),batch(land,{roughness:1},true));
  }
  return batches.filter(Boolean);
}
