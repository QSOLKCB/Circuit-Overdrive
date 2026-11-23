// SPDX-License-Identifier: Apache-2.0
export function createMap(canvas, track) {
  const ctx = canvas.getContext('2d');
  const points = Array.from({length:192}, (_, i) => track.sample(track.length * i / 192));
  const xs = points.map(p => p.x), zs = points.map(p => p.z);
  const minX = Math.min(...xs), minZ = Math.min(...zs);
  const width = Math.max(...xs) - minX, height = Math.max(...zs) - minZ;
  const scale = Math.min((canvas.width - 26) / width, (canvas.height - 24) / height);
  const x = v => (v - minX - width / 2) * scale + canvas.width / 2;
  const y = v => (v - minZ - height / 2) * scale + canvas.height / 2;
  const path = new Path2D();
  points.forEach((p, i) => i ? path.lineTo(x(p.x), y(p.z)) : path.moveTo(x(p.x), y(p.z)));
  path.closePath();
  return p => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#b7c6bd';
    ctx.stroke(path);
    ctx.fillStyle = '#fffbe7';
    ctx.fillRect(x(points[0].x)-6, y(points[0].z)-2, 12, 4);
    ctx.beginPath();
    ctx.arc(x(p.x), y(p.z), 7, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffce42';
    ctx.fill();
    ctx.strokeStyle = '#142024';
    ctx.lineWidth = 2;
    ctx.stroke();
  };
}
