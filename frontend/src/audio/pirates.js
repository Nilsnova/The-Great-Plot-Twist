// The pirate wave's sounds (lane P5), original oscillator and noise voices on the existing buses, so
// the Settings volumes (master × effects, master × music) apply. Booms and splashes are rate-limited:
// a whole battery firing at once stays one clean thump instead of a wall of noise.
const GAP = { 'pirate-cannon': .07, 'pirate-cannon-manual': .05, 'pirate-splash': .09, 'pirate-hit': .06, 'pirate-wall': .12 };
export const PIRATE_CUES = ['pirate-cannon', 'pirate-cannon-manual', 'pirate-splash', 'pirate-hit', 'pirate-wall',
  'pirate-sunk', 'pirate-bell', 'pirate-victory', 'pirate-defeat', 'pirate-tick'];
const CAPTIONS = {
  'pirate-bell': 'The pirate bell rings',
  'pirate-victory': 'Victory: the island holds',
  'pirate-defeat': 'The pirates took the island',
};

export function createPirateSound({ synth, effects, music, caption = () => {}, now = () => 0 }) {
  const last = new Map();
  return function cue(name) {
    const t = now(), gap = GAP[name];
    if (gap && t - (last.get(name) ?? -1) < gap) return false;
    last.set(name, t);
    switch (name) {
      case 'pirate-cannon': case 'pirate-cannon-manual': {
        const loud = name === 'pirate-cannon-manual' ? 1.4 : 1;
        synth.noise(effects, .38, .08 * loud, 170);
        synth.tone(effects, 52, .32, .07 * loud, 'sine');
        synth.tone(effects, 78, .12, .04 * loud, 'triangle');
        break;
      }
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
      case 'pirate-victory':
        [523, 659, 784].forEach((frequency, i) => synth.tone(music, frequency, .22, .06, 'triangle', i * .13));
        synth.tone(music, 1047, .9, .07, 'triangle', .39); synth.tone(music, 784, .9, .04, 'sine', .39);
        break;
      case 'pirate-defeat':
        [392, 311, 262].forEach((frequency, i) => synth.tone(music, frequency, .45, .055, 'triangle', i * .32));
        synth.tone(music, 131, 1.4, .05, 'sine', .96);
        break;
      default: return false;
    }
    if (CAPTIONS[name]) caption(CAPTIONS[name]);
    return true;
  };
}
