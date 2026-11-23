// SPDX-License-Identifier: Apache-2.0
import {buildVehicleVisual, vehicleDraws} from '../vendor/vanillajs/modules/scenic3d/index.js';
import {multiplyMatrices, quatMultiply, rotate} from '../vendor/vanillajs/modules/math/index.js';
import {carRecipe, rideHeight} from './sim.js';
import {FIELD} from './field.js';
import {box, quad} from './geometry.js';

const WHITE=[.98,.97,.87], INK=[.027,.036,.053], STEEL=[.39,.47,.50];
const SILVER=[.79,.83,.81], RED=[.94,.046,.026];
const at=(x,y,z)=>[x,y,-z];
const mix=(a,b,t)=>a+(b-a)*t;

// Station, body half-width, shoulder height and crown of the bonnet/deck.
// The nose, pressed front wings and short boot are all part of one continuous shell.
const sections=[
  [-2.16,.815,.57,.035],[-2.05,.885,.638,.046],[-1.76,.944,.742,.06],
  [-1.30,.97,.776,.068],[-.82,.941,.786,.07],[-.42,.933,.80,.042],
  [.47,.935,.808,.038],[1.26,.97,.811,.043],[1.68,.95,.798,.052],
  [2.02,.924,.761,.053],[2.16,.861,.712,.046]
];
function section(z) {
  const i=sections.findIndex(k=>k[0]>=z);
  if(i<=0) {const end=i<0?sections.at(-1):sections[0];return {w:end[1],h:end[2],c:end[3]};}
  const a=sections[i-1],b=sections[i],t=(z-a[0])/(b[0]-a[0]);
  return {w:mix(a[1],b[1],t),h:mix(a[2],b[2],t),c:mix(a[3],b[3],t)};
}
function deck(x,z) {
  const {w,h,c}=section(z),u=Math.abs(x/w);
  // A small centre rise and crease over each front wheel catch the moving sun.
  return [x,h+c*(1-u*u)+.024*(1-Math.min(1,Math.abs(z+1.35)/.74))*Math.max(0,1-Math.abs(u-.76)/.20),z];
}
function roof(x,z) {
  return [x,1.34-.055*(x/.63)**2-.016*((z-.13)/.53)**2,z];
}
function archFloor(z) {
  const dz=Math.abs(Math.abs(z)-carRecipe.wheel.wheelbase/2);
  return dz<.38 ? .34+Math.sqrt(.38**2-dz**2) : .223;
}
const panes = {
  front:[[-.732,.857,-.88],[.732,.857,-.88],roof(.592,-.40),roof(-.592,-.40)],
  rear:[[.755,.856,1.39],[-.755,.856,1.39],roof(-.606,.66),roof(.606,.66)]
};
function pane(corners,u,v) {
  const [a,b,c,d]=corners;
  return a.map((x,i)=>mix(mix(x,b[i],u),mix(d[i],c[i],u),v));
}
function patch(out,point,u0,v0,u1,v1,color,normal) {
  quad(out,point(u0,v0),point(u1,v0),point(u1,v1),point(u0,v1),color,normal);
}
// Original chamfered stencil digits. All numbers use the same six-sided strokes.
const masks=['abcdef','bc','abdeg','abcdg','bcfg','acdfg','acdefg','abc','abcdefg','abcdfg'];
const strokes={a:[.17,.89,.80,.89],b:[.85,.85,.85,.55],c:[.85,.47,.85,.15],
  d:[.17,.10,.80,.10],e:[.12,.46,.12,.15],f:[.12,.85,.12,.55],g:[.17,.50,.80,.50]};
function number(out,n,point,color,normal) {
  [...String(n)].forEach((digit,i)=>{
    for(const s of masks[Number(digit)]) {
      const [x,y,X,Y]=strokes[s],horizontal=y===Y;
      const dx=horizontal?0:.109, dy=horizontal?.09:0;
      const p=(u,v)=>point((i+u+.13*(v-.5))/2,v);
      quad(out,p(x-dx,y-dy),p(X-dx,Y-dy),p(X+dx,Y+dy),p(x+dx,y+dy),color,normal);
    }
  });
}

function coachwork(night){
  const shell=[], detail=[], glass=[], lamps=[], projectors=[];
  const stations=new Set(sections.map(row=>row[0]));
  for(const axle of [-1.31,1.31]){
    stations.add(axle-.395); stations.add(axle+.395);
    for(let i=0;i<=12;i++) stations.add(axle-.38*Math.cos(Math.PI*i/12));
  }
  const zs=[...stations].sort((a,b)=>a-b);
  for(let i=1;i<zs.length;i++){
    const a=zs[i-1],b=zs[i],sa=section(a),sb=section(b);
    for(const s of [-1,1]){
      for(const [inner,outer] of [[0,.54],[.54,.76],[.76,.92],[.92,1]]) {
        quad(shell,deck(s*inner*sa.w,a),deck(s*inner*sb.w,b),deck(s*outer*sb.w,b),deck(s*outer*sa.w,a),
          WHITE,[s*inner*.14,.98,0]);
      }
      const side=(z,f,atTop)=>[s*(f.w-(atTop?0:.037)),atTop?f.h:archFloor(z),z];
      const crease=(z,f)=>[s*(f.w+.006),Math.max(f.h-.135,archFloor(z)+.015),z];
      quad(shell,side(a,sa,false),side(b,sb,false),crease(b,sb),crease(a,sa),[.87,.89,.91],[s,-.12,0]);
      quad(shell,crease(a,sa),crease(b,sb),side(b,sb,true),side(a,sa,true),WHITE,[s,.23,0]);
      // Return lip behind each wheel opening gives the flared fender thickness.
      if(archFloor((a+b)/2)>.25) {
        const p=side(a,sa,false),q=side(b,sb,false);
        quad(detail,p,q,[q[0]-s*.084,q[1]+.012,b],[p[0]-s*.084,p[1]+.012,a],INK,[s,-.35,0]);
      }
    }
  }
  for(const [z,normal] of [[-2.16,[0,0,-1]],[2.16,[0,0,1]]]){
    const f=section(z);
    for(const [left,right] of [[-1,-.60],[-.60,0],[0,.6],[.6,1]]){
      quad(shell,[left*(f.w-.032),.223,z],[right*(f.w-.032),.223,z],deck(right*f.w,z),deck(left*f.w,z),WHITE,normal);
    }
  }
  for(const z of [-.40,.13]) for(const [left,right] of [[-.606,-.32],[-.32,0],[0,.32],[.32,.606]]){
    const end=z+.53;quad(shell,roof(left,z),roof(left,end),roof(right,end),roof(right,z),WHITE,[left*.20,1,0]);
  }
  for(const side of [-1,1]){
    const windows=[[side*.732,.857,-.88],[side*.755,.856,1.39],roof(side*.606,.66),roof(side*.592,-.40)];
    const surface=(u,v)=>pane(windows,u,v);
    patch(glass,surface,0,0,1,1,[.19,.31,.39],[side,.28,0]);
    for(const [a,b,color] of [[0,.045,WHITE],[.46,.50,INK],[.77,.785,INK],[.89,1,WHITE]]){
      patch(color===WHITE?shell:detail,surface,a,0,b,1,color,[side,.28,0]);
    }
    patch(detail,surface,.04,0,.93,.055,INK,[side,.3,0]);
    for(const z of [-.50,.49]) box(detail,at,[side*.937,.717,-z],[.016,.028,.126],INK);
    // Mirror stalk and swept two-tone housing.
    box(detail,at,[side*.83,.904,.66],[.19,.038,.061],INK);
    box(shell,at,[side*.933,.93,.65],[.158,.089,.147],WHITE);
    box(detail,at,[side*.933,.933,.573],[.126,.054,.012],SILVER);
    box(detail,at,[side*.932,.244,0],[.053,.071,1.77],INK);
  }
  for(const [name,corners] of Object.entries(panes)){
    const v=(u,t)=>pane(corners,u,t),normal=[0,.62,name==='front'?-.78:.78];
    patch(glass,v,0,0,1,1,[.25,.35,.43],normal);
    patch(detail,v,0,0,1,.038,INK,normal);
    patch(detail,v,0,.967,1,1,INK,normal);
    for(const u of [0,.976]) patch(detail,v,u,0,u+.024,1,INK,normal);
    if(name==='rear'){
      // Two pale cage diagonals are tucked behind the tinted backlight.
      for(const s of [-1,1]){
        const p=(u,t)=>{const q=v(s<0?u:1-u,t); q[2]-=.055; return q;};
        quad(detail,p(.12,.08),p(.148,.08),p(.823,.87),p(.795,.87),SILVER,normal);
      }
      for(const t of [.28,.46,.64]) patch(detail,v,.035,t,.965,t+.006,[.26,.27,.23],normal);
    }
  }
  // Pressed bonnet extractors have discrete louvers and a painted centre rib.
  for(const side of [-1,1]) for(let j=0;j<4;j++){
    const z=-1.50+.065*j, f=(x,z)=>{const p=deck(x,z);p[1]+=.006;return p;};
    quad(detail,f(side*.41,z),f(side*.65,z+.032),f(side*.645,z+.061),f(side*.405,z+.029),INK,[0,1,0]);
  }
  // The raised bumper shoulders turn the corner of the nose and boot. A narrow
  // seam and the projecting splitter keep the two fascias separate at distance.
  for (const [z,dir] of [[-2.16,-1],[2.16,1]]) {
    const y=z<0?.405:.418;
    for(const sign of [-1,1]){
      const corner=(x,h,along)=>[sign*x,h,z+dir*along];
      quad(shell,corner(.66,y,.015),corner(.85,y+.01,.018),corner(.858,y-.102,.025),corner(.69,y-.08,.028),WHITE,[0,.16,dir]);
      quad(shell,corner(.85,y+.01,.018),corner(.933,y+.026,-.30),corner(.928,y-.075,-.32),corner(.858,y-.102,.025),WHITE,[sign*.88,.15,dir*.36]);
      quad(detail,corner(.69,y-.09,.028),corner(.858,y-.111,.025),corner(.858,y-.129,.025),corner(.69,y-.108,.028),INK,[0,0,dir]);
    }
  }
  // Front air dam, splitter, horizontal slats and paired projector/indicator pods.
  const face=(s,z)=>(u,v)=>[s*u,v,z];
  patch(detail,face(1,-2.168),-.71,.267,.71,.475,INK,[0,0,-1]);
  for(const y of [.296,.353,.409]) patch(detail,face(1,-2.173),-.52,y,.52,y+.012,STEEL,[0,0,-1]);
  box(detail,at,[0,.205,2.115],[1.70,.062,.16],INK);
  patch(detail,face(1,-2.170),-.213,.522,.213,.607,INK,[0,0,-1]);
  for(const x of [-.175,-.10,-.025,.05,.125])
    patch(detail,face(1,-2.172),x,.536,x+.015,.593,STEEL,[0,0,-1]);
  for(const side of [-1,1]){
    const f=face(side,-2.169);
    quad(detail,f(.24,.467),f(.79,.465),f(.81,.568),f(.24,.60),INK,[0,0,-1]);
    for(let i=0;i<3;i++){
      const x=.275+.17*i,front=face(side,-2.174);
      quad(night ? projectors : detail,front(x,.487),front(x+.141,.487),front(x+.143,.558),front(x,.566),
        i===2?[.98,.48,.085]:[.92,.96,.93],[0,0,-1]);
    }
  }
  // Broad tail panel and long lens clusters remain recognisable behind another car.
  patch(detail,face(1,2.164),-.84,.43,.84,.704,INK,[0,0,1]);
  patch(detail,face(1,2.17),-.84,.694,.84,.711,STEEL,[0,.25,1]);
  for(const s of [-1,1]){
    const back=face(s,2.172);
    for(const [l,r,tint] of [[.34,.53,RED],[.55,.69,RED],[.71,.81,[1,.34,.055]]]){
      quad(lamps,back(l,.476),back(r,.491),back(r,.657),back(l,.674),tint,[0,0,1]);
      const lens=face(s,2.175);
      quad(lamps,lens(l,.617),lens(r,.608),lens(r,.623),lens(l,.633),[1,.29,.105],[0,.25,1]);
    }
    box(detail,at,[s*.61,.267,-2.08],[.37,.077,.163],INK);
    box(detail,at,[s*.56,.212,-2.13],[.17,.082,.125],STEEL);
    // Tapered two-plane rear wing on raked stanchions.
    const strut=(x,y,z)=>[s*.566+x,y,z];
    for (const x of [-.025,.025]) {
      quad(detail,strut(x,.763,1.64),strut(x,.765,1.80),strut(x,1.085,1.97),strut(x,1.08,1.87),INK,[Math.sign(x),0,0]);
    }
    quad(detail,strut(-.025,.765,1.80),strut(.025,.765,1.80),strut(.025,1.085,1.97),strut(-.025,1.085,1.97),STEEL,[0,.22,1]);
    box(shell,at,[s*.928,1.096,-1.92],[.041,.174,.359],WHITE);
  }
  quad(detail,[-.94,1.055,1.737],[.94,1.055,1.737],[.94,1.11,2.058],[-.94,1.11,2.058],INK,[0,1,-.16]);
  quad(detail,[-.94,1.11,2.058],[.94,1.11,2.058],[.94,1.076,2.07],[-.94,1.076,2.07],STEEL,[0,.1,1]);
  return {shell,detail,glass,lamps,projectors};
}

// Each identity has its own panel layout, high-contrast secondary colour and race number.
// Coordinates are on the body surfaces so the graphics follow the bonnet crown and roof.
const schemes=[
  {bands:[[-.51,-.35],[.35,.51]],accent:[.98,.85,.23],kick:.48},
  {bands:[[-.58,-.31],[-.25,-.20]],accent:[.065,.095,.16],kick:-.37},
  {bands:[[-.41,-.34],[-.26,.06]],accent:WHITE,kick:.18},
  {bands:[[.12,.25],[.32,.49]],accent:[.94,.64,.29],kick:-.57},
  {bands:[[-.44,-.31],[.16,.46]],accent:INK,kick:.62},
  {bands:[[-.48,-.38],[-.34,-.10]],accent:WHITE,kick:-.18}
];
function raceGraphics(driver) {
  const out=[], {bands,accent,kick}=schemes[driver.id];
  for(const [index,[left,right]] of bands.entries()) {
    const color=driver.id===5 && !index?[.035,.14,.32]:accent;
    for(const [a,b,fn] of [[-2.16,-.89,deck],[1.39,2.16,deck],[-.398,.657,roof]]){
      for(let i=0;i<12;i++){
        const vertex=(x,t)=>{const p=fn(x,mix(a,b,t)); p[1]+=.007; return p;};
        quad(out,vertex(left,i/12),vertex(left,(i+1)/12),vertex(right,(i+1)/12),vertex(right,i/12),color,[0,1,0]);
      }
    }
  }
  const roofID=(u,v)=>{const p=roof((u-.5)*.83,.523-v*.76);p[1]+=.017;return p;};
  for(let col=0;col<4;col++) for(let row=0;row<2;row++)
    patch(out,roofID,-.036+col*.268,-.02+row*.52,-.036+(col+1)*.268,-.02+(row+1)*.52,WHITE,[0,1,0]);
  number(out,driver.number,(u,v)=>{const p=roofID(u,v);p[1]+=.011;return p;},INK,[0,1,0]);
  for(const side of [-1,1]){
    const stripe=(z,y)=>[side*(section(z).w-.002),y,z];
    quad(out,stripe(-.74,.434),stripe(-.72,.556),stripe(.63,.65+kick*.10),stripe(.71,.548+kick*.10),accent,[side,0,0]);
    // Pair of quarter-panel flashes high enough to clear the rear wheel arch.
    for(const z of [.85,1.49]) {
      quad(out,stripe(z,.733),stripe(z+.08,.783),stripe(z+.40,.791),stripe(z+.32,.744),accent,[side,0,0]);
    }
    const badge=(u,v)=>[side*.947,.372+.34*v,-side*(u-.5)*.79-.06];
    patch(out,badge,-.06,-.05,1.07,1.05,WHITE,[side,0,0]);
    number(out,driver.number,(u,v)=>{const p=badge(u,v);p[0]+=side*.004;return p;},INK,[side,0,0]);
  }
  // A backlight sunstrip and a big fascia identifier are readable from the chase car.
  const wind=(u,v)=>{const p=pane(panes.front,u,v);p[2]-=.007;return p;};
  patch(out,wind,.017,.805,.983,.956,accent,[0,.62,-.78]);
  const rear=(u,v)=>{const p=pane(panes.rear,u,v);p[2]+=.011;return p;};
  patch(out,rear,.016,.77,.984,.955,accent,[0,.62,.78]);
  const plate=(u,v)=>[(u-.5)*.59,.457+v*.231,2.18];
  patch(out,plate,-.04,-.04,1.04,1.04,WHITE,[0,0,1]);
  number(out,driver.number,(u,v)=>[(u-.5)*.56,.468+v*.210,2.187],INK,[0,0,1]);
  // Continue the livery around the lower valance and along the wing's trailing edge.
  for(const [l,r] of bands) patch(out,(u,v)=>[u,v,2.164],l,.245,r,.419,accent,[0,0,1]);
  patch(out,(u,v)=>[u,v,2.071],-.90,1.079,.90,1.104,accent,[0,0,1]);
  return new Float32Array(out);
}

export function touringMeshes(renderer,night=false) {
  const rig=buildVehicleVisual('touring',{profile:'low'});
  const {shell,detail,glass,lamps,projectors}=coachwork(night);
  const mesh=v=>renderer.mesh(new Float32Array(v));
  // Identical wheel geometry appears four times in the upstream rig. Share the two GPU buffers.
  const tyre=rig.parts.find(part=>part.id==='front-left-tire'), alloy=rig.parts.find(part=>part.id==='front-left-alloy');
  const rim=Array.from(alloy.vertices);
  for(const side of [-1,1]){
    // A bright valve marker on the rim helps the player read wheel rotation.
    quad(rim,[side*.151,.212,-.014],[side*.151,.244,-.016],[side*.151,.245,.024],[side*.151,.214,.022],
      [.99,.68,.11],[side,0,0]);
  }
  return {rig,shell:mesh(shell),detail:mesh(detail),glass:mesh(glass),lamps:mesh(lamps),
    projectors:night ? mesh(projectors) : null,
    tyre:mesh(tyre.vertices),rim:mesh(rim),tyreMaterial:tyre.material,rimMaterial:alloy.material,
    liveries:FIELD.map(d=>({paint:{color:[1,3,5].map(i=>parseInt(d.color.slice(i,i+2),16)/255),roughness:.27,metalness:.36},
      graphics:mesh(raceGraphics(d))}))};
}

export function bodyTransform(p) {
  const qYaw=[0,Math.sin(p.yaw/2),0,Math.cos(p.yaw/2)];
  const qPitch=[Math.sin(p.pitch/2),0,0,Math.cos(p.pitch/2)];
  const qRoll=[0,0,Math.sin(p.roll/2),Math.cos(p.roll/2)];
  const q=quatMultiply(quatMultiply(qYaw,qPitch),qRoll);
  const right=rotate(q,[1,0,0]), up=rotate(q,[0,1,0]), back=rotate(q,[0,0,1]);
  return [...right,0,...up,0,...back,0,p.x-up[0]*rideHeight,p.y-up[1]*rideHeight,p.z-up[2]*rideHeight,1];
}

export function wheelTransforms(rig,p,root) {
  const draws=vehicleDraws(rig,{steer:-p.steering,wheelSpin:p.wheelSpin});
  const wheels=[];
  for(const {part,matrix} of draws) {
    if(part.wheel===null || wheels[part.wheel]) continue;
    const w=rig.wheels[part.wheel];
    // The physics solver mounts each suspension strut on the chassis, then
    // measures its extension vertically in world space, even on a bank.
    matrix[12]=Math.sign(w.position[0])*carRecipe.wheel.track/2;
    matrix[13]=rideHeight;
    matrix[14]=(w.front?-1:1)*carRecipe.wheel.wheelbase/2;
    const scale=carRecipe.wheel.radius/w.radius;
    for(const k of [0,1,2,4,5,6,8,9,10]) matrix[k]*=scale;
    const world=multiplyMatrices(root,matrix);
    world[13]-=carRecipe.suspension.restLength-p.compression[part.wheel];
    wheels[part.wheel]=world;
  }
  return wheels;
}
