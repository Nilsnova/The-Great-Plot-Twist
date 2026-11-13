// The ?demo=1 rehearsal: simulated captains step ashore one by one, so the world's arrival effect plays.
import {describe, expect, it} from 'vitest';
import {arrivalSchedule, createRehearsalCaptains} from '../src/class-demo/rehearsal.js';

describe('rehearsal arrivals', () => {
  it('spreads 40 captains over 25 s with uneven gaps, the same way every time', () => {
    const times = arrivalSchedule(40);
    expect(times).toHaveLength(40);
    expect(times).toEqual(arrivalSchedule(40));
    expect(times[0]).toBeLessThan(1.7);
    expect(times[39]).toBe(25);
    const gaps = times.map((time, index) => time - (times[index - 1] ?? 0));
    expect(gaps.every(gap => gap > 0.2 && gap < 1.1)).toBe(true);
    expect(new Set(gaps.map(gap => gap.toFixed(2))).size).toBeGreaterThan(20);
    expect(arrivalSchedule(40, {seed: 2})).not.toEqual(times);
  });
  it('keeps small crowds short and survives odd counts', () => {
    expect(arrivalSchedule(0)).toEqual([]);
    expect(arrivalSchedule(14).at(-1)).toBeCloseTo(10.4, 1);
    expect(arrivalSchedule(1)).toEqual([2.6]);
  });
  it('shows a captain in the presence only after their arrival time, never before', () => {
    const captains = createRehearsalCaptains({count: 40, random: () => 0.5});
    expect(captains.presence(0, 'harbor').others).toHaveLength(0);
    const seen = [];
    for (let second = 0; second < 30; second++) { captains.step(1, second * 1000); seen.push(captains.presence(0, 'harbor').others.length); }
    expect(seen.every((value, index) => index === 0 || value >= seen[index - 1])).toBe(true);
    expect(seen[4]).toBeGreaterThan(3);
    expect(seen[4]).toBeLessThan(12);
    expect(seen[11]).toBeGreaterThan(seen[4]);
    expect(seen[29]).toBe(40);
    for (const bot of captains.bots) expect(bot.arriveAt).toBeLessThanOrEqual(25);
  });
  it('stagger: false puts everyone there at once', () => {
    const captains = createRehearsalCaptains({count: 8, stagger: false});
    captains.step(0.1, 0);
    expect(captains.presence(0, 'harbor').others).toHaveLength(8);
  });
});
