// T36 Move mode (src/island/move-mode.js) against the in-memory fake server: start, tap, nudge, the
// preview colour, a refused square, Place here, Cancel and the arrow keys; plus the card's Move button
// (card-model.js) and the api's move() (api.js).
import {describe, expect, it, vi} from 'vitest';
import {createMoveMode, moveTitle} from '../../src/island/move-mode.js';
import {buildCardModel} from '../../src/island/card-model.js';
import {createIslandApi} from '../../src/island/api.js';
import {createFakeIslandTransport} from '../../src/pirates/fake-api.js';

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
    mode.tap(-18.5, -1);
    expect(await mode.confirm()).toBe(null);
    expect(spy).not.toHaveBeenCalled();
    mode.start('wall_1'); mode.cancel();
    expect(mode.active).toBe(false);
  });
  it('shows a wall off every pirate path in red with the short reason, and a lane square in green (D056)', async () => {
    const {mode, preview, render} = await setUp();
    mode.start('wall_1');
    expect(render.mock.calls.at(-1)[0].line).toBe('Tap a glowing square. Up to three rows per approach.');
    mode.tap(-4, -5.5); // the old north spot of wall_11: no pirate walks there
    expect(preview.mock.calls.at(-1)[0]).toMatchObject({spotId: 'wall_1', ok: false});
    expect(render.mock.calls.at(-1)[0]).toMatchObject({ok: false, refused: true, status: 'Walls go on a pirate path.'});
    mode.tap(-12, .5); // across the west route
    expect(render.mock.calls.at(-1)[0]).toMatchObject({ok: true, status: 'This square is free.'});
    const answer = await mode.confirm();
    expect(answer.ok).toBe(true);
  });
  it('moves one square per arrow key and leaves other keys to the game', async () => {
    const {mode} = await setUp();
    mode.start('house_1');
    const {x, z} = mode.state;
    const event = key => ({key, preventDefault: vi.fn(), stopPropagation: vi.fn()});
    expect(mode.handleKey(event('ArrowRight'))).toBe(true);
    expect(mode.handleKey(event('ArrowUp'))).toBe(true);
    expect(mode.state).toMatchObject({x: x + .5, z: z - .5});
    expect(mode.handleKey(event('e'))).toBe(false);
  });
  it('docks a touch near a built wall onto a legal shared edge and keeps a fourth row refused', async () => {
    const accepted = [
      {id:'wall_2', kind:'wall', built:true, x:14.5, z:-.5},
      {id:'wall_3', kind:'wall', built:true, x:16.5, z:-.5},
    ];
    const render = vi.fn(), api = {move: vi.fn(async () => ({ok:true}))};
    const ruined = new Set(['wall_3']);
    const mode = createMoveMode({api, render, spots: () => accepted, canJoinWall: wall => !ruined.has(wall.id)});
    expect(mode.start('wall_1')).toBe(true);
    mode.tap(17, -2.5);
    expect(mode.state).toMatchObject({x:17, z:-2.5, ok:false});
    expect(await mode.confirm()).toBeNull();
    mode.tap(16.51, -2.99);
    expect(mode.state).toMatchObject({x:16.5, z:-3, ok:false});
    ruined.clear();
    mode.tap(16.51, -2.99);
    expect(mode.state).toMatchObject({x:16.5, z:-2.5, ok:true});
    expect(render.mock.lastCall[0].status).toBe('Walls join here.');
    await mode.confirm();
    expect(api.move).toHaveBeenCalledExactlyOnceWith({spot:'wall_1', x:16.5, z:-2.5, code:null});
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
