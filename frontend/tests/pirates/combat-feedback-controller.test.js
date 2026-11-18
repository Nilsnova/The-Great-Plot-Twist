// Real wave/controller integration for range feedback. No browser or network is needed.
import { expect, it } from 'vitest';
import { createWaveController } from '../../src/pirates/controller.js';
import { createRoomProxy } from '../../src/pirates/room.js';

async function setup({ playerId = 'me', room = null } = {}) {
  let now = 100000, latest = null, callbacks = null, range = null, blocked = false;
  const player = { x: 90, z: 0 }, events = [];
  const controller = createWaveController({ playerId, room, now: () => now, listen: false,
    world: { scene: {}, container: {}, player: { position: player }, isBlocked: () => blocked },
    createRenderer: () => ({ events(list) { events.push(...list); }, setVisible() {}, update(value) { latest = value; }, dispose() {} }),
    createHud: options => { callbacks = options; return { countdown() {}, bar() {}, prompt() {},
      banner() {}, setVisible() {}, rangeFeedback(value) { range = value; }, dispose() {} }; },
    setTimer: () => 0, clearTimer() {} });
  controller.start({ waveId: 'feedback', wave: 1, seed: 77, startsAt: now, weather: { kind: 'calm' } });
  async function advance(ms) {
    for (let i = 0; i < ms; i += 50) { now += 50; controller.update(.05); await Promise.resolve(); }
  }
  await advance(2000);
  return { controller, player, advance, events, get range() { return range; }, get latest() { return latest; },
    get callbacks() { return callbacks; }, block(value) { blocked = value; } };
}

it('reveals an out-of-range attempt and follows the actual equipped weapon', async () => {
  const h = await setup(), target = h.controller.state.ships[0];
  expect(target).toBeTruthy();
  expect(h.range).toBeNull();
  expect(h.controller.shoot(target.id)).toBe(false);
  await h.advance(50);
  expect(h.range).toMatchObject({ status: 'Out of range · move closer', radius: 14 });
  expect(h.latest.combatFeedback.range.radius).toBe(14);
  h.controller.setCaptainWeapon('long_rifle'); h.controller.setCaptainSkills(['long_barrel']);
  h.player.x = 80;
  await h.advance(50);
  expect(h.range).toMatchObject({ radius: 25, x: 80 });
  await h.advance(1600);
  expect(h.range).toBeNull();
  h.controller.dispose();
});

it('preserves firing and impact animation events without written damage feedback', async () => {
  const h = await setup(), target = h.controller.state.ships[0];
  h.player.x = target.x - 8; h.player.z = target.z;
  expect(h.controller.shoot(target.id)).toBe(true);
  expect(h.controller.shoot(target.id)).toBe(false);
  await h.advance(50);
  expect(h.range.status).toBe('Reloading');
  await h.advance(1000);
  expect(h.events.some(event => event.type === 'captain_fired' && event.by === 'me')).toBe(true);
  expect(h.events.some(event => event.type === 'ship_hit' && event.by === 'captain:me' && event.damage > 0)).toBe(true);
  expect(h.range).not.toHaveProperty('hit');
  h.controller.dispose();
});

it('handles fire-control preview and queued touch/keyboard attempts, clearing in menus', async () => {
  const h = await setup();
  h.callbacks.onRangePreview(true); await h.advance(50);
  expect(h.range.radius).toBe(14);
  h.callbacks.onRangePreview(false);
  h.callbacks.onShoot(true); h.callbacks.onShoot(false); await h.advance(50);
  expect(h.range.status).toBe('No enemy in range');
  h.block(true); await h.advance(50);
  expect(h.range).toBeNull();
  expect(h.latest.combatFeedback).toMatchObject({ range: null, danger: null });
  h.block(false); await h.advance(50);
  expect(h.range).toBeNull();
  h.controller.dispose();
});

it('keeps host and visitor range private while their shots are shared', async () => {
  const hostRoom = createRoomProxy(), visitorRoom = createRoomProxy();
  hostRoom.attach({ send(type, payload) { visitorRoom.receive(type, payload); return true; } });
  visitorRoom.attach({ send(type, payload) { hostRoom.receive(type, payload); return true; } });
  const host = await setup({ playerId: 'host', room: hostRoom });
  const visitor = await setup({ playerId: 'visitor', room: visitorRoom });
  try {
    host.controller.setCaptainWeapon('long_rifle');
    visitor.controller.setCaptainWeapon('fire_bombs');
    const target = host.controller.state.ships[0];
    Object.assign(host.player, { x: target.x - 8, z: target.z });
    Object.assign(visitor.player, { x: target.x + 8, z: target.z });
    const advance = async ms => { for (let t = 0; t < ms; t += 50) { await host.advance(50); await visitor.advance(50); } };

    expect(host.controller.shoot(target.id)).toBe(true);
    await advance(300);
    expect(visitor.events.some(event => event.type === 'captain_fired' && event.by === 'host')).toBe(true);
    expect(visitor.range).toBeNull();
    expect(visitor.latest.combatFeedback.range).toBeNull();
    expect(host.range).toMatchObject({ x: host.player.x, z: host.player.z, radius: 22, label: 'Long rifle range' });

    visitor.callbacks.onRangePreview(true);
    await advance(50);
    expect(visitor.range).toMatchObject({ x: visitor.player.x, z: visitor.player.z, radius: 14, label: 'Fire bombs throw range' });
    const hostOrigin = { x: host.range.x, z: host.range.z, radius: host.range.radius };
    expect(visitor.controller.shoot(target.id)).toBe(true);
    visitor.player.x += 1;
    await advance(300);
    expect(host.events.some(event => event.type === 'captain_fired' && event.by === 'visitor')).toBe(true);
    expect(host.range).toMatchObject(hostOrigin);
    expect(visitor.range.x).toBe(visitor.player.x);

    visitor.callbacks.onRangePreview(false);
    await advance(1700);
    expect(host.range).toBeNull();
    expect(visitor.range).toBeNull();
    host.callbacks.onRangePreview(true);
    await advance(50);
    expect(host.range.radius).toBe(22);
    expect(visitor.range).toBeNull();
  } finally {
    host.controller.dispose(); visitor.controller.dispose(); hostRoom.close(); visitorRoom.close();
  }
});
