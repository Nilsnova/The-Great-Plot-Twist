// The battle's punchy voices (lane T4): cannon, mortar, musket, warship horn, victory fanfare, harpoon twang and
// gunboat shot. Original recipes built from oscillators, filtered noise and envelopes on the Web Audio API.
// Rules every voice follows: nothing runs long (each source stops right after its envelope), every node is
// disconnected when its source ends, and one cue never has more than VOICE_CAP voices sounding at once (the
// newest is dropped, which costs nothing and keeps a big wave from overloading the audio thread).
export const VOICE_CAP = 6;
const NOISE_SECONDS = 1.6;

// A parameter value given as a number, or as [[seconds, value], ...] glided to with exponential ramps.
function glide(param, value, start) {
  if (!Array.isArray(value)) { param.setValueAtTime(value, start); return; }
  param.setValueAtTime(value[0][1], start + value[0][0]);
  for (const [at, to] of value.slice(1)) param.exponentialRampToValueAtTime(Math.max(.0001, to), start + at);
}

// Recipes: kit.osc({type, f, dur, vol, at, attack, hold, filter:{type, f, q}, vibrato:{rate, depth}}) and
// kit.noise({type, f, q, dur, vol, at, attack}); f is a Hz number or a glide.
function cannon(kit, { crack = 1 } = {}) {
  kit.osc({ type: 'sine', f: [[0, 125], [.25, 40]], dur: .62, vol: .17, attack: .003 });             // the boom
  kit.osc({ type: 'triangle', f: [[0, 92], [.2, 46]], dur: .28, vol: .07, attack: .003 });            // body
  kit.noise({ type: 'bandpass', f: 2600, q: .8, dur: .08, vol: .12 * crack, attack: .001 });          // the crack
  kit.noise({ type: 'lowpass', f: [[0, 1100], [.9, 160]], q: .5, dur: .9, vol: .07, at: .02, attack: .02 }); // the tail
}
const RECIPES = {
  'pirate-cannon': { bus: 'effects', gain: 1, build: kit => cannon(kit) },
  'pirate-cannon-manual': { bus: 'effects', gain: 1.3, build: kit => cannon(kit, { crack: 1.3 }) },
  // The mortar leaving its tube: a hollow thump (a resonant tube), then the shell whistling up and fading.
  'pirate-mortar': { bus: 'effects', gain: 1, build: kit => {
    kit.osc({ type: 'sine', f: [[0, 150], [.14, 62]], dur: .3, vol: .16, attack: .004 });
    kit.noise({ type: 'bandpass', f: 420, q: 5, dur: .22, vol: .2, attack: .003 });
    kit.osc({ type: 'sine', f: [[0, 320], [.7, 1100]], dur: .75, vol: .022, at: .06, attack: .12 });
  } },
  // Far-off landing: a soft, low whump with a rumble, no crack at all.
  'pirate-mortar-impact': { bus: 'effects', gain: 1, build: kit => {
    kit.osc({ type: 'sine', f: [[0, 68], [.6, 30]], dur: .85, vol: .2, attack: .03 });
    kit.noise({ type: 'lowpass', f: [[0, 320], [.7, 70]], q: .7, dur: .8, vol: .13, attack: .04 });
  } },
  // A sharp crack: a bright burst, a quick snap and a small puff of powder.
  'pirate-musket': { bus: 'effects', gain: 1, build: kit => {
    kit.noise({ type: 'highpass', f: 3400, q: .7, dur: .09, vol: .13, attack: .001 });
    kit.osc({ type: 'sine', f: [[0, 240], [.07, 90]], dur: .09, vol: .07, attack: .001 });
    kit.noise({ type: 'lowpass', f: 1300, q: .6, dur: .22, vol: .05, at: .01, attack: .004 });
  } },
  // The boss warship's horn: a deep brass swell, two sawtooth voices a hair apart and a fifth above through a
  // filter that opens as the note swells, a breath of noise, then a second, longer blast.
  'pirate-horn': { bus: 'effects', gain: 1, build: kit => {
    for (const [at, dur] of [[0, 1.05], [1.25, 1.7]]) {
      for (const [f, vol] of [[56, .07], [56.7, .06], [84, .03]]) {
        kit.osc({ type: 'sawtooth', f: [[0, f * 1.05], [.12, f]], dur, vol, at, attack: .22, hold: dur - .4,
          filter: { type: 'lowpass', f: [[0, 220], [.45, 1000], [dur, 380]], q: 2.2 } });
      }
      kit.noise({ type: 'bandpass', f: 500, q: 1.2, dur: dur * .6, vol: .03, at, attack: .2 });
    }
  } },
  // A short rising fanfare on the music bus: C E G, then a held C chord with a shimmer.
  'pirate-victory': { bus: 'music', gain: 1, build: kit => {
    [[523, 0, .2], [659, .11, .2], [784, .22, .22]].forEach(([f, at, dur]) => {
      kit.osc({ type: 'triangle', f, dur, vol: .06, at, attack: .008 });
      kit.osc({ type: 'sawtooth', f, dur, vol: .02, at, attack: .008, filter: { type: 'lowpass', f: 2600, q: .8 } });
    });
    for (const f of [1047, 1319, 1568]) {
      kit.osc({ type: 'triangle', f, dur: 1.1, vol: .055, at: .36, attack: .01 });
      kit.osc({ type: 'sawtooth', f, dur: 1.1, vol: .018, at: .36, attack: .01, filter: { type: 'lowpass', f: [[0, 3200], [1.1, 900]], q: .8 } });
    }
    kit.noise({ type: 'highpass', f: 6500, q: .5, dur: .6, vol: .035, at: .36, attack: .01 });
  } },
  // Harpoon release: the bowstring twang (a plucked tone with a fast, dying wobble), a whoosh, a little thunk.
  'pirate-harpoon': { bus: 'effects', gain: 1, build: kit => {
    kit.osc({ type: 'sawtooth', f: [[0, 330], [.06, 300], [.5, 286]], dur: .55, vol: .05, attack: .002,
      filter: { type: 'lowpass', f: [[0, 3400], [.5, 500]], q: 3 }, vibrato: { rate: 34, depth: 22 } });
    kit.noise({ type: 'bandpass', f: [[0, 1400], [.16, 3600]], q: 1.4, dur: .18, vol: .05, at: .03, attack: .02 });
    kit.osc({ type: 'sine', f: [[0, 95], [.09, 58]], dur: .1, vol: .08, attack: .002 });
  } },
  // A gunboat's gun: lighter and snappier than the cannon, a flat pop-bang with a ping.
  'pirate-gunboat': { bus: 'effects', gain: 1, build: kit => {
    kit.osc({ type: 'sine', f: [[0, 200], [.14, 72]], dur: .3, vol: .12, attack: .002 });
    kit.noise({ type: 'bandpass', f: 3200, q: .9, dur: .05, vol: .1, attack: .001 });
    kit.osc({ type: 'triangle', f: [[0, 760], [.1, 330]], dur: .11, vol: .035, attack: .001 });
    kit.noise({ type: 'lowpass', f: [[0, 1600], [.3, 300]], q: .5, dur: .32, vol: .045, at: .02, attack: .01 });
  } },
};
export const BATTLE_CUES = Object.freeze(Object.keys(RECIPES));

export function createBattleSounds(context, { cap = VOICE_CAP, random = Math.random } = {}) {
  const active = new Map(); // cue -> the voices (one per call) still sounding
  let noiseBuffer = null;
  const live = new Set();   // every source not ended yet, so dispose() can stop them at once
  function noise() {
    if (noiseBuffer) return noiseBuffer;
    const frames = Math.ceil(context.sampleRate * NOISE_SECONDS), data = (noiseBuffer = context.createBuffer(1, frames, context.sampleRate)).getChannelData(0);
    let seed = 48271;
    for (let i = 0; i < frames; i++) { seed = (seed * 16807) % 2147483647; data[i] = seed / 1073741823.5 - 1; }
    return noiseBuffer;
  }
  // Starts a source at `start`, stops it after its envelope and frees everything when it ends.
  function launch(voice, source, nodes, start, dur) {
    voice.sources.add(source); live.add(source);
    source.onended = () => {
      source.onended = null; source.disconnect(); for (const node of nodes) node.disconnect();
      voice.sources.delete(source); live.delete(source);
      if (!voice.sources.size) active.get(voice.cue)?.delete(voice);
    };
    return { source, stopAt: start + dur + .02 };
  }
  function envelope(gain, start, { vol, attack = .004, hold, dur }) {
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(vol, start + attack);
    if (hold && hold > attack) gain.gain.setValueAtTime(vol, start + hold);
    gain.gain.exponentialRampToValueAtTime(.0001, start + dur);
  }
  function play(name, { effects, music } = {}) {
    const recipe = RECIPES[name];
    if (!recipe) return false;
    const output = recipe.bus === 'music' ? music : effects;
    if (!output) return false;
    const voices = active.get(name) ?? new Set();
    active.set(name, voices);
    if (voices.size >= cap) return false;
    const voice = { cue: name, sources: new Set() }, t0 = context.currentTime;
    voices.add(voice);
    build(recipe, voice, output, t0);
    if (!voice.sources.size) voices.delete(voice);
    return true;
  }
  function build(recipe, voice, output, t0) {
    const level = recipe.gain;
    recipe.build({
      osc({ type = 'sine', f, dur, vol, at = 0, attack, hold, filter, vibrato }) {
        const start = t0 + at, oscillator = context.createOscillator(), gain = context.createGain(), nodes = [gain];
        oscillator.type = type; glide(oscillator.frequency, f, start);
        envelope(gain, start, { vol: vol * level, attack, hold, dur });
        let head = oscillator;
        if (filter) {
          const node = context.createBiquadFilter(); node.type = filter.type; node.Q.value = filter.q ?? 1; glide(node.frequency, filter.f, start);
          head.connect(node); head = node; nodes.push(node);
        }
        head.connect(gain); gain.connect(output);
        const { source, stopAt } = launch(voice, oscillator, nodes, start, dur);
        if (vibrato) { // a short, fading wobble on the pitch: its own source, stopped with the note
          const wobble = context.createOscillator(), depth = context.createGain();
          wobble.frequency.setValueAtTime(vibrato.rate, start); depth.gain.setValueAtTime(vibrato.depth, start);
          depth.gain.exponentialRampToValueAtTime(.01, start + dur);
          wobble.connect(depth); depth.connect(oscillator.frequency);
          const lfo = launch(voice, wobble, [depth], start, dur);
          wobble.start(start); wobble.stop(lfo.stopAt);
        }
        source.start(start); source.stop(stopAt);
      },
      noise({ type = 'bandpass', f, q = .7, dur, vol, at = 0, attack }) {
        const start = t0 + at, source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
        source.buffer = noise(); filter.type = type; filter.Q.value = q; glide(filter.frequency, f, start);
        envelope(gain, start, { vol: vol * level, attack, dur });
        source.connect(filter); filter.connect(gain); gain.connect(output);
        const launched = launch(voice, source, [filter, gain], start, dur);
        source.start(start, random() * (NOISE_SECONDS - dur - .05 > 0 ? NOISE_SECONDS - dur - .05 : 0)); source.stop(launched.stopAt);
      },
    });
  }
  return {
    play, busOf: name => RECIPES[name]?.bus ?? null,
    voices: name => active.get(name)?.size ?? 0,
    dispose() {
      for (const source of [...live]) { const end = source.onended; source.onended = null; try { source.stop(); } catch { /* already ended */ } end?.call(source); }
      live.clear(); active.clear();
    },
  };
}
