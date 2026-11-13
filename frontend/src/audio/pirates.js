// The pirate wave's sounds (lane P5), original oscillator and noise voices on the existing buses, so
// the Settings volumes (master × effects, master × music) apply. Booms and splashes are rate-limited:
// a whole battery firing at once stays one clean thump instead of a wall of noise.
import { BATTLE_CUES } from './battle-sounds.js';
const GAP = { 'pirate-cannon': .07, 'pirate-cannon-manual': .05, 'pirate-splash': .09, 'pirate-hit': .06, 'pirate-wall': .12,
  'pirate-mortar': .12, 'pirate-mortar-impact': .12, 'pirate-musket': .04, 'pirate-gunboat': .06, 'pirate-harpoon': .08, 'pirate-horn': 1 };
export const PIRATE_CUES = ['pirate-cannon', 'pirate-cannon-manual', 'pirate-splash', 'pirate-hit', 'pirate-wall',
  'pirate-sunk', 'pirate-bell', 'pirate-victory', 'pirate-defeat', 'pirate-tick',
  'pirate-mortar', 'pirate-mortar-impact', 'pirate-musket', 'pirate-horn', 'pirate-harpoon', 'pirate-gunboat'];
const CAPTIONS = {
  'pirate-bell': 'The pirate bell rings',
  'pirate-victory': 'Victory: the island holds',
  'pirate-horn': 'A warship horn sounds',
  'pirate-defeat': 'The pirates took the island',
};

// `battle` (createBattleSounds) plays the punchy battle voices; `isMuted(bus)` ('effects' or 'music') lets a
// muted bus skip building any nodes at all. The returned cue function also has dispose().
export function createPirateSound({ synth, effects, music, caption = () => {}, now = () => 0, battle = null, isMuted = () => false }) {
  const last = new Map();
  function cue(name) {
    if (battle && BATTLE_CUES.includes(name)) {
      if (isMuted(battle.busOf(name))) return true;
      const t = now(), gap = GAP[name];
      if (gap && t - (last.get(name) ?? -1) < gap) return false;
      last.set(name, t);
      if (!battle.play(name, { effects, music })) return false;
      if (CAPTIONS[name]) caption(CAPTIONS[name]);
      return true;
    }
    if (isMuted(name === 'pirate-defeat' ? 'music' : 'effects')) return true;
    const t = now(), gap = GAP[name];
    if (gap && t - (last.get(name) ?? -1) < gap) return false;
    last.set(name, t);
    switch (name) {
      case 'pirate-splash': synth.noise(effects, .32, .028, 1900); synth.noise(effects, .5, .015, 700); break;
      case 'pirate-hit': synth.noise(effects, .14, .05, 520); synth.tone(effects, 118, .09, .035, 'square'); break;
      case 'pirate-wall': synth.noise(effects, .2, .045, 340); synth.tone(effects, 70, .12, .03, 'triangle'); break;
      case 'pirate-sunk': synth.noise(effects, .9, .035, 420); synth.tone(effects, 98, .7, .03, 'sine'); synth.tone(effects, 73, .9, .03, 'sine', .25); break;
      case 'pirate-tick': synth.tone(effects, 990, .06, .03, 'square'); break;
      case 'pirate-bell':
        for (const delay of [0, .55]) {
          synth.tone(effects, 784, 1.7, .06, 'sine', delay);
          synth.tone(effects, 1180, 1.1, .03, 'sine', delay);
          synth.tone(effects, 1568, .5, .018, 'triangle', delay);
        }
        break;
      case 'pirate-defeat':
        [392, 311, 262].forEach((frequency, i) => synth.tone(music, frequency, .45, .055, 'triangle', i * .32));
        synth.tone(music, 131, 1.4, .05, 'sine', .96);
        break;
      default: return false;
    }
    if (CAPTIONS[name]) caption(CAPTIONS[name]);
    return true;
  }
  cue.dispose = () => battle?.dispose();
  return cue;
}
