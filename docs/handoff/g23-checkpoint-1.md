# G23 checkpoint 1 — player manual

Requester: G23 task owner. Branch: `docs/g23-help`, from `origin/main` at `c26f303`. Checkpoint base merged from `origin/main`: already up to date. Push only this branch; no main push or merge into main.

## Changed

Added `docs/HOW-TO-PLAY.md`, a spoiler-free manual covering every requested topic. Player instructions are checked against current source rather than presented as a completed live game. No clue meanings, card combinations, culprit or solution appear. Read-only agent review corrected the intro order, reset warning and gamepad-dialogue claim.

## Verified

- `(cd frontend && npm test && npm run build)`: 33 files / 288 tests passed; build passed; spoiler guard checked 51 built text files.
- New manual reviewed against the shell, intro, settings, controls, case adapters/screens, weather, places and session code. Public issue link points to this repository.
- Secret scan of the checkpoint diff: empty (run before commit/push).

## Not verified / remaining

- C2 help page and C3 screenshots/build/CSP tests follow in later checkpoints.
- `frontend/HOW-IT-WORKS.md` does not exist on this main. Used `frontend/GRAPHICS.md` and source instead.
- Integrated sign-in, live kit/crew/case connection, building, prediction and duel screens, and a bulletin are absent. Help labels local rehearsal and planned features.
- Requested 10× positions closing at zero are the approved upcoming Exchange design, not implemented by the current market service; no trading screen exists. Documented as planned, with loss risk and play-money-only wording.
- Intro gamepad navigation is not reliably integrated: the gameplay guard omits the active intro. Recommend keyboard/touch for dialogue; no unrelated module changed.

## G9 link point

After integration, add a **How to play** link to `/help.html` from the title menu and pause menu beside **Settings** (`frontend/src/shell/controller.js`), preserving keyboard focus when returning. G23 adds no inbound link and does not edit those modules. The page itself will link back to the game.

Branch/PR: `docs/g23-help`; no PR or deployment created at this checkpoint.
