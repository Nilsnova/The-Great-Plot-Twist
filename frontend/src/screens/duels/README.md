# Lantern Duels screen (package A7)

> **What this folder is:** the arena panel of Lantern Duels: challenges, the sealed signal picker, the reveal, and results with Replay and Rematch. It talks to the server through one small adapter, and it comes with a local practice ring so the whole panel can be tried with no server.
>
> **Who uses it:** the screen builder and the reviewers of package A7, and whoever wires the sign-in (package A2) or switches the flag `arena` on later. The rules and routes are in [docs/INTERFACES.md](../../../../docs/INTERFACES.md) (Lantern Duels); this file only says how the screen is built.

The server decides every duel (D003). The screen sends signals and ids, never a round result, a winner or an amount. A captain's sealed signals reach the other captain only inside the reveal, after both envelopes are in. The panel sits behind the server flag `arena`, which stays off: while it is off the panel says "The ring is closed for now."

## How it opens

`src/game.js` has one hook, and three small lines that make the open panel an overlay (see below). When the player presses E at the hotspot `arena_gate` (Smugglers' Cove), the hook loads `index.js` with a dynamic import, so the title and game chunks do not grow, and calls:

```js
openArena({ container, resetInput, focus, getToken })
```

- `container`: the game's element. The panel is a `<dialog>` inside it.
- `resetInput` and `focus`: the game's own functions. The panel calls `resetInput` when it opens and when it closes, and `focus` (back to the canvas) when it closes.
- `getToken`: **optional, for package A2.** A function that returns the sign-in token, or `null`. Until it is passed, the panel shows "Sign in with GitHub to duel." when the flag is on and sends nothing to the duel routes.

The panel is built once. If the game shuts down and clears its container, the panel notices, stops all its work, and the next `openArena` builds a fresh one.

### The open panel is an overlay of the game

`index.js` also exports `isArenaOpen()`, true while the panel's dialog is open. `game.js` keeps the loaded module and asks it in three places, so that the open panel is an overlay of the game, like the case board (`caseUi.active`):

- `world.isBlocked` (so `world.busy` is true): the explorer stands still, the gamepad and the touch controls leave the explorer alone (the gamepad then works the dialog: D-pad moves the focus, A presses, Start or B closes it), and no hotspot or journey starts behind the panel;
- `hasOverlay()`: the shell's Escape handler runs before the dialog hears the key, and without this line it opens the pause menu on top of the panel instead of letting Escape close the panel;
- the block of the game loop that reads the hotkeys (T, M, Escape and 1 to 4), in case the focus is lost to the page behind the panel.

These lines go beyond the one hook of spec 11.9. A reviewer found the problem in a real browser on 6 Nov (Escape opened the pause menu on top of the panel), so they were added and need approval with the pull request.

## Files

Each file does one job and stays under 150 lines.

| File | One job |
|---|---|
| `index.js` | The lazy entry `openArena(ctx)`. Picks the adapter and opens or focuses the panel. Also `isArenaOpen()`, which the game asks. |
| `panel.js` | The dialog, its four tabs, key handling, focus, and wiring clicks to the adapter. |
| `panel-status.js` | The status lines at the top: practice label, coins, polling line, waiting message, notice. |
| `challenges.js` | Tab 1: named and open challenges, and the answer view (Answer, Decline). |
| `new-challenge.js` | Tab 2: opponent, rounds, stake, the picker and the seal button. |
| `history.js` | Tab 3: waiting challenges (sealed signals, countdown, Withdraw) and results (Replay, Rematch). |
| `rules-card.js` | Tab 4: the rules card. |
| `picker.js` | The sealed signal picker: one radio group per round, oil left, Clear. |
| `reveal.js` | The reveal animation, its text twin for screen readers, and the reduced-motion table. |
| `glyphs.js` | The three signal shapes, drawn in code: Flash a sunburst, Shade a shutter, Mirror a diamond. |
| `dom.js` | Small DOM helpers (button, label, redraw that keeps focus, "has the data changed", "was I removed"). |
| `logic.js` | Pure rules: signals, oil, the picker state, who takes a round, payouts, captain names, time left. |
| `steps.js` | Pure words: the reveal as steps with a running score, the result line, the history lines. |
| `messages.js` | Every error code mapped to one plain sentence. |
| `poll.js` | The poll schedule (pure) and the timer that follows it. |
| `view-store.js` | The one view both adapters hand to the panel, with copies and a revision number. |
| `http-client.js` | The only place that calls `fetch`: token, JSON, one request at a time, never throws. |
| `http-intents.js` | Challenge, answer and cancel: one `actionUid` per intent, kept after a lost answer. |
| `http-adapter.js` | The HTTP adapter: `/api/config` once per opening, polling, and the surface below. |
| `fake-ring.js` | The practice ring: stakes, payouts, refusals and lazy expiry, in the shape of the real routes. |
| `fake-views.js` | What one captain may see of a duel in the practice ring. The only place that decides visibility. |
| `fake-start.js` | The practice ring's starting position. |
| `fake-adapter.js` | The practice adapter: the same surface, with a seeded rival that answers after about 6 s. |
| `duels.css` | The panel, the lanterns, the 375 px layout, colour-blind and reduced motion rules. |

The spec lists a shorter set of files. The extra ones exist only to keep each file small and to give each job one home (the practice ring, the intents, the status lines and the tab bodies).

## The adapter contract

Both adapters have the same surface, so the panel never knows which one it has:

```js
adapter.read()                       // a copy of the current view
adapter.subscribe(listener)          // listener(view) after every change; returns stop()
adapter.refresh()                    // ask now; restarts the fast polling window
adapter.challenge({ opponentName, rounds, stake, signals })   // resolves { ok, view, code?, message? }
adapter.answer(duelId, signals)
adapter.cancel(duelId)               // withdraw (the challenger) or decline (the named captain)
adapter.select(duelId)               // load one duel in full, for the reveal
adapter.retry()                      // resend the intent whose outcome was unknown, with the SAME actionUid
adapter.setVisible(isVisible)        // the page or the panel was hidden or shown
adapter.dispose()
```

The view is `{ mode, revision, rules, coins, heldCoins, incoming, openChallenges, yours, recent, selected, sealed, serverOffsetMs, polling, notice, canRetry }`.

- `mode` is `loading`, `closed` (the flag is off), `signed_out` (no token), `ready`, `practice` (the fake) or `unavailable`.
- `polling` is `fast`, `slow`, `paused` or `off`. `notice` is `null` or `{ id, code, message }`.
- `selected` is the detail of one duel, with the reveal once it is finished. The lists are the server's JSON, unchanged.
- `sealed` is the one addition to the spec: the player's own sealed signals by duel id, remembered from the answers the adapter has seen, so a waiting challenge can show them without an extra request.

**Safe repeats.** The adapter makes one `actionUid` per intent and keeps it until the server gives a definite answer (2xx or 4xx). After a network failure or a 5xx it reads the list and offers "Try again", and `retry()` sends the same `actionUid`, so a lost answer can never make two challenges. After `409 already_applied` it reads again and counts the intent as done.

**Polling.** One request at a time. After the panel opens or the player acts: every 5 s for 2 minutes, then every 30 s, and nothing after 10 quiet minutes ("Paused. Check again"). Never while the page is hidden. A `429` waits for `Retry-After`; a network error or a 5xx doubles the wait up to 60 s and says "The ring did not answer. Retrying." That is at most 40 calls for one open, quiet panel.

## Try it by hand

The local practice ring is for development only: it is removed from the production build.

1. `cd frontend && npm install && npm run dev`, then open the address Vite prints with `?arena=local` added, for example `http://127.0.0.1:5173/?arena=local`.
2. Choose **New game**, leave the intro with **Return to the island**, sail to Smugglers' Cove (sea chart, key M), walk to the arena gate and press E.
3. The panel says "Practice ring: a local stand-in rival. Nothing is saved." It starts with 500 coins, a named challenge from Brave Puffin 17, an open challenge from Captain-7c41d2 and two past duels. Challenge anyone: the rival answers about 6 seconds later.
4. Without `?arena=local`, the panel talks to the real routes and, with the flag off, says the ring is closed.

## What the tests cover

The Vitest setup has no DOM, so the tests cover the pure logic and the adapters. The panel files are checked by hand (below).

| Test file | What it proves |
|---|---|
| `tests/duels-index.test.js` | The lazy entry: one panel for two quick presses, and `isArenaOpen()` is true only while the dialog is open (a stand-in panel, because there is no DOM). |
| `tests/duels-logic.test.js` | The rules and numbers equal the server's: all 17 and 147 sequences, symmetry, no unbeatable sequence, payouts 19, 47, 95, 190, the picker, names, time left. |
| `tests/duels-text.test.js` | One sentence per error code, the reveal steps with a running score, reduced motion gives one step, the result and history lines. |
| `tests/duels-poll.test.js` | 5 s for 2 minutes, then 30 s, 40 calls in 10 quiet minutes, hidden page, 429 and failure waits, one request at a time. |
| `tests/duels-fake.test.js` | The practice ring: stakes held once, payouts once, the same refusals, lazy expiry, and the rival's signals never shown before the reveal. |
| `tests/duels-http.test.js` | Exact method, path, body and header of each call, no player id, the same `actionUid` on retry, every refusal mapped, one request at a time. |

## Manual checks

Checked in a real browser with `?arena=local`, on a desktop size and at 375 x 667:

- Keyboard only: Tab into a round, arrow keys and Space choose, the seal button waits for every round, Enter seals.
- Oil: a signal the oil cannot pay for is disabled with "needs 2 oil, 1 left"; a round can always take Shade.
- The reveal: both shutters open together, the strip marks each point, the line explains it, the score ticks. Focus starts on "Skip" and ends on "Back to the ring".
- Reduced motion: no animation, the whole result as a table, the summary spoken once.
- 375 px: one column, the tabs wrap, three signal buttons per round fit, no horizontal scroll, text at least 14 px, targets at least 44 px.
- Keys typed in the dialog never reach the game window; Escape closes; `resetInput` runs on open and close.
- In the running game (press E at the arena gate, not only in the practice ring), Escape closes the panel and does not open the pause menu. Open it again and close it again to check that.
- With a gamepad, the stick does not move the explorer while the panel is open, and Start or B closes the panel instead of opening the pause menu.
- With the flag off the panel says the ring is closed; without a token it says how to sign in.

Checked by a script, not by a person, on 6 Nov in headless Chrome with the running game loop (the script is not in the repository): Escape closes the panel and leaves the pause menu closed, the keyboard focus goes back to the canvas, a gamepad stick and WASD do not move the explorer behind the panel (they do move it when the panel is closed), Start closes the panel, and the hotkey T is ignored behind the panel.

Not yet checked by a person: the spoken text with VoiceOver, other browsers and touch devices, and the real walk to the arena gate (the script opens the panel with the game's `interact` event). Please run the list above before approving.

## What is not here yet

- **Sign-in.** The game client has no token until package A2. It passes `getToken` to `openArena` then.
- **The routes.** The server routes and the migration are built by the server part of A7. Until both are merged and the migration is applied, the HTTP adapter has nothing to talk to, and the flag `arena` stays off.
- **The world check.** `npm run test:world` presses E at every hotspot. At the arena gate that opens this panel, and the script then waits for a hotspot prompt that the open panel hides, so the check fails on this branch. Its helper `dismissIntro` in `frontend/scripts/intro-browser-fixture.js` needs `'.duel-modal'` in its list of dialogs to close, next to `'.intro-modal'` and `'.case-modal'`. That file is shared with the graphics work, so this pull request does not change it. Tried in a scratch copy on 6 Nov: with that one word added the world check passes (twice), without it the check fails.
- **Live duels, preset taunts and the weekly cup** are later packages (see the spec).
