// Dev-only listening panel for the battle cues (lane T4): `?soundcheck=1` in a dev build, or
// `__island.soundcheck()` in the console. One button per cue plus "Play all": every cue in turn, a pause between.
import { PIRATE_CUES } from './pirates.js';
const PAUSE_MS = 1700;
export function mountSoundcheck({ audio, container = document.body, cues = PIRATE_CUES, pause = PAUSE_MS }) {
  const panel = document.createElement('aside'), status = document.createElement('p'), timers = new Set();
  panel.setAttribute('aria-label', 'Sound check');
  panel.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:99999;max-width:260px;padding:10px;border-radius:10px;background:#101820e8;color:#fff;font:12px/1.3 system-ui,sans-serif;display:flex;flex-direction:column;gap:6px';
  const title = document.createElement('strong'); title.textContent = 'Sound check (dev)';
  status.style.margin = '0'; status.textContent = 'Click a cue. Sound needs one click to unlock.';
  const play = name => {
    const ok = audio.cue(name);
    status.textContent = ok ? `Played ${name}` : 'Sound is locked: click once more, then play.';
    return ok;
  };
  const all = document.createElement('button'); all.type = 'button'; all.textContent = 'Play all in turn';
  const stop = () => { for (const id of timers) clearTimeout(id); timers.clear(); };
  all.addEventListener('click', () => {
    stop();
    cues.forEach((name, i) => { const id = setTimeout(() => { timers.delete(id); play(name); }, i * pause); timers.add(id); });
  });
  panel.append(title, all);
  for (const name of cues) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = name.replace('pirate-', '');
    button.addEventListener('click', () => play(name)); panel.append(button);
  }
  panel.append(status); container.append(panel);
  return { panel, play, dispose() { stop(); panel.remove(); } };
}
