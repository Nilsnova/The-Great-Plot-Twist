// Exhaustive state probes for G21. Used only by test_act1_web_correctness.py; no browser/network.
import { Game, memoryStorage } from '../../../frontend/src/story/engine.js';

function snapshot(game, result) {
  const reopened = new Game(game.story, game.storage);
  const resumed = reopened.resume();
  return {
    accepted: result.accepted,
    message: result.message,
    state: game.state,
    visible: game.visibleActions().map(({ action, allowed }) => [action.id, allowed]),
    notes: game.sceneNotes(),
    resumed,
    resumedState: reopened.state,
  };
}

function probe(story, { prefix, moves }) {
  return moves.map((move) => {
    const game = new Game(story, memoryStorage());
    game.newGame();
    for (const prior of prefix) {
      if (!game.perform(prior).accepted) throw new Error('Probe prefix was refused');
    }
    return snapshot(game, game.perform(move));
  });
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (input += chunk));
process.stdin.on('end', () => {
  const { story, cases } = JSON.parse(input);
  process.stdout.write(JSON.stringify(cases.map((sample) => probe(story, sample))));
});
