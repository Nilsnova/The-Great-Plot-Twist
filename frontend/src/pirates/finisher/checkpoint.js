// Optional rehearsal checkpoint inside the existing pirate demo. No API calls, coins or saved wave progress.
import {createFinisher} from './rules.js';
import {createFinisherRecorder} from './input.js';
import {createFinisherIntroduction} from './introduction.js';

export function startFinisherCheckpoint({container, kind, player = 'local-demo', island = 'demo-island', reducedMotion}) {
  const wave = {haul: 5, cannon: 15, duel: 30, redtide: 100}[kind];
  const finisher = createFinisher({wave, enabled: true, preparation: true});
  const ship = {id: 'checkpoint_boss', kind: kind === 'redtide' ? 'redtide' : 'warship', boss: true, hp: 1, maxHp: 100, x: 0, z: 0};
  finisher.bind({ships: [ship], party: new Map([[player, {id: player}]]), presentAt: () => true, now: () => 0, damageShip() {}});
  finisher.watch(ship); finisher.begin([]);
  const recorder = createFinisherRecorder();
  const scene = createFinisherIntroduction({container, me: player, reducedMotion, recorder, practiceIdentity: {player, island},
    onReady: () => finisher.input({type: 'finisher_ready', by: player, shipId: ship.id})});
  let frame, previous = performance.now(), accumulated = 0, disposed = false;
  function update(now) {
    if (disposed) return;
    const dt = Math.min(.1, (now - previous) / 1000); previous = now; accumulated += dt;
    while (accumulated >= .05) {finisher.tick([]); accumulated -= .05;}
    const state = finisher.state();
    if (!state) {scene.dispose(); return;}
    scene.update({finisher: state, dt});
    if (state.phase === 'task' || state.phase === 'grace') for (const input of recorder.take(now, state.sample, state.tasks, {force: state.phase === 'grace'})) {
      finisher.input({type: 'finisher_input', by: player, ...input});
    }
    frame = requestAnimationFrame(update);
  }
  frame = requestAnimationFrame(update);
  return {dispose() {disposed = true; cancelAnimationFrame(frame); scene.dispose();}};
}
