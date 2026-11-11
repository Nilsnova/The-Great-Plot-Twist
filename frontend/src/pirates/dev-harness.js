// ?pirates=demo: the whole wave without the other lanes. Lazily imported by game.js, never in the
// cold title. Uses the in-memory fake API, fake defenses on home_islet (spots on the home_islet coast,
// as in the sim tests) and a BroadcastChannel room, so two tabs on one computer defend together.
//   B   ring the bell (your island, or the Pirate Point bell on Lighthouse Isle)
//   P   sail to Pirate Point          H   sail home
// URL extras: &spots=cannon_2,wall_1 (defenses), &weather=storm|fog|rain|calm, &wave=N (force a wave
// number), &hp=N (a sturdier island, for the perf reading with 20+ ships), &lamps=real (no rehearsal help).
// Tower defense v2: &spots=cannon_2:3,mortar_1:2 (id:level), &full=1 (the whole island at level 3),
// &crew=gunner2,carpenter2,lookout, &captain=1..5, &auto=1 (auto next wave). F fires your musket; after a
// won wave the break offers Next wave (the fake's start route again, the next wave number).
import { coastPoint } from './sim.js';
import { createFakeIslandApi, createFakeWorld } from './fake-api.js';
import { createLocalRoom } from './room.js';
import { mountPirates } from './index.js';

const at = (id, kind, bearing, radius) => {
  const p = coastPoint(bearing * Math.PI / 180, radius);
  return { id, kind, x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 };
};
export const DEMO_SPOTS = [
  at('cannon_1', 'cannon', -45, .75), at('cannon_2', 'cannon', 45, .75), at('cannon_3', 'cannon', 135, .75), at('cannon_4', 'cannon', -135, .75),
  at('wall_1', 'wall', 0, .86), at('wall_2', 'wall', 90, .86), at('wall_3', 'wall', 180, .86), at('wall_4', 'wall', -90, .86),
  at('wall_5', 'wall', 8, .86), at('wall_6', 'wall', 98, .86),
  at('mortar_1', 'mortar', 20, .55), at('mortar_2', 'mortar', 160, .55), at('cannon_5', 'cannon', 65, .62),
  { id: 'tower_1', kind: 'watchtower', x: 0, z: -14 },
];
const FULL = ['cannon_1:3', 'cannon_2:3', 'cannon_3:3', 'cannon_4:3', 'cannon_5:2', 'mortar_1:3', 'mortar_2:3',
  'wall_1:3', 'wall_2:3', 'wall_3:3', 'wall_4:3', 'wall_5:3', 'wall_6:3', 'tower_1:2'];
/** "gunner2,carpenter2,lookout" → {gunner: 2, carpenter: 2, lookout: 1}. */
export function readCrewParam(text = '') {
  const crew = { gunner: 0, carpenter: 0, lookout: 0 };
  for (const token of String(text).split(',')) {
    const match = /^(gunner|carpenter|lookout)(\d?)$/.exec(token.trim());
    if (match) crew[match[1]] = Number(match[2] || 1);
  }
  return crew;
}
/** "cannon_2:3,wall_1" → the demo spots with their levels. */
export function readSpotsParam(text) {
  const wanted = new Map(String(text).split(',').map(token => token.trim().split(':')).map(([id, level]) => [id, Number.parseInt(level ?? '1', 10) || 1]));
  return DEMO_SPOTS.filter(spot => wanted.has(spot.id)).map(spot => ({ ...spot, level: wanted.get(spot.id) }));
}
const DEFAULT_SPOTS = ['cannon_2', 'cannon_3', 'wall_1', 'wall_2'];
const uid = () => `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export function startPirateDemo(ctx) {
  const query = new URLSearchParams(location.search);
  const defenses = readSpotsParam(query.get('full') === '1' ? FULL.join(',') : query.get('spots') ?? DEFAULT_SPOTS.join(','));
  const crew = readCrewParam(query.get('crew') ?? (query.get('full') === '1' ? 'gunner2,carpenter2,lookout' : ''));
  const captain = Math.min(5, Math.max(1, Number.parseInt(query.get('captain') ?? '1', 10) || 1));
  const api = createFakeIslandApi({ world: createFakeWorld(), weather: query.get('weather') ?? 'calm', version: 2 });
  if (query.get('auto') === '1') { try { localStorage.setItem('tgpt:pirates:auto-next', '1'); } catch { /* fine */ } }
  const forcedWave = Number.parseInt(query.get('wave') ?? '', 10), hardy = Number.parseInt(query.get('hp') ?? '', 10);
  const rooms = new Map(), islandRoom = createLocalRoom('live:place:isle_demo:1');
  const toast = document.createElement('p'); toast.className = 'demo-toast'; toast.hidden = true; toast.setAttribute('role', 'status');
  ctx.container.append(toast);
  let toastTimer = 0, lastWave = null;
  const notify = text => { toast.textContent = text; toast.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, 3500); };
  const pirates = mountPirates({ ...ctx, api, getDefenses: () => defenses, rehearsal: query.get('lamps') !== 'real', host: true, notify,
    finishWave: async body => { const answer = await api.finishWave(body); notify(answer.loot ? `Loot: 🪙 ${answer.loot}` : 'No loot this time.'); return answer; },
    openRoom: topic => { const room = createLocalRoom(topic); if (room) rooms.set(topic, room); return room; },
    islandRoom, islandSimOptions: hardy > 0 ? { island: { hp: hardy } } : {},
    getCrew: () => crew, captainLevel: () => captain, startNextWave: () => ringIsland({ next: true }) });
  // Like the island lane: the bell's answer becomes wave_started_server on the bus.
  async function ringIsland({ next = false } = {}) {
    try {
      const info = await api.startWave({ where: 'own', actionUid: uid() });
      const forced = Number.isInteger(forcedWave) && forcedWave > 0 ? (next && lastWave ? lastWave + 1 : forcedWave) : info.wave;
      lastWave = forced;
      ctx.emit({ type: 'wave_started_server', ...info, wave: forced, boss: forced % 5 === 0 });
      return { ok: true, data: info };
    } catch (error) { notify(error.message); return { ok: false, code: error.code, message: error.message }; }
  }
  async function sail(id, x, z) {
    // The front door's goal card and other panels hold the world; sail once it is free.
    for (let i = 0; i < 300 && (ctx.isBlocked?.() || ctx.world.busy); i++) await new Promise(resolve => setTimeout(resolve, 200));
    await ctx.travel(id, { fast: true });
    if (ctx.world.current?.id === id && Number.isFinite(x)) ctx.player.position.set(x, ctx.world.current.groundHeight?.(x, z) ?? 1, z);
  }
  const keydown = event => {
    const target = event.target;
    if (event.repeat || ctx.isBlocked?.() || (target instanceof HTMLElement && target.closest('input, select, textarea, [contenteditable=true]'))) return;
    const place = ctx.world.current?.id;
    if (event.code === 'KeyB' && place === 'home_islet') void ringIsland();
    if (event.code === 'KeyB' && place === 'lighthouse_isle') void pirates.point?.ringBell();
    if (event.code === 'KeyP' && place !== 'lighthouse_isle') void sail('lighthouse_isle', 4, -2);
    if (event.code === 'KeyH' && place !== 'home_islet') void sail('home_islet', defenses[0]?.x - 1.5, defenses[0]?.z + 1);
  };
  window.addEventListener('keydown', keydown);
  const hint = document.createElement('p'); hint.className = 'demo-toast pirate-demo-hint';
  hint.textContent = 'Pirate demo: B rings the bell, F fires your musket, P sails to Pirate Point, H sails home.';
  ctx.container.append(hint); setTimeout(() => hint.remove(), 6000);
  const ready = (async () => {
    const first = defenses.find(item => item.kind === 'cannon') ?? { x: 0, z: 12 };
    if (query.get('place') === 'point') await sail('lighthouse_isle', 4, -2);
    else await sail('home_islet', first.x - 1.6, first.z + .8);
  })();
  const harness = {
    api, defenses, pirates, ready, ringIsland, sail, notify,
    dispose() { window.removeEventListener('keydown', keydown); clearTimeout(toastTimer); toast.remove(); hint.remove(); pirates.dispose(); islandRoom?.close(); for (const room of rooms.values()) room.close(); },
  };
  if (import.meta.env.DEV) window.__pirates = harness;
  return harness;
}
