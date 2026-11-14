// First-time practice uses the real scene with a private recorder. The controller receives only readiness.
import {createFinisherScene, TASK_TEXT} from './scene.js';
import {createPracticeMemory} from './practice.js';
import {goalOf, scoreOf} from './rules.js';
import {difficultyFor} from './difficulty.js';

// The solo goal in words, from this run's numbers (T39: they grow with the wave; difficulty.js).
const seconds = share => Math.round(share * 100) / 10;
const GOALS = {
  haul: d => `Keep the needle in the green zone for ${seconds(d.share)} of the 10 seconds.`,
  cannon: d => `Hit the glowing weak spot ${d.hits} times in 10 seconds. The cannon reloads after each shot.`,
  duel: d => `Match at least ${Math.round(d.share * 100)}% of the arrows in time. A wrong arrow costs one correct answer.`,
  rescue: d => `Keep the needle in the green zone for ${seconds(d.share)} of the 10 seconds to save the treasure.`,
};
const KEYS = {haul: 'Hold Space or the Haul button; release to lower the needle.',
  cannon: 'Aim with the pointer or Left/Right. Click, press F or Space, or tap Fire.',
  duel: 'Use arrow keys, WASD, or the four arrow buttons.',
  rescue: 'Hold Space or the Haul button; release to lower the needle.'};

export function createFinisherIntroduction(options) {
  const memory = createPracticeMemory(options.practiceIdentity ?? {}), marks = new Map();
  let mode = 'explain', queue = null, elapsed = 0, task = null, ready = false, focused = false, focusPractice = false;
  const record = (sample, value) => { if (mode === 'practice' && !marks.has(sample)) marks.set(sample, value); };
  const scene = createFinisherScene({...options, recorder: {
    press: (sample, value) => mode === 'practice' ? record(sample, value) : mode === 'live' && options.recorder?.press(sample, value),
    fill(sample, value) {
      if (mode === 'practice') for (let s = 0; s < sample; s++) record(s, value);
      else if (mode === 'live') options.recorder?.fill(sample, value);
    },
  }});
  const guide = document.createElement('section'); guide.className = 'finisher-panel finisher-introduction';
  guide.setAttribute('aria-label', 'Learn this game');
  const title = document.createElement('strong'), text = document.createElement('p'), status = document.createElement('p');
  title.className = 'finisher-task-title'; text.className = 'finisher-how'; status.className = 'finisher-how'; status.setAttribute('aria-live', 'polite');
  const actions = document.createElement('div'); actions.className = 'finisher-controls';
  const practice = document.createElement('button'), skip = document.createElement('button');
  for (const button of [practice, skip]) {button.type = 'button'; button.className = 'kit-button'; actions.append(button);}
  guide.append(title, text, status, actions); scene.element.append(guide);
  const reset = () => {marks.clear(); elapsed = 0; scene.resetInput();};
  function next() {
    memory.finish(task); queue.shift(); reset(); task = queue[0]; mode = task ? 'explain' : 'ready'; focused = false;
    if (!task && !ready) {ready = true; options.onReady?.();}
  }
  practice.onclick = () => {
    if (mode === 'practice') next();
    else {reset(); mode = 'practice'; focusPractice = true;}
  };
  skip.onclick = next;
  return {
    element: scene.element,
    get needle() {return scene.needle;}, get aim() {return scene.aim;},
    update({finisher: f, dt = 0, boss = null}) {
      if (f.phase !== 'prepare') {
        if (mode !== 'live') {reset(); mode = 'live';}
        guide.hidden = true; delete scene.element.dataset.learning;
        scene.update({finisher: f, dt, boss}); return;
      }
      const playing = f.players.includes(options.me);
      if (!queue) {
        queue = playing ? f.tasks.map(item => item.task).filter(kind => !memory.seen(kind)) : [];
        task = queue[0];
        if (!task) {mode = 'ready'; ready = true; if (playing) options.onReady?.();}
      }
      guide.hidden = false; scene.element.dataset.learning = mode;
      title.textContent = task ? `${mode === 'practice' ? 'Practice: ' : 'Learn: '}${TASK_TEXT[task].title}` : 'Waiting for the crew';
      text.textContent = mode === 'practice' ? 'Practice only. Try the controls below, then choose Finish practice or wait for the next step.' : task ? `${GOALS[task](f.difficulty?.[task] ?? difficultyFor(task))} ${KEYS[task]} This is the solo goal; the crew shares the real target. Practice does not count toward the battle.` : 'The scored attempt starts when the crew is ready.';
      const message = `Automatic start in ${Math.ceil(f.prepareLeft)} s. ${f.ready.length} of ${f.players.length} ready.`;
      if (status.textContent !== message) status.textContent = message;
      actions.hidden = !playing || mode === 'ready';
      practice.textContent = mode === 'practice' ? 'Finish practice' : 'Practice'; skip.textContent = 'Skip practice';
      if (playing && task && !focused) {practice.focus(); focused = true;}
      if (mode !== 'practice') {scene.update({finisher: f, dt, boss}); return;}
      elapsed += Math.max(0, Math.min(.1, dt));
      const sample = Math.min(99, Math.floor(elapsed * 10)), salt = f.salt;
      // T39: practice uses the same numbers as the scored attempt (the run's frozen difficulty).
      const difficulty = f.difficulty?.[task];
      const score = scoreOf(task, options.me, marks, {salt, easy: options.easy?.() === true, difficulty});
      const goal = goalOf(task, [options.me], {easy: new Map([[options.me, options.easy?.() === true]]), difficulty});
      scene.update({finisher: {...f, phase: 'task', kind: f.kind === 'rescue' ? 'rescue' : task, task: 0, sample, players: [options.me],
        tasks: [{task, from: 0, to: 100, score, goal, cleared: score >= goal, players: {[options.me]: score}}]}, dt, boss});
      if (focusPractice) {scene.focusControls(); focusPractice = false;}
      if (elapsed >= 10) next();
    },
    dispose() {scene.dispose();},
  };
}
