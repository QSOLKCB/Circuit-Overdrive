// SPDX-License-Identifier: Apache-2.0
import {PLAYER_ID} from './field.js';

function courseOutline(track, boxWidth, boxHeight, cx, cy) {
  const points = Array.from({length:192}, (_, i) => track.sample(track.length * i / (track.closed ? 192 : 191)));
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
      ctx.arc(x(p.x),y(p.z),isPlayer ? 5.5 : 4,0,2*Math.PI);
      ctx.fill(); ctx.stroke();

      const dx=p.x-player.x, dz=p.z-player.z;
      const side=dx*c-dz*s, back=dx*s+dz*c;
      const px=246+side*3.3, py=139+back*3.3;
      if (px<185 || px>307 || py<35 || py>183) continue;
      ctx.save();
      ctx.translate(px,py);
      ctx.rotate(player.yaw-p.yaw);
      ctx.fillRect(-3.3,-7,6.6,14);
      ctx.strokeRect(-3.3,-7,6.6,14);
      ctx.restore();
    }
  };
}
