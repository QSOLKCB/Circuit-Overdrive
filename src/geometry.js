// SPDX-License-Identifier: Apache-2.0
// Flat-shaded triangle batches for the speedway's original low-poly scenery.
import { cross, normalize, subtract } from '../vendor/vanillajs/modules/math/index.js';

export function triangle(out, a, b, c, color, normal) {
  const n = normal ?? normalize(cross(subtract(b, a), subtract(c, a)));
  for (const p of [a, b, c]) out.push(...p, ...n, ...color, p[0], p[2]);
}

export function quad(out, a, b, c, d, color, normal) {
  triangle(out, a, b, c, color, normal);
  triangle(out, a, c, d, color, normal);
}

// Local coordinates increase road-right, up, and forward, in metres.
export function local(frame, x, y, forward) {
  return [frame.x + frame.rx*x + frame.tx*forward, frame.y + y,
    frame.z + frame.rz*x + frame.tz*forward];
}

export function box(out, at, center, size, color) {
  const [x,y,z] = center, [w,h,d] = size.map(v => v/2);
  const corner = (a,b,c) => at(x+a*w,y+b*h,z+c*d);
  const a = corner(-1,-1,-1), b = corner(1,-1,-1), c = corner(1,1,-1), e = corner(-1,1,-1);
  const A = corner(-1,-1,1), B = corner(1,-1,1), C = corner(1,1,1), E = corner(-1,1,1);
  quad(out,a,b,c,e,color);
  quad(out,A,E,C,B,color);
  quad(out,e,c,C,E,color,[0,1,0]);
  quad(out,a,A,B,b,color,[0,-1,0]);
  quad(out,a,e,E,A,color);
  quad(out,b,B,C,c,color);
}

// Five-row display type drawn into the sign face. All signage uses local geometry.
const glyphs = {
  A:['010','101','111','101','101'], D:['110','101','101','101','110'],
  E:['111','100','110','100','111'], I:['111','010','010','010','111'],
  N:['1001','1101','1011','1001','1001'], O:['0110','1001','1001','1001','0110'],
  P:['110','101','110','100','100'], R:['110','101','110','101','101'],
  S:['111','100','111','001','111'], V:['10001','10001','01010','01010','00100'],
  X:['1001','1001','0110','1001','1001'], Y:['101','101','010','010','010'], '2':['111','001','111','100','111'],
  '1':['010','110','010','010','111'], '3':['111','001','111','001','111'],
  '4':['101','101','111','001','001'], '5':['111','100','111','001','111'],
  '6':['111','100','111','101','111'], '7':['111','001','010','010','010'],
  '8':['111','101','111','101','111'], '9':['111','101','111','001','111']
};
export function lettering(out, word, pixel, at, color) {
  const width = [...word].reduce((w,char) => w + glyphs[char][0].length + 1, -1);
  let left = -width*pixel/2;
  for (const char of word) {
    const rows = glyphs[char];
    rows.forEach((row,i) => [...row].forEach((bit,j) => {
      if (bit !== '1') return;
      const x = left+j*pixel, y = (4-i)*pixel;
      quad(out,at(x,y),at(x+pixel,y),at(x+pixel,y+pixel),at(x,y+pixel),color);
    }));
    left += (rows[0].length+1)*pixel;
  }
}
