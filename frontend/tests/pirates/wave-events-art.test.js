import {afterEach, describe, expect, it, vi} from 'vitest';
import {createEventArt} from '../../src/pirates/wave-events-art.js';

function canvasFixture() {
  const operations = [];
  const context = {
    globalCompositeOperation: 'source-over', globalAlpha: 1,
    setTransform() {}, clearRect() {}, beginPath() {}, fillRect() {},
    drawImage(stamp, ...bounds) {
      operations.push({type: 'bank', mode: this.globalCompositeOperation, alpha: this.globalAlpha, stamp, bounds});
    },
    createRadialGradient(...bounds) {
      const stops = [];
      operations.push({type: 'gradient', mode: this.globalCompositeOperation, bounds, stops});
      return {addColorStop: (offset, colour) => stops.push([offset, colour])};
    },
    arc() {}, fill() {},
  };
  return {operations, getContext: () => context, getBoundingClientRect: () => ({width: 375, height: 812}), setAttribute() {}};
}

function fogFixture(options = {}) {
  const layer = canvasFixture(), stamp = canvasFixture();
  const createElement = vi.fn().mockReturnValueOnce(layer).mockReturnValueOnce(stamp);
  vi.stubGlobal('document', {createElement});
  const art = createEventArt({container: {prepend() {}}, project: (x, z) => ({x: x * 10, y: z * 8}), ...options});
  const state = {event: {id: 'fog_bank', clear: 16, watchtowers: [{x: 20, z: 24}]}, towers: [{x: 7, z: 9, range: 20}]};
  const render = (dt = 0) => {
    layer.operations.length = 0;
    art.update({state, dt});
    return [...layer.operations];
  };
  return {render, createElement, stamp};
}

afterEach(() => vi.unstubAllGlobals());

describe('fog bank art', () => {
  it('reveals the tower and watchtower sight through all banks using their existing fade profiles', () => {
    const {render} = fogFixture();
    const first = render();
    expect(first.slice(0, 10).every(({type, mode, alpha}) => type === 'bank' && mode === 'source-over' && alpha === 1)).toBe(true);
    expect(first.slice(10, 12)).toEqual([
      {type: 'gradient', mode: 'destination-out', bounds: [70, 72, 200 * (1 - .55), 70, 72, 200],
        stops: [[0, 'rgba(0,0,0,0.8)'], [1, 'rgba(0,0,0,0)']]},
      {type: 'gradient', mode: 'destination-out', bounds: [200, 192, 96, 200, 192, 160],
        stops: [[0, 'rgba(0,0,0,0.95)'], [1, 'rgba(0,0,0,0)']]},
    ]);
    expect(first.slice(12)).toEqual(first.slice(0, 10).map(bank => ({...bank, mode: 'destination-over', alpha: .39})));
  });

  it('reuses one stamp, limits low quality to five banks, and holds the banks still with reduced motion', () => {
    let reducedMotion = true;
    const {render, createElement, stamp} = fogFixture({quality: () => 'low', reducedMotion: () => reducedMotion});
    const banks = dt => render(dt).filter(item => item.type === 'bank' && item.mode === 'source-over');
    const first = banks(0);
    expect(first).toHaveLength(5);
    expect(first.every(item => item.stamp === stamp)).toBe(true);
    const quadrants = new Set(first.map(({bounds:[left, top, width, height]}) =>
      `${left + width / 2 < 375 / 2}:${top + height / 2 < 812 / 2}`));
    expect(quadrants.size).toBe(4);
    expect(banks(.1)).toEqual(first);
    reducedMotion = false;
    expect(banks(.1)).not.toEqual(first);
    expect(createElement).toHaveBeenCalledTimes(2);
  });
});
