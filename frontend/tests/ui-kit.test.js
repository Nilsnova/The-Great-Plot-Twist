// Presentation helpers are pure: no DOM, game economy or backend state.
import { expect, it } from 'vitest';
import { createTypewriter, choiceKey, formatCoins, chartPoints, progressRatio } from '../src/ui/kit/logic.js';
it('advances whole Unicode characters, skips once and respects reduced motion', () => {
  const line = createTypewriter('A ⚓ coast', { rate: 10 });
  line.tick(.2); expect(line.text).toBe('A '); expect(line.done).toBe(false);
  line.skip(); line.tick(1); expect(line.text).toBe('A ⚓ coast'); expect(line.done).toBe(true);
  expect(createTypewriter('Quiet sea', { reducedMotion: true }).done).toBe(true);
});
it('maps numbered choices and wraps arrows without accepting absent choices', () => {
  expect(choiceKey('3',0,3)).toEqual({ index:2, activate:true });
  expect(choiceKey('9',0,3)).toBe(null);
  expect(choiceKey('ArrowUp',0,3)).toEqual({ index:2, activate:false });
  expect(choiceKey('Enter',1,3)).toEqual({ index:1, activate:true });
  expect(choiceKey('ArrowDown',0,0)).toBe(null);
});
it('formats supplied integer coins without inventing missing balances', () => {
  expect(formatCoins(0)).toBe('0'); expect(formatCoins(12345)).toBe('12,345');
  expect(formatCoins(-12)).toBe('-12'); expect(formatCoins(null)).toBe('—');
  expect(formatCoins(1.2)).toBe('—'); expect(formatCoins(Infinity)).toBe('—');
});
it('scales a sparkline to integer bounds, handles flat data and refuses invalid samples', () => {
  expect(chartPoints([10,20,15],100,40,4)).toEqual([[4,36],[50,4],[96,20]]);
  expect(chartPoints([5,5],100,40,4)).toEqual([[4,20],[96,20]]);
  expect(chartPoints([5],100,40,4)).toEqual([[50,20]]);
  expect(chartPoints([5,NaN])).toEqual([]); expect(chartPoints([])).toEqual([]);
});
it('clamps presentation progress and handles a missing duration', () => {
  expect(progressRatio(5,10)).toBe(.5); expect(progressRatio(15,10)).toBe(1);
  expect(progressRatio(-3,10)).toBe(0); expect(progressRatio(1,0)).toBe(0);
});
