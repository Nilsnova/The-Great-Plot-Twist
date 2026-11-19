// T36 Move mode (src/island/move-mode.js) against the in-memory fake server: start, tap, nudge, the
// preview colour, a refused square, Place here, Cancel and the arrow keys; plus the card's Move button
// (card-model.js) and the api's move() (api.js).
import {describe, expect, it, vi} from 'vitest';
import {createMoveMode, moveTitle} from '../../src/island/move-mode.js';
import {buildCardModel} from '../../src/island/card-model.js';
import {createIslandApi} from '../../src/island/api.js';
import {createFakeIslandTransport} from '../../src/pirates/fake-api.js';
import {freeWallCells, onWallPerimeter, positionsOf} from '../../src/island/placement.js';

async function setUp() {
  const api = createIslandApi({transport: createFakeIslandTransport({version: 2})});
  let island = (await api.getIsland()).data;
  const render = vi.fn(), preview = vi.fn(), onMoved = vi.fn((answer) => { island = answer.data; });
  const mode = createMoveMode({api, render, preview, spots: () => island.spots, onMoved});
  return {api, mode, render, preview, onMoved, island: () => island};
}

describe('Move mode', () => {
  it('starts on the spot where it stands, with a green footprint of its size', async () => {
    const {mode, preview, render} = await setUp();
    expect(mode.start('cannon_1')).toBe(true);
    expect(mode.state).toMatchObject({spotId: 'cannon_1', x: -12.5, z: -14.5, ok: true});
    expect(preview).toHaveBeenLastCalledWith({spotId: 'cannon_1', x: -12.5, z: -14.5, size: 2, ok: true});
    expect(render.mock.calls.at(-1)[0]).toMatchObject({title: 'Move this tower spot', placeLabel: 'Place here'});
  });
  it('snaps a tap to a square and shows a refused square in red with the reason', async () => {
    const {mode, preview, render} = await setUp();
    mode.start('cannon_1');
    mode.tap(0.2, 2.1); // the heart
    expect(mode.state).toMatchObject({x: 0, z: 2, ok: false});
    expect(preview.mock.calls.at(-1)[0].ok).toBe(false);
    expect(render.mock.calls.at(-1)[0]).toMatchObject({ok: false, refused: true, status: "That is too close to the island's heart."});
  });
  it('places the building on the server and the answer carries the new square', async () => {
    const {mode, onMoved, island, render} = await setUp();
    mode.start('cannon_1');
    mode.tap(-10.1, -10.4);
    const answer = await mode.confirm();
    expect(answer.ok).toBe(true);
    expect(onMoved).toHaveBeenCalledTimes(1);
    expect(island().spots.find(item => item.id === 'cannon_1')).toMatchObject({x: -10, z: -10.5});
    expect(island().layout).toMatchObject({version: 2, movable: true});
    expect(mode.active).toBe(false);
    expect(render).toHaveBeenLastCalledWith(null);
  });
  it('sends nothing for a refused square or the square it stands on, and Cancel ends the mode', async () => {
    const {mode, api} = await setUp();
    const spy = vi.spyOn(api, 'move');
    mode.start('wall_1');
    mode.tap(30, 30);
    expect(await mode.confirm()).toBe(null);
    const {x, z} = positionsOf((await api.getIsland()).data.spots).wall_1;
    mode.tap(x, z);
    expect(await mode.confirm()).toBe(null);
    expect(spy).not.toHaveBeenCalled();
    mode.start('wall_1'); mode.cancel();
    expect(mode.active).toBe(false);
  });
  it('rejects the inside of the island and snaps a near tap to a free edge spot', async () => {
    const {mode, preview, render, island} = await setUp();
    const positions = positionsOf(island().spots), current = positions.wall_1;
    const target = freeWallCells('wall_1', positions).find(cell => cell.x !== current.x || cell.z !== current.z);
    mode.start('wall_1');
    expect(render.mock.calls.at(-1)[0].line).toBe('Tap a highlighted spot on the grass edge, or use the arrows.');
    mode.tap(-4, -5.5);
    expect(preview.mock.calls.at(-1)[0]).toMatchObject({spotId: 'wall_1', ok: false});
    expect(render.mock.calls.at(-1)[0]).toMatchObject({ok: false, refused: true, status: 'Walls go in one row along the grass edge.'});
    mode.tap(target.x + .39, target.z + .32);
    expect(mode.state).toMatchObject(target);
    expect(render.mock.calls.at(-1)[0]).toMatchObject({ok: true, status: 'This square is free.'});
    const answer = await mode.confirm();
    expect(answer.ok).toBe(true);
    expect(island().spots.find(spot => spot.id === 'wall_1')).toMatchObject(target);
  });
  it('uses arrow controls to skip blocked slots and stay in the edge row', async () => {
    const {mode} = await setUp();
    mode.start('wall_1');
    const start = mode.state;
    expect(mode.handleKey({key: 'ArrowRight'})).toBe(true);
    const next = mode.state;
    expect(next.ok).toBe(true);
    expect(next.x).toBeGreaterThan(start.x);
    expect(onWallPerimeter(next.x, next.z)).toBe(true);
  });
  it('refuses an occupied edge spot without redirecting to a different slot', async () => {
    const {mode, island} = await setUp();
    const {x, z} = positionsOf(island().spots).wall_2;
    mode.start('wall_1');
    mode.tap(x, z);
    expect(mode.state).toMatchObject({x, z, ok: false});
    expect(await mode.confirm()).toBe(null);
  });
  it('moves one square per arrow key and leaves other keys to the game', async () => {
    const {mode} = await setUp();
    mode.start('house_1');
    const event = key => ({key, preventDefault: vi.fn(), stopPropagation: vi.fn()});
    expect(mode.handleKey(event('ArrowRight'))).toBe(true);
    expect(mode.handleKey(event('ArrowUp'))).toBe(true);
    expect(mode.state).toMatchObject({x: 7.5, z: -6.5});
    expect(mode.handleKey(event('e'))).toBe(false);
  });
  it('keeps the bar open with the server\'s message when the move is refused', async () => {
    const api = {move: vi.fn(async () => ({ok: false, status: 409, code: 'wave_running', message: 'A wave is under way. Move buildings between waves.'}))};
    const render = vi.fn(), mode = createMoveMode({api, render, spots: () => []});
    mode.start('cannon_1'); mode.tap(-10, -10);
    await mode.confirm();
    expect(mode.active).toBe(true);
    expect(render.mock.calls.at(-1)[0]).toMatchObject({status: 'A wave is under way. Move buildings between waves.', refused: true});
  });
  it('names the building that stands on the spot', () => {
    expect(moveTitle('cannon_1', [{id: 'cannon_1', built: true, kind: 'mortar'}])).toBe('Move Mortar');
  });
});

describe('the Move button and the api', () => {
  const spot = {id: 'wall_1', kind: 'wall', built: true, level: 1, cost: 10};
  it('shows only when the island answer says the layout is movable, off during a wave', () => {
    expect(buildCardModel({spotId: 'wall_1', slot: 'wall', spot, coins: 50}).move).toBe(null);
    expect(buildCardModel({spotId: 'wall_1', slot: 'wall', spot, coins: 50, movable: true}).move).toMatchObject({label: 'Move', disabled: false});
    expect(buildCardModel({spotId: 'wall_1', slot: 'wall', spot, coins: 50, movable: true, battle: true}).move).toMatchObject({disabled: true});
    expect(buildCardModel({spotId: 'pp_wall_1', slot: 'wall', spot, coins: 50, movable: true, point: true}).move).toBe(null);
  });
  it('refuses a position off the grid before asking the server', async () => {
    const transport = {get: vi.fn(), post: vi.fn()};
    const answer = await createIslandApi({transport}).move({spot: 'wall_1', x: 1.25, z: 0});
    expect(answer).toMatchObject({ok: false, code: 'off_grid'});
    expect(transport.post).not.toHaveBeenCalled();
  });
  it('posts the spot and the square', async () => {
    const transport = {get: vi.fn(), post: vi.fn(async () => ({ok: false, status: 404, code: 'feature_off', message: 'Moving buildings is not open yet.'}))};
    await createIslandApi({transport}).move({spot: 'wall_1', x: 1.5, z: -2});
    expect(transport.post).toHaveBeenCalledWith('/api/island/move', {spot: 'wall_1', x: 1.5, z: -2});
  });
});
