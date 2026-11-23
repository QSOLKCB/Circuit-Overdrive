// SPDX-License-Identifier: Apache-2.0
import { buildVehicleVisual } from '../vendor/vanillajs/modules/scenic3d/index.js';
import { box, quad, lettering } from './geometry.js';
import { FIELD, PLAYER_ID } from './field.js';

const SCARLET = [.92,.075,.027], CREAM = [.97,.85,.57], BLUE = [.026,.16,.34];
const INK = [.035,.05,.063], at=(x,y,z)=>[x,y,-z];

// Clip the procedural touring shell along paint boundaries. Normals, position
// and UVs interpolate across each cut so all bands lie on the curved panels.
function clip(polygon, edge, less) {
  const result=[];
  for(let i=0;i<polygon.length;i++) {
    const a=polygon[i], b=polygon[(i+1)%polygon.length];
    const insideA=less ? a[0]<=edge : a[0]>=edge;
    const insideB=less ? b[0]<=edge : b[0]>=edge;
    if(insideA)result.push(a);
    if(insideA!==insideB) {
      const t=(edge-a[0])/(b[0]-a[0]);
      result.push(a.map((v,k)=>v+t*(b[k]-v)));
    }
  }
  return result;
}
function paintBody(vertices) {
  const coat=[], stripes=[], bands=[[-2,-.49,SCARLET],[-.49,-.44,CREAM],[-.44,-.34,BLUE],
    [-.34,-.05,CREAM],[-.05,2,SCARLET]];
  for(let i=0;i<vertices.length;i+=33) {
    const source=[0,11,22].map(j=>Array.from(vertices.subarray(i+j,i+j+11)));
    for(const [left,right,color] of bands) {
      const out = color === SCARLET ? coat : stripes;
      const tint = color === SCARLET ? [1,1,1] : color;
      const polygon=clip(clip(source,left,false),right,true);
      for(let k=1;k<polygon.length-1;k++) {
        for(const p of [polygon[0],polygon[k],polygon[k+1]])
          out.push(...p.slice(0,6),...tint,...p.slice(9));
      }
    }
  }
  return {coat:new Float32Array(coat), stripes:new Float32Array(stripes)};
}

// Slanted stencil numerals, shared by the door plates and roof.
function number27(out, point, color) {
  const strips=[
    [[0,1],[.43,1],[.43,.82],[0,.82]], [[.27,.84],[.43,.84],[.43,.45],[.27,.45]],
    [[0,.57],[.43,.57],[.43,.4],[0,.4]], [[0,.41],[.16,.41],[.16,.1],[0,.1]],
    [[0,.17],[.43,.17],[.43,0],[0,0]], [[.53,1],[1,1],[1,.82],[.53,.82]],
    [[.82,.84],[1,.84],[.68,0],[.50,0]]
  ];
  for(const strip of strips) quad(out,...strip.map(([u,v])=>point(u+.12*(v-.5),v)),color);
}
function raceTrim(driver, paint) {
  const decal = driver.id === PLAYER_ID ? number27 : (out, point, color) => {
    lettering(out, String(driver.number), 1, (x,y) => point(.5+x/7+.08*(y/5-.5),y/5), color);
  };
  const out=[],lamps=[];
  for(const side of [-1,1]) {
    box(out,at,[side*.59,1.015,-2.0],[.10,.42,.23],INK);
    box(out,at,[side*.96,1.23,-2.02],[.052,.28,.45],paint);
    box(out,at,[side*.915,.30,-.035],[.12,.16,2.05],BLUE);
    const position=(u,v,offset)=>[side*(.921+offset),.40+v*.44,-side*(u-.5)*.76];
    const plaque=(u,v)=>position(u,v,.004);
    quad(out,plaque(-.22,-.11),plaque(1.22,-.11),plaque(1.15,1.1),plaque(-.15,1.1),CREAM,[side,0,0]);
    decal(out,(u,v)=>position(u,v,.008),INK);
    // Quarter panel arrow behind the door number.
    const stripe=(z,y)=>[side*.942,y,z];
    quad(out,stripe(.48,.66),stripe(1.8,.9),stripe(1.85,.81),stripe(.5,.52),CREAM);
    quad(out,stripe(.5,.53),stripe(1.85,.80),stripe(1.88,.765),stripe(.52,.48),BLUE);
  }
  box(out,at,[0,1.23,-2.0],[1.94,.075,.37],BLUE);
  box(out,at,[0,1.268,-2.12],[1.93,.015,.085],CREAM);
  box(out,at,[0,.28,2.35],[1.65,.075,.27],BLUE);
  // An inset tail panel, divided lenses and ID plate keep the back legible at speed.
  const rear=(x,y,z=2.477)=>[x,y,z];
  quad(out,rear(-.785,.51),rear(.785,.51),rear(.80,.757),rear(-.80,.757),INK,[0,0,1]);
  for(const side of [-1,1]) {
    for(let i=0;i<3;i++) {
      const x0=side*(.39+i*.13), x1=side*(.505+i*.13);
      const light=(x,y)=>rear(x,y,2.484);
      quad(lamps,light(x0,.55),light(x1,.55),light(x1,.713),light(x0,.713),
        i===2 ? [1,.32,.065] : [1,.082,.055],[0,0,1]);
    }
    // Small bumper reflectors also read from the oblique showroom view.
    box(out,at,[side*.73,.415,-2.45],[.19,.047,.064],CREAM);
  }
  quad(out,rear(-.185,.52,2.487),rear(.185,.52,2.487),rear(.185,.67,2.487),rear(-.185,.67,2.487),CREAM,[0,0,1]);
  decal(out,(u,v)=>rear((u-.5)*.21,.538+.115*v,2.496),INK);
  box(out,at,[0,.313,-2.40],[1.59,.075,.17],INK);
  for(const x of [-.57,-.38,.38,.57]) box(out,at,[x,.278,-2.31],[.035,.12,.34],BLUE);
  const front=(x,y,z=-2.48)=>[x,y,z];
  for(const side of [-1,1]) {
    quad(out,front(side*.30,.56),front(side*.78,.57),front(side*.78,.73),front(side*.30,.71),INK,[0,0,-1]);
    for(let j=0;j<3;j++){
      const start=side*(.32+j*.145), end=start+side*.125;
      const lens=(x,y)=>front(x,y,-2.487);
      quad(out,lens(start,.592),lens(end,.595),lens(end,.693),lens(start,.69),
        j===2 ? [1,.56,.11] : [.86,.91,.9],[0,0,-1]);
    }
  }
  box(out,at,[0,.411,2.456],[.78,.14,.074],INK);
  for(const y of [.39,.44]) box(out,at,[0,y,2.499],[.69,.015,.012],[.35,.37,.36]);
  // Decals follow the doubly curved roof panel, including its seam at the rear.
  const roof=(u,v)=>{
    const x=(u-.5)*.7+.16, z=.65-v*.76;
    const y=1.52-.065*(x/(.94*.64))**2-.025*((z+.45)/1.33*2-1)**2;
    return [x,y+.009,z];
  };
  decal(out,roof,INK);
  return {body:new Float32Array(out),lamps:new Float32Array(lamps)};
}

export function touringMeshes(renderer) {
  const visual=buildVehicleVisual('touring',{profile:'low',paint:[1,1,1]});
  const mesh=new Map();
  const body=paintBody(visual.parts.find(part => part.id === 'body').vertices);
  for (const part of visual.parts) {
    mesh.set(part.id, renderer.mesh(part.id === 'body' ? body.coat : part.vertices));
  }
  let lamps;
  const liveries = FIELD.map(driver => {
    const paint = driver.id === PLAYER_ID ? SCARLET :
      [1,3,5].map(start => parseInt(driver.color.slice(start,start+2),16)/255);
    const trim = raceTrim(driver, paint);
    lamps ??= renderer.mesh(trim.lamps);
    return {material:{color:paint,roughness:.32,metalness:.18}, trim:renderer.mesh(trim.body)};
  });
  return {visual,mesh,liveries,stripes:renderer.mesh(body.stripes),lamps};
}
