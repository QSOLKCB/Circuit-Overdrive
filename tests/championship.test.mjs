// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import {CALENDAR, POINTS, SAVE_LIMIT, championshipStandings, createChampionship,
  resumeChampionship, validateChampionshipSave} from '../src/championship.js';
import {championshipStorage} from '../src/championship-storage.js';
import {startRace, pauseRace, createRace} from '../src/sim.js';
import {driverIntent} from './driver.mjs';

const id = '0123456789abcdef'.repeat(2), revision = 'ab'.repeat(20);
function ready() {
  const cup = createChampionship(id,revision);
  cup.prepareEvent();
  return cup;
}
test('four flags score exactly once from the bound simulation and survive inter-event reloads', () => {
  let cup = createChampionship(id,revision);
  assert.equal(cup.phase,'not-started');
  assert.throws(() => cup.startEvent());
  assert.throws(() => cup.serialize());
  assert.equal(new Set(CALENDAR.map(event => event.seed)).size,4);
  for (const [i,event] of CALENDAR.entries()) {
    cup.prepareEvent();
    const race = cup.startEvent();
    assert.equal(race.course,event.course);
    assert.equal(race.seed,event.seed);
    const before = cup.serialize();
    startRace(race);
    assert.throws(() => cup.settleEvent(race));
    for (let tick=0; tick<35000 && race.phase !== 'finished'; tick++) {
      cup.stepEvent(race, race.phase === 'racing' ? driverIntent(race.player.current,33,0,race.course) : {});
    }
    assert.equal(race.phase,'finished');
    const expected = race.order.map(({id,finishTicks,recoveries}) => ({id,finishTicks,recoveries}));
    assert.equal(cup.serialize(),before);
    const result = cup.settleEvent(race);
    assert.deepEqual(result.classification,expected);
    race.order.reverse();
    assert.deepEqual(result.classification,expected);
    assert.throws(() => { result.classification[0].finishTicks = 1; },TypeError);
    assert.throws(() => cup.settleEvent(race));
    const saved = cup.serialize();
    assert(saved.length < SAVE_LIMIT);
    cup = resumeChampionship(saved,revision);
    assert.equal(cup.serialize(),saved);
    assert.equal(cup.history.length,i+1);
    assert.equal(cup.nextEvent,CALENDAR[i+1] ?? null);
    assert.equal(cup.phase,i<3 ? 'event-completed' : 'complete');
    assert.equal(championshipStandings(cup.history).reduce((sum,r) => sum+r.points,0),(i+1)*26);
  }
  assert.throws(() => cup.prepareEvent());
  assert.throws(() => cup.startEvent());
});

test('restarted and abandoned attempts, paused races, foreign races and claimed flags cannot pay', () => {
  const cup = ready(), initial = cup.serialize();
  const abandoned = cup.startEvent();
  startRace(abandoned);
  pauseRace(abandoned);
  cup.stepEvent(abandoned,{});
  assert.throws(() => cup.settleEvent(abandoned));
  cup.abandonEvent(abandoned);
  const race = cup.startEvent();
  for (const foreign of [abandoned,createRace(race.seed,race.course),{phase:'finished'},JSON.parse(initial)]) {
    assert.throws(() => cup.stepEvent(foreign,{}));
    assert.throws(() => cup.settleEvent(foreign));
  }
  race.phase = 'finished';
  cup.stepEvent(race,{});
  assert.throws(() => cup.settleEvent(race),/chequered/);
  assert.equal(cup.serialize(),initial);
  assert.equal(resumeChampionship(initial,revision).phase,'event-ready');
});

test('seeds vary the existing rival decisions on reused courses and reproduce the same field', () => {
  const traits = event => createRace(event.seed,event.course).entrants.slice(0,5)
    .map(({id,number,style,ai}) => [id,number,style,ai.pace,ai.bias,ai.passSide]);
  for (const index of [0,1]) {
    const first = traits(CALENDAR[index]), repeat = traits(CALENDAR[index+2]);
    assert.deepEqual(traits(CALENDAR[index]),first);
    assert.deepEqual(first.map(d=>d.slice(0,3)),repeat.map(d=>d.slice(0,3)));
    assert.notDeepEqual(first.map(d=>d.slice(3)),repeat.map(d=>d.slice(3)));
  }
});

test('ties resolve by wins, seconds, thirds, latest result and stable entrant ID', () => {
  assert.deepEqual(POINTS,[10,6,4,3,2,1]);
  const order = history => championshipStandings(history).map(row=>row.driver.id);
  assert.deepEqual(order([]),[0,1,2,3,4,5]);
  for (const [a,b,winner] of [
    [[1,1,2,5],[2,2,1,2],0], [[1,1,2,5],[3,3,1,1],0],
    [[1,1,3,5],[4,4,1,1],0], [[1,1,2,2],[2,2,1,1],1]
  ]) {
    const history = a.map((place,i) => {
      const rest = [2,3,4,5];
      return {classification:Array.from({length:6},(_,j) => ({
        id:j+1===place ? 0 : j+1===b[i] ? 1 : rest.shift()
      }))};
    });
    const ranks = order(history);
    assert.equal(ranks.filter(i=>i<2)[0],winner);
    assert.deepEqual(order(history),ranks);
  }
});

test('save admission rejects inconsistent history, invalid times, scores, identity and source', () => {
  const data = JSON.parse(ready().serialize());
  const first = {key:'woc-inaugural/'+id+'/1/701', course:'speedway', seed:701, elapsedTicks:9000,
    classification:[5,0,1,2,3,4].map(id=>({id,finishTicks:id===5?9000:null,recoveries:0}))};
  data.history.push(first);
  assert.equal(validateChampionshipSave(JSON.stringify(data),revision).history[0].classification[1].finishTicks,null);
  const invalid = [
    d=>{d.points=99;}, d=>{d.version=2;}, d=>{d.authority='unknown';}, d=>{d.revision=null;},
    d=>{d.id='changed';}, d=>{d.history=[first,first];}, d=>{d.history=Array(5).fill(first);},
    d=>{d.history[0].key+='x';}, d=>{d.history[0].course='ridge';}, d=>{d.history[0].seed++;},
    d=>{d.history[0].elapsedTicks++;}, d=>{d.history[0].classification.pop();},
    d=>{d.history[0].classification[1].id=5;}, d=>{d.history[0].classification[1].id=6;},
    d=>{d.history[0].classification[0].finishTicks=null;}, d=>{d.history[0].classification[0].points=10;},
    d=>{d.history[0].classification[0].recoveries=-1;}, d=>{d.history[0].classification[1].finishTicks=8999;},
    d=>{d.history[0].classification[2].finishTicks=9000;}
  ];
  for (const change of invalid) {
    const copy = structuredClone(data);
    change(copy);
    assert.throws(()=>resumeChampionship(JSON.stringify(copy),revision),undefined,String(change));
  }
  for (const raw of ['{','null','[]',' '.repeat(SAVE_LIMIT+1)]) assert.throws(()=>resumeChampionship(raw,revision));
  assert.throws(()=>createChampionship(id,'development'));
  assert.throws(()=>createChampionship('invalid',revision));
});

test('one atomic slot detects stale writers, denied reads, quota and unavailable locking', async () => {
  let value = null;
  const storage = {getItem:()=>value, setItem:(_,text)=>{value=text;}};
  const locks = {request:(_,write)=>Promise.resolve(write())};
  const slot = championshipStorage(()=>storage,()=>locks);
  assert.deepEqual(slot.read(),{available:true,text:null});
  assert.deepEqual(await Promise.all([slot.write(null,'one'),slot.write(null,'two')]),['saved','conflict']);
  assert.equal(await slot.write('one','reset'),'saved');
  assert.equal(await slot.write('one','old flag'),'conflict');
  assert.equal(slot.read().text,'reset');
  storage.setItem=()=>{throw Error('quota');};
  assert.equal(await slot.write('reset','new'),'unavailable');
  const denied = championshipStorage(()=>{throw Error('denied');},()=>undefined);
  assert.deepEqual(denied.read(),{available:false,text:null});
  assert.equal(await denied.write(null,'new'),'unavailable');
});
