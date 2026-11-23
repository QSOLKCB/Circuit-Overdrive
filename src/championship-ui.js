// SPDX-License-Identifier: Apache-2.0
import {CALENDAR, POINTS, championshipStandings, createChampionship} from './championship.js';
import {FIELD, PLAYER_ID} from './field.js';
import {drawCoursePreview} from './map.js';

const $ = id => document.getElementById(id);
function element(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}
const format = course => course.closed ? '3 laps' : 'Mountain sprint';

function board(caption, headings, rows) {
  const table = element('table');
  table.append(element('caption',caption));
  const head = table.createTHead().insertRow();
  for (const label of headings) head.append(element('th',label));
  const body = table.createTBody();
  for (const {driver,values} of rows) {
    const row = body.insertRow();
    row.dataset.driver = driver.id;
    row.style.setProperty('--paint',driver.color);
    if (driver.id === PLAYER_ID) row.className = 'woc-player';
    for (const value of values) row.insertCell().textContent = value;
  }
  return table;
}
const nameplate = driver => '#' + driver.number + ' ' + driver.name;
function pointsBoard(history) {
  return board('Championship standings', ['Pos','Driver','Points'],
    championshipStandings(history).map(({driver,points},i) => ({
      driver, values:[i+1,nameplate(driver),points]
    })));
}
function eventBoard(result, history, formatTime) {
  const points = new Map(championshipStandings(history).map(row => [row.driver.id,row.points]));
  return board('Event classification', ['Pos','Driver','At flag','Award','Total'],
    result.classification.map(({id,finishTicks},i) => ({
      driver:FIELD[id], values:[i+1,nameplate(FIELD[id]),finishTicks === null ? 'Racing at flag' :
        formatTime(finishTicks),'+'+POINTS[i],points.get(id)]
    })));
}
function calendarList(history) {
  const list = element('ol');
  list.className = 'woc-calendar';
  for (const [i,event] of CALENDAR.entries()) {
    const item = element('li'), detail = element('div');
    item.append(element('b',String(i+1).padStart(2,'0')),detail);
    detail.append(element('strong',event.name),element('small',event.course.name+' · '+format(event.course)));
    if (history[i]) detail.append(element('span','Won by '+FIELD[history[i].classification[0].id].name));
    list.append(item);
  }
  return list;
}

export function championshipUI({revision, grid, leave, changed, formatTime}) {
  const panel = $('woc'), content = $('woc-content'), actions = $('woc-actions');
  let cup = null, view = null;
  let announcement = '';

  function button(id, label, handler, primary = false) {
    const node = element('button',label);
    node.type = 'button';
    node.id = 'woc-'+id;
    node.onclick = handler;
    if (primary) node.className = 'primary';
    actions.append(node);
    return node;
  }
  function hide() {
    view = null;
    panel.hidden = true;
  }
  function home() {
    hide();
    leave();
  }
  function newCup() {
    const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2,'0')).join('');
    cup = createChampionship(id,revision);
    cup.prepareEvent();
    show('briefing');
  }
  function next() {
    if (cup.phase === 'complete') return show('trophy');
    if (cup.phase === 'event-completed') cup.prepareEvent();
    show('briefing');
  }
  function back() {
    if (view === 'hub') home();
    else show('hub');
  }
  function focus() {
    (actions.querySelector('button.primary') || actions.querySelector('button'))?.focus({preventScroll:true});
  }
  function show(screen) {
    view = screen;
    panel.hidden = false;
    panel.dataset.view = screen;
    content.replaceChildren();
    actions.replaceChildren();
    const history = cup?.history ?? [];
    const n = history.length;
    const title = $('woc-title'), label = $('woc-label'), copy = $('woc-copy');
    label.textContent = 'World Overdrive Championship';
    $('woc-trophy').hidden = screen !== 'trophy';
    if (screen === 'hub') {
      label.textContent = 'Championship menu';
      title.textContent = 'World Overdrive Championship';
      copy.textContent = 'Race five rivals across four events for the world title.';
      content.append(calendarList(history));
      if (cup) button('continue','Continue championship',() => show(cup.phase === 'complete' ? 'trophy' :
        cup.phase === 'event-completed' ? 'results' : 'briefing'),true);
      button('new',cup ? 'New championship' : 'Start championship',() => cup ? show('replace') : newCup(),!cup);
      button('calendar','Event calendar',() => show('calendar'));
      button('standings','Standings',() => show('standings'));
      button('leave','Standalone racing',home);
    } else if (screen === 'replace') {
      title.textContent = 'Start a new championship?';
      copy.textContent = 'Your current championship and its results will be replaced.';
      button('keep','Keep championship',() => show('hub'),true);
      button('replace','Start new championship',newCup);
    } else if (screen === 'calendar' || screen === 'standings') {
      title.textContent = screen === 'calendar' ? 'Event calendar' : 'Points standings';
      copy.textContent = screen === 'calendar' ? 'Two visits to each course. Each round awards its own points.' :
        n+' of 4 events scored · 10 / 6 / 4 / 3 / 2 / 1 points per finish order';
      content.append(screen === 'calendar' ? calendarList(history) : pointsBoard(history));
      button('back','Championship menu',back,true);
    } else if (screen === 'briefing') {
      const event = cup.nextEvent;
      label.textContent = 'Round '+(n+1)+' / 4 · Event briefing';
      title.textContent = event.name;
      copy.textContent = event.course.name+' · '+format(event.course)+' · '+(event.course.length/1000).toFixed(2)+' km';
      const route = element('canvas');
      route.width = 240;
      route.height = 120;
      route.setAttribute('aria-label',event.course.name+' course map');
      drawCoursePreview(route,event.course);
      content.append(route,pointsBoard(history));
      button('grid','Start event',grid,true);
      button('back','Championship menu',back);
    } else if (screen === 'results') {
      const event = CALENDAR[n-1], leader = championshipStandings(history)[0];
      label.textContent = 'Round '+n+' / 4 · Chequered flag';
      title.textContent = event.name;
      copy.textContent = 'Championship leader · '+nameplate(leader.driver)+' · '+leader.points+' points';
      content.append(eventBoard(history.at(-1),history,formatTime));
      if (cup.nextEvent) content.append(element('p','Up next · '+cup.nextEvent.name+' · '+cup.nextEvent.course.name));
      button('next',cup.nextEvent ? 'Continue to round '+(n+1) : 'View championship trophy',next,true);
      button('back','Championship menu',back);
    } else if (screen === 'trophy') {
      const winner = championshipStandings(history)[0];
      label.textContent = 'World Overdrive Champion';
      title.textContent = nameplate(winner.driver);
      copy.textContent = winner.points+' points · World Overdrive Championship';
      content.append(pointsBoard(history));
      for (const [i,result] of history.entries()) {
        const event = element('details');
        event.append(element('summary','Round '+(i+1)+' · '+CALENDAR[i].name),
          eventBoard(result,history.slice(0,i+1),formatTime));
        content.append(event);
      }
      button('new','New championship',() => show('replace'),true);
      button('back','Championship menu',back);
    }
    announcement = label.textContent+' · '+title.textContent;
    panel.scrollTop = 0;
    changed();
    focus();
  }
  return {
    get announcement() { return announcement; },
    get visible() { return view !== null; },
    get active() { return cup?.phase === 'event-active'; },
    get roundName() { return cup?.nextEvent?.name; },
    open:() => show('hub'), focus, back,
    takeGrid() {
      const race = cup.startEvent();
      hide();
      return race;
    },
    abandon(race) { cup.abandonEvent(race); },
    briefing:() => show('briefing'),
    step(race,command) { cup.stepEvent(race,command); },
    finish(race) { cup.settleEvent(race); show('results'); }
  };
}
