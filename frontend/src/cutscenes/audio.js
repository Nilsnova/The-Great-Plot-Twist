// Cutscene sound: a soft procedural music bed and optional recorded voice lines.
// Voices load through fetch + Web Audio (connect-src 'self'); media elements stay blocked by CSP.
// A missing manifest entry, file or decoder means that line is silent; subtitles always remain.
const CHORDS = {
  dusk: [[110, 164.81, 220, 261.63], [87.31, 130.81, 174.61, 220], [130.81, 196, 261.63, 329.63], [98, 146.83, 196, 246.94]],
  harbor: [[130.81, 196, 261.63, 329.63], [174.61, 261.63, 349.23, 440], [98, 146.83, 196, 293.66]],
  dawn: [[146.83, 220, 293.66, 369.99], [196, 293.66, 392, 493.88], [164.81, 246.94, 329.63, 415.3]],
};
const CHORD_SECONDS = 6;

export function createCutsceneAudio({preferences, base = '', fetchImpl = globalThis.fetch?.bind(globalThis),
  AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext} = {}) {
  let context = null, master = null, bed = null, voiceBus = null, disposed = false;
  const sources = [];
  function levels() {
    const value = preferences?.() ?? {};
    const level = key => Number.isFinite(value[key]) ? value[key] : .6;
    return {master: level('master'), music: level('music') * .5, voice: level('voice')};
  }
  function ensure() {
    if (context || disposed || !AudioContextClass) return context;
    try {
      context = new AudioContextClass();
      const now = levels();
      master = context.createGain(); master.gain.value = now.master; master.connect(context.destination);
      bed = context.createGain(); bed.gain.value = 0; bed.connect(master);
      voiceBus = context.createGain(); voiceBus.gain.value = now.voice; voiceBus.connect(master);
      void context.resume?.().catch(() => {});
    } catch { context = null; }
    return context;
  }
  function music(mood, total) {
    if (!ensure() || levels().music <= 0) return;
    const chords = CHORDS[mood] ?? CHORDS.dusk, start = context.currentTime + .05;
    const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 900; filter.connect(bed);
    const count = Math.max(1, Math.ceil(total / CHORD_SECONDS));
    for (let index = 0; index < count; index++) {
      const at = start + index * CHORD_SECONDS, chord = chords[index % chords.length];
      for (const [voice, frequency] of chord.entries()) {
        const oscillator = context.createOscillator(), gain = context.createGain();
        oscillator.type = voice === 0 ? 'sine' : 'triangle'; oscillator.frequency.value = frequency;
        oscillator.detune.value = (voice - 1.5) * 4;
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(voice === 0 ? .2 : .08, at + 1.8);
        gain.gain.linearRampToValueAtTime(0, at + CHORD_SECONDS + 1.2);
        oscillator.connect(gain); gain.connect(filter);
        oscillator.start(at); oscillator.stop(at + CHORD_SECONDS + 1.3);
        sources.push(oscillator);
      }
    }
    bed.gain.setValueAtTime(0, start);
    bed.gain.linearRampToValueAtTime(levels().music, start + 1.5);
  }
  async function loadVoice(file) {
    if (!fetchImpl || !ensure()) return null;
    try {
      const response = await fetchImpl(`${base}audio/voice/${file}`);
      if (!response.ok) return null;
      const data = await response.arrayBuffer();
      return disposed ? null : await context.decodeAudioData(data);
    } catch { return null; }
  }
  return {
    get context() { return context; },
    // Start the bed and schedule every recorded line at its start time. Returns once scheduled.
    async start(timeline, {mood = 'dusk', offset = 0} = {}) {
      if (disposed || !ensure()) return;
      music(mood, timeline.total - offset);
      const startAt = context.currentTime - offset;
      await Promise.all(timeline.lines.filter(line => line.voice && line.end > offset).map(async line => {
        const buffer = await loadVoice(line.voice.file);
        if (!buffer || disposed) return;
        const when = startAt + line.start;
        if (when < context.currentTime - .05) return; // too late to start cleanly; the subtitle stays
        const source = context.createBufferSource(); source.buffer = buffer; source.connect(voiceBus);
        source.start(Math.max(context.currentTime, when)); sources.push(source);
      }));
    },
    pause() { void context?.suspend?.().catch(() => {}); },
    resume() { void context?.resume?.().catch(() => {}); },
    // A short fade avoids a click; the context closes afterwards.
    stop(fade = .4) {
      if (!context || disposed) { disposed = true; return; }
      disposed = true;
      const now = context.currentTime, ctx = context;
      try { master.gain.cancelScheduledValues(now); master.gain.setValueAtTime(master.gain.value, now); master.gain.linearRampToValueAtTime(0, now + fade); } catch { /* closing anyway */ }
      setTimeout(() => {
        for (const source of sources.splice(0)) { try { source.stop(); } catch { /* already stopped */ } }
        void ctx.close?.().catch(() => {});
      }, fade * 1000 + 50);
    },
  };
}
