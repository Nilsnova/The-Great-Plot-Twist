// Presenter controls on real DOM; the tour boundary is a local observable double.
import { expect, it } from 'vitest';
import { browserHarness } from './g20-browser.js';
const evaluate = browserHarness();
const modules = { '/src/demo/tour.js': `export function createTour(ctx) {
  let active=false; window.g20Tour={starts:0,next:0,stops:0,disposed:0};
  return {get active(){return active},changing:false,step:null,
    start(){active=true;window.g20Tour.starts++;ctx.announce({title:'Test highlight',copy:'Local only'});},
    advance(){window.g20Tour.next++},stop(){active=false;window.g20Tour.stops++;ctx.announce(null)},
    update(){ctx.progress(.5)},dispose(){window.g20Tour.disposed++}};
}` };

it.each(['', '?demo=0', '?demo=true', '?demo=01'])('keeps presenter absent for query %s', async query => {
  const result = await evaluate(async query => {
    history.replaceState({}, '', '/g20-harness' + query);
    const { createCinematicDemo } = await window.g20Import('/src/ui/cinematic-demo.js');
    const demo = createCinematicDemo(document.body, {}); demo.start(); demo.update(1); demo.dispose();
    return { active: demo.active, panels: document.querySelectorAll('.presenter-panel').length, tourCreated: !!window.g20Tour };
  }, query, modules);
  expect(result).toEqual({ active: false, panels: 0, tourCreated: false });
});

it('enables only ?demo=1, forwards controls/progress and disposes its owned panel', async () => {
  const result = await evaluate(async () => {
    history.replaceState({}, '', '/g20-harness?demo=1');
    const { createCinematicDemo } = await window.g20Import('/src/ui/cinematic-demo.js');
    const shots = [], demo = createCinematicDemo(document.body, { cinematic: name => shots.push(name) });
    const button = text => [...document.querySelectorAll('button')].find(b => b.textContent === text);
    const select = document.querySelector('select'); select.value = 'relighting'; button('Play visual').click();
    button('Start highlights tour').click(); demo.update(1);
    const active = demo.active, progress = document.querySelector('progress').value;
    button('Next beat · Space').click(); button('End rehearsal').click();
    const stopped = !demo.active; demo.dispose();
    return { shots, active, progress, stopped, calls: window.g20Tour, panels: document.querySelectorAll('.presenter-panel').length };
  }, null, modules);
  expect(result).toEqual({ shots: ['relighting'], active: true, progress: .5, stopped: true,
    calls: { starts: 1, next: 1, stops: 1, disposed: 1 }, panels: 0 });
});
