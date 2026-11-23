// SPDX-License-Identifier: Apache-2.0
// A replay contains only values delivered to the 60 Hz game, plus recovery
// requests. Wall time spent paused and camera changes do not affect a replay.
const LIMIT = 60 * 60 * 30;
const validCourse = course => course === 'speedway' || course === 'ridge';
const validSeed = seed => Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff;
const inRange = (value, low) => Number.isFinite(value) && value >= low && value <= 1;

export function createRecording(course, seed) {
  if (!validCourse(course) || !validSeed(seed)) throw RangeError('Invalid replay header');
  const runs = [];
  let ticks = 0, overflow = false;
  return {
    record({throttle,brake,steer}, recover) {
      if (ticks === LIMIT) { overflow = true; return; }
      ticks++;
      const previous = runs.at(-1);
      if (previous && previous[1] === throttle && previous[2] === brake && previous[3] === steer && previous[4] === recover) previous[0]++;
      else runs.push([1,throttle,brake,steer,recover]);
    },
    get complete() { return !overflow; },
    export() {
      if (overflow) throw RangeError('This drive exceeds the 30-minute replay limit.');
      return {version:1,course,seed,ticks,runs:runs.map(row=>row.slice())};
    }
  };
}

export function* replayCommands(data) {
  if (data?.version !== 1 || !validCourse(data.course) || !validSeed(data.seed) ||
      !Number.isInteger(data.ticks) || data.ticks < 0 || data.ticks > LIMIT ||
      !Array.isArray(data.runs) || data.runs.length > data.ticks) throw RangeError('Invalid replay header');
  let count = 0;
  for (const row of data.runs) {
    if (!Array.isArray(row) || row.length !== 5 || !Number.isInteger(row[0]) || row[0] <= 0 ||
        !inRange(row[1],0) || !inRange(row[2],0) || !inRange(row[3],-1) || typeof row[4] !== 'boolean') {
      throw RangeError('Invalid replay run');
    }
    count += row[0];
    if (count > data.ticks) throw RangeError('Invalid replay length');
  }
  if (count !== data.ticks) throw RangeError('Incomplete replay');
  for (const [length,throttle,brake,steer,recover] of data.runs) {
    for (let i=0; i<length; i++) yield {command:{throttle,brake,steer},recover};
  }
}
