// SPDX-License-Identifier: Apache-2.0
import {dot,rotate} from '../vendor/vanillajs/modules/math/index.js';
import {PLAYER_ID} from './field.js';

// Oblique projection separates the inverted return span from the grid below it.
function mapPoint(p,rocket) {
  return rocket ? {x:p.x+.46*p.z,z:-p.y+.28*p.z} : p;
}
function courseOutline(track, boxWidth, boxHeight, cx, cy) {
  const points = Array.from({length:192}, (_, i) => mapPoint(track.sample(track.length * i / (track.closed ? 192 : 191)),track.discipline==='rocket'));
  const xs = points.map(p => p.x), zs = points.map(p => p.z);
  const minX = Math.min(...xs), minZ = Math.min(...zs);
  const width = Math.max(...xs) - minX, height = Math.max(...zs) - minZ;
  const scale = Math.min(boxWidth / width, boxHeight / height);
  const x = v => (v - minX - width / 2) * scale + cx;
  const y = v => (v - minZ - height / 2) * scale + cy;
  const path = new Path2D();
  points.forEach((p, i) => i ? path.lineTo(x(p.x), y(p.z)) : path.moveTo(x(p.x), y(p.z)));
  if (track.closed) path.closePath();
  return {points,x,y,path};
}

export function drawCoursePreview(canvas, course) {
  const ctx=canvas.getContext('2d');
  const {path,points,x,y}=courseOutline(course,canvas.width-14,canvas.height-12,canvas.width/2,canvas.height/2);
  ctx.strokeStyle='#e7f2ed';
  ctx.lineWidth=3;
  ctx.lineCap='round';
  ctx.stroke(path);
  const finish=course.closed ? points[0] : points.at(-1);
  ctx.fillStyle='#ffce4a';
  ctx.fillRect(x(finish.x)-3,y(finish.z)-3,6,6);
}

export function createMap(canvas, track) {
  const ctx=canvas.getContext('2d');
  const {points,x,y,path}=courseOutline(track,142,162,84,107);
  return entrants => {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#b7c6bd';
    ctx.stroke(path);
    ctx.fillStyle = '#fffbe7';
    ctx.fillRect(x(points[0].x)-5,y(points[0].z)-2,10,4);
    if (!track.closed) {
      const finish=points.at(-1);
      ctx.fillStyle='#ffcb4d';
      ctx.fillRect(x(finish.x)-4,y(finish.z)-4,8,8);
    }
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('COURSE',84,16);
    ctx.fillText('TRAFFIC',246,16);
    ctx.strokeStyle = '#718183';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(179,27,134,164);
    ctx.setLineDash([5,6]);
    ctx.beginPath();
    ctx.moveTo(246,27); ctx.lineTo(246,191);
    ctx.moveTo(179,139); ctx.lineTo(313,139);
    ctx.stroke();
    ctx.setLineDash([]);
    const player=entrants[PLAYER_ID].current;
    const rocket=track.discipline==='rocket';
    const right=rocket ? rotate(player.orientation,[1,0,0]) : null;
    const rear=rocket ? rotate(player.orientation,[0,0,1]) : null;
    const c=Math.cos(player.yaw), s=Math.sin(player.yaw);

    // The full map provides lap context. A second, heading-up view resolves cars
    // that share a few screen pixels on the map during a start or a close pass.
    for (const driver of entrants) {
      const isPlayer=driver.id===PLAYER_ID;
      if (driver.finishTicks !== null && !isPlayer) continue;
      const p=driver.current;
      ctx.fillStyle=driver.color;
      ctx.strokeStyle=isPlayer ? '#fffbe7' : '#16202a';
      ctx.lineWidth=isPlayer ? 2.5 : 1;
      ctx.beginPath();
      const point=mapPoint(p,rocket);
      ctx.arc(x(point.x),y(point.z),isPlayer ? 5.5 : 4,0,2*Math.PI);
      ctx.fill(); ctx.stroke();

      const dx=p.x-player.x, dz=p.z-player.z;
      const delta=rocket ? [dx,p.y-player.y,dz] : null;
      const side=rocket ? dot(delta,right) : dx*c-dz*s, back=rocket ? dot(delta,rear) : dx*s+dz*c;
      const px=246+side*3.3, py=139+back*3.3;
      if (px<185 || px>307 || py<35 || py>183) continue;
      ctx.save();
      ctx.translate(px,py);
      if(rocket) {
        const nose=rotate(p.orientation,[0,0,-1]);
        ctx.rotate(Math.atan2(dot(nose,right),-dot(nose,rear)));
      } else ctx.rotate(player.yaw-p.yaw);
      ctx.fillRect(-3.3,-7,6.6,14);
      ctx.strokeRect(-3.3,-7,6.6,14);
      ctx.restore();
    }
  };
}
