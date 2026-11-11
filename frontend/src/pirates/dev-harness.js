// ?pirates=demo: the whole wave without the other lanes. Lazily imported by game.js, never in the
// cold title. Uses the in-memory fake API, fake defenses on home_islet (spots on the home_islet coast,
// as in the sim tests) and a BroadcastChannel room, so two tabs on one computer defend together.
//   B   ring the bell (your island, or the Pirate Point bell on Lighthouse Isle)
//   P   sail to Pirate Point          H   sail home
// URL extras: &spots=cannon_2,wall_1 (defenses), &weather=storm|fog|rain|calm, &wave=N (force a wave
// number), &lamps=fill (Pirate Point: the host's "fill missing lamps" button straight away).
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
];
const DEFAULT_SPOTS = ['cannon_2', 'cannon_3', 'wall_1', 'wall_2'];
const uid = () => `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export function startPirateDemo(ctx) {
  const query = new URLSearchParams(location.search);
  const wanted = (query.get('spots') ?? DEFAULT_SPOTS.join(',')).split(',').map(text => text.trim());
  const defenses = DEMO_SPOTS.filter(spot => wanted.includes(spot.id));
  const api = createFakeIslandApi({ world: createFakeWorld(), weather: query.get('weather') ?? 'calm' });
  const forcedWave = Number.parseInt(query.get('wave') ?? '', 10);
  const rooms = new Map(), islandRoom = createLocalRoom('live:place:isle_demo:1');
  const toast = document.createElement('p'); toast.className = 'demo-toast'; toast.hidden = true; toast.setAttribute('role', 'status');
  ctx.container.append(toast);
  let toastTimer = 0;
  const notify = text => { toast.textContent = text; toast.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, 3500); };
  const pirates = mountPirates({ ...ctx, api, getDefenses: () => defenses, rehearsal: query.get('lamps') !== 'real', host: true, notify,
    finishWave: async body => { const answer = await api.finishWave(body); notify(answer.loot ? `Loot: 🪙 ${answer.loot}` : 'No loot this time.'); return answer; },
    openRoom: topic => { const room = createLocalRoom(topic); if (room) rooms.set(topic, room); return room; },
    islandRoom });
  // Like the island lane: the bell's answer becomes wave_started_server on the bus.
  async function ringIsland() {
    try {
      const info = await api.startWave({ where: 'own', actionUid: uid() });
      ctx.emit({ type: 'wave_started_server', ...info, wave: Number.isInteger(forcedWave) && forcedWave > 0 ? forcedWave : info.wave });
    } catch (error) { notify(error.message); }
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
  hint.textContent = 'Pirate demo: B rings the bell, P sails to Pirate Point, H sails home.';
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
