// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRace, recoverCar, startRace, stepRace } from '../src/sim.js';
import { track } from '../src/track.js';
import { ridge } from '../src/ridge.js';
import { createReplayPoses, interpolateReplayPoses } from '../src/replay-presentation.js';
import { selectHeadlights } from '../src/headlights.js';
import { driverIntent } from './driver.mjs';

for (const course of [track,ridge]) {
  test(course.id+' preserves six-car authority through the flag under night observation',()=>{
    const day=createRace(708,course), night=createRace(708,course);
    const poses=createReplayPoses();
    startRace(day);
    startRace(night);
    let sawContact=false;
    for(let tick=0; tick<24000 && day.phase!=='finished'; tick++) {
      // Drive into the actual outside rail, recover once, then finish on line.
      const lane=sawContact ? 0 : course.barrierOffset+3;
      const command=driverIntent(day.player.current,30,lane,course);
      if(day.player.contact && !day.player.recoveries) {
        assert(recoverCar(day));
        assert(recoverCar(night));
      }
      stepRace(day,command);
      stepRace(night,command);
      sawContact ||= night.player.contact;
      // Observe the night field at 20 Hz, including fractional wheel/body poses,
      // a different follow target each time, and both light budgets.
      if(tick%3===0) {
        interpolateReplayPoses(night,poses,.5);
        const focus=poses[Math.floor(tick/3)%poses.length];
        selectHeadlights(poses,focus,tick%2===0,false);
      }
      if(tick%600===0) assert.deepEqual(night,day);
    }
    assert(sawContact);
    assert.equal(night.phase,'finished');
    assert.equal(night.order.length,6);
    assert.equal(night.player.recoveries,1);
    assert.deepEqual(night,day);
  });
}
