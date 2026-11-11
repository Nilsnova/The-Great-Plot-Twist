// Gesture-gated Web Audio owner. Uses current weather and semantic UI/world cues only.
import {getPreferences,onPreferences} from '../settings/preferences.js';
import {mixVolumes,strideStep,harborAudioConditions,isStationHumActive,harborCueVolumes} from './logic.js';
import {createSynth} from './synth.js';
import {createAmbience} from './ambience.js';
import {createMusic} from './music.js';
import {createFestivalSound} from './festival.js';
import {createPirateSound} from './pirates.js';
// Keep audio behind a real user gesture and centralize listeners for complete cleanup.
export function createAudio({container,on,caption}) {
  let context, master, musicBus, effectsBus, voiceBus, duck;
  const voices = new Set();
  let synth, ambience, music, hum, humGain, festivalSound, pirateSound;
  let humActive = false, disposed = false, screen = 'title', finale = false;
  let stride = 0, hornAt = 0, harborHornAt = 0, flagAt = 0, beamAt = 0, lastBlip = 0;
  function apply() {
    if (!context) return;
    const preferences = getPreferences();
    const mix = mixVolumes(preferences);
    const now = context.currentTime;
    const busLevels = [
      [master, mix.master],
      [musicBus, preferences.music],
      [effectsBus, preferences.effects],
      [voiceBus, preferences.voice],
    ];
    for (const [bus, value] of busLevels) {
      bus.gain.cancelScheduledValues(now);
      if (value === 0) bus.gain.setValueAtTime(0, now);
      else bus.gain.setTargetAtTime(value, now, 0.03);
    }
  }
  function theme() {
    const themeName = document.hidden ? null : finale ? 'finale' : screen === 'title' ? 'title' : null;
    music?.set(themeName);
  }
  function unlock(event) {
    if (disposed || !event.isTrusted) return;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;

    if (!context) {
      context = new Audio();
      master = context.createGain();
      musicBus = context.createGain();
      effectsBus = context.createGain();
      voiceBus = context.createGain();
      // The music passes a duck gain that dips while the narrator speaks (playVoice).
      duck = context.createGain();
      master.gain.value = 0;
      musicBus.connect(duck);
      duck.connect(master);
      voiceBus.connect(master);
      effectsBus.connect(master);
      master.connect(context.destination);
      synth = createSynth(context);
      ambience = createAmbience(context, effectsBus);
      music = createMusic(context, musicBus, synth);
      festivalSound=createFestivalSound(context,musicBus,effectsBus,caption);
      pirateSound=createPirateSound({synth,effects:effectsBus,music:musicBus,caption,now:()=>context.currentTime});

      // The station hum is a persistent oscillator whose gain changes with place state.
      hum = context.createOscillator();
      humGain = context.createGain();
      hum.type = 'sine';
      hum.frequency.value = 110;
      humGain.gain.value = 0;
      hum.connect(humGain);
      humGain.connect(effectsBus);
      hum.start();
      apply();
    }
    context.resume()
      .then(() => { if (!disposed) theme(); })
      .catch(() => caption('Sound unavailable. All cues remain visible.'));
  }
  // Resolve semantic cue names here so world and screen code never manages Web Audio nodes.
  function cue(name) {
    if (!context || context.state !== 'running' || disposed) return false;

    if(name.startsWith('festival-')){void festivalSound.cue(name.slice(9));return true;}
    if(name.startsWith('pirate-'))return pirateSound(name);
    if (name === 'foghorn') {
      synth.tone(effectsBus, 98, 1.6, 0.16, 'sine');
      synth.tone(effectsBus, 147, 1.4, 0.07, 'sine');
      caption('Lighthouse foghorn · a low call across the water');
    }
    if (name === 'beam') {
      synth.tone(effectsBus, 587, 0.7, 0.035, 'sine');
      caption('The lighthouse beam sweeps across the coast');
    }
    if (name === 'build') {
      synth.tone(effectsBus, 196, 0.1, harborCueVolumes.build, 'triangle');
      synth.tone(effectsBus, 262, 0.12, harborCueVolumes.build * .72, 'triangle', 0.06);
      caption('A building settles into place');
    }
    if (name === 'flag') {
      synth.noise(effectsBus, 0.1, harborCueVolumes.flag, 2100);
      caption('A flag snaps in the storm wind');
    }
    if (name === 'step') synth.tone(effectsBus, 105, 0.035, 0.035, 'triangle');
    if (name === 'click') synth.tone(effectsBus, 440, 0.055, 0.035, 'triangle');
    const isFreshDialogueBlip = name === 'blip' && performance.now() - lastBlip > 85;
    if (isFreshDialogueBlip) {
      lastBlip = performance.now();
      synth.tone(effectsBus, 660, 0.025, 0.015, 'triangle');
    }
    return true;
  }
  // A recorded voice line (the narrator, src/narrator/): fetched and decoded here, played on the voice bus
  // (Settings › Voice volume), with the music ducked while it speaks. Returns null while sound is locked;
  // otherwise {done: Promise<boolean> (true when it played to the end), stop()}.
  function ducking() {
    if (!duck) return;
    const now = context.currentTime;
    duck.gain.cancelScheduledValues(now);
    duck.gain.setTargetAtTime(voices.size ? 0.3 : 1, now, voices.size ? 0.08 : 0.4);
  }
  function playVoice(url, {fetchImpl = globalThis.fetch?.bind(globalThis)} = {}) {
    if (!context || context.state !== 'running' || disposed || typeof url !== 'string' || !fetchImpl) return null;
    let source = null, stopped = false, settled = false, settle;
    const done = new Promise(resolve => { settle = resolve; });
    const voice = {stop() { stopped = true; try { source?.stop(); } catch { /* already ended */ } finish(false); }};
    function finish(played) { if (settled) return; settled = true; voices.delete(voice); ducking(); settle(played); }
    voices.add(voice); ducking();
    fetchImpl(url).then(response => (response.ok ? response.arrayBuffer() : null))
      .then(data => (data && !stopped && !disposed ? context.decodeAudioData(data) : null))
      .then(buffer => {
        if (!buffer || stopped || disposed) { finish(false); return; }
        source = context.createBufferSource(); source.buffer = buffer; source.connect(voiceBus);
        source.onended = () => { source.disconnect(); finish(!stopped); };
        source.start();
      }).catch(() => finish(false));
    return {done, stop: () => voice.stop()};
  }
  const click = event => { if (event.target.closest('button')) cue('click'); };
  const blip = () => cue('blip');
  const visibility = () => {
    theme();
    if (document.hidden) context?.suspend().catch(() => {});
  };
  window.addEventListener('click', unlock, true);
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
  document.addEventListener('click', click, true);
  document.addEventListener('dialogue-blip', blip);
  document.addEventListener('visibilitychange', visibility);

  const stopPreferences = onPreferences(apply);
  const stopCinematic = on('cinematic', event => {
    finale = event.stage === 'started';
    if (finale) cue('beam');
    theme();
  });
  const stopHarborCues = [on('islet_build_raised', () => cue('build'))];
  return {unlock,get state(){return context?.state??'locked';},cue,playVoice,
    setScreen(mode){screen=mode;theme();},
    update(dt, { weather, weatherAnswer, isletBuilt = [], speed = 0, night = 0, active = false, place } = {}) {
      if (!context || disposed) return;
      const isPlaying = screen === 'playing' && active;
      ambience.update(weather, isPlaying);

      const step = strideStep(stride, active ? speed : 0, dt);
      stride = step.distance;
      if (step.step) cue('step');

      const humWanted = isStationHumActive({ place, active: isPlaying, night, isletBuilt });
      if (humWanted !== humActive && humGain) {
        humActive = humWanted;
        const now = context.currentTime;
        humGain.gain.cancelScheduledValues(now);
        humGain.gain.setTargetAtTime(humWanted ? harborCueVolumes.stationHum : 0, now, 0.5);
      }

      const cues = harborAudioConditions({ weatherAnswer, place, active: isPlaying, night });
      if (cues.fogHorn) {
        harborHornAt += dt;
        if (harborHornAt > 26) {
          harborHornAt = 0;
          cue('foghorn');
        }
      } else harborHornAt = 0;
      if (cues.flagSnap) {
        flagAt += dt;
        if (flagAt > 15) {
          flagAt = 0;
          cue('flag');
        }
      } else flagAt = 0;

      if (active && place === 'lighthouse_isle') {
        hornAt += dt;
        beamAt += dt;
        if (weather.fog > 0.65 && hornAt > 22) {
          hornAt = 0;
          cue('foghorn');
        }
        if (night > 0.3 && beamAt > 35) {
          beamAt = 0;
          cue('beam');
        }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      window.removeEventListener('click', unlock, true);
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('dialogue-blip', blip);
      document.removeEventListener('visibilitychange', visibility);
      stopPreferences();
      stopCinematic();
      stopHarborCues.forEach(stop => stop());
      for (const voice of [...voices]) voice.stop();
      festivalSound?.dispose();
      music?.dispose();
      ambience?.dispose();
      synth?.dispose();
      if (hum) {
        try { hum.stop(); }
        catch { /* The context is already closing. */ }
        hum.disconnect();
        humGain?.disconnect();
      }
      master?.disconnect();
      musicBus?.disconnect();
      effectsBus?.disconnect();
      voiceBus?.disconnect();
      duck?.disconnect();
      context?.close().catch(() => {});
    },
  };
}
