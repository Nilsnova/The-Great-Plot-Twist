# The Island Exchange panel

> **What this folder is:** the screen of the Island Exchange (package L4): a modal with two tabs, "Prices" and "Your positions", where a player opens and closes 10x positions on real prices. It also holds the panel's own small adapter: the HTTP mapping, a local fake and the canned answers the fake uses.
>
> **Who uses it:** the game opens it when the player interacts with the harbor hotspot `market_hall` (one small hook in `src/game.js`). The server contract is `GET /api/market`, `GET /api/market/portfolio`, `POST /api/market/open` and `POST /api/market/close`, described in the comment at the top of `backend/server/routes/market.py` and summed up in `docs/INTERFACES.md`.

Play money only. The screen shows what the server says and sends what the player wants. **The server decides every rule**: prices, fees, zero points, limits, market hours and the automatic close at zero. This folder never calls `fetch` outside `http.js` and does no rule arithmetic. The only thing it computes is display rounding: a zero point is shown rounded toward the entry price (up for a rising position, down for a falling one), with the decimals of the company.

## What the player sees

- **Prices tab.** One card per company: name, what it follows ("Follows Bitcoin"), the real price with its currency and time, the status in words, and "Open a position". A company that cannot be opened shows the reason as text, never a silent disabled button. On top: the demo label (demo mode), "Trading opens later." (flag off), the simulation note. Data credits appear only in Settings > Credits.
- US stock opening captions show the server's `opensAt` in Lisbon time and say "Lisbon time". Price timestamps and market closing times keep the player's own time zone.
- **Open form** (inside the card): rising or falling, a stake from `rules.stakeChoices` ("100 coins + 2 fee"), the 10x note, the estimated zero point, "You can lose at most 102 coins" and the confirm button ("Open rising position for 102 coins"). Nothing is preselected, so no click opens a position by accident.
- **Your positions tab.** The coins, "Staked today", "Open positions", each open position with entry price, zero point, price now, worth now, and profit or loss in words ("Up 15 coins", "Down 20 coins"). "Close position" asks once more ("Close and receive about 113 coins?"). Below: the recently closed positions ("Closed by you: +113 coins" or "Closed at zero: ...").
- **One status line** (`role="status"`) announces results and refusals. A position that closed at zero while the panel was open is announced once ("Your falling position in Pier Post Courier reached its zero point and closed at zero.").
- A quiet button, "Read the shareholder register", closes the panel and opens card C6's search at `market_hall`, so the case stays reachable at the same hotspot.

## Files

| File | Job |
|---|---|
| `index.js` | `createMarketEntry(ctx)`: picks the adapter and loads the panel lazily. The only file that imports `http.js` or `fake.js`. |
| `panel.js` | The kit modal, the two kit tabs, polling and focus. No fetch, no rules. |
| `board-view.js`, `open-form.js`, `positions-view.js`, `parts.js` | The Prices pane, the form, the positions pane and the small DOM helpers they share. Items are built once and updated in place. |
| `view-models.js`, `words.js`, `result-words.js`, `format.js` | Pure: the exact words and numbers shown. Every status, reason and error code has plain words (a test checks the list). |
| `session.js`, `trades.js`, `poller.js`, `uid.js` | Pure logic with no DOM: the last good answers and failed-refresh notes; one uid per click and "Send again"; the refresh timer; the action id. |
| `http.js` | The HTTP mapping. The only file that calls `fetch`. |
| `fake.js`, `fixtures.js`, `fixtures-portfolio.js`, `refusals.js` | The local fake and its canned answers, in the shapes of spec section 8. |
| `market.css` | Layout, 375 px, reduced motion. |

## The adapter contract

```js
const adapter = createMarketHttpAdapter({ getToken });     // fetchImpl, makeUid and timeoutMs (10000) are optional
await adapter.board();                                     // GET  /api/market            no token is sent
await adapter.portfolio();                                 // GET  /api/market/portfolio  Bearer token
await adapter.open({ companyId, side, stake }, { uid });   // POST /api/market/open       Bearer token
await adapter.close({ positionId }, { uid });              // POST /api/market/close      Bearer token
// Every call resolves and none throws:
//   { ok: true, data }   or   { ok: false, code, message, status, retryAfterSeconds }
```

- **One `uid` per click.** `trades.js` makes it. "Send again" after an unknown outcome reuses the same uid, so a repeat answers `already_applied` (shown as "This was already done.") instead of trading twice. The browser never sends a price or a player id; the adapter only forwards the fields of the contract.
- **Unknown outcome.** A network failure, a timeout (10 s), a `504`, a `503` that does not say "nothing was done", or a `200` whose body cannot be read becomes `code: "outcome_unknown"` on open and close. The panel then refreshes the portfolio and offers "Check again" and "Send again", and no new trade starts until it is settled. After "Check again" a quiet "Forget this trade" button appears, for a trade that is not listed under Your positions and that the player no longer wants: it drops the attempt and sends nothing, so a new trade can start. The two `503` answers that say nothing happened (`market_unavailable`, `database_not_configured`) keep their own code. Reads (board, portfolio) never produce `outcome_unknown`; a failed read is `network_error`.
- **`429`** gives `retryAfterSeconds` from `Retry-After` ("Wait 7 seconds, then try again.").
- **No token** means no `Authorization` header, and the portfolio answers `401` ("Sign in to trade on the Island Exchange."). The game has no sign-in until package A2, so the board works and trading waits for it. A2 passes `getToken` to `createMarketEntry`.
- **Shape check.** An answer that is not the shape of the contract (a board without `companies` and `rules.stakeChoices`, a portfolio without `positions` and `recentlyClosed`) is `bad_response`, so the views never meet it.
- A portfolio position carries its own `currency` and `priceDecimals` (both null when its company left `companies.json`), so the panel needs no board to show its prices. If a position has none, the panel reads them from the board by `companyId`; without the board it shows two decimals and no currency.

## The local fake

In a dev build, open the game with `?market=local` (for example `http://127.0.0.1:5173/?market=local`). The panel then talks to `fake.js` instead of the server: no network, no coins, no saved progress. Add `&scenario=` with one of `mixed` (class time: islands open, one stale, Apple closed, NVIDIA without a price), `us-open`, `holiday`, `demo`, `off` (trading switched off) or `relit` (fee 1 %, Greyfathom delisted).

The fake has the same surface as the HTTP adapter and answers from `fixtures.js`. It has **no game rules**: it never works out a fee, a value, a zero point or a profit. An accepted open adds a canned position built from the board's own `zeroPrices` and `stakeChoices`; it only adds and subtracts the numbers it was given. In the browser console (dev build only), `window.__market.adapter.dev` rehearses the rest:

```js
const { dev } = window.__market.adapter;
dev.failNext('market_closed');                           // the next open or close is refused with any code of refusals.js
dev.failNext('network_error', 'board');                  // or the next board or portfolio read
dev.failNext('outcome_unknown', 'trade', { applied: true }); // the trade happens, the answer is lost: "Send again" meets already_applied
dev.signedIn(false);                                     // the sign-in line
dev.scenario('demo'); dev.reset();
```

## Polling, focus and motion

- The board refreshes every 30 s, the portfolio every 15 s while its tab is shown. Polling pauses while the page is hidden, runs at once after each action and when the page is shown again, and stops when the panel closes. A failed poll keeps the last view and says "Could not refresh (last update 12:05)". Polling never moves the focus and never announces anything except the one-time zero notice.
- Opening the panel focuses the close button (the kit default) and always starts on the Prices tab with closed forms and a clean status line. Escape closes it and the focus returns to the game. After an action the focus moves to the status line. After a trade went through (also when "Send again" finds it was already done) every form closes and clears, so nothing stale is left to press twice.
- There is no ticker, flash or slide. `market.css` also switches off any transition for `prefers-reduced-motion` and for `data-reduced-motion="true"` (the game's own setting).

## Accessibility checklist (manual, in a real browser)

Run `cd frontend && npm run dev`, open `http://127.0.0.1:5173/?market=local`, stand at the Island Exchange in the harbor (or call `window.__market` from a page that loads the entry) and check:

1. Keyboard only: open the panel with E, tab through both tabs (arrow keys, Home and End), open a form, choose side and stake with the arrow keys, open and close a position, close with Escape.
2. After Escape the focus is back on the game, and the character does not keep walking.
3. A screen reader names the dialog "Island Exchange", every card by its company, and the buttons by company ("Open a position in Apple", "Close your rising position in Saltreach Harbor Trust"). Price and status read as words in a definition list. Results and refusals are announced once.
4. Reduced motion (system setting and the game's setting): nothing moves.
5. 375 px wide: one column, no horizontal scroll, text at least 14 px (16 px for body text), touch targets at least 44 px, the modal scrolls inside the viewport.
6. "Read the shareholder register" closes the panel and opens the case search at `market_hall`.
7. With the board failing (`dev.failNext('network_error', 'board')`) the last prices stay and the note appears; with `outcome_unknown` the "Check again" and "Send again" buttons appear, and after "Check again" also "Forget this trade".

Gamepad: button A presses a focused button, link, radio button or checkbox (`src/controls/gamepad.js`) and the D-pad moves the focus, so a gamepad-only player can choose a side and a stake. A test in `tests/gamepad.test.js` covers it.

A script for these checks (`frontend/scripts/check-market.js`) needs the controller's OK because it adds a script line to `package.json`, so it is not part of this round.

## How to test

```bash
cd frontend && npm test          # tests/market/*.test.js: format, words, view models, http, fake, session, trades, poller, boundary, css
cd frontend && npm run build     # the build includes the spoiler guard
```

The tests need no network and no DOM. `boundary.test.js` keeps the team boundary: only `http.js` calls `fetch`, only `index.js` imports `http.js` or `fake.js`, every file starts with a header comment and stays under 150 lines, and no text contains an em or en dash.

## G9 application capabilities

The game supplies its explicit session's current A2 request function and separate anonymous public
client. Prices remain available when trading is closed; portfolio and trade calls require the exact
market flag and signed-in scope. No panel owns token renewal. Ordinary close retains an uncertain
trade's original action id; account or permission cleanup erases private presentation.

All requests use the shared status, report, sign-in and retry controls. A read retry stays a read.
An explicit uncertain-trade retry first completes a current portfolio read, then reuses the original
body and action id. A refused resend keeps that original uncertain attempt. The server supplies
prices, balances, rules, simulation copy and outcomes.
