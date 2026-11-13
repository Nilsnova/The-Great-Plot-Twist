// The battle cues build a graph, end and disconnect, stay under the voice cap and fall silent when muted.
import { describe, it, expect, vi } from 'vitest';
import { createBattleSounds, BATTLE_CUES, VOICE_CAP } from '../src/audio/battle-sounds.js';
import { createPirateSound, PIRATE_CUES } from '../src/audio/pirates.js';

function fakeContext() {
  const nodes = [];
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
  const make = (kind, extra = {}) => {
    const node = { kind, connected: new Set(), disconnected: false, started: null, stopped: null, onended: null, ...extra,
      connect(target) { node.connected.add(target); }, disconnect() { node.disconnected = true; node.connected.clear(); },
      start(...args) { node.started = args; }, stop(at) { node.stopped = at; } };
    nodes.push(node); return node;
  };
  return {
    nodes, currentTime: 0, sampleRate: 8000,
    createOscillator: () => make('osc', { frequency: param(), type: 'sine' }),
    createGain: () => make('gain', { gain: param() }),
    createBiquadFilter: () => make('filter', { frequency: param(), Q: param(), type: 'lowpass' }),
    createBufferSource: () => make('noise', { buffer: null }),
    createBuffer: (_, frames) => ({ getChannelData: () => new Float32Array(frames) }),
    sources: () => nodes.filter(node => node.kind === 'osc' || node.kind === 'noise'),
    endAll() { for (const node of nodes.filter(n => n.onended)) node.onended(); },
  };
}
const buses = () => ({ effects: { kind: 'bus', connect() {}, disconnect() {} }, music: { kind: 'bus', connect() {}, disconnect() {} } });

describe('battle sounds', () => {
  it('has every cue of the brief', () => {
    for (const name of ['pirate-cannon', 'pirate-mortar', 'pirate-mortar-impact', 'pirate-musket', 'pirate-horn', 'pirate-victory', 'pirate-harpoon', 'pirate-gunboat'])
      expect(BATTLE_CUES).toContain(name);
  });
  it.each(BATTLE_CUES)('%s builds a graph, schedules a stop for every source and frees every node when it ends', name => {
    const context = fakeContext(), sounds = createBattleSounds(context, { random: () => .5 });
    expect(sounds.play(name, buses())).toBe(true);
    const sources = context.sources();
    expect(sources.length).toBeGreaterThan(1);
    expect(sounds.voices(name)).toBe(1);
    for (const source of sources) {
      expect(source.started).not.toBeNull();
      expect(source.stopped).toBeGreaterThan(0);
      expect(source.stopped).toBeLessThan(4); // nothing long-running
    }
    context.endAll();
    expect(context.nodes.every(node => node.kind === 'bus' || node.disconnected)).toBe(true);
    expect(sounds.voices(name)).toBe(0);
  });
  it('drops a new voice when the cue already has the cap sounding, and frees the slot when one ends', () => {
    const context = fakeContext(), sounds = createBattleSounds(context), bus = buses();
    for (let i = 0; i < VOICE_CAP; i++) expect(sounds.play('pirate-cannon', bus)).toBe(true);
    const before = context.nodes.length;
    expect(sounds.play('pirate-cannon', bus)).toBe(false);
    expect(context.nodes.length).toBe(before); // the dropped voice built nothing
    expect(sounds.voices('pirate-cannon')).toBe(VOICE_CAP);
    expect(sounds.play('pirate-musket', bus)).toBe(true); // another cue has its own cap
    context.endAll();
    expect(sounds.play('pirate-cannon', bus)).toBe(true);
  });
  it('dispose stops and disconnects everything still sounding', () => {
    const context = fakeContext(), sounds = createBattleSounds(context);
    sounds.play('pirate-horn', buses()); sounds.play('pirate-victory', buses());
    sounds.dispose();
    expect(context.nodes.every(node => node.kind === 'bus' || node.disconnected)).toBe(true);
    expect(sounds.voices('pirate-horn')).toBe(0);
  });
});

describe('pirate cues with the battle voices', () => {
  const setup = (muted = {}) => {
    const context = fakeContext(), bus = buses(), battle = createBattleSounds(context), caption = vi.fn();
    const cue = createPirateSound({ synth: { tone: vi.fn(), noise: vi.fn() }, effects: bus.effects, music: bus.music, caption,
      now: () => context.currentTime, battle, isMuted: name => !!muted[name] });
    return { context, cue, caption };
  };
  it('plays each battle cue', () => {
    for (const name of PIRATE_CUES.filter(n => BATTLE_CUES.includes(n))) {
      const { context, cue } = setup(); expect(cue(name)).toBe(true); expect(context.sources().length).toBeGreaterThan(0);
    }
  });
  it('is silent when the bus is muted: no node is built', () => {
    const { context, cue } = setup({ effects: true, music: true });
    for (const name of PIRATE_CUES) cue(name);
    expect(context.nodes.length).toBe(0);
  });
  it('muting effects keeps the victory fanfare on the music bus', () => {
    const { context, cue } = setup({ effects: true });
    cue('pirate-cannon'); expect(context.nodes.length).toBe(0);
    cue('pirate-victory'); expect(context.sources().length).toBeGreaterThan(0);
  });
  it('rate-limits a battery and captions the horn', () => {
    const { context, cue, caption } = setup();
    expect(cue('pirate-cannon')).toBe(true); expect(cue('pirate-cannon')).toBe(false);
    context.currentTime = .1; expect(cue('pirate-cannon')).toBe(true);
    cue('pirate-horn'); expect(caption).toHaveBeenCalledWith('A warship horn sounds');
  });
  it('dispose reaches the battle voices', () => {
    const { context, cue } = setup(); cue('pirate-horn'); cue.dispose();
    expect(context.nodes.every(node => node.kind === 'bus' || node.disconnected)).toBe(true);
  });
});
