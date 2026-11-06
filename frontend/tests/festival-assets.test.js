// Validate the delivered art/audio artifacts, including silent seams and headroom.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { festivalDimensions } from '../src/pixel/festival-catalog.js';
import { festivalSounds } from '../src/audio/festival-catalog.js';
import { pixelById, pixelArtIds } from '../src/pixel/catalog.js';

describe('festival workshop artifacts', () => {
  it('gives each of twelve lamps four distinct day/night and lit/unlit drawings', () => {
    for (let number = 1; number <= 12; number++) {
      const prefix = `festival-lamp-${String(number).padStart(2, '0')}`;
      const images = [];
      for (const state of ['unlit', 'lit']) {
        for (const suffix of ['', '-night']) {
          const id = `${prefix}-${state}${suffix}`;
          expect(festivalDimensions[id]).toEqual([48, 80, 6]);
          images.push(readFileSync(`public/pixel/${id}.png`).toString('base64'));
        }
      }
      expect(new Set(images).size).toBe(4);
    }
  });
  it('registers the complete festival family without adding any default game texture loads', () => {
    expect(Object.keys(festivalDimensions)).toHaveLength(56);
    for (const id of Object.keys(festivalDimensions)) {
      expect(pixelById[id].usage).toBe('library');
      expect(pixelArtIds).not.toContain(id);
    }
  });
  it.each(festivalSounds)('$title is an audible mono recording with a quiet seam and no clipping', sound => {
    const wav = readFileSync(`public/${sound.file}`);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.readUInt16LE(20)).toBe(1); // Linear PCM.
    expect(wav.readUInt16LE(22)).toBe(1); // Mono.
    expect(wav.readUInt32LE(24)).toBe(22050);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.toString('ascii', 36, 40)).toBe('data');
    expect(wav.readUInt32LE(40) / 2 / 22050).toBe(sound.seconds);
    const samples = Array.from({ length: (wav.length - 44) / 2 }, (_, i) => wav.readInt16LE(44 + i * 2));
    const peak = samples.reduce((maximum, sample) => Math.max(maximum, Math.abs(sample)), 0);
    const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample ** 2, 0) / samples.length);
    expect(peak).toBeLessThan(30000);
    expect(rms).toBeGreaterThan(300);
    expect(samples[0]).toBe(0);
    expect(samples.at(-1)).toBe(0);
  });
});
