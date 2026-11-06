# The prediction kiosk (package L5, the screen)

> **What this is:** the kiosk screen of the prediction desk. A player at the harbor's `prediction_kiosk` reads up to five real questions, stakes play coins on YES or NO, sees how earlier stakes ended, and (for a host) settles a pool.
>
> **Who uses it:** `src/game.js` opens it when the game emits `{ type: 'interact', id: 'prediction_kiosk' }`. The server side is in `backend/server/routes/predictions.py`; the contract is in `docs/INTERFACES.md` (the prediction desk) and `specs/L5-prediction-desk.md`, section 8.

The screen only shows what the server says. It never works out a pool, a payout or a limit: `payoutPerCoin`, `canStake`, the receipts and every error come from the server. The one sum in the screen is "payout minus stake", for the words "14 more than your stake".

Everything sits behind the flag `predictions`, which is **off** (Nils' decision 18). While it is off the server answers `404 feature_off`, and the kiosk says "The prediction desk is closed for now."

## How to try it

```bash
cd frontend
npm run dev
```

1. Open the address Vite prints, with `?desk=local` added: `http://127.0.0.1:5173/?desk=local`.
2. Choose **New game**, close the intro with Escape, sail to Saltreach Harbor, walk to the kiosk and press **E**. Or, without walking, run this in the browser console (development only): `window.__island.emit({type: 'interact', id: 'prediction_kiosk'})`.
3. With `?desk=local` the kiosk talks to a practice desk that lives in the browser (three made-up questions, 1,000 practice coins, you are a host). It says "Practice desk: not real coins" at the top. Without `?desk=local` it talks to the real server through `/api/predictions`.

The practice desk is loaded only in development. The production build does not contain it (search `dist/` for "Practice desk": there is no match).

## The files

| File | Job |
|---|---|
| `desk.js` | The modal "Prediction kiosk" with the tabs Questions, My stakes and (hosts only) Presenter. Asks the server when it opens, after every action and every 30 seconds while open; never while closed. |
| `questions-view.js` | The question cards and the stake form with its confirm step. DOM only. |
| `stakes-view.js` | "My stakes": how each stake ended, and today's total. DOM only. |
| `presenter-view.js` | The presenter tab: Manifold state, our pool, and Settle YES / Settle NO / Void, each with a confirm step. DOM only. |
| `card-list.js` | The cards of both lists: each card keeps its own live region between refreshes. |
| `dom-helpers.js` | Small DOM helpers (a real button, a live region, keep the keyboard focus on refresh). |
| `view-model.js` | Pure. Display text of a question, a stake and the form; the check of the stake input. |
| `time-labels.js` | Pure. "Thu 17 Dec, 12:00 CET" and "in 41 days". |
| `presenter-model.js` | Pure. The Manifold line, which settle buttons are possible, the confirm text and the receipt. |
| `messages.js` | Pure. The play-money line, the credit and one plain sentence for every error code. |
| `desk-state.js` | Pure. Turns the two answers (list, mine) into the one state the desk shows. |
| `flow.js` | Pure. What happens after a click: the next step of the form, the notice, and when the stake id is kept. |
| `adapter.js` | Chooses the adapter: the practice desk in development with `?desk=local`, the HTTP adapter otherwise. |
| `adapter-http.js` | `createHttpDeskAdapter({ request })` with `list()`, `mine()`, `stake()`, `settle()` and `makeStakeId()`. Turns every server answer into one "reply". |
| `request.js` | A small wrapper around `fetch`. Refuses any path outside `/api/predictions`, adds the token only when there is one, 10 second limit. |
| `adapter-fake.js`, `fake-pool.js` | The practice desk: a fake of the server with the same refusals, and a simple stand-in split (never the source of truth). |
| `desk.css` | The look, from the UI kit. No animation, no transition. |

The tests are in `frontend/tests/predictions/`. They are pure (there is no DOM environment), so the DOM files are checked by eye in the browser.

## The replies

Every adapter call answers with one reply, and `kind` says what to do:

| `kind` | When | What the screen does |
|---|---|---|
| `ok` | a good answer | shows it |
| `done` | `409 already_applied` | counts as done, asks for fresh numbers |
| `closed` | `404 feature_off` (or a server without the routes) | shows the closed desk |
| `signin` | `401` | "Sign in with GitHub to stake coins." |
| `wait` | `429` | says how many seconds to wait, keeps the stake id |
| `refused` | a clear "no" (403, 404, 409, 422, a 503 that changed nothing) | shows the server's own message |
| `unknown` | no network, a timeout, `database_unavailable`, a server error | says the answer was lost; **Confirm** again sends the same stake id |

## The stake id

The stake id is made once, when the player presses **Confirm**. If the answer is lost, the same stake is sent again with the same id, and the server counts it once. After any clear answer the id is dropped, so the next confirmed click is a new stake. The rule is in `flow.js` and tested in `tests/predictions/flow.test.js` and `http-adapter.test.js`.

## Keyboard and screen reader

- Escape cancels an open confirm step first. A second Escape closes the kiosk. The kiosk is also counted as an open overlay in `game.js`, so Escape does not open the pause menu on top of it.
- Keys typed in the kiosk do not reach the game, so they cannot walk the explorer around.
- Every card is an `<article>` with its question as `<h3>`. The side choice is a `<fieldset>` with the legend "Your forecast". Every card has one polite live region (`role="status"`) that is never replaced.
- After a stake the focus moves to the "Your stake" line. After a refusal it goes back to the button the player used.
- The kiosk has no animation and no transition, so reduced motion needs nothing special.
- At 375 px wide the kiosk is one column, text is 16 px or more and buttons are 44 px or taller.

## Switching to the sign-in client (package A2)

On `main` today the game has no sign-in, so `adapter.js` hands the HTTP adapter a `request` whose `getToken()` returns `null`: every player is "not signed in", and the kiosk can be read but not used. When package A2 is merged:

1. In `adapter.js`, replace `createRequest({ getToken: noToken })` with A2's `api` from `src/online/api.js`. It has the same `get(path)` and `post(path, body)` and answers in the same `{ ok, status, data }` / `{ ok: false, status, code, message }` shape.
2. Delete `request.js` and `tests/predictions/request.test.js`.

The adapter marks the public list call as anonymous (`request.get(path, { anonymous: true })`). A2's `api` ignores that second argument and sends the token whenever the player is signed in, which does no harm on a public route.

## Known limits

- The Close button (the cross) also cancels an open confirm step first, because the kit modal gives Escape and the Close button the same handler. A second click closes the kiosk.
- A gamepad or the touch stick cannot move the explorer while the kiosk is open (`game.js` counts the kiosk in `isBlocked`).
- The practice desk keeps its stakes in memory only. A reload starts it again.
