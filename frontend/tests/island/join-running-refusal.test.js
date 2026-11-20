// The real island assembly/API must retain read refusals rather than join a cached wave; transport is local.
import {afterEach, expect, it, vi} from 'vitest';
vi.mock('../../src/island/ui.js', () => ({createIslandUi: () => ({open: null, active: false,
  close() {}, dispose() {}, toast() {}, banner() {}, visit() {}})}));
vi.mock('../../src/island/move-bar.js', () => ({createMoveBar: () => ({render() {}, dispose() {}})}));
vi.mock('../../src/island/village-bar.js', () => ({createVillageBar: () => ({render() {}, setBuildings() {}, dispose() {}})}));
vi.mock('../../src/island/wall-builder-bar.js', () => ({createWallBuilderBar: () => ({render() {}, dispose() {}})}));
import {createIsland} from '../../src/island/index.js';
import {createFakeIslandTransport} from '../../src/pirates/fake-api.js';

let island;
afterEach(() => island?.dispose());
it('returns the exact 429 wait without trying to join an older cached current wave', async () => {
  const base = createFakeIslandTransport(), refusal = {ok: false, status: 429, code: 'too_many_requests', retryAfterSeconds: 17};
  let limited = false;
  const transport = {...base, get: vi.fn(path => limited && path.startsWith('/api/waves/current?') ? Promise.resolve(refusal) : base.get(path)),
    post: vi.fn((path, body) => base.post(path, body))};
  island = createIsland({container: {}, transport, mode: 'fake', storage: null, visitStorage: null,
    emit() {}, on: () => () => {}, menu: () => () => {}, settings: () => () => {}});
  await island.load();
  expect((await island.api.startWave()).ok).toBe(true);
  expect((await island.flow.look()).ok).toBe(true);
  expect(island.flow.current).toMatchObject({joined: false});
  transport.post.mockClear(); limited = true;
  expect(await island.joinRunningWave()).toMatchObject(refusal);
  expect(transport.post).not.toHaveBeenCalled();
  expect(island.flow.current.joined).toBe(false);
});
