// When the tutorials may start (T52, and the bug Nicolas Radomski found: a signed-out player was walked through the
// intro and the first goal before having an island). The intro, the guided start, the unlock cards and the
// first-run goals start only while the player stands on an island they own or joined: on the island place, with
// the island's code and its campaign known from the server's answer. A signed-out player, the front door and a
// code typed but not joined yet have no answer, so nothing starts.
//   probe: {place, code, wave}   (src/tutorial/game-hooks.js)
import {gameKey} from '../narrator/logic.js';

export const ISLAND_PLACE = 'home_islet';
export function onIsland(probe) {
  if (!probe || probe.place !== ISLAND_PLACE) return false;
  if (gameKey(probe.code, null) === null) return false;
  return Number.isSafeInteger(probe.wave) && probe.wave >= 0;
}
// Resolves true once onIsland(read()) holds, false after `timeout` ms (the front door's intro waits for it).
export function waitForIsland(read, {timeout = 8000, every = 200, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), now = () => Date.now()} = {}) {
  const until = now() + timeout;
  return (async () => {
    for (;;) {
      let ok = false;
      try { ok = onIsland(read()); } catch { ok = false; }
      if (ok) return true;
      if (now() >= until) return false;
      await wait(every);
    }
  })();
}
