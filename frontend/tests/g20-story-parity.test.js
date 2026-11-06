// Read-only cross-language oracle: reachable states and every scene action, including refusals.
// Python runs without bytecode or saves; backend files are never written.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Game } from '../src/story/engine.js';
import { story } from './story-fixture.js';

const backend = fileURLToPath(new URL('../../backend', import.meta.url));
const python = `import json, sys
sys.path.insert(0, sys.argv[1])
from plot_twist.engine import Game
data = json.load(sys.stdin)
rows = []
for case in data['cases']:
    game = Game(data['story'], save_path=None)
    for action in case['path']:
        assert game.perform(action).accepted
    result = game.perform(case['action'])
    rows.append({'state': game.state.to_dict(), 'result': {'accepted': result.accepted, 'message': result.message},
        'actions': [[a['id'], allowed] for a, allowed in game.visible_actions()], 'notes': game.scene_notes(),
        'inventory': [{'name': name, 'description': description} for name, description in game.inventory_details()]})
json.dump(rows, sys.stdout)
`;
function replay(path) {
  const game = new Game(story);
  for (const id of path) { if (!game.perform(id).accepted) throw new Error(`Unreachable parity path: ${id}`); }
  return game;
}
// Ignore message in the visited key: it changes displayed text, not transition eligibility.
function key(state) { return JSON.stringify([state.scene, state.inventory, state.flags, state.ended]); }
const queue = [[]], seen = new Set(), cases = [], reached = new Set();
for (let i = 0; i < queue.length; i++) {
  if (queue.length > 10000) throw new Error('Story state space grew: review parity traversal');
  const path = queue[i], game = replay(path), stateKey = key(game.state);
  if (seen.has(stateKey)) continue;
  seen.add(stateKey); reached.add(game.state.scene);
  for (const action of [...(game.scene.actions ?? []).map(a => a.id), 'g20_absent_action']) {
    const next = replay(path), result = next.perform(action);
    cases.push({ path, action, scene: game.state.scene, expected: {
      state: next.state, result, actions: next.visibleActions().map(({ action: a, allowed }) => [a.id, allowed]),
      notes: next.sceneNotes(), inventory: next.inventoryDetails(),
    } });
    if (result.accepted && !seen.has(key(next.state))) queue.push([...path, action]);
  }
}
const oracle = spawnSync(process.env.G20_PYTHON || 'python3', ['-B', '-c', python, backend], {
  input: JSON.stringify({ story, cases }), encoding: 'utf8', timeout: 30000, maxBuffer: 20 * 1024 * 1024,
});
if (oracle.error || oracle.status !== 0) throw new Error(`Python parity oracle failed: ${oracle.error?.message ?? oracle.stderr}`);
const actual = JSON.parse(oracle.stdout);

it(`G20 visits all ${reached.size} scenes in ${seen.size} transition states (${cases.length} probes)`, () => {
  expect([...reached].sort()).toEqual(Object.keys(story.scenes).sort());
  expect(actual).toHaveLength(cases.length); expect(cases.length).toBeGreaterThan(Object.keys(story.scenes).length);
});
describe('G20 Python/browser parity by scene', () => {
  for (const scene of Object.keys(story.scenes)) {
    it(`${scene}: identical state, actions, notes, inventory and acceptance/refusal messages`, () => {
      const indexes = cases.flatMap((c, index) => c.scene === scene ? [index] : []);
      expect(indexes.length).toBeGreaterThan(0);
      for (const index of indexes) expect(cases[index].expected, `path ${cases[index].path.join('/')} action ${cases[index].action}`).toEqual(actual[index]);
    });
  }
});
