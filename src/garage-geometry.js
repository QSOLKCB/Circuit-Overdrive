// SPDX-License-Identifier: Apache-2.0
// Original, cosmetic showroom geometry. None of these dimensions is a vehicle recipe.
import {box, lettering, quad, triangle} from './geometry.js';
import {GARAGE_CATALOG, garageModel} from './garage-catalog.js';

const at=(x,y,z)=>[x,y,z], white=[1,1,1], ink=[.055,.075,.083], steel=[.38,.46,.48];
const cream=[.91,.86,.70], amber=[.97,.57,.15], teal=[.15,.49,.49];
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
const block=(out,x,y,z,w,h,d,color)=>box(out,at,[x,y,z],[w,h,d],color);
const typed=groups=>Object.fromEntries(Object.entries(groups).map(([key,value])=>[key,new Float32Array(value)]));

// Separate authored silhouettes, in +Y up / -Z forward coordinates. These are
// finite presentation recipes selected by built-in catalogue ID, never save data.
const shapes={
  'cinder-two':{length:4.25,width:1.75,deck:.94,roof:1.51,front:-.68,rear:.95,roofFront:-.18,roofRear:.62,radius:.34},
  lilt:{length:3.58,width:1.65,deck:.97,roof:1.65,front:-.67,rear:1.43,roofFront:-.31,roofRear:1.17,radius:.32},
  'evening-line':{length:4.85,width:1.86,deck:.88,roof:1.44,front:-.84,rear:1.63,roofFront:-.29,roofRear:.80,radius:.35},
  'rivet-eight':{length:4.68,width:2.02,deck:1.02,roof:1.51,front:-.60,rear:1.20,roofFront:-.17,roofRear:.79,radius:.38},
  yardhand:{length:4.95,width:1.94,deck:1.13,roof:1.91,front:-1.04,rear:.36,roofFront:-.72,roofRear:.18,radius:.41},
  'glass-comet':{length:4.38,width:1.96,deck:.78,roof:1.28,front:-1.23,rear:1.50,roofFront:-.40,roofRear:.63,radius:.35}
};

function wheel(tyres,rims,x,z,radius,side) {
  const cy=radius+.03, outer=x+side*.15, inner=x-side*.12;
  const point=(u,angle,r)=>[u,cy+Math.cos(angle)*r,z+Math.sin(angle)*r];
  for(let i=0;i<12;i++) {
    const a=i*Math.PI/6,b=(i+1)*Math.PI/6;
    quad(tyres,point(inner,a,radius),point(outer,a,radius),point(outer,b,radius),point(inner,b,radius),ink);
    triangle(tyres,[outer,cy,z],point(outer,a,radius),point(outer,b,radius),ink,[side,0,0]);
    const face=outer+side*.008;
    triangle(rims,[face,cy,z],point(face,a,radius*.65),point(face,b,radius*.65),i%2?steel:cream,[side,0,0]);
  }
  block(rims,outer+side*.016,cy,z,.018,radius*.27,radius*.27,steel);
}

export function garageVehicleGeometry(modelId) {
  const model=garageModel(modelId),s=shapes[modelId],paint=rgb(model.finish.body),accent=rgb(model.finish.accent);
  const shell=[],trim=[],glass=[],lamps=[],tyres=[],rims=[];
  const front=-s.length/2,rear=s.length/2,half=s.width/2;
  // Six-ring chamfered lower body, with a distinct nose height and rear profile.
  const sections=[
    [front,half*.82,s.deck*(modelId==='glass-comet'?.65:.90)],
    [front+.28,half*.97,s.deck],[-s.length*.23,half,s.deck],
    [s.length*.25,half,s.deck],[rear-.23,half*.97,s.deck],[rear,half*.84,s.deck*.91]
  ];
  const ring=([z,w,h])=>[[-w*.87,.40,z],[-w,.54,z],[-w,h-.10,z],[-w*.86,h,z],
    [w*.86,h,z],[w,h-.10,z],[w,.54,z],[w*.87,.40,z]];
  const rings=sections.map(ring);
  for(let i=0;i<rings.length-1;i++)for(let j=0;j<8;j++) {
    // The pickup has an actual open recess instead of a painted solid bed top.
    if(modelId==='yardhand' && j===3 && i>=2)continue;
    quad(shell,rings[i][j],rings[i+1][j],rings[i+1][(j+1)%8],rings[i][(j+1)%8],paint);
  }
  for(const index of [0,rings.length-1])for(let j=1;j<7;j++)
    triangle(shell,rings[index][0],rings[index][j],rings[index][j+1],paint,[0,0,index===0?-1:1]);

  // Painted cabin frame surrounds inset planar glass. Large roof/profile
  // differences are geometric; stock finishes also match the catalogue record.
  const low=half*.85,high=half*(modelId==='glass-comet'?.64:.72),deck=s.deck+.012;
  const A=[-low,deck,s.front],B=[low,deck,s.front],C=[high,s.roof,s.roofFront],D=[-high,s.roof,s.roofFront];
  const E=[-low,deck,s.rear],F=[low,deck,s.rear],G=[high,s.roof,s.roofRear],H=[-high,s.roof,s.roofRear];
  quad(trim,H,G,C,D,modelId==='cinder-two'?accent:paint);
  quad(trim,D,C,B,A,paint);quad(trim,F,G,H,E,paint);
  quad(trim,E,H,D,A,paint);quad(trim,C,G,F,B,paint);
  const inset=(corners,t=.075,offset=[0,0,0])=>{
    const center=[0,1,2].map(i=>corners.reduce((sum,p)=>sum+p[i],0)/4);
    return corners.map(p=>p.map((v,i)=>v+(center[i]-v)*t+offset[i]));
  };
  const window=[.12,.24,.29];
  quad(glass,...inset([D,C,B,A],.10,[0,.006,-.009]),window);
  quad(glass,...inset([F,G,H,E],.13,[0,.006,.009]),window);
  for(const side of [-1,1]) {
    const lower=(z)=>[side*(low+.006),deck+.02,z],upper=(z)=>[side*(high+.006),s.roof-.015,z];
    const split=s.roofFront+(s.roofRear-s.roofFront)*.57;
    const pane=points=>quad(glass,...inset(side<0?points.reverse():points),window);
    pane([lower(s.front),upper(s.roofFront),upper(split-.035),lower(split-.035)]);
    pane([lower(split+.035),upper(split+.035),upper(s.roofRear),lower(s.rear)]);
    block(trim,side*(half+.008),s.deck-.16,(s.front+s.rear)/2,.018,.048,(s.rear-s.front)*.85,accent);
    block(trim,side*(half+.023),s.deck-.10,split-.16,.035,.04,.19,steel);
    block(trim,side*(half+.11),s.deck+.09,s.front+.16,.21,.12,.20,paint);
    // Sill and door gaps make the four small bay displays readable as cars.
    block(trim,side*(half+.012),.49,0,.026,.09,s.length*.68,ink);
    block(trim,side*(half+.014),.68,s.rear-.13,.018,.31,.018,ink);
    for(const z of [-s.length*.29,s.length*.29])wheel(tyres,rims,side*half,z,s.radius,side);
  }

  block(trim,0,.55,front-.014,s.width*.79,.17,.12,steel);
  block(trim,0,.55,rear+.014,s.width*.79,.16,.12,steel);
  block(trim,0,s.deck*.75,front-.024,s.width*.44,.13,.035,ink);
  for(const side of [-1,1]) {
    const slim=modelId==='evening-line'||modelId==='glass-comet';
    block(lamps,side*half*.66,s.deck*.79,front-.032,s.width*(slim?.24:.19),slim?.075:.15,.042,[.96,.96,.77]);
    block(lamps,side*half*.66,s.deck*.79,rear+.028,s.width*(slim?.26:.17),.10,.04,[.72,.075,.035]);
    if(modelId==='glass-comet')block(trim,side*half*.66,s.deck*.79,rear+.052,.035,.12,.016,ink);
  }
  block(trim,0,.60,rear+.082,.33,.10,.014,cream);
  if(modelId==='rivet-eight') {
    block(shell,0,s.deck+.08,(front+s.front)/2,.78,.14,(s.front-front)*.63,paint);
    for(const side of [-1,1])block(trim,side*.20,s.deck+.155,(front+s.front)/2,.14,.012,(s.front-front)*.64,accent);
  }
  if(modelId==='yardhand') {
    const bedStart=.50,bedEnd=rear-.13;
    block(trim,0,.76,(bedStart+bedEnd)/2,s.width*.77,.10,bedEnd-bedStart,ink);
    for(const side of [-1,1])block(shell,side*half*.85,1.09,(bedStart+bedEnd)/2,.22,.39,bedEnd-bedStart,paint);
    block(trim,0,1.07,rear-.012,s.width*.80,.36,.09,accent);
    block(shell,0,1.07,bedStart,s.width*.79,.35,.10,paint);
    for(let z=bedStart+.15;z<bedEnd;z+=.28)block(trim,0,.819,z,s.width*.73,.016,.033,steel);
  }
  if(modelId==='glass-comet')block(trim,0,.98,rear-.20,s.width*.85,.065,.22,accent);
  return typed({shell,trim,glass,lamps,tyres,rims});
}

export const GARAGE_BAY_POSITIONS=Object.freeze([8.1,2.7,-2.7,-8.1].map(x=>Object.freeze([x,0,4.25])));
export const GARAGE_PREVIEW_POSITION=Object.freeze([0,.14,-4.5]);

export function garageWorkshopGeometry() {
  const floor=[],structure=[],details=[],lights=[];
  block(floor,0,-.16,0,25,.30,25,[.23,.28,.29]);
  for(let x=-12;x<=12;x+=3)block(details,x,.001,0,.016,.01,24,[.17,.21,.22]);
  for(let z=-12;z<=12;z+=3)block(details,0,.002,z,24,.01,.016,[.17,.21,.22]);
  block(structure,0,3.2,9,25,6.4,.4,[.19,.26,.28]);
  for(const x of [-12.4,12.4])block(structure,x,2.7,2,.4,5.4,14,[.24,.31,.32]);
  block(structure,0,1.0,8.76,24.8,2,.08,teal);
  block(details,0,2.04,8.69,24.8,.10,.08,cream);
  for(const x of [-11.8,-5.4,5.4,11.8]) {
    block(structure,x,3.1,8.4,.30,6.2,.50,ink);
    block(details,x,1.0,8.10,.39,1.8,.06,amber);
    for(let y=.28;y<1.8;y+=.40)block(details,x,y,8.06,.40,.14,.07,ink);
    block(lights,x,5.1,7.95,1.8,.12,.32,cream);
  }
  for(const z of [1.6,7.2]) {
    block(structure,0,5.8,z,24.5,.28,.30,ink);
    for(const x of [-8.1,-2.7,2.7,8.1]) {
      block(details,x,5.55,z,3.4,.16,.52,ink);
      block(lights,x,5.45,z,3.15,.04,.36,[.80,.94,.91]);
    }
  }
  // Four marked storage bays, no invisible or decorative owned-car instances.
  GARAGE_BAY_POSITIONS.forEach(([x,,z],i)=>{
    for(const side of [-1,1])block(details,x+side*2.35,.025,z,.07,.022,6.2,cream);
    block(details,x,.025,z-3.1,4.7,.022,.08,cream);
    block(details,x,.025,z+3.1,4.7,.022,.08,cream);
    lettering(details,String(i+1),.23,(a,b)=>[x-a,.043,z-2.8+b],amber);
    block(details,x,3.35,8.69,2.2,.92,.12,ink);
    lettering(lights,'0'+String(i+1),.10,(a,b)=>[x-a,3.12+b,8.61],cream);
  });
  // Display platform has no inventory slot or monetary value.
  block(structure,0,.06,-4.5,4.6,.15,6.7,[.11,.16,.18]);
  for(const x of [-2.24,2.24])block(lights,x,.142,-4.5,.035,.018,6.5,amber);
  for(const z of [-7.77,-1.23])block(lights,0,.142,z,4.50,.018,.035,amber);
  for(let x=-2.1;x<2.1;x+=.35)block(details,x,.15,-7.45,.14,.015,.33,cream);
  // Roller door, cabinets, a workbench and an unoccupied service lift.
  block(details,0,3.28,8.54,7.7,2.35,.20,ink);
  for(let y=2.25;y<4.35;y+=.18)block(details,0,y,8.40,7.35,.11,.07,steel);
  block(structure,8.9,.73,-3.6,4.3,1.46,.80,teal);
  block(details,8.9,1.49,-3.6,4.5,.12,.96,steel);
  for(const x of [7.4,8.4,9.4,10.4])for(const y of [.37,.80,1.22]) {
    block(details,x,y,-4.02,.88,.032,.025,ink);
    block(details,x,y+.10,-4.045,.34,.045,.025,cream);
  }
  for(const x of [-10.5,-7.0]) {
    block(structure,x,1.75,-4.1,.38,3.5,.45,teal);
    block(details,x,.20,-4.1,.8,.35,.9,ink);
    block(details,x,.43,-4.1,.30,.18,4.8,steel);
  }
  block(details,0,5.02,8.65,10.2,.83,.16,ink);
  // The shared bitmap alphabet has no U or W; these original signs stay within
  // its supported glyphs. Full workshop identity is also semantic UI text.
  lettering(lights,'AFTER',.105,(x,y)=>[3.14-x,4.82+y,8.55],amber);
  lettering(lights,'HRS',.105,(x,y)=>[.22-x,4.82+y,8.55],cream);
  lettering(lights,'MOTOR',.105,(x,y)=>[-2.65-x,4.82+y,8.55],cream);
  return typed({floor,structure,details,lights});
}

export function garageGeometry() {
  return {workshop:garageWorkshopGeometry(),vehicles:GARAGE_CATALOG.map(model=>({modelId:model.modelId,
    parts:garageVehicleGeometry(model.modelId)}))};
}
