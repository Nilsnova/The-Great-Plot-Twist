// Helper for test_web_parity.py: plays lists of action ids through the JavaScript engine
// (frontend/src/story/engine.js) and prints the result of every step as JSON.
//
// Input (stdin):   {"story": {...}, "playthroughs": [["to_desk", ...], ["to_shore", ...]]}
// Output (stdout): one entry per playthrough, in the same order:
//                  [{"steps": [...], "resumed": true, "resumedState": {...}}, ...]
//
// Every playthrough starts a fresh game, so playthroughs never influence each other. One run of
// this file handles many playthroughs, because starting Node.js takes a moment each time.
//
// Used by: test_web_parity.py, which starts this file with Node.js and compares the output
// with what the Python engine does for the same moves.
import { Game, memoryStorage } from '../../../frontend/src/story/engine.js';

// Plays one list of action ids on a fresh game and reports what happened at every step.
function playThrough(story, actions) {
  const game = new Game(story, memoryStorage());
  game.newGame();
  const steps = actions.map((id) => {
    const result = game.perform(id);
    return {
      accepted: result.accepted,
      message: result.message,
      state: JSON.parse(JSON.stringify(game.state)),
      visible: game.visibleActions().map(({ action, allowed }) => [action.id, allowed]),
      notes: game.sceneNotes(),
    };
  });
  // Round-trip through the save, like closing and reopening the page.
  const reopened = new Game(story, game.storage);
  const resumed = reopened.resume();
  return { steps, resumed, resumedState: reopened.state };
}

let input = '';
process.stdin.setEncoding('utf8'); // read text, so a multi-byte letter is never cut between chunks
process.stdin.on('data', (chunk) => (input += chunk));
process.stdin.on('end', () => {
  const { story, playthroughs } = JSON.parse(input);
  const results = playthroughs.map((actions) => playThrough(story, actions));
  process.stdout.write(JSON.stringify(results));
});
