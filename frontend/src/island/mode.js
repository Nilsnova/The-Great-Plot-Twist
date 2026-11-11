// Whether the island game is on (BUILD-PLAN 3.4, flag "islands"), as plain rules. game.js imports only
// this small file; everything else in src/island/ loads after Play, in its own chunk.
//   'fake'  ?islands=fake in a dev build: the in-memory fake server (src/pirates/fake-api.js, createFakeIslandTransport)
//   'live'  /api/config says flags.islands is true: the real routes through the signed-in API
//   'off'   neither: the old home islet and the old start in the harbor
export function islandsMode({search = '', dev = false, flags = null} = {}) {
  let wanted = null;
  try { wanted = new URLSearchParams(search).get('islands'); } catch { /* A bad address means off. */ }
  if (wanted === 'fake' && dev === true) return 'fake';
  return flags?.islands === true ? 'live' : 'off';
}

// The flags arrive with /api/config. An online adapter waits a moment for them (Play is usually pressed
// long after they came); a local or demo adapter never gets them and decides at once.
export async function resolveIslandsMode({search = '', dev = false, online = false, readFlags = () => null,
  timeoutMs = 1500, stepMs = 100, wait = ms => new Promise(resolve => setTimeout(resolve, ms))} = {}) {
  const read = () => { try { return readFlags(); } catch { return null; } };
  let flags = read();
  const first = islandsMode({search, dev, flags});
  if (first !== 'off' || !online) return first;
  for (let waited = 0; flags === null && waited < timeoutMs; waited += stepMs) {
    await wait(stepMs);
    flags = read();
  }
  return islandsMode({search, dev, flags});
}

// Where Play lands: on your own island when the islands are on, except for a player who came with the
// class (a HARBOR- code, the projector QR or "Join the class harbor"), who lands at Pirate Point
// (lighthouse_isle, the class battle). With the islands off the old start in the harbor stays.
export const PIRATE_POINT = 'lighthouse_isle';
export function startPlace({mode, destination = 'saltreach_harbor', classHarbor = false, visiting = false}) {
  if (mode === 'off' || destination !== 'saltreach_harbor') return destination;
  if (visiting) return 'home_islet';
  return classHarbor ? PIRATE_POINT : 'home_islet';
}
