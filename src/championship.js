// SPDX-License-Identifier: Apache-2.0
import {FIELD, PLAYER_ID} from './field.js';
import {createRace, stepRace, PENALTY_TICKS} from './sim.js';
import {track} from './track.js';
import {ridge} from './ridge.js';

export const POINTS = Object.freeze([10, 6, 4, 3, 2, 1]);
export const CALENDAR = Object.freeze([
  {name:'Overdrive Opening Cup', course:track, seed:701},
  {name:'Redline Mountain Challenge', course:ridge, seed:702},
  {name:'Speedway Grand Prix', course:track, seed:703},
  {name:'Ridge Championship Finale', course:ridge, seed:704}
].map(Object.freeze));

// This edition uses the v0.6.2 vehicle, AI, courses, recovery and flag classification.
const AUTHORITY = 'c97ee47e7577337032a55eb2e6ae53b855285573';
const EDITION = 'woc-inaugural';
export const SAVE_LIMIT = 8192;
const uint = n => Number.isSafeInteger(n) && n >= 0;
const eventKey = (id, index) => [EDITION, id, index + 1, CALENDAR[index].seed].join('/');

function requireValue(ok, message) {
  if (!ok) throw RangeError(message);
}
function fields(value, names) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name)),
  'Unexpected championship save fields');
}
function checkIdentity(id, revision) {
  requireValue(typeof id === 'string' && /^[a-f0-9]{32}$/.test(id), 'Invalid championship ID');
  requireValue(revision === null || typeof revision === 'string' && /^[a-f0-9]{40}$/.test(revision),
    'Invalid game revision');
}

function acceptResult(result, id, index) {
  fields(result, ['key','course','seed','elapsedTicks','classification']);
  const {key, course, seed, elapsedTicks, classification} = result;
  const event = CALENDAR[index];
  requireValue(key === eventKey(id,index) && course === event.course.id && seed === event.seed,
    'Result does not belong to this championship round');
  requireValue(uint(elapsedTicks) && elapsedTicks > 0 && Array.isArray(classification) &&
    classification.length === FIELD.length, 'Incomplete event classification');
  const seen = new Set();
  let previousTime = 0, previousId = -1;
  const rows = classification.map(row => {
    fields(row, ['id','finishTicks','recoveries']);
    const {id, finishTicks, recoveries} = row;
    requireValue(uint(id) && FIELD[id]?.id === id && !seen.has(id), 'Invalid or repeated driver');
    seen.add(id);
    requireValue(uint(recoveries) && recoveries <= elapsedTicks, 'Invalid recovery count');
    if (finishTicks === null) {
      requireValue(id !== PLAYER_ID, 'Missing player finish');
      previousTime = Infinity;
    } else {
      const runningTicks = finishTicks - recoveries * PENALTY_TICKS;
      requireValue(uint(finishTicks) && runningTicks >= 1 && runningTicks <= elapsedTicks &&
        (id !== PLAYER_ID || runningTicks === elapsedTicks), 'Invalid official finish time');
      requireValue(finishTicks > previousTime || finishTicks === previousTime && id > previousId,
        'Out-of-order finisher');
      previousTime = finishTicks;
    }
    previousId = id;
    return Object.freeze({id, finishTicks, recoveries});
  });
  return Object.freeze({key, course, seed, elapsedTicks, classification:Object.freeze(rows)});
}

// Read text only. Check its bound before parsing and own every accepted nested row.
export function validateChampionshipSave(text, revision) {
  requireValue(typeof text === 'string' && text.length <= SAVE_LIMIT, 'Invalid championship save size');
  const data = JSON.parse(text);
  fields(data, ['version','edition','authority','revision','id','history']);
  requireValue(data.version === 1 && data.edition === EDITION && data.authority === AUTHORITY,
    'Unsupported championship save edition or racing authority');
  checkIdentity(data.id, data.revision);
  requireValue(data.revision === revision, 'Championship save requires its original game revision');
  requireValue(Array.isArray(data.history) && data.history.length <= CALENDAR.length, 'Invalid round count');
  const history = data.history.map((result,i) => acceptResult(result,data.id,i));
  return Object.freeze({...data, history:Object.freeze(history)});
}

export function championshipStandings(history) {
  const rows = FIELD.map(driver => ({driver, points:0, places:[]}));
  for (const event of history) {
    event.classification.forEach(({id}, i) => {
      rows[id].points += POINTS[i];
      rows[id].places.push(i+1);
    });
  }
  const count = (row, place) => row.places.filter(p => p === place).length;
  return rows.sort((a,b) => {
    if (b.points !== a.points) return b.points - a.points;
    for (const place of [1,2,3]) {
      const difference = count(b,place) - count(a,place);
      if (difference) return difference;
    }
    for (let i = history.length-1; i >= 0; i--) {
      if (a.places[i] !== b.places[i]) return a.places[i] - b.places[i];
    }
    return a.driver.id - b.driver.id;
  });
}

function session(id, revision, history, phase) {
  let activeRace = null, receipt = null;
  function expect(expected) {
    requireValue(phase === expected, 'Championship is ' + phase + ', expected ' + expected);
  }
  function active(race) {
    expect('event-active');
    requireValue(race === activeRace, 'Stale championship race');
  }
  return Object.freeze({
    id, revision,
    get phase() { return phase; },
    get history() { return history; },
    get nextEvent() { return CALENDAR[history.length] ?? null; },
    prepareEvent() {
      requireValue(phase === 'not-started' || phase === 'event-completed', 'Cannot prepare this round');
      phase = 'event-ready';
    },
    startEvent() {
      expect('event-ready');
      const {seed, course} = CALENDAR[history.length];
      activeRace = createRace(seed,course);
      phase = 'event-active';
      return activeRace;
    },
    abandonEvent(race) {
      active(race);
      activeRace = receipt = null;
      phase = 'event-ready';
    },
    stepEvent(race, command) {
      active(race);
      const before = race.phase;
      stepRace(race,command);
      if (before === 'racing' && race.phase === 'finished') {
        receipt = acceptResult({
          key:eventKey(id,history.length), course:race.course.id, seed:race.seed,
          elapsedTicks:race.elapsedTicks,
          classification:race.order.map(({id,finishTicks,recoveries}) => ({id,finishTicks,recoveries}))
        },id,history.length);
      }
    },
    settleEvent(race) {
      active(race);
      requireValue(receipt && race.phase === 'finished', 'No accepted chequered flag');
      history = Object.freeze([...history, receipt]);
      activeRace = receipt = null;
      phase = history.length === CALENDAR.length ? 'complete' : 'event-completed';
      return history.at(-1);
    },
    serialize() {
      requireValue(phase !== 'not-started', 'Championship has not started');
      return JSON.stringify({version:1, edition:EDITION, authority:AUTHORITY, revision, id, history});
    }
  });
}

export function createChampionship(id, revision) {
  checkIdentity(id, revision);
  return session(id,revision,Object.freeze([]),'not-started');
}

export function resumeChampionship(text, revision) {
  const {id, history} = validateChampionshipSave(text,revision);
  const phase = history.length === CALENDAR.length ? 'complete' : history.length ? 'event-completed' : 'event-ready';
  return session(id,revision,history,phase);
}

// Keep the Theatre's v2 tape unchanged. Its source, course, seed and duration
// identify the race. The filename also identifies this specific championship.
export function eventReplayMetadata(cup, index) {
  const result = cup.history[index];
  if (!cup.revision || !result) return null;
  return Object.freeze({
    version:2, revision:cup.revision, course:result.course, seed:result.seed,
    ticks:result.elapsedTicks + 180, // v0.6.2's three-second fixed-tick countdown
    filename:'woc-'+cup.id+'-r'+(index+1)+'-'+result.course+'-'+result.seed+'-replay.json'
  });
}
