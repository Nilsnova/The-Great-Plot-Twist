import {describe, expect, it} from 'vitest';
import {hudWaveView, readHudWaveStatus} from '../../src/ui/wave-progress.js';

describe('truthful displayed wave progress', () => {
  it('reads the owner best without deriving it from captain level or next wave', () => {
    const status = readHudWaveStatus({place: 'home_islet', ownBest: 40, captainLevel: 1, nextWave: 41});
    expect(status).toEqual({bestWave: 40, currentWave: null});
    expect(hudWaveView(status)).toEqual({text: 'Best wave 40', label: 'Best won wave 40'});
  });
  it('keeps a real zero record distinct from unknown progress', () => {
    expect(hudWaveView(readHudWaveStatus({place: 'home_islet', ownBest: 0})).text).toBe('Best wave 0');
    expect(hudWaveView(readHudWaveStatus({place: 'home_islet'})))
      .toEqual({text: 'Best wave …', label: 'Best wave not loaded yet'});
  });
  it('uses the visited island record and never falls back to the owner during a pending visit', () => {
    expect(readHudWaveStatus({place: 'home_islet', ownBest: 40, visiting: {waveBest: 7}}).bestWave).toBe(7);
    expect(readHudWaveStatus({place: 'home_islet', ownBest: 40, visiting: {code: 'ISLE-TEST'}}).bestWave).toBeNull();
  });
  it('shows the accepted running wave without promoting it to a successful record', () => {
    const wave = {info: {wave: 41}, done: false, finished: false};
    const status = readHudWaveStatus({place: 'home_islet', ownBest: 40, wave});
    expect(status).toEqual({bestWave: 40, currentWave: 41});
    expect(hudWaveView(status)).toEqual({text: 'Wave 41', label: 'Current wave 41'});
  });
  it.each([{done: true}, {finished: true}])('returns to the actual record after a completed/stopped controller: %o', phase => {
    const status = readHudWaveStatus({place: 'home_islet', ownBest: 7, wave: {info: {wave: 8}, ...phase}});
    expect(hudWaveView(status).text).toBe('Best wave 7');
  });
  it('uses a Pirate Point active wave but invents no Point best record', () => {
    expect(hudWaveView(readHudWaveStatus({place: 'lighthouse_isle', ownBest: 40, wave: {info: {wave: 3}}})).text).toBe('Wave 3');
    expect(readHudWaveStatus({place: 'lighthouse_isle', ownBest: 40})).toBeNull();
    expect(readHudWaveStatus({place: 'saltreach_harbor', ownBest: 40, wave: {info: {wave: 3}}})).toBeNull();
  });
  it.each([undefined, null, -1, 1.2, '40', Infinity, Number.MAX_SAFE_INTEGER + 1])('keeps invalid best values unknown: %s', ownBest => {
    expect(readHudWaveStatus({place: 'home_islet', ownBest}).bestWave).toBeNull();
  });
  it.each([0, -1, 1.2, '41', Infinity])('never labels an invalid current value as a wave: %s', wave => {
    const status = readHudWaveStatus({place: 'home_islet', ownBest: 40, wave: {info: {wave}}});
    expect(hudWaveView(status).text).toBe('Best wave 40');
  });
  it('leaves absent status hidden for old callers and keeps snapshots immutable', () => {
    expect(hudWaveView(undefined)).toBeNull();
    const input = {place: 'home_islet', ownBest: 40, visiting: {waveBest: 8}, wave: {info: {wave: 9}, done: false}};
    const before = structuredClone(input);readHudWaveStatus(input);expect(input).toEqual(before);
  });
});
