// Wrap the existing boat scene so every Again obtains a new server-bound round.
import {sharedBoatResult} from './shared-boat-card.js';

export async function launchSharedBoatScene({createBoatGame, session, game, container, onClose = () => {},
  onSettled = () => {}, isCurrent = () => true, ...sceneOptions} = {}) {
  let scene = null, disposed = false, restarting = false;
  async function mount() {
    const started = await session.begin(game);
    if (!started.ok) return started;
    if (disposed || !isCurrent()) { session.cancel(); return {ok: false, message: 'The island changed before this round started.'}; }
    scene?.dispose();
    const round = started.data.round;
    scene = createBoatGame({...sceneOptions, container, game, wave: round.recordWave,
      onFinish: async ({stars}) => {
        const answer = await session.finish(stars);
        onSettled(answer);
        return sharedBoatResult(answer);
      },
      onClose: outcome => { dispose(); onClose(outcome); }});
    // Capture before the original Again handler; it must never restart an unbound round.
    scene.element.addEventListener('click', again, true);
    return {ok: true};
  }
  async function again(event) {
    if (!event.target?.closest?.('.boat-again')) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (restarting || disposed) return;
    restarting = true;
    const button = scene.element.querySelector('.boat-again');
    if (button) button.disabled = true;
    const answer = await mount();
    if (!answer.ok && !disposed) {
      const line = scene?.element.querySelector('.boat-result-line');
      if (line) line.textContent = answer.message ?? 'Retry to confirm the original reward before sailing again.';
      if (button) button.disabled = false;
    }
    restarting = false;
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    scene?.dispose(); scene = null;
    session.cancel();
  }
  const started = await mount();
  if (!started.ok) { dispose(); return started; }
  return {ok: true, data: {
    get element() { return scene?.element; }, get phase() { return scene?.phase; },
    get outcome() { return scene?.outcome; }, update: dt => scene?.update(dt),
    close() { scene?.close(); }, dispose,
  }};
}
