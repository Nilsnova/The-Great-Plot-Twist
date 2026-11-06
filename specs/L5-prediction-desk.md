# L5 Prediction desk: implementation spec

> **What this is:** the build plan for package L5, the prediction desk at the harbor's `prediction_kiosk`. It covers hand-picked real questions from Manifold, play-coin pools that the winners share, a presenter button that settles a pool, and the kiosk screen.
>
> **Who uses it:** the server builder and the screen builder on `feat/l5-prediction-desk`, the controller who commits and merges, and Nils, who approves the rules marked *chosen here*.

- **Status:** draft, 6 Nov 2026. The rules marked *chosen here* need Nils' OK. They go into the new decision entry (section 10.2).
- **Branch:** `feat/l5-prediction-desk`, cut from `main` 3d59b6a.
- **Flag:** everything is behind `predictions`, and that flag stays OFF (Nils' decision 18). While it is off, every L5 route answers `404 feature_off`.
- **What I read:** ROADMAP.md (L5 and L6), docs/INTERFACES.md, docs/ENGINEERING.md, docs/DECISIONS.md (D004, D016, D017), `backend/server/adapters/`, `backend/server/market/`, `backend/server/weather/`, the two migrations, supabase/README.md, `backend/server/wallet.py`, OPEN-WORLD.md section 8, A2's uncommitted host-check draft (read only), and the live Manifold API docs and answers (5 and 6 Nov 2026).

## 1. The answer in one page

1. **What a player does.** At the kiosk, a captain reads up to five real questions from Manifold, all picked by hand. The captain picks YES or NO and stakes 1 to 50 play coins. Each captain stakes once per question, and at most 200 coins per Lisbon day. For each side, the kiosk shows the coins staked, how many captains staked, and about how much one coin brings back if that side wins. These "odds from the pool" are the only odds shown. The kiosk never shows Manifold's own probability and never links to a betting site. It always says: "Forecasting with play coins. Play money: no cash value. It cannot be bought or cashed out."
2. **How a pool pays out (*chosen here*).**
   - The winners share the pool in proportion to their stakes.
   - A cut of **5 % of the losing side**, rounded down, leaves the game. The design (OPEN-WORLD 8.1) took 5 % of the whole pool. I changed it so that a correct forecast never gets back less than it staked.
   - **Rounding is against nobody.** The payouts plus the cut add up to exactly the coins staked. Each payout is less than one coin away from its exact share. Leftover coins go to the stakes with the largest remainders, and on a tie to the earliest stake.
   - **Everybody gets a full refund** in three cases:
     - the question is void (Manifold says CANCEL, MKT or any other result, or the host voids it);
     - nobody picked the winning side;
     - everybody picked the same side.
3. **When staking closes.** Each question has its own closing time in the allow-list, at least 60 minutes before the moment that decides it. A question closes earlier if Manifold closes it or decides it. The database keeps the closing time it was given at the first stake and never changes it, and at every stake the earlier of that and the one the server knows at that moment counts, so a stored closing time never moves later.
4. **Settling a pool in the 23 Nov minimum.**
   - A host presses Settle YES, Settle NO or Void.
   - YES or NO works only after the pool has closed. If Manifold has already decided, the host's choice must match Manifold's. Void works at any time.
   - One SQL function pays everyone in one transaction, and a pool settles only once.
   - The ledger ref `pool:<questionId>` is a second lock against paying the same player twice.
   - A trigger on `prediction_pools` makes a settled pool final: the table refuses every later change to its row, even from the server, so a pool cannot be reopened and paid again.
   - Automatic settlement (Manifold has decided, then a 60-minute wait) comes after the minimum.
5. **Money.**
   - Two new wallet reasons: `prediction_stake` (spend, ref `stake:<stakeId>`) and `prediction_payout` (earn, ref `pool:<questionId>`, for both wins and refunds).
   - Two atomic SQL functions, `prediction_place_stake()` and `prediction_settle_pool()`. Both move coins only through `apply_wallet_transaction()`.
   - Lock order everywhere: the pool row first, then wallets in player-id order.
6. **Data.**
   - Manifold only: no key, and 500 requests a minute per IP address.
   - One `CachedSource` per question, kept for 120 s, with a 3 s timeout. A recorded real answer per question is the fallback.
   - In demo mode the server never calls Manifold.
   - Polymarket is a later backup. Never Kalshi, never Metaculus.
7. **Hosts.** A host is a signed-in player whose verified id is in `HOST_PLAYER_IDS`. A2's `require_host` is **not on `main`**: it existed only uncommitted in A2's own working copy when this was written. So L5 writes the same contract with A2's names, and A2's copy wins at merge.
8. **The five questions.** Weather comes first, and all five stay `pending` until Nils has read them:
   - Groundhog Day 2027
   - warmest year 2026
   - the opening record of *Avengers: Doomsday*
   - *The Fate of Ophelia* passing 2 billion plays
   - a song made mostly by AI in the Billboard top 20

## 2. Ownership and files

| Owner | Files |
|---|---|
| Server builder (new files) | `backend/server/predictions/` with `__init__.py` (package map), `pools.py` (pure pool rules, shared later with L6), `stake_rules.py` (the desk's numbers, pure checks, the Lisbon day), `questions.py` (loads and checks the allow-list), `manifold.py` (the only file that knows Manifold's address and field names), `source.py` (one CachedSource per question), `store.py` (database reads and the two function calls), `limits.py` (10 stakes per 30 s per player) and `desk.py` (the service). Also `backend/server/routes/predictions.py`, `backend/content/predictions/` (`questions.json`, `README.md`, `recorded/`, `samples/`), `supabase/migrations/20261106100000_prediction_desk.sql` and the tests in section 9. |
| Server builder (small edits) | `backend/server/app.py` (keyword-only `prediction_desk`, the router). `backend/server/wallet.py` (two pairs at the end). `backend/server/__init__.py` and `routes/__init__.py` (one line each). `backend/server/tests/test_wallet.py` (the reason lists). `supabase/README.md`, `docs/INTERFACES.md` (a new L5 section and table rows), `docs/DECISIONS.md` (one new entry), `.env.example`. **Only if A2 is not on `main` when you start:** `backend/server/hosts.py`, the `HOST_PLAYER_IDS` part of `settings.py`, and `test_hosts.py` and `test_host_settings.py` (section 7.2). |
| Screen builder | `frontend/src/screens/predictions/` with `desk.js`, `questions-view.js`, `stakes-view.js`, `presenter-view.js`, `view-model.js`, `adapter.js`, `adapter-http.js`, `adapter-fake.js`, `request.js`, `desk.css` and `README.md`. Also `frontend/tests/predictions/*.test.js` and one small hook in `frontend/src/game.js` (section 8.7). |
| Nobody on this branch | `vercel.json`, `.github/`, `docs/STATUS.md`, `ROADMAP.md`, `frontend/GRAPHICS.md`, `frontend/package.json`, the case adapter `frontend/src/adapter/`, the case screens in `frontend/src/screens/*.js`, `backend/server/market/`, `backend/content/README.md`. A2 is editing that last README, so the predictions folder gets its own. |

**Paths changed from the roadmap.** ROADMAP and INTERFACES reserve `backend/content/questions.json`, `backend/server/adapters/predictions.py` and `backend/server/game/pools.py`. As built, they are `backend/content/predictions/questions.json`, `backend/server/predictions/manifold.py` and `backend/server/predictions/pools.py`. That is one folder per feature, as `market/` and `weather/` already do. The decision entry records the change, and the roadmap's owner updates ROADMAP.md later.

## 3. The question allow-list

### 3.1 Files in `backend/content/predictions/`

| File | What it is |
|---|---|
| `questions.json` | The allow-list. Questions show in the order of the file, so weather questions go first. |
| `README.md` | The format, the curation checklist, how to record a Manifold answer, and the rules below. |
| `recorded/<marketId>.json` | One real Manifold answer per listed question. It is the runtime fallback and also test data. |
| `samples/<marketId>.json` | Real resolved answers used only by tests: YES, NO, CANCEL and MKT. Plus one hand-edited copy marked `"editedFrom"`, whose `token` is `CASH`, to test that refusal. |

**Recording format.** Each recording looks like this:

```json
{"recordedAt": "2026-11-05T22:46:22Z", "source": "GET https://api.manifold.markets/v0/market/<id>",
 "answer": {"id", "slug", "question", "outcomeType", "mechanism", "token", "closeTime", "isResolved",
            "resolution?", "resolutionTime?"}}
```

- **Fields kept:** only the keys listed in `answer` above.
- **Fields removed before saving:**
  - `creatorId`, `creatorUsername`, `creatorName`, `creatorAvatarUrl`, `resolverId` and `url` (the url contains the creator's username). These are personal data.
  - `probability`, `p`, `pool`, `volume`, `volume24Hours`, `totalLiquidity`. That is the market price, which we do not show.
  - `description`, `textDescription`, `groupSlugs`, `coverImageUrl`.
- **Already recorded.** 11 such files were recorded and trimmed on 5 Nov 2026 at 22:46 UTC. They cover the 5 proposed questions, 2 reserves, and resolved samples `5tuCpAqPlp` (NO), `6Ll9sZtyun` (YES), `c0uOtluyER` (CANCEL) and `99gszRZN58` (MKT). They live in `recorded/` and `samples/`. Do not record them again inside a test.

### 3.2 Format of `questions.json`

```json
{
  "format": 1,
  "questions": [
    {
      "id": "groundhog-2027",
      "source": "manifold",
      "marketId": "pRq8uqsEus",
      "text": "Will Punxsutawney Phil see his shadow on Groundhog Day, 2 February 2027?",
      "topic": "weather",
      "decidedBy": "The Punxsutawney Groundhog Club announcement on 2 February 2027, as resolved on Manifold.",
      "eventAt": "2027-02-02T12:00:00Z",
      "closesAt": "2027-02-01T23:00:00Z",
      "reviewedBy": "pending",
      "reviewedOn": "pending"
    }
  ]
}
```

| Field | Rule |
|---|---|
| `id` | 2 to 40 characters from a-z, 0-9 and hyphen, and unique. It is the pool key in the database and `questionId` in the API. Never rename or remove a question while its pool is unsettled. |
| `source` | Only `"manifold"` is accepted. `"kalshi"` and `"metaculus"` are refused with the reason: Kalshi's terms forbid caching and sharing, and Metaculus needs an account and hides the numbers. `"polymarket"` and `"weather"` are refused as "reserved, not built yet". |
| `marketId` | 6 to 40 letters and digits, and unique. It is the only value ever put into the Manifold address, and it never comes from a request. |
| `text` | Our own wording, 10 to 140 characters, ending with `?`, with no blocked word (whole words, any case). It must mean exactly what the Manifold question means. |
| `topic` | One of `weather`, `science`, `technology`, `culture`, `sport`. |
| `decidedBy` | 10 to 160 characters saying in plain words who decides, ending "as resolved on Manifold." It is shown on screen. |
| `eventAt` | Optional. The UTC time when the outcome is decided. If it is given, `closesAt` must be at least 60 minutes earlier. |
| `closesAt` | UTC time with a `Z`, when staking closes. |
| `reviewedBy`, `reviewedOn` | The person who read the Manifold question and its description, and the date (YYYY-MM-DD). `"pending"` in either field means the question is loaded but never shown and never stakeable: the routes answer `404 no_such_question`. This puts the rule "a human reads every question" into the code. |

**What the loader checks.** `questions.py` raises `QuestionsError` when:

- the file is not 1 to 40 questions;
- an `id` or `marketId` appears twice;
- any field rule above fails.

The error message names the question and the field, as `companies.py` does. If the file is broken, the desk does not start: its routes answer `503 predictions_unavailable` and the rest of the API keeps working (the `market_or_none` pattern).

**Blocked words.** This is the second guard after the human review. It matches whole words in any case, in our `text`, and a test also runs it over the recorded Manifold `question`:

- violence: war, wars, kill, killed, killing, attack, attacks, bomb, nuclear, terror, terrorist, shooting, shot, murder
- death: dead, die, dies, death, deaths, dying, suicide
- politics: election, elections, vote, votes, president
- adult and personal: sex, porn, drug, drugs, pregnant, pregnancy

Matching on substrings is wrong. In the candidate search, the substring "war" flagged every "warmest" and "warming" question.

### 3.3 Curation checklist (goes into the README)

Only accept a question that meets all of these:

- binary (`outcomeType` BINARY), on play money (`token` MANA), with at least 10 bettors;
- with a clear rule in the Manifold description;
- not about a private person, and not an "I" or "my" market;
- free of politics, elections, war, death and adult topics, and not a disaster count.

Then:

1. **Prefer questions decided at one known moment.** Avoid "will X happen before date Y". News can settle those before Manifold resolves them, and before our pool closes.
2. **Set `closesAt` at least 60 minutes before the deciding moment,** and before Manifold's `closeTime`.
3. **Read the Manifold description again on the day you review.** A creator can change it later. If the meaning changes after our review, the host voids the pool.
4. **Record one answer with a single `curl` outside the tests,** and trim it with the field list in 3.1.

### 3.4 The five proposed questions and the reserves

All are open, binary and MANA as recorded on 5 Nov. Every one stays `pending` until Nils reads it.

| # | `id` | `marketId` | Our `text` | Topic | `eventAt` (UTC) | `closesAt` (UTC) | Manifold close | Note |
|---|---|---|---|---|---|---|---|---|
| 1 | `groundhog-2027` | `pRq8uqsEus` | Will Punxsutawney Phil see his shadow on Groundhog Day, 2 February 2027? | weather | 2027-02-02T12:00:00Z | 2027-02-01T23:00:00Z | 2027-02-02 23:59 | The rule is clear (the Groundhog Club's announcement). Weather folklore. |
| 2 | `warmest-year-2026` | `q68phStPls` | Will 2026 be the warmest year on record? | weather | 2027-01-08T00:00:00Z | 2026-12-01T00:00:00Z | 2026-12-31 23:59 | **The description is empty**, so the creator does not say whose record counts. Nils keeps it or swaps in reserve A. It closes early because the monthly data reveals the answer bit by bit. |
| 3 | `avengers-opening-record` | `tyNgzgQQQc` | Will Avengers: Doomsday set a new record for the biggest North American opening weekend? | culture | 2026-12-17T23:00:00Z | 2026-12-17T12:00:00Z | 2026-12-26 01:16 | `decidedBy`: Box Office Mojo, domestic opening weekend above 360,091,572 dollars, as resolved on Manifold. Check the release date (Fri 18 Dec 2026, US previews on Thu 17) before you fill in the times. |
| 4 | `ophelia-two-billion` | `uyczEh8yAh` | Will The Fate of Ophelia pass 2 billion plays on Spotify by the end of 2026? | culture | 2026-12-31T23:59:00Z | 2026-12-15T00:00:00Z | 2026-12-31 23:59 | Spotify's public counter decides it. It closes two weeks early because the count is public and grows every day. |
| 5 | `ai-song-top-20` | `9qO6y9sEId` | Will a song made mostly by AI reach the top 20 of the Billboard Hot 100 before 2027? | technology | (none) | 2026-12-01T00:00:00Z | 2026-12-31 23:59 | A "before" question with 401 bettors. Manifold resolves it the way a Metaculus question resolves; we never call Metaculus. It closes a month early. |
| A | `berkeley-earth-2026` | `X3De8lrtBV1A8E63QA2p` | Will Berkeley Earth report 2026 global warming of 1.5 °C or more? | weather | 2027-01-13T00:00:00Z | 2026-12-01T00:00:00Z | 2027-01-13 07:59 | Reserve for #2. The rule is clear, but the answer looks nearly certain. |
| B | `world-chess-2026` | `CqssL2NltN` | Will Gukesh keep his title at the 2026 World Chess Championship? | sport | 2026-11-24 (game 1) | 2026-11-23T23:00:00Z | 2026-12-31 22:59 | Reserve, usable only if the desk opens before 24 Nov. The match runs 24 Nov to 12 Dec in Geneva (Wikipedia summary, read on 6 Nov). |

## 4. Manifold read client

### 4.1 Facts checked on 6 Nov 2026

Checked in the docs at docs.manifold.markets/api and in live answers:

- **Address and access.** `GET https://api.manifold.markets/v0/market/{marketId}` needs no key and no sign-in.
- **Rate limit.** 500 requests a minute per IP address. Using several addresses to get around the limit is not allowed.
- **Stability.** The API is labelled alpha and may change. So the parser is strict, and the recorded fallback covers a change.
- **Terms.** The Terms of Service govern use. Integrations are a permitted use; scraping outside the API and dodging the limit are not. I found no clause asking for credit. We credit Manifold in text anyway, as the roadmap asks, and Discord is the place to ask about showing question text (OPEN-WORLD 8.2).
- **`token`.** `MANA` or `CASH` (prize cash). The field is optional. A missing token counts as MANA, and `CASH` is refused.
- **`closeTime`.** Milliseconds since 1970. It is the earlier of the creator's chosen date and the resolution time, so a market resolved early shows its resolution time as `closeTime`.
- **`resolution`.** Values seen on resolved binary markets: `YES`, `NO`, `CANCEL`, `MKT`. `resolutionTime` is in milliseconds. An unresolved answer has no `resolution` or `resolutionTime` key at all.

### 4.2 `manifold.py`

```python
MANIFOLD_API = "https://api.manifold.markets/v0"
TIMEOUT_SECONDS = 3.0
MARKET_ID_CHARACTERS = set(string.ascii_letters + string.digits)

@dataclass(frozen=True)
class MarketState:
    market_id: str
    closes_at: datetime | None   # Manifold's closeTime, UTC
    is_resolved: bool
    decided_as: str | None       # "yes", "no", "void" (CANCEL, MKT, anything else); None while open
    decided_at: datetime | None  # resolutionTime, UTC

class ManifoldAnswerError(ValueError): ...

def parse_market(answer: object, expected_id: str) -> MarketState: ...
async def fetch_market(market_id: str, transport: httpx.AsyncBaseTransport | None = None) -> MarketState: ...
```

- **`parse_market` refuses an answer** when:
  - its id is not `expected_id`;
  - `outcomeType` is not `BINARY`;
  - `token` is `CASH`;
  - `isResolved` is not a true/false value;
  - `closeTime` is not a whole number;
  - the answer is resolved but `resolution` is not text.
- **Mapping.** YES becomes `yes`, NO becomes `no`, and everything else becomes `void`.
- **`fetch_market`** checks the id's characters before it builds the address, calls httpx with the timeout and `raise_for_status()`, then parses the answer. A 429, a 5xx, a timeout or a parse error all count as a failed fetch, so `CachedSource` falls back.
- **Logging.** Never log the answer body.

### 4.3 `source.py`

- `make_question_sources(questions, settings, transport=None, clock=utc_now, folder=CONTENT_FOLDER) -> dict[str, CachedSource]` builds one source per listed question:
  - name `manifold:<questionId>`, `ttl_seconds=120`, `timeout_seconds=3.0`;
  - fallback `RecordedData(parse_market(recording["answer"], marketId), recordedAt)`.
- A missing or broken recording logs a warning, and that question has no fallback. A test makes sure every listed question has a valid recording.
- **Demo mode** uses `RecordedOnlySource`. It is a 3-line subclass whose `can_call_outside()` returns `False`, the same as in `weather/source.py`. A later clean-up can move both into `adapters/base.py`. Do not import it from `weather/`.
- **Call budget.**
  - 5 questions every 120 s is 2.5 calls a minute per server instance; 40 questions would be 20 a minute.
  - The limit is 500 a minute per IP address. Vercel instances share addresses with other customers, so Manifold can answer 429 even when we are quiet. Then the source shows the last good answer (`stale`) or the recording (`fallback`).

### 4.4 How the desk uses a reading

- **Real readings.** `live`, `cache` and `stale` are real readings; `fallback` is the recording.
- **`manifold.state`.**
  - `decided` when the market is resolved;
  - `closed` when `closes_at` is now or earlier;
  - `open` otherwise;
  - `unknown` when the only data, outside demo mode, is the recording, or when there is no data at all.
- **Effective closing time.** The earliest of: the allow-list `closesAt`, Manifold's `closeTime` (when known), and the stored `prediction_pools.closes_at` (when a pool row exists).
- **Staking** needs `manifold.state == "open"`. Outside demo mode, a fallback-only reading means `503 source_unavailable`.
- **A stale reading is good for 15 minutes (*chosen here*).** A `stale` reading (the last good answer, kept because Manifold cannot be reached) older than `STALE_LIMIT_FOR_STAKE` (15 minutes) is still shown, and it still limits what a host may settle, but nobody may stake on it: the market may have been decided since, and the news could reach some captains first. A stake then answers `503 source_unavailable`, and `canStake` is false. The recording in demo mode is never held to this limit.

## 5. Pool rules as pure functions

### 5.1 `pools.py` (shared with L6)

This file has no input or output, no clock and no settings. It works for 2 or 3 outcomes, because L6 adds home, draw and away.

```python
VOID = "void"

@dataclass(frozen=True)
class Stake:
    row_id: int      # prediction_stakes.id: the order stakes were placed, used for ties
    player_id: str
    side: str
    amount: int      # whole coins, at least 1

@dataclass(frozen=True)
class Payout:
    row_id: int
    player_id: str
    coins: int

@dataclass(frozen=True)
class SettlementPlan:
    settlement: str  # "winners", "refund_void", "refund_no_winners", "refund_one_sided"
    cut: int
    payouts: tuple[Payout, ...]   # one per paid stake; losing stakes get no Payout

def cut_for(losing_coins: int, cut_percent: int) -> int              # losing_coins * cut_percent // 100
def plan_settlement(stakes: Sequence[Stake], outcome: str, cut_percent: int) -> SettlementPlan
def refund_everyone(stakes: Sequence[Stake], settlement: str) -> SettlementPlan
def share_among_winners(winners: Sequence[Stake], shared_coins: int) -> tuple[Payout, ...]
def coins_by_side(stakes: Sequence[Stake]) -> dict[str, int]
def payout_per_coin(coins_by_side: Mapping[str, int], side: str, cut_percent: int) -> Decimal | None
```

**The rule.** Write T for all coins in the pool, W for the coins on the winning side (0 when the outcome is `void`), and L = T - W.

- **Refund everyone** (each stake back in full) when:
  - the outcome is `void` (settlement `refund_void`);
  - W = 0 (`refund_no_winners`);
  - L = 0 (`refund_one_sided`).
- **Otherwise share** (`winners`):
  - cut = floor(L x 5 / 100), and the shared coins D = T - cut. D is at least W, so every winner gets at least their stake back.
  - Each winner's whole share is (amount x D) // W, and the remainder is (amount x D) % W.
  - The leftover, D minus the sum of the whole shares, is fewer than the number of winners. The stakes with the largest remainders get one extra coin each, and on a tie the lowest `row_id` goes first.
  - Name the sort key function (`remainder_order`) instead of writing a lambda.
- **Rounding against nobody:**
  - the payouts plus the cut equal T;
  - every payout is at least the stake;
  - every payout is less than one coin from amount x D / W;
  - the pool never creates coins.

**Worked examples** (these are the test cases):

| Case | Stakes (row id: side, coins) | Outcome | Result |
|---|---|---|---|
| A | 1: yes 30, 2: yes 20, 3: no 50 | yes | T 100, L 50, cut 2, D 98. Exact shares 58.8 and 39.2, whole shares 58 and 39, 1 coin left goes to row 1. Payouts 59 and 39, cut 2. |
| B | 1: yes 1, 2: yes 1, 3: yes 1, 4: no 1 | yes | T 4, cut 0, D 4. Whole shares 1, 1, 1 with equal remainders; the leftover coin goes to row 1. Payouts 2, 1, 1. |
| C | 1: yes 10, 2: no 190 | yes | cut 9 (9.5 rounded down), D 191. Row 1 gets 191. |
| D | 1: yes 40, 2: yes 10 | yes | `refund_one_sided`: 40 and 10 back. |
| E | 1: yes 40, 2: no 10 | no | Row 2 wins: L 40, cut 2, D 48, row 2 gets 48. |
| F | 1: no 25 | yes | `refund_no_winners`: 25 back. |
| G | any | void | `refund_void`: every stake back. |
| H | (no stakes) | yes | `refund_no_winners`, no payouts. |

**`payout_per_coin`** is display only. Write W_S for the coins on side S and L_S = T - W_S.

- It is `None` when W_S = 0.
- It is `1.00` when L_S = 0, because the pool would be refunded.
- Otherwise it is (T - cut_for(L_S, 5)) / W_S, rounded **down** to 2 decimals, so the screen never promises more than the pool pays.

### 5.2 `stake_rules.py`

```python
MIN_STAKE = 1
MAX_STAKE = 50
DAILY_STAKE_CAP = 200            # per Lisbon day, counted from prediction_stakes
POOL_CUT_PERCENT = 5             # of the losing side (chosen here)
MIN_MINUTES_BEFORE_EVENT = 60    # used by the allow-list loader
SETTLE_GRACE_MINUTES = 60        # automatic settlement only, after the minimum
DESK_TIMEZONE_NAME = "Europe/Lisbon"

def check_stake_amount(amount: int) -> None             # 422 stake_too_small below 1 (also 0 and -3), 422 stake_too_big above 50
def desk_day_start(now: datetime) -> datetime          # the latest 00:00 Lisbon time, in UTC; UTC if there is no tz data
def effective_closes_at(*times: datetime | None) -> datetime   # the earliest time that is given
def is_staking_open(closes_at: datetime, now: datetime) -> bool  # now < closes_at
def coins_left_today(staked_today: int) -> int          # max(0, DAILY_STAKE_CAP - staked_today)
```

- The numbers are named constants, each with a test, as the Exchange does.
- OPEN-WORLD's idea of keeping these numbers in JSON is not followed. D017 set the precedent of constants in Python.
- The time zone loader uses the same fallback as `market/rules.py`, but this file has its own copy. Do not import from `market/`, because the Exchange v2 rework is in flight.

## 6. Database: `supabase/migrations/20261106100000_prediction_desk.sql`

**Shape of the file.** It copies the Exchange file's layout: a header with what it does, who uses it, the rules the database keeps, what it needs, why it is safe to run twice, and how the file is organised. There is a plain-English comment above every statement, and a `comment on` for every table, column, view, policy and function. It runs after the foundation and Exchange migrations; its timestamp also sorts after A2's (020000 and 030000), A6's (040000), A4's (050000) and L2's (070000).

**1. Wallet reasons.** Use the exact shape `test_wallet_matches_migration.py` reads, with no apostrophes:

```sql
insert into public.wallet_reasons (reason, direction, description) values
  ('prediction_stake',  'spend', 'Coins staked on a question at the prediction desk.'),
  ('prediction_payout', 'earn',  'Coins paid back from a prediction desk pool, for a win or a refund.')
on conflict (reason) do nothing;
```

In Python, append `("prediction_stake", SPEND), ("prediction_payout", EARN)` at the **end** of `WALLET_REASONS`, with the comment `# Added by supabase/migrations/20261106100000_prediction_desk.sql (the prediction desk).`

**2. `prediction_pools`.** One row per question, created by the first stake or by the settlement:

```sql
create table if not exists public.prediction_pools (
  question_id text primary key,
  closes_at   timestamptz not null,
  status      text not null default 'open',
  outcome     text,
  settlement  text,
  settled_by  text,
  settled_at  timestamptz,
  cut_coins   bigint,
  paid_coins  bigint,
  created_at  timestamptz not null default now(),
  constraint prediction_pools_question_id_format check (question_id ~ '^[a-z0-9-]{2,40}$'),
  constraint prediction_pools_status_allowed check (status in ('open', 'settled')),
  constraint prediction_pools_outcome_allowed check (outcome is null or outcome in ('yes', 'no', 'void')),
  constraint prediction_pools_settlement_allowed check (settlement is null or settlement in
    ('winners', 'refund_void', 'refund_no_winners', 'refund_one_sided')),
  constraint prediction_pools_settled_by_allowed check (settled_by is null or settled_by in ('host', 'auto')),
  constraint prediction_pools_void_is_refunded check (outcome is distinct from 'void' or settlement = 'refund_void'),
  constraint prediction_pools_state_is_complete check (
    (status = 'open' and outcome is null and settlement is null and settled_by is null
       and settled_at is null and cut_coins is null and paid_coins is null)
    or (status = 'settled' and outcome is not null and settlement is not null and settled_by is not null
       and settled_at is not null and cut_coins >= 0 and paid_coins >= 0))
);
```

**3. `prediction_stakes`.** One row per stake. Rows are never deleted except when their player is deleted (cascade):

```sql
create table if not exists public.prediction_stakes (
  id          bigint generated always as identity primary key,
  question_id text not null references public.prediction_pools (question_id),
  player_id   uuid not null references public.profiles (id) on delete cascade,
  side        text not null,
  amount      bigint not null,
  stake_id    text not null,
  ref         text not null,
  payout      bigint,
  created_at  timestamptz not null default now(),
  constraint prediction_stakes_side_allowed check (side in ('yes', 'no')),
  constraint prediction_stakes_amount_above_zero check (amount > 0),
  constraint prediction_stakes_stake_id_format check (stake_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  constraint prediction_stakes_ref_from_stake_id check (ref = 'stake:' || stake_id),
  constraint prediction_stakes_payout_not_negative check (payout is null or payout >= 0)
);
create unique index if not exists prediction_stakes_one_per_stake_id on public.prediction_stakes (player_id, stake_id);
create unique index if not exists prediction_stakes_one_per_question on public.prediction_stakes (question_id, player_id);
create index if not exists prediction_stakes_player_id_idx on public.prediction_stakes (player_id, id desc);
create index if not exists prediction_stakes_question_side_idx on public.prediction_stakes (question_id, side);
```

- The pool table holds no running totals. The totals come from the stakes, so they cannot drift.
- If a player is deleted while a pool is open, their stake row goes and those coins simply leave the game. No coin is ever created. This is a documented limit.

**4. The view `prediction_pool_sides`.** It is for the server only:

```sql
create or replace view public.prediction_pool_sides with (security_invoker = true) as
  select question_id, side, count(*)::integer as players, sum(amount)::bigint as coins
    from public.prediction_stakes group by question_id, side;
```

**5. Row-level security.**

- RLS is on for both tables.
- Pools: `"Players can read all prediction pools"`, a select policy for `authenticated` using `true`. Pool rows hold no personal data.
- Stakes: `"Players can read their own prediction stakes"`, a select policy using `player_id = (select auth.uid())`.
- There is no insert, update or delete policy on either table.

**6. Privileges.** This is the second lock, and the update rights are per column:

```sql
revoke all on table public.prediction_pools, public.prediction_stakes, public.prediction_pool_sides
  from public, anon, authenticated, service_role;
revoke all on sequence public.prediction_stakes_id_seq from public, anon, authenticated, service_role;
grant select on table public.prediction_pools, public.prediction_stakes to authenticated;
grant select, insert on table public.prediction_pools to service_role;
grant update (status, outcome, settlement, settled_by, settled_at, cut_coins, paid_coins)
  on table public.prediction_pools to service_role;
grant select, insert on table public.prediction_stakes to service_role;
grant update (payout) on table public.prediction_stakes to service_role;
grant select on table public.prediction_pool_sides to service_role;
```

- `select ... for update` needs the update right on at least one column, and the column grants give exactly that.
- The server cannot change who staked what or how much, and it cannot delete a stake or a pool.

**6a. The trigger `prediction_pools_keep_settled()`.** A settled pool is final. A `before update ... for each row` trigger raises `pool_settled` for any update of a row whose status is `settled`, so even a server bug that wrote the table directly cannot reopen a pool and settle it again with the other outcome (the ref `pool:<questionId>` alone would stop only a second payout to the same player). Nobody may run the trigger function by hand (`revoke all ... from public, anon, authenticated, service_role`).

**7. `prediction_place_stake()`.** This is the only way a stake happens. Python passes the limits as arguments, so the numbers live in `stake_rules.py` only.

```sql
create or replace function public.prediction_place_stake(
  p_player_id uuid, p_question_id text, p_side text, p_amount bigint, p_stake_id text,
  p_closes_at timestamptz, p_max_stake bigint, p_daily_cap bigint, p_day_start timestamptz)
returns jsonb language plpgsql set search_path = '' as $$ ... $$;
```

The steps, in order:

1. **Check the arguments.** Raise `bad_stake` if any of these fail: side is yes or no; 1 <= amount <= p_max_stake; p_max_stake >= 1; p_daily_cap >= 0; p_closes_at and p_day_start are not null; p_day_start is not later than now() plus 1 minute; the stake id matches `^[A-Za-z0-9_-]{8,64}$`; the question id matches `^[a-z0-9-]{2,40}$`.
2. **Make sure the pool row exists, then lock it.** `insert into public.prediction_pools (question_id, closes_at) values (p_question_id, p_closes_at) on conflict (question_id) do nothing;`, then `select status, closes_at ... for update`.
3. **Lock the wallet row** with `for update`, always after the pool. Raise `wallet_not_found` if there is none.
4. **Refuse a repeat.** If this player already used this stake id, `raise exception 'already_applied' using errcode = '23505'`. This is the answer to a repeat, whatever else has changed since.
5. **Check the pool is open.** If the status is not `open`, or `now() >= least(stored closes_at, p_closes_at)`, return `{"status":"refused","reason":"pool_closed"}`.
6. **One stake per question.** If this player already has a stake on this question, return `{"status":"refused","reason":"already_staked","side","amount"}`. Check it explicitly: the unique index would raise 23505, which the server would wrongly read as `already_applied`.
7. **Daily cap.** Sum the player's stakes with `created_at >= p_day_start`. If that sum plus the amount is over the cap, return `{"status":"refused","reason":"daily_cap","coinsLeft"}`.
8. **Take the coins** with `public.apply_wallet_transaction(p_player_id, -p_amount, 'prediction_stake', 'stake:' || p_stake_id)`. `insufficient_funds` cancels everything.
9. **Insert the stake row,** with `ref = 'stake:' || p_stake_id`.
10. **Return** `{"status":"done","balance","stakedToday","sides":[{"side","coins","players"}]}`, with the sides of this question taken from the stakes.

**8. `prediction_settle_pool()`.** The server works out the payouts in `pools.py`, and the database checks them, as `market_trade()` checks the arithmetic of a trade.

```sql
create or replace function public.prediction_settle_pool(
  p_question_id text, p_outcome text, p_closes_at timestamptz, p_cut_percent integer,
  p_payouts jsonb,   -- [{"stakeRowId": 12, "coins": 34}, ...]
  p_settled_by text)
returns jsonb language plpgsql set search_path = '' as $$ ... $$;
```

The steps, in order:

1. **Check the arguments.** Raise `bad_settlement` if any of these fail: outcome is yes, no or void; 0 <= cut <= 100; settled_by is host or auto; p_closes_at is not null; p_payouts is a JSON array; the question id format is right.
2. **Make sure the pool row exists** (insert, on conflict do nothing) **and lock it** with `for update`. An empty pool is settled too, so no stake can arrive later.
3. **A pool settles once.** If the status is `settled`, `raise exception 'already_applied' using errcode = '23505'`.
4. **YES or NO only after closing.** If the outcome is not `void` and `now() < least(stored closes_at, p_closes_at)`, return `{"status":"refused","reason":"pool_open","closesAt"}`.
5. **Read the pool from its stakes.** Take T, W and L from the stake rows, under the pool lock. No stake can be inserted now, because the stake function locks the pool first.
6. **Decide the settlement** exactly as in `pools.py`: `refund_void`, then `refund_no_winners`, then `refund_one_sided`, otherwise `winners`. The cut is 0 for refunds and `(L * p_cut_percent) / 100` otherwise, and D = T - cut.
7. **The payouts must name exactly the stakes that get paid.** For a refund that is every stake; for a win, every winning stake. Compare the number of given rows, the number of distinct given ids, the number expected and the number that match. If they differ, return `{"status":"refused","reason":"stakes_changed"}`; this can only happen when a void races a deletion.
8. **The numbers must add up.** The sum of the payouts must equal D, each payout must be at least 1, a refund must equal the stake, and a win must satisfy `abs(coins * W - amount * D) < W`. Otherwise raise `bad_settlement`.
9. **Pay in player-id order** with `public.apply_wallet_transaction(player_id, coins, 'prediction_payout', 'pool:' || p_question_id)`. Every function locks in the same order (pool, then wallets by player id), so two settles or a settle and a stake cannot deadlock.
10. **Write each stake's payout,** 0 for the losing side.
11. **Mark the pool settled:** status, outcome, settlement, settled_by, settled_at = now(), cut_coins and paid_coins.
12. **Return** `{"status":"done","settlement","paidPlayers","paidCoins","cutCoins","settledAt"}`.

**Grants and errors for both functions.**

- `revoke all ... from public, anon, authenticated; grant execute ... to service_role`. Neither is SECURITY DEFINER.
- How errors reach the server through `supabase_admin.py`:
  - 23505 becomes `AlreadyApplied` (409);
  - `insufficient_funds` (P0001) becomes 409;
  - `bad_stake`, `bad_settlement` and `wallet_not_found` become 502 `database_error`. Those three mean the server has a bug.

## 7. Routes: `backend/server/routes/predictions.py`

The comment at the top of the file is the contract, in the style of `routes/market.py`. JSON keys are camelCase. Every route first checks `is_enabled("predictions", settings.flags)` and answers `404 feature_off` ("The prediction desk is closed for now.") when it is off. For signed-in routes the `PlayerDep` sign-in check runs first, as in the Exchange.

### 7.1 The four routes

| Route | Who | What it does |
|---|---|---|
| `GET /api/predictions` | anyone | The questions, their pools and the rules. It takes no query parameters (`422 validation_error`). Sent with `Cache-Control: public, max-age=10, s-maxage=10`. |
| `GET /api/predictions/mine` | signed in | Your coins, today's stakes, your stakes and results (newest first, at most 50), and `host` (true or false). Sent with `Cache-Control: private, no-store`. |
| `POST /api/predictions/stake` | signed in | `{questionId, side: "yes"\|"no", amount, stakeId}`, with any extra field refused. `amount` is a `StrictInt`. `stakeId` is 8 to 64 characters from `[A-Za-z0-9_-]`, made once per confirmed click and sent again on a retry. The ledger ref is `stake:<stakeId>`. |
| `POST /api/predictions/settle` | host only | `{questionId, outcome: "yes"\|"no"\|"void"}`. The question id is the repeat key, because a pool settles once. A repeat answers `409 already_applied`. A retry after a 503 is always safe. |

```text
GET /api/predictions
200 {"questions": [{"id": "avengers-opening-record", "text": "...", "topic": "culture",
       "decidedBy": "...", "closesAt": "2026-12-17T12:00:00Z",
       "status": "open" | "closed" | "settled", "canStake": true,
       "outcome": null | "yes" | "no" | "void",
       "settlement": null | "winners" | "refund_void" | "refund_no_winners" | "refund_one_sided",
       "settledAt": null,
       "manifold": {"state": "open" | "closed" | "decided" | "unknown", "decidedAs": null, "decidedAt": null},
       "sides": [{"side": "yes", "label": "Yes", "coins": 120, "players": 4, "payoutPerCoin": 1.62},
                 {"side": "no",  "label": "No",  "coins": 80,  "players": 3, "payoutPerCoin": 2.43}],
       "totalCoins": 200, "source": "cache", "fetchedAt": "2026-11-20T10:02:11Z"}],
     "rules": {"minStake": 1, "maxStake": 50, "dailyCap": 200, "cutPercent": 5, "cutOf": "losing side",
               "dayStarts": "00:00 Europe/Lisbon"},
     "attribution": "Questions and results: Manifold Markets (manifold.markets), a play-money forecasting site.",
     "playMoney": "Forecasting with play coins. Play money: no cash value. It cannot be bought or cashed out."}

GET /api/predictions/mine
200 {"coins": 940, "stakedToday": 70, "leftToday": 130, "dailyCap": 200, "host": false,
     "stakes": [{"questionId", "text", "side", "amount", "placedAt", "status", "result": null | "won" | "lost" | "refunded",
                 "payout": null | 34, "settlement", "outcome", "settledAt"}]}

POST /api/predictions/stake  ->  200 {"questionId", "side", "amount", "coins", "stakedToday", "leftToday", "sides", "totalCoins"}
POST /api/predictions/settle ->  200 {"questionId", "outcome", "settlement", "settledAt", "paidPlayers", "paidCoins", "cutCoins"}
```

**What the fields mean.**

- `canStake` is true only when all of these hold: the status is open, the effective closing time has not passed, `manifold.state` is `open`, and the reading is real (or demo mode is on) and, if it is `stale`, at most 15 minutes old. The browser never decides this.
- `source` and `fetchedAt` are `null` when there is no data at all.
- The answer never contains Manifold's probability, and a test checks that.
- `result` follows from the pool: `winners` with a payout above 0 is `won`, `winners` with a payout of 0 is `lost`, and any `refund_*` is `refunded`.

**Order of checks for a stake.**

1. The speed limiter (`limits.py`, 10 in 30 s, else 429 with `Retry-After`). It is a copy of the Exchange limiter with stake wording, because the Exchange limiter's message says "trading" and `market/` is off limits on this branch.
2. Is this stake id already in `prediction_stakes`? Then `409 already_applied`. This comes first.
3. Is the question on the list and reviewed? Otherwise `404 no_such_question`.
4. `check_stake_amount`.
5. The Manifold reading: `503 source_unavailable`, or `409 pool_closed` if Manifold has closed or decided the question.
6. A time pre-check: `409 pool_closed`.
7. `validate_transaction(-amount, "prediction_stake", ref)`.
8. `prediction_place_stake()`.

**Order of checks for a settlement.**

1. The host check (401 or 403), then the flag (404).
2. Is the question on the list? Otherwise 404.
3. Is the pool already settled? Then `409 already_applied`, with a message that names the outcome.
4. The Manifold cross-check: if the reading is real and the question is decided as yes or no, a different yes or no is `409 outcome_conflict`. If Manifold decided `void`, only `void` is allowed. `void` is always allowed. A fallback reading has no cross-check, and the host's word stands.
5. For yes or no before closing: `409 pool_open`.
6. Read the stakes (`order=id.asc`, at most 10,000), run `plan_settlement`, then call `prediction_settle_pool()`.
7. If the answer is `stakes_changed`, read and plan once more. A second `stakes_changed` is `409 stakes_changed`.
8. Log one INFO line with the question id, the outcome, the settlement, the number of payouts and the coins. Never log player ids.

**Every error.** All of them use the standard error shape:

| Status | Code | When (and the plain message) |
|---|---|---|
| 401 | `unauthorized` | No token, or a bad one. |
| 403 | `forbidden` | Settling when you are not a host: "Only a host can do this." The first route to use 403. |
| 404 | `feature_off`, `no_such_question` | The flag is off. Or: "That question is not on the prediction desk." |
| 409 | `already_applied` | Stake: "This stake was already placed." Settle: "This question was settled already: YES won." Treat it as done. |
| 409 | `pool_closed` | "Staking on this question has closed." One variant adds "...on Manifold". |
| 409 | `already_staked` | "You already staked 20 coins on YES for this question. One stake per question." |
| 409 | `daily_stake_cap` | "You can stake at most 200 coins a day at the desk. You can still stake 30 coins today." |
| 409 | `insufficient_funds` | From the wallet. |
| 409 | `pool_open` | "Staking is open until Thu 17 Dec 12:00 UTC. Settle it after that, or void it." |
| 409 | `outcome_conflict` | "Manifold decided this question as NO. Settle it as no, or void it." |
| 409 | `stakes_changed` | "The pool changed while it was being settled. Try again." |
| 422 | `validation_error`, `stake_too_small`, `stake_too_big` | A malformed body; "A stake must be at least 1 coin."; "You can stake at most 50 coins on one question." |
| 429 | `too_many_requests` | "You are staking very fast. Wait a few seconds, then try again." Sent with `Retry-After`. |
| 503 | `predictions_unavailable`, `source_unavailable`, `database_unavailable`, `database_not_configured` | `database_unavailable` on a stake means the outcome is unknown. Retrying with the **same** stakeId is safe. |

### 7.2 The host check

- **What exists.** `require_host` is **not on `main`**: `git grep` finds no `require_host`, `HostDep` or `HOST_PLAYER_IDS` at 3d59b6a or at main's tip c71f8a5. A2's draft exists only uncommitted, in A2's own working copy. The STATUS line on main says A2 merges on Fri 6.
- **If A2 is on `main` when you start:** import `HostDep` from `server.hosts` and write nothing else.
- **If not, write A2's contract exactly:**
  - `backend/server/hosts.py` with `require_host(player, settings) -> Player`, `get_current_host` and `HostDep`;
  - `Settings.host_player_ids: frozenset[str]`, read from `HOST_PLAYER_IDS`: comma-separated UUIDs, each written in canonical lowercase. A bad item stops the server with a `SettingsError` that says where the item is but never repeats it;
  - the `.env.example` line `# [SERVER ONLY] Player ids ... of the hosts who may use presenter routes ... Empty means nobody is a host and every presenter route answers 403.` followed by `HOST_PLAYER_IDS=`;
  - add `HOST_PLAYER_IDS` to `SETTING_NAMES` in `test_app.py`.
- **How it behaves.** The login check runs first (401). A signed-in player who is not on the list gets `403 forbidden`. An empty list means 403 for everybody. The id always comes from the verified token.
- **At merge,** the controller keeps A2's copy of these files.

### 7.3 Wiring the desk into the app

- `create_app(..., *, prediction_desk: PredictionDesk | None = None)` is keyword-only. When it is `None`, call `desk_or_none(settings)`, which returns `None` and logs the error if the allow-list or the content is broken.
- Store the desk as `app.state.predictions`.
- `get_desk` answers `503 predictions_unavailable` when the desk is `None`. Routes use `DeskDep`.
- `desk_from_settings(settings, transport=None, clock=utc_now, folder=CONTENT_FOLDER)` builds the real desk. Building it never calls the network: sources fetch only when they are asked.
- Register the router with `app.include_router(predictions.router, prefix="/api")`.

## 8. The kiosk screen (`frontend/src/screens/predictions/`)

### 8.1 Files

Keep each file under about 150 lines, with a header comment and plain names (ENGINEERING section 1). The case screens' dense one-line style is not the model.

| File | Job |
|---|---|
| `desk.js` | `createDesk({container, resetInput, focus}) -> {open(), close(), dispose(), get active()}`. It builds a kit `createModal` titled "Prediction kiosk" with kit `createTabs`: Questions, My stakes, and Presenter (shown only when `mine().host`). It refreshes when opened, after every action, and every 30 s while open. It stops refreshing when closed and never polls in the background. |
| `questions-view.js` | The question cards and the stake form. DOM only. |
| `stakes-view.js` | "My stakes" with results, and today's total. DOM only. |
| `presenter-view.js` | For each question: the Manifold state, our pool state, and Settle YES, Settle NO, Void, each with a confirm step. DOM only. |
| `view-model.js` | Pure: turns answers into display text, maps error codes to plain sentences, checks the stake input. No DOM, no money arithmetic. |
| `adapter.js` | Chooses the adapter. In DEV with `?desk=local` it uses the fake; otherwise HTTP. The `import.meta.env.DEV` guard keeps the fake out of the production build. |
| `adapter-http.js` | `createHttpDeskAdapter({request})` with `list()`, `mine()`, `stake({questionId, side, amount, stakeId})`, `settle({questionId, outcome})` and `makeStakeId()`. |
| `request.js` | A tiny `fetch` wrapper that returns the same answer shape as A2's `online/api.js`: `{ok:true, status, data}` or `{ok:false, status, code, message, retryAfterSeconds?}`. It refuses any path outside `/api/predictions` before calling fetch, has a 10 s timeout, and adds `Authorization` only when `getToken()` returns a token. On `main` today `getToken` returns `null`, because the game has no sign-in yet. Once A2 merges, `adapter.js` passes A2's `api` instead and this file can go. |
| `adapter-fake.js` | A local practice desk for development and tests: 3 made-up practice questions, in-memory stakes and the same refusals. It is labelled "Practice desk: not real coins". Its settle uses a simple stand-in split, which is fine because it is never the source of truth. |
| `desk.css` | Styles that reuse the kit look. |
| `README.md` | What each file does. How to try it: `cd frontend && npm run dev`, open `/?desk=local`, then walk to the harbor kiosk and press E, or run `window.__island.emit({type:'interact', id:'prediction_kiosk'})` in the console (DEV only). How it switches to A2's api. |

### 8.2 What the screen shows

- **The closed desk.** While the flag is off (`404 feature_off`), the dialog shows only "The prediction desk is closed for now.", the play-money line and the credit.
- **Question cards.** Each card is an `<article>` with an `<h3>` holding the question. Under it:
  - the topic, and "Decided by: ..." from `decidedBy`;
  - "Staking closes Thu 17 Dec, 12:00 (in 41 days)" in the player's local time, made with `Intl.DateTimeFormat` with the zone name shown;
  - one line per side: "YES: 120 coins from 4 captains. If YES wins, each coin brings back about 1.62 coins." Text is the main channel, and any bar is static and `aria-hidden="true"`;
  - when a side has no stakes: "Nobody has picked NO yet. If nobody does, everybody gets their coins back.";
  - "The winners share the pool. 5 % of the coins on the losing side leave the game. Numbers change until staking closes."
- **The stake form,** shown when `canStake` is true and the player has no stake on this question:
  - a `<fieldset>` with the legend "Your forecast" and two radio buttons, Yes and No;
  - a labelled number input, "Coins (1 to 50)", with `inputmode="numeric"`, min 1, max 50, step 1, and a hint: "You can still stake 130 coins today.";
  - a "Stake" button that leads to an inline confirm: "Stake 20 coins on YES? You cannot change or take back a stake." with Confirm and Back.
  - `makeStakeId()` runs once, at Confirm. A retry after a network error or a 503 sends the same id. After a 200, the form is replaced by "Your stake: 20 coins on YES".
  - While the request is in flight, the button is disabled with `aria-busy`.
- **Why staking is off,** when `canStake` is false: "Staking has closed.", "Manifold cannot be checked right now, so staking is paused.", "Sign in with GitHub to stake coins." (after a 401), or "Settled: YES won."
- **My stakes.** A list, not a table, so it reads well at 375 px:
  - "20 coins on YES", then "Open: closes ..." or "Closed: waiting for the result";
  - "Won: 34 coins back (14 more than your stake)" or "Lost: NO won";
  - "Refunded: 20 coins back, because the question was cancelled or unclear on Manifold" (or "nobody picked the winning answer", or "everybody picked the same answer");
  - the header "Today you staked 70 of 200 coins."
- **Presenter tab.** The Manifold state ("Manifold: decided YES at 14:02", "open", "closed, waiting", "cannot be reached") and buttons that follow the public fields: YES and NO after closing, Void always. The confirm says what will happen: "Settle as YES: the captains who picked YES share the pool. This cannot be undone." or "Void: everybody gets their coins back. This cannot be undone." The receipt follows: "Paid 4 captains 196 coins. 4 coins left the game."
- **On every tab,** a footer with `attribution` and `playMoney` as text. No links: credit Manifold in text, and nothing links to a betting site.
- **Refusals.** Show the server's own `message` in the card's `role="status"` live region. `view-model.js` has a plain sentence for every code in 7.1, plus one for network and timeout errors. `already_applied` counts as done and refreshes "My stakes".

### 8.3 Keyboard and screen reader

- The kit modal handles Escape, focus moving to the heading when it opens, Tab staying inside the dialog, and focus going back to the opener; `focus()` returns to the game canvas. The kit tabs handle Arrow keys, Home and End.
- While a confirm step is open, Escape cancels the confirm first. Use `onCancel` to check that.
- Every action is a real `<button>` with text, never only an icon. Inputs have labels, the side choice is a fieldset with a legend, and coin amounts are written with their unit.
- Each card has one polite live region. Errors are never shown by colour alone.
- After a stake, focus moves to the "Your stake" line, which has `tabindex="-1"`.

### 8.4 Reduced motion

The desk has no animation and no transitions. Any visual change is instant, whether `prefers-reduced-motion` or the game's `reducedMotion()` setting is on or not.

### 8.5 375 px wide

- One column; the modal is `width: min(880px, calc(100vw - 16px))` and `max-height: calc(100dvh - 16px)`.
- Text is at least 16 px, buttons are at least 44 px tall, and long words wrap with `overflow-wrap: anywhere`. No fixed widths and no horizontal scroll.
- Check by eye at 375 x 812 with `?desk=local`, and add a screenshot to the PR.

### 8.6 The browser never decides money

The screen shows only the server's numbers: `payoutPerCoin`, `canStake`, the receipts. It does no pool arithmetic. Only the DEV fake has a stand-in split.

### 8.7 The one hook in `frontend/src/game.js`

Add three short additions inside `startGame`.

1. A lazy loader, loaded once:

   ```js
   // Prediction desk (L5): the harbor's prediction kiosk opens it. Loaded on first use.
   let desk=null,deskLoading=null;
   function openDesk(){deskLoading??=import('./screens/predictions/desk.js').then(module=>{desk=module.createDesk({container,resetInput:input.reset,focus:()=>graphics.renderer.domElement.focus()});return desk;});
     deskLoading.then(panel=>panel.open()).catch(error=>{deskLoading=null;console.error(error);hud.message('The prediction desk could not load. Try again.');});}
   ```

2. A listener next to the existing `interact` listener:

   ```js
   const stopDesk=on('interact',event=>{if(event.id==='prediction_kiosk'&&!intro.active&&!caseUi.active)openDesk();});
   ```

3. `stopDesk();desk?.dispose();` in both clean-up paths: the failed first place, and `dispose()`.

**Known limit.** As with the case screens, a gamepad may still move the explorer behind the modal. Adding `||desk?.active` to `isBlocked` is an optional extra in the same file.

## 9. Tests to write first

### 9.1 Backend tests (pytest, no network)

`conftest.py` already refuses connections. Pass a fake transport or fake service, and pass `prediction_desk=` explicitly in every app test.

| File | Tests (names read like sentences) |
|---|---|
| `test_prediction_pools.py` | Winners share in proportion to their stakes (case A). The cut is 5 % of the losing side, rounded down (A, C). Payouts plus the cut add up to every coin staked (parametrize A to H, plus 200 pools from `random.Random(42)`). Every winner gets at least their stake back. Each payout is within one coin of the exact share. Leftover coins go to the largest remainders, then the earliest stake (B). Void refunds every stake in full. A pool with no winners refunds everyone. A pool where everybody picked the same side refunds everyone. An empty pool settles with no payouts. Losers get no payout. Payout per coin is None when nobody staked on that side, 1.00 when the other side is empty, and rounded down to 2 decimals. Three outcomes work, for L6. |
| `test_prediction_stake_rules.py` | Stakes of 0 and -3 are refused as `stake_too_small`; 51 as `stake_too_big`; 1 and 50 are accepted. The day starts at midnight Lisbon time, before and after the clock change on 28 Mar 2027 (2027-03-28T23:30Z gives 23:00Z; 22:59Z gives 2027-03-28T00:00Z). A missing time zone falls back to UTC. Closing at exactly now counts as closed. The effective closing time is the earliest one given. Coins left today never go below 0. |
| `test_prediction_questions.py` | The real file loads. Ids and market ids are unique. A blocked word is refused as a whole word, while "warmest" passes. A topic or source not on the list is refused (`kalshi` and `metaculus` with their reasons). Text over 140 characters or without "?" is refused. A `closesAt` without a time zone is refused. A close less than 60 minutes before `eventAt` is refused. A `pending` question is loaded but not served. More than 40 questions are refused. Every listed question has a valid recording, and its `closesAt` is not after the recorded Manifold `closeTime`. The recorded question texts contain no blocked word. |
| `test_prediction_manifold.py` | Every recording and sample parses. YES, NO, CANCEL and MKT map to yes, no, void and void. A non-BINARY answer, a CASH token, a mismatched id, a missing `isResolved` and a non-whole `closeTime` are refused. Milliseconds become UTC. An unresolved answer has no `decided_as`. An id with `/` is refused before any request. 429 and 500 from a fake transport raise. |
| `test_prediction_source.py` | A second get within 120 s does not fetch. After 120 s it fetches again. A failure gives `stale` with the old time. A failure from the start gives `fallback` from the recording. Demo mode never calls the transport. A question without a recording raises `SourceUnavailable` when Manifold is down. |
| `test_prediction_store.py` | The argument names sent to both functions are exact. Replies are read for done, every refusal reason and `stakes_changed`. An unreadable reply gives 502. The read queries are shaped right (`in.(...)` with checked ids, a limit on every list). |
| `test_prediction_routes.py`, with `prediction_helpers.py` | `prediction_helpers.py` holds a FakeDatabase (an httpx `MockTransport` that mimics the selects, the view and both functions, including 23505 and `insufficient_funds`) and fake sources. **Flag off:** all four routes answer 404 `feature_off`. **List:** works signed out; shows five questions with sides, `source`, `fetchedAt`, `attribution` and `playMoney`; contains no `probability`; refuses query parameters with 422; hides pending questions. **Mine:** 401 without a token; your stakes only, with results; the `host` flag. **Stake:** the normal path; sent twice, the second is 409 `already_applied` and the wallet function ran once; a repeat after closing is still `already_applied`; 404 `no_such_question`; 409 `pool_closed` by time and when Manifold has decided; 503 `source_unavailable` on a fallback-only reading; demo mode stakes on the fallback; 422 for 0, -3, 51, "5", 5.5, an extra field and a bad stakeId; 409 `already_staked`; 409 `daily_stake_cap` with coins left; 409 `insufficient_funds`; staking exactly the whole balance leaves 0; 429 after 10 fast stakes; 503 `database_unavailable` passes through. **Settle:** 401; 403 for a non-host; 403 when the host list is empty; void works on an open pool; YES before closing is 409 `pool_open`; YES after closing pays exactly what `plan_settlement` gave; settling twice gives 409 `already_applied`; a mismatch with a decided Manifold gives 409 `outcome_conflict`; CANCEL or MKT allows only void; a fallback reading lets the host decide; `stakes_changed` is retried once; two concurrent settles of one pool (`asyncio.gather` on the service) give one receipt and one `AlreadyApplied`. |
| `test_predictions_match_migration.py` | The two reasons are the last pairs, in order. Python's argument dicts match the SQL parameter names. The SQL contains `'stake:' \|\| p_stake_id` and `'pool:' \|\| p_question_id`. The SQL id patterns match the Python character sets. Both new tables have RLS on and `revoke all`. `service_role` gets no delete and only column updates. The four settlement names appear in both languages. The limits are arguments, not numbers inside the SQL. |
| `test_wallet.py` (edit) | Add the two pairs to the expected list and to the direction tests. |
| `test_hosts.py`, `test_host_settings.py` (only if you write hosts.py) | 401 comes before 403. A non-host gets 403, a host passes, an empty list gives 403. An uppercase UUID in the setting matches the lowercase id from Supabase. A bad item stops the server without repeating the item. |

### 9.2 SQL checks on a private scratch Postgres

Use a private scratch Postgres. The package `pgserver` 0.1.4 runs one (Postgres 16.2); say in the report which version ran. Keep the data folder outside the repository (below, `$SCRATCH` stands for any such folder). Run it from `backend/`:

```bash
uv run --with pgserver==0.1.4 python - <<'PY'
import pathlib, subprocess, pgserver
data = pathlib.Path("$SCRATCH/pg-l5")
shim = """create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth, public to anon, authenticated, service_role; grant execute on function auth.uid() to anon, authenticated, service_role;"""
psql = pathlib.Path(pgserver.__file__).parent / "pginstall" / "bin" / "psql"
with pgserver.get_server(data, cleanup_mode="delete") as server:   # stops and deletes at the end
    run = lambda sql: subprocess.run([str(psql), "-v", "ON_ERROR_STOP=1", "-q", server.get_uri()], input=sql.encode(), check=True)
    run(shim)
    for _ in (1, 2):
        for path in sorted(pathlib.Path("../supabase/migrations").glob("*.sql")):
            run(path.read_text())
    run(pathlib.Path("$SCRATCH/l5-checks.sql").read_text())
print("applied twice, checks passed")
PY
```

Write `l5-checks.sql` (outside the repository), and later turn the same blocks into the README test plan. The single checks:

- S1: the reasons count is 13.
- S2: a stake lowers the balance and writes one `prediction_stake` row with ref `stake:...`.
- S3: a repeated stakeId gives 23505 and changes nothing.
- S4: a second stake on the same question with another stakeId is refused as `already_staked`.
- S5: four stakes of 50 pass, and a fifth gives `daily_cap` with `coinsLeft` 0.
- S6: a past closing time gives `pool_closed`.
- S7: `insufficient_funds` leaves no stake row.
- S8: staking the exact balance leaves 0.
- S9: a correct YES plan pays out, writes one `pool:<id>` ledger row per winner and marks the pool settled.
- S10: a second settle gives 23505.
- S11: payouts off by one coin, a missing winner or an included loser give `bad_settlement` or `stakes_changed`, and nothing is paid.
- S12: void, no-winners and one-sided pools refund exactly.
- S13: an empty pool settles and pays nothing.
- S14: privileges hold:
  - `authenticated` can read only its own stakes, cannot write either table and cannot run either function;
  - `service_role` cannot `update prediction_stakes set amount = 1`, and cannot delete;
  - `anon` gets nothing.
- S15: deleting a player removes their stakes.
- S16: a settled pool is final: as `service_role`, an `update` of a settled pool (reopening it, or any other column) fails with `pool_settled`, a second payout to the other player is impossible, and an open pool still settles.

The race checks run two psql processes, started half a second apart:

- R1: the same player on two questions, the first with `begin; ... pg_sleep(2); commit;`. The second waits, then gets `daily_cap`.
- R2: two settles of one pool give one `done` and one `already_applied`, with one payout row per winner.
- R3: a stake during a settle waits, then gets `pool_closed`.
- R4: the same stakeId twice gives one `done` and one `already_applied`.

### 9.3 Frontend tests (Vitest)

The client tests are pure: there is no DOM environment, and `package.json` is frozen while Codex changes it. So DOM files are checked by eye, and the logic is tested here.

| File | Tests |
|---|---|
| `tests/predictions/view-model.test.js` | A pool line with stakes, without stakes, and the one-sided note. `payoutPerCoin` is shown as "about 1.62" and `null` as "no stakes yet". Closing labels in days, hours and minutes, and after closing. Result lines for won (with the gain), lost and each refund reason. Every server code maps to a sentence, and an unknown code to a generic one. The stake input refuses empty, 0, -3, 2.5, "abc", 51 and more than is left today, and accepts 20. The play-money line and the credit are present. |
| `tests/predictions/http-adapter.test.js` | The list call has no token and the mine call sends one. The stake body is exactly `{questionId, side, amount, stakeId}`, never with a player id. 404 `feature_off` gives the closed desk. 401 asks the player to sign in. 409 `already_applied` counts as done and refreshes mine. 429 says how long to wait. A network error retries with the same stakeId, and a new click after a 200 gets a new one. The settle body is `{questionId, outcome}`. |
| `tests/predictions/request.test.js` | A path outside `/api/predictions` throws before fetch. Authorization is added only with a token. The 10 s timeout. Both answer shapes. |
| `tests/predictions/fake-adapter.test.js` | The fake refuses a second stake, a closed question, staking over the cap and too few coins. A repeated stakeId answers `already_applied`. It is labelled as practice. |

## 10. Docs and contracts to update

### 10.1 `docs/INTERFACES.md`

Keep the edits small and in clearly separate places, so the merge with A2 and A6 is easy.

- **Section 1, the status table:** the 403 row now says that `POST /api/predictions/settle` uses it. Add the codes `no_such_question`, `pool_closed`, `already_staked`, `daily_stake_cap`, `pool_open`, `outcome_conflict`, `stakes_changed`, `stake_too_small`, `stake_too_big` and `predictions_unavailable`.
- **Section 2:** a new subsection, "The prediction desk (package L5)", after the Island Exchange. It has the four-route table, the example JSON, the rules in one list (section 1 of this spec) and the errors.
- **Section 4:** a paragraph for the new migration, plus rows for both tables, the view and both functions.
- **Section 5:** the two reasons.
- **Section 9:** the L5 row becomes "built (flag off, migration not applied)", with the real paths and names.
- **"Rules for the live data features", the L5 paragraph:** describe what was built. The paths changed, Polymarket is not built yet, the credit is text only, Manifold's price is never shown, and closing and refunds work as in this spec.

### 10.2 `docs/DECISIONS.md`: one new entry, D025 (D018 on the branch)

The branch drafted D018. The story round keeps D018, so this entry became D025 at the group 3 merge.

```markdown
## D025 · Prediction desk rules · 2026-11-06

**Status:** Proposed in the L5 pull request (`feat/l5-prediction-desk`); accepted when reviewed by another
teammate and merged. The number is provisional. Base: the roadmap (L5) and OPEN-WORLD section 8. Points marked
"chosen here" need Nils' OK. The flag `predictions` stays off (Nils' decision 18).

**Decision:**
1. Play-coin pools only: the winners share the pool. No outside odds, no link to a betting site; Manifold's
   own probability is never shown, only coins and captains per side and a rough payout per coin.
2. Questions: a hand-picked allow-list in `backend/content/predictions/questions.json` (one folder per feature;
   D016 and the roadmap said `backend/content/questions.json`), Manifold only, each read by a person
   (`reviewedBy`); a `pending` question is hidden.
3. Stakes (chosen here): one per player and question, 1 to 50 coins, at most 200 per Lisbon day. Staking closes
   at the question's own time, at least 60 minutes before the deciding moment, earlier if Manifold closes or
   decides. The database keeps the closing time it was given at the first stake and never changes it; at every
   stake the earlier of that stored time and the time the server knows at that moment counts, so a stored
   closing time never moves later.
4. Payout (chosen here; changed from OPEN-WORLD 8.1): the cut is 5 % of the LOSING side, rounded down, so a right
   forecast never loses coins (with the old rule, 99 coins on YES against 1 on NO would pay the winners 96).
   Largest-remainder rounding, ties to the earliest stake: payouts plus cut equal the coins staked. Full refund
   when void (Manifold CANCEL, MKT or anything else, or the host), when nobody picked the winner, and when
   everybody picked the same side.
5. Settlement: a host button in the minimum (yes or no only after closing and only matching a decided Manifold;
   void any time). Final, even if Manifold changes its mind later. Automatic settlement later: Manifold decided,
   then a 60-minute grace, on the first request that touches the pool (no cron, D002).
6. Database: reasons `prediction_stake` (spend, ref `stake:<stakeId>`) and `prediction_payout` (earn, ref
   `pool:<questionId>`); tables `prediction_pools` and `prediction_stakes`, view `prediction_pool_sides`;
   functions `prediction_place_stake()` and `prediction_settle_pool()`, each one transaction, pool lock first,
   then wallets by player id. The server computes the payouts (`pools.py`); the database checks that they cover
   exactly the paid stakes, add up and stay within one coin of the exact share. Update rights per column. A
   trigger (`prediction_pools_keep_settled()`) makes a settled pool final in the table itself: it refuses every
   update of a settled pool, so even a server bug cannot reopen a pool and pay it a second time (the ledger
   ref `pool:<questionId>` alone would only stop a second payout to the same player).
7. Data: Manifold, no key, cached 120 s per question per server instance, a recorded answer as the fallback;
   demo mode never calls it. Polymarket later. Never Kalshi or Metaculus. A stake needs a real reading, and
   (chosen here) a `stale` reading (the last good answer, kept because Manifold cannot be reached) must not be
   older than 15 minutes: an older one is still shown and still limits a host's settlement, but nobody can
   stake on it, because a market that was decided meanwhile would be news that only some captains know.
8. API: `404 feature_off` while the flag is off; a repeat answers `409 already_applied` first; settle is host-only
   (`HOST_PLAYER_IDS`, A2's contract).

**Why:** forecasting fun with no money; numbers a student can explain line by line; no right forecast loses
coins; no coin is ever created; a double click or a retry never pays twice.

**Alternatives and trade-offs:** cut on the whole pool (rejected, see 4); rounding down with the leftovers in the
cut (rejected: it rounds against the winners); several stakes or switching sides (not in the minimum); the split
computed in SQL (rejected: the rule would be written twice in full); one stake table shared with L6 (left to L6);
a link to Manifold (text credit only). Known limits: a player deleted while a pool is open takes their stake out
of the pool; the cache is per instance; news can reach players before Manifold resolves, which is why pools close
before the deciding moment.

**Agreed by, PR and impact:** proposal for Nils, 6 Nov 2026. Affects L6 (`pools.py`), the list of wallet reasons
(13), the kiosk screen and A2 (`hosts.py`).
```

### 10.3 `supabase/README.md`

- **New section "The prediction desk migration",** in the style of the Exchange section: the rows for the tables, the view and the functions; why the database checks the payouts; the lock order; that the migration is not applied yet.
- **Wallet reasons table:** two new rows.
- **"Who may do what":** rows for both tables (read, insert, update, delete), the view, both functions and the id counter. Use the `**` footnote pattern for "through the function", and note the column-level update rights.
- **"Three quick checks":** 12 tables with RLS after this migration.
- **Step 15:** add the two new reasons.
- **A new block "Prediction desk checks (steps P1 to P16)"** with the S and R checks from 9.2, written as SQL-editor blocks with the expected results.

### 10.4 Other files

- `.env.example`: only the `HOST_PLAYER_IDS` line, and only when you write hosts.py. Manifold needs no key.
- `backend/content/predictions/README.md`: everything in 3.1 to 3.3, and "never remove a question while its pool is unsettled".
- `backend/server/__init__.py` and `routes/__init__.py`: one line each, for `predictions/`, `hosts.py` and `predictions.py`.

## 11. The 23 Nov minimum and the gates

**In the minimum:**

- the allow-list with five Manifold questions (all pending until Nils has read them);
- the Manifold client with its recordings;
- `pools.py` and `stake_rules.py`;
- the migration;
- the four routes;
- the host check;
- the kiosk with the questions, pool odds, staking, "My stakes" with results, the presenter tab, plain-word refusals and the credit;
- every test above.

The flag stays off, and nothing is applied to the real Supabase project.

**After the minimum (later):**

- automatic settlement with the 60-minute grace;
- weather questions settled from Open-Meteo data (the design's first loop, `source: "weather"`, reserved);
- Polymarket Gamma `/events/keyset` as a backup;
- accuracy titles (at least 10 picks);
- more than five questions;
- voiding automatically when Manifold has not resolved 30 days after our closing time.

**Done when.** The builders report the exact output of each check:

- [ ] `cd backend && uv run pytest -q` is green.
- [ ] `uv run ruff check .` prints "All checks passed!".
- [ ] `uv run ruff format --check <changed .py files>` passes.
- [ ] The pglast parse check in ENGINEERING 4.2 step 9 passes for all files.
- [ ] The scratch Postgres applies every migration twice, and S1 to S15 and R1 to R4 pass. Say which Postgres version ran (16.2 through pgserver).
- [ ] `cd frontend && npm install && npm test && npm run build` passes, and the build's spoiler check is green.
- [ ] With `?desk=local` in dev: the kiosk opens from `prediction_kiosk`; a stake, a refusal, a settle and a result all show in plain words; the layout works at 375 px; the keyboard path works. A screenshot goes in the report.
- [ ] Without the flag, every route answers 404 `feature_off`, and the kiosk says it is closed.
- [ ] No secrets, no `.env` file, and no Manifold personal data in the diff.

## 12. Suggested commit slices for the controller

The roadmap asks for PRs of about 400 lines.

1. The money core: the migration, `pools.py`, `stake_rules.py`, the wallet pairs and their tests.
2. The data and the API: the allow-list, the recordings, `manifold.py`, `source.py`, `store.py`, `limits.py`, `desk.py`, the routes, the host check and the docs.
3. The kiosk screen and the `game.js` hook.

## 13. Open points for Nils

1. OK the *chosen here* rules: the cut on the losing side only, one stake per question, the closing-time rule (a stored closing time never moves later), the 15-minute limit on a stale Manifold reading, and the host-button limits.
2. Read the five questions and the two reserves. Then set `reviewedBy` and `reviewedOn` in the file. Keep or drop question 2, whose description is empty.
3. Who is a host: put your own Supabase User UID into `HOST_PLAYER_IDS` in the Vercel settings.
4. Decision 18 still holds: the flag stays off until you are sure about play-money pools in class.
