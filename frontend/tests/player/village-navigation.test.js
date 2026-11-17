import {describe, expect, it, vi} from 'vitest';
import {createVillageNavigation} from '../../src/player/village-navigation.js';

function setup() {
  const canvas = new EventTarget(), events = new EventTarget(), view = {panVillage: vi.fn(), villageControl: vi.fn()};
  canvas.getBoundingClientRect = () => ({width: 800, height: 600});
  let enabled = true;
  const nav = createVillageNavigation({canvas, events, view, enabled: () => enabled});
  const send = (type, extra = {}) => {
    const event = new Event(type, {cancelable: true});
    Object.assign(event, {pointerId: 1, button: 0, clientX: 100, clientY: 100}, extra);
    canvas.dispatchEvent(event); return event;
  };
  return {events, view, nav, send, enable(value) { enabled = value; }};
}

describe('village navigation gestures', () => {
  it('preserves a normal click and small finger jitter', () => {
    const {send, view, nav} = setup();
    send('pointerdown'); send('pointermove', {clientX: 104, clientY: 103});
    expect(send('pointerup').defaultPrevented).toBe(false);
    expect(view.panVillage).not.toHaveBeenCalled(); nav.dispose();
  });
  it('pans at threshold and cancels picking even after returning to the starting point', () => {
    const {send, view, nav} = setup();
    send('pointerdown'); send('pointermove', {clientX: 120}); send('pointermove');
    expect(view.panVillage.mock.calls).toEqual([[20, 0, 800, 600], [-20, 0, 800, 600]]);
    expect(send('pointerup').defaultPrevented).toBe(true); nav.dispose();
  });
  it('does not resume an interrupted drag after Move, a dialog or pause closes', () => {
    const {send, view, nav, enable} = setup();
    send('pointerdown'); enable(false); nav.refresh(); enable(true);
    send('pointermove', {clientX: 120});
    expect(view.panVillage).not.toHaveBeenCalled();
    expect(send('pointerup').defaultPrevented).toBe(true);
    send('pointerdown'); send('pointermove', {clientX: 120});
    expect(view.panVillage).toHaveBeenCalledOnce(); nav.dispose();
  });
  it('cancels multi-touch and blur and clears ended pointer state', () => {
    const {send, events, view, nav} = setup();
    send('pointerdown'); send('pointerdown', {pointerId: 2, isPrimary: false});
    send('pointermove', {clientX: 120}); expect(send('pointerup').defaultPrevented).toBe(true);
    send('pointerdown'); events.dispatchEvent(new Event('blur')); expect(send('pointerup').defaultPrevented).toBe(true);
    for (const type of ['pointercancel', 'lostpointercapture']) {
      send('pointerdown'); send(type); send('pointermove', {clientX: 120});
    }
    expect(view.panVillage).not.toHaveBeenCalled(); nav.dispose();
  });
  it('zooms only while enabled and removes all listeners on disposal', () => {
    const {send, enable, view, nav} = setup();
    expect(send('wheel', {deltaY: -80}).defaultPrevented).toBe(true);
    send('wheel', {deltaY: 80}); enable(false); send('wheel', {deltaY: -80});
    expect(view.villageControl.mock.calls).toEqual([['in'], ['out']]);
    nav.dispose(); enable(true); send('wheel', {deltaY: -80});
    send('pointerdown'); send('pointermove', {clientX: 130});
    expect(view.villageControl).toHaveBeenCalledTimes(2); expect(view.panVillage).not.toHaveBeenCalled();
  });
});
