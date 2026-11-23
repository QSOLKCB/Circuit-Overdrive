// SPDX-License-Identifier: Apache-2.0
import { multiplyMatrices, perspective, viewMatrix } from '../vendor/vanillajs/modules/math/index.js';
import { bodyTransform } from './touring-car.js';

// The closely spaced front lenses share one photometric centre per car.
export const BEAM = Object.freeze({
  range:72, linear:.021, quadratic:.00047, inner:Math.cos(12*Math.PI/180),
  outer:Math.cos(28*Math.PI/180), dip:.055, maxSources:2, rivalDistance:48
});
const WORLD_LIMIT=10000, MAX_VERTICES=600000, CELL=64;

export function headlightSource(pose) {
  if (!pose || !['x','y','z','yaw','pitch','roll'].every(k=>Number.isFinite(pose[k]))) return null;
  if (Math.max(Math.abs(pose.x),Math.abs(pose.y),Math.abs(pose.z))>WORLD_LIMIT-4) return null;
  const m=bodyTransform(pose);
  const position=[0,1,2].map(k=>m[12+k]+.60*m[4+k]-2.18*m[8+k]);
  const direction=[0,1,2].map(k=>(-m[8+k]-BEAM.dip*m[4+k])/Math.hypot(1,BEAM.dip));
  return {position,direction};
}

export function selectHeadlights(poses,focus,reduced,showroom) {
  if (poses.length>6) throw RangeError('Headlights require a six-car field or smaller');
  if (!poses.includes(focus) || focus.finished) return [];
  const source=headlightSource(focus);
  if (!source) return [];
  const sources=[source];
  if (!reduced && !showroom) {
    let nearest=null, distance=BEAM.rivalDistance;
    for (const p of poses) {
      if (!p || p.id===focus.id || p.finished) continue;
      const d=Math.hypot(p.x-focus.x,p.y-focus.y,p.z-focus.z);
      if (d>=distance) continue;
      const candidate=headlightSource(p);
      if (candidate) { nearest=candidate; distance=d; }
    }
    if (nearest) sources.push(nearest);
  }
  return sources;
}

const vertexShader=`
attribute vec3 position, normal, tint;
uniform mat4 vp;
uniform vec3 originA, originB;
varying vec3 deltaA, deltaB, n, albedo;
void main() {
  deltaA=position-originA;
  deltaB=position-originB;
  n=normal;
  albedo=tint;
  gl_Position=vp*vec4(position,1.0);
}`;
const fragmentShader=`
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec3 deltaA, deltaB, n, albedo;
uniform vec3 axisA, axisB;
uniform float second;
float beam(vec3 delta, vec3 axis) {
  // Reject large components before taking a dot product on mediump devices.
  vec3 a=abs(delta);
  if(max(max(a.x,a.y),a.z)>=${BEAM.range}.0) return 0.0;
  float d=length(delta);
  vec3 ray=delta/max(d,0.001);
  float cone=smoothstep(${BEAM.outer},${BEAM.inner},dot(ray,axis));
  float cutoff=1.0-smoothstep(${BEAM.range-16}.0,${BEAM.range}.0,d);
  float incidence=dot(n,-ray);
  // Broad grazing return keeps asphalt visible at low lamp mounting height.
  float surface=smoothstep(-0.08,0.02,incidence)*(0.50+0.50*max(incidence,0.0));
  return 3.6*surface*cone*cutoff/(1.0+${BEAM.linear}*d+${BEAM.quadratic}*d*d);
}
void main() {
  float energy=beam(deltaA,axisA);
  if(second>0.0) energy+=0.67*beam(deltaB,axisB);
  gl_FragColor=vec4(albedo*vec3(1.0,0.89,0.70)*energy,0.0);
}`;

function buildProgram(gl) {
  const program=gl.createProgram(), shaders=[];
  if (!program) throw Error('Headlight program allocation failed');
  try {
    for(const [type,source] of [[gl.VERTEX_SHADER,vertexShader],[gl.FRAGMENT_SHADER,fragmentShader]]) {
      const shader=gl.createShader(type);
      if (!shader) throw Error('Headlight shader allocation failed');
      shaders.push(shader);
      gl.shaderSource(shader,source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
      gl.attachShader(program,shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
    return program;
  } catch (error) { gl.deleteProgram(program); throw error; }
  finally { for(const shader of shaders) gl.deleteShader(shader); }
}

// Keep triangles intact, including their original diagonal on changing banks.
// Spatial cells index draw ranges inside a single compact retained buffer.
function packReceivers(batches) {
  const cells=new Map();
  let count=0;
  for(const {vertices,receiverVertices,material,receivesHeadlights} of batches) {
    const v=receiverVertices ?? vertices;
    if(receivesHeadlights===false || material.emission>0 || material.opacity<1) continue;
    count+=v.length/11;
    if(count>MAX_VERTICES) throw RangeError('Headlight receiver budget exceeded');
    for(let i=0;i<v.length;i+=33) {
      const x=Math.floor((v[i]+v[i+11]+v[i+22])/(3*CELL));
      const z=Math.floor((v[i+2]+v[i+13]+v[i+24])/(3*CELL));
      const key=x+','+z;
      let cell=cells.get(key);
      if(!cell) {
        cell={triangles:[],min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
        cells.set(key,cell);
      }
      cell.triangles.push([v,i]);
    }
  }
  const data=new ArrayBuffer(count*20);
  const xyz=new Float32Array(data), signed=new Int8Array(data), rgb=new Uint8Array(data);
  const ranges=[];
  let offset=0;
  for(const {triangles,min,max} of cells.values()) {
    const first=offset;
    for(const [v,i] of triangles) for(let j=i;j<i+33;j+=11) {
      for(let k=0;k<3;k++) {
        const value=v[j+k];
        xyz[offset*5+k]=value;
        min[k]=Math.min(min[k],value); max[k]=Math.max(max[k],value);
        signed[offset*20+12+k]=Math.round(Math.max(-1,Math.min(1,v[j+3+k]))*127);
        rgb[offset*20+16+k]=Math.round(v[j+6+k]*255);
      }
      offset++;
    }
    const [x,y,z]=min.map((v,i)=>(v+max[i])/2);
    const r=Math.hypot(x-min[0],y-min[1],z-min[2]);
    ranges.push({first,count:offset-first,min,max,x,y,z,r});
  }
  return {data,ranges};
}

function inRange(cell,position) {
  let squared=0;
  for(let i=0;i<3;i++) {
    const gap=Math.max(cell.min[i]-position[i],0,position[i]-cell.max[i]);
    squared+=gap*gap;
  }
  return squared<BEAM.range**2;
}

// Called after LitRenderer.draw has written opaque world depth, before cars.
// Takes only receiver batches already admitted by that same LitRenderer.
export function createHeadlightPass(gl,batches) {
  const {data,ranges}=packReceivers(batches);
  const program=buildProgram(gl), buffer=gl.createBuffer();
  try {
    if(!buffer) throw Error('Headlight buffer allocation failed');
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
    const error=gl.getError();
    if(error!==gl.NO_ERROR) throw Error('Headlight upload failed ('+error+')');
  } catch(error) { gl.deleteBuffer(buffer); gl.deleteProgram(program); throw error; }
  const u={};
  for(const key of ['vp','originA','originB','axisA','axisB','second']) u[key]=gl.getUniformLocation(program,key);
  const attributes=[
    ['position',gl.FLOAT,false,0],['normal',gl.BYTE,true,12],['tint',gl.UNSIGNED_BYTE,true,16]
  ].map(([key,type,norm,offset])=>[gl.getAttribLocation(program,key),type,norm,offset]);
  return {
    draw(sources,eye,q,frame,isVisible) {
      if (!sources.length) return;
      if(sources.length>BEAM.maxSources || !sources.every(({position,direction})=>
        position.length===3 && position.every(v=>Number.isFinite(v)&&Math.abs(v)<=WORLD_LIMIT) &&
        direction.length===3 && Math.abs(Math.hypot(...direction)-1)<1e-5)) throw RangeError('Invalid headlight source');
      const vp=multiplyMatrices(perspective(frame.fov,gl.drawingBufferWidth/gl.drawingBufferHeight,
        frame.near,frame.far),viewMatrix(eye,q));
      if (!vp.every(Number.isFinite)) throw RangeError('Invalid headlight camera');
      const [a,b=a]=sources;
      gl.useProgram(program); gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      for(const [index,type,norm,offset] of attributes) {
        gl.enableVertexAttribArray(index); gl.vertexAttribPointer(index,3,type,norm,20,offset);
      }
      gl.uniformMatrix4fv(u.vp,false,vp);
      gl.uniform3fv(u.originA,a.position); gl.uniform3fv(u.axisA,a.direction);
      gl.uniform3fv(u.originB,b.position); gl.uniform3fv(u.axisB,b.direction);
      gl.uniform1f(u.second,sources.length-1);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE,gl.ONE); gl.depthMask(false);
      gl.depthFunc(gl.EQUAL);
      for(const cell of ranges) {
        if(isVisible(cell) && (inRange(cell,a.position) || (b!==a && inRange(cell,b.position))))
          gl.drawArrays(gl.TRIANGLES,cell.first,cell.count);
      }
      gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.disable(gl.BLEND);
      for(const [index] of attributes) gl.disableVertexAttribArray(index);
    },
    dispose() { if(!gl.isContextLost()) {gl.deleteBuffer(buffer); gl.deleteProgram(program);} }
  };
}
