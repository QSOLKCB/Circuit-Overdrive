// SPDX-License-Identifier: Apache-2.0
// Test driver. These are exactly the three commands available on the keyboard.
import { track } from '../src/track.js';

export function driverIntent(p, cruise = 30, lateral = 0, course = track) {
  const target = course.sample(p.s + 9 + p.speed * 0.52, lateral);
  const angle = Math.atan2(target.x - p.x, -(target.z - p.z)) + p.yaw;
  const error = Math.atan2(Math.sin(angle), Math.cos(angle));
  return {
    steer: Math.abs(error) < 0.028 ? 0 : Math.sign(error),
    throttle: p.speed < cruise ? 1 : 0,
    brake: p.speed > cruise + 2 ? 1 : 0,
  };
}
