// Wall builder contracts: real quotes, immutable paid intents and lifecycle-safe retries with injected transport.
import {describe, expect, it, vi} from 'vitest';
import {createWallBuilder} from '../../src/island/wall-builder-mode.js';
import {createWallBuilderApi} from '../../src/island/wall-builder-api.js';
const code = 'ISLE-K7Q2M', epoch = '11111111-1111-4111-8111-111111111111';
const island = {code, coins: 1000, waveBest: 50, flags: 0, spots: [], layout: {wallRuleVersion: 1, wallCapacity: 128}};
const quoteFor = cells => ({placements: cells.map((cell, i) => ({spot: `wall_${i + 1}`, ...cell})), unitCost: 10,
  islandEpoch: epoch, totalCost: cells.length * 10, remaining: 128 - cells.length, wallRuleVersion: 1, wallCapacity: 128});
const success = data => ({ok: true, status: 200, data});
const receiptFor = body => success({receipt: {actionUid: body.actionUid, totalCost: body.quotedTotal,
  placements: body.placements, islandEpoch: body.islandEpoch, repeat: false}, island});
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; };
function setup() {
  let context = {allowed: true, code, epoch};
  const api = {enableWalls: vi.fn(async () => success(island)), quoteWalls: vi.fn(async body => success(quoteFor(body.cells))),
    buildWalls: vi.fn(async body => receiptFor(body))};
  const render = vi.fn(), preview = vi.fn(), onIsland = vi.fn(), makeUid = vi.fn(() => 'abcdefgh12345678');
  const mode = createWallBuilder({api, context: () => context, render, preview, onIsland, makeUid});
  return {mode, api, render, preview, onIsland, makeUid, set: value => { context = {...context, ...value}; }};
}
async function ready(test) { await test.mode.start(); test.mode.tap(1.26, 6.1); await test.mode.quote(); }

describe('wall construction controller', () => {
  it('starts only in the permitted owner context and waits for admission', async () => {
    const t = setup(); t.set({allowed: false}); expect(await t.mode.start()).toBe(false);
    expect(t.api.enableWalls).not.toHaveBeenCalled(); t.set({allowed: true});
    expect(await t.mode.start()).toBe(true); expect(t.onIsland).toHaveBeenCalledWith(island);
  });
  it('snaps a start and drafts edge-sharing cardinal runs with turns before quoting', async () => {
    const t = setup(); await t.mode.start(); t.mode.tap(1.26, 6.1); t.mode.tap(5.5, 6); t.mode.tap(5.5, 10);
    expect(t.mode.state.cells).toEqual([{x: 1.5, z: 6}, {x: 3.5, z: 6}, {x: 5.5, z: 6}, {x: 5.5, z: 8}, {x: 5.5, z: 10}]);
    expect(t.preview.mock.calls.at(-1)[0].valid).toBe(false); expect(t.mode.state.phase).toBe('draft');
    expect(t.mode.tap(5.5, 6)).toBe(false); expect(t.mode.state.cells).toHaveLength(5);
    t.mode.undo(); expect(t.mode.state.cells).toHaveLength(4);
  });
  it('refuses overlong and nonfinite drafts without replacing the existing cells', async () => {
    const t = setup(); await t.mode.start(); expect(t.mode.tap(NaN, 0)).toBe(false);
    t.mode.tap(-28, 0); t.mode.tap(28, 0); expect(t.mode.state.cells).toHaveLength(29);
    expect(t.mode.tap(28, 8)).toBe(false); expect(t.mode.state.cells).toHaveLength(29);
    expect(t.mode.state.status).toMatch(/32/);
  });
  it('confirms only the exact ordered quote and approved total', async () => {
    const t = setup(); await ready(t); const placements = quoteFor([{x: 1.5, z: 6}]).placements;
    expect(t.mode.state.phase).toBe('ready'); await t.mode.confirm();
    expect(t.api.buildWalls).toHaveBeenCalledWith({code, placements, islandEpoch: epoch, quotedTotal: 10, actionUid: 'abcdefgh12345678'});
    expect(t.onIsland).toHaveBeenCalledTimes(2); expect(t.mode.active).toBe(false);
  });
  it('binds a legacy unknown-context purchase to the real server quote epoch', async () => {
    const t = setup(); t.set({epoch: null}); await ready(t); await t.mode.confirm();
    expect(t.api.buildWalls.mock.calls[0][0].islandEpoch).toBe(epoch);
  });
  it('refuses a quote that disagrees with the known canonical context epoch', async () => {
    const t = setup(); await t.mode.start(); t.mode.tap(1.5, 6);
    t.api.quoteWalls.mockResolvedValueOnce(success({...quoteFor([{x: 1.5, z: 6}]), islandEpoch: '22222222-2222-4222-8222-222222222222'}));
    await t.mode.quote(); expect(t.mode.state.phase).toBe('refused'); expect(await t.mode.confirm()).toBeNull();
  });
  it('invalidates an old quote when an unpaid draft is edited', async () => {
    const t = setup(); await ready(t); t.mode.tap(5.5, 6); expect(await t.mode.confirm()).toBeNull();
    expect(t.api.buildWalls).not.toHaveBeenCalled(); expect(t.mode.state.phase).toBe('draft');
  });
  it('retains one UID and immutable intent after a lost reply, cancel and reopen', async () => {
    const t = setup(); await ready(t); t.api.buildWalls.mockResolvedValueOnce({ok: false, status: 503, message: 'Try again.'});
    await t.mode.confirm(); const intent = t.api.buildWalls.mock.calls[0][0];
    expect(t.mode.state.phase).toBe('unknown'); expect(t.mode.tap(9.5, 6)).toBe(false); t.mode.undo();
    t.mode.cancel(); await t.mode.start(); await t.mode.confirm();
    expect(t.api.buildWalls.mock.calls[1][0]).toEqual(intent); expect(t.makeUid).toHaveBeenCalledTimes(1);
  });
  it('blocks double confirm and reconciles a response from a closed session before applying state', async () => {
    const t = setup(), pending = deferred(); await ready(t); t.api.buildWalls.mockReturnValueOnce(pending.promise);
    const first = t.mode.confirm(); expect(await t.mode.confirm()).toBeNull();
    t.mode.cancel(); await t.mode.start(); expect(t.mode.state.busy).toBe(true);
    pending.resolve(receiptFor(t.api.buildWalls.mock.calls[0][0])); await first;
    expect(t.onIsland).toHaveBeenCalledTimes(1); expect(t.mode.state.phase).toBe('unknown');
    await t.mode.confirm(); expect(t.onIsland).toHaveBeenCalledTimes(2); expect(t.makeUid).toHaveBeenCalledTimes(1);
  });
  it.each([{epoch: '22222222-2222-4222-8222-222222222222'}, {code: 'ISLE-ABCDE'}])('ignores a changed scope response without repainting it: %j', async changed => {
    const t = setup(), pending = deferred(); await ready(t); t.api.buildWalls.mockReturnValueOnce(pending.promise);
    const first = t.mode.confirm(); t.set(changed);
    pending.resolve(receiptFor(t.api.buildWalls.mock.calls[0][0])); await first;
    expect(t.onIsland).toHaveBeenCalledTimes(1); expect(t.render).toHaveBeenLastCalledWith(null); expect(t.mode.active).toBe(false);
    t.mode.dispose(); expect(await t.mode.start()).toBe(false); expect(t.preview).toHaveBeenLastCalledWith(null);
  });
  it('unlocks an editable draft after a clear refusal from an earlier closed session', async () => {
    const t = setup(), pending = deferred(); await ready(t); t.api.buildWalls.mockReturnValueOnce(pending.promise);
    const first = t.mode.confirm(); t.mode.cancel(); await t.mode.start();
    pending.resolve({ok: false, status: 409, message: 'The quote changed.'}); await first;
    expect(t.mode.state.phase).toBe('draft'); expect(t.mode.tap(3.5, 6)).toBe(true);
  });
  it('leaves an ordinary refusal editable and requires a fresh quote', async () => {
    const t = setup(); await ready(t); t.api.buildWalls.mockResolvedValueOnce({ok: false, status: 409, message: 'The quote changed.'});
    await t.mode.confirm(); expect(t.mode.state.phase).toBe('draft'); expect(t.mode.tap(3.5, 6)).toBe(true);
    expect(await t.mode.confirm()).toBeNull(); expect(t.api.buildWalls).toHaveBeenCalledTimes(1);
  });
  it('discards a quote received after leaving the view', async () => {
    const t = setup(), pending = deferred(); await t.mode.start(); t.mode.tap(1.5, 6);
    t.api.quoteWalls.mockReturnValueOnce(pending.promise); const asked = t.mode.quote(); t.mode.cancel();
    pending.resolve(success(quoteFor([{x: 1.5, z: 6}]))); await asked; expect(t.mode.active).toBe(false);
  });
});

describe('wall builder transport', () => {
  it('sends admission, ordered quote and quoted-total construction to the dedicated routes', async () => {
    const cells = [{x: 1.5, z: 6}], quote = quoteFor(cells);
    const transport = {post: vi.fn(async (path, body) => success(path.endsWith('enable') ? island : path.endsWith('quote') ? quote : receiptFor(body).data))};
    const api = createWallBuilderApi({transport}); await api.enableWalls({code}); expect((await api.quoteWalls({cells, code})).ok).toBe(true);
    const body = {placements: quote.placements, islandEpoch: epoch, quotedTotal: 10, actionUid: 'abcdefgh12345678', code};
    expect((await api.buildWalls(body)).ok).toBe(true); expect(transport.post).toHaveBeenLastCalledWith('/api/island/walls/build', body);
  });
  it.each([[], [{x: 1.25, z: 0}], [{x: 0, z: 0}, {x: 0, z: 0}]])('refuses invalid cells before posting: %j', async cells => {
    const transport = {post: vi.fn()}, api = createWallBuilderApi({transport});
    expect((await api.quoteWalls({cells})).status).toBe(422); expect(transport.post).not.toHaveBeenCalled();
  });
  it.each(['spot', 'UID', 'price', 'epoch'])('refuses an invalid construction %s before posting', async changed => {
    const body = {placements: quoteFor([{x: 1, z: 6}]).placements, islandEpoch: epoch, quotedTotal: 10, actionUid: 'abcdefgh12345678', code};
    if (changed === 'spot') body.placements[0].spot = 'wall_129';
    if (changed === 'UID') body.actionUid = 'bad';
    if (changed === 'price') body.quotedTotal = 0;
    if (changed === 'epoch') delete body.islandEpoch;
    const transport = {post: vi.fn()}, api = createWallBuilderApi({transport});
    expect((await api.buildWalls(body)).status).toBe(422); expect(transport.post).not.toHaveBeenCalled();
  });
  it.each([{wallRuleVersion: 0, wallCapacity: 12}, {wallRuleVersion: 1, wallCapacity: 12}])('refuses unsupported admission metadata: %j', async layout => {
    const api = createWallBuilderApi({transport: {post: async () => success({...island, layout})}});
    expect((await api.enableWalls({code})).status).toBe(502);
  });
  it.each(['reordered', 'wrong total', 'duplicate ID'])('rejects an inconsistent %s quote', async changed => {
    const cells = [{x: 1, z: 6}, {x: 3, z: 6}], quote = quoteFor(cells);
    if (changed === 'reordered') quote.placements.reverse();
    if (changed === 'wrong total') quote.totalCost++;
    if (changed === 'duplicate ID') quote.placements[1].spot = quote.placements[0].spot;
    const api = createWallBuilderApi({transport: {post: async () => success(quote)}});
    expect(await api.quoteWalls({cells})).toMatchObject({ok: false, status: 502, code: 'unreadable'});
  });
  it('compares a delayed quote with the exact originally posted cells', async () => {
    const cells = [{x: 1, z: 6}], quoted = quoteFor(structuredClone(cells)), pending = deferred();
    const api = createWallBuilderApi({transport: {post: () => pending.promise}}), asked = api.quoteWalls({cells});
    cells[0].x = 9; pending.resolve(success(quoted)); expect((await asked).ok).toBe(true);
  });
  it.each(['price', 'UID', 'cell', 'island', 'epoch'])('treats a mismatched %s receipt as unknown', async changed => {
    const body = {placements: quoteFor([{x: 1, z: 6}]).placements, islandEpoch: epoch, quotedTotal: 10, actionUid: 'abcdefgh12345678', code};
    const reply = receiptFor(body); reply.data = structuredClone(reply.data);
    if (changed === 'price') reply.data.receipt.totalCost++;
    if (changed === 'UID') reply.data.receipt.actionUid = 'otheruid12345678';
    if (changed === 'cell') reply.data.receipt.placements[0].x++;
    if (changed === 'island') reply.data.island.code = 'ISLE-ABCDE';
    if (changed === 'epoch') reply.data.receipt.islandEpoch = '22222222-2222-4222-8222-222222222222';
    const transport = {post: vi.fn(async () => reply)}, api = createWallBuilderApi({transport});
    expect(await api.buildWalls(body)).toMatchObject({ok: false, status: 502});
    transport.post.mockRejectedValueOnce(new Error('offline')); expect(await api.buildWalls(body)).toMatchObject({ok: false, status: 0});
  });
});
