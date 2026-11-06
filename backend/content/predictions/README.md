# Prediction desk content

> **What this folder is:** the hand-picked list of questions for the prediction desk (package L5), one saved real answer from Manifold Markets for each question, and the saved answers the tests use.
>
> **Who uses it:** the server reads `questions.json` and `recorded/` when it starts (`backend/server/predictions/questions.py` and `source.py`). The tests read `samples/` too. The browser never sees these files, only the answers of `GET /api/predictions`.

Play money only. A captain stakes play coins, and the winners share the pool. Questions and results come from [Manifold Markets](https://manifold.markets/), a play-money forecasting site, and the screen credits it in text. Nothing here links to a betting site, and the desk never shows Manifold's own probability.

## The files

| File | What it is |
|---|---|
| `questions.json` | The allow-list. Questions show in the order of the file, so weather questions go first. |
| `README.md` | This file. |
| `recorded/<marketId>.json` | One real Manifold answer per question (and per reserve). It is the runtime fallback when Manifold cannot be reached, and also test data. |
| `samples/<marketId>.json` | Real resolved answers that only the tests use: YES (`6Ll9sZtyun`), NO (`5tuCpAqPlp`), CANCEL (`c0uOtluyER`) and MKT (`99gszRZN58`). `6Ll9sZtyun-cash.json` is a hand-edited copy of the YES sample, marked `"editedFrom"`, whose `token` is `CASH`: it tests that prize-cash markets are refused. |

## The format of questions.json

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
| `id` | 2 to 40 characters from a-z, 0-9 and hyphen, and unique. It is the pool key in the database and `questionId` in the API. **Never rename or remove a question, or set it back to `pending`, while its pool is unsettled**: players have staked coins on that id. Void the pool first (a pool can be settled only while the question is listed and reviewed; otherwise the settlement answers `404 no_such_question` and the coins stay locked). |
| `source` | Only `"manifold"` is accepted. `"kalshi"` and `"metaculus"` are refused with a reason: Kalshi's terms forbid caching and sharing, and Metaculus needs an account and hides the numbers. `"polymarket"` and `"weather"` are refused as "reserved, not built yet". |
| `marketId` | 6 to 40 letters and digits, and unique. It is the only value ever put into the Manifold address, and it never comes from a request. |
| `text` | Our own wording, 10 to 140 characters, ending with `?`, with no blocked word (whole words, any case). It must mean exactly what the Manifold question means. |
| `topic` | One of `weather`, `science`, `technology`, `culture`, `sport`. |
| `decidedBy` | 10 to 160 characters saying in plain words who decides, ending "as resolved on Manifold." It is shown on screen. |
| `eventAt` | Optional. The UTC time when the outcome is decided. If it is given, `closesAt` must be at least 60 minutes earlier. |
| `closesAt` | The time when staking closes, with a time zone (write a `Z` for UTC). Set it before Manifold's own close time. A question also closes earlier if Manifold closes it or decides it. The database keeps the closing time it was given at the first stake and never changes it, and at every stake the earlier of that and the closing time the server knows at that moment counts, so a stored closing time never moves later. |
| `reviewedBy`, `reviewedOn` | The person who read the Manifold question and its description, and the date (YYYY-MM-DD). `"pending"` in either field means the question is loaded but never shown and never stakeable: the routes answer `404 no_such_question`. This puts the rule "a human reads every question" into the code. |

The server checks every field when it starts and refuses a bad file with a message that names the question and the field. If the file is broken, the desk does not start: its routes answer `503 predictions_unavailable` and the rest of the API keeps working. A field that is not in the table is refused too (a typo such as `evenAt` would otherwise switch off a check). The list has 1 to 40 questions. `backend/server/tests/test_prediction_questions.py` checks the real file.

### Blocked words

This is the second guard after the human review. The words below are refused in our `text`, as whole words in any case, and a test also runs them over the recorded Manifold question. Matching pieces of words is wrong: "war" must not flag "warmest".

- violence: war, wars, kill, killed, killing, attack, attacks, bomb, nuclear, terror, terrorist, shooting, shot, murder
- death: dead, die, dies, death, deaths, dying, suicide
- politics: election, elections, vote, votes, president
- adult and personal: sex, porn, drug, drugs, pregnant, pregnancy

## How to pick a question (the checklist)

Only accept a question that meets all of these:

- binary (`outcomeType` BINARY), on play money (`token` MANA), with at least 10 bettors;
- with a clear rule in the Manifold description;
- not about a private person, and not an "I" or "my" market;
- free of politics, elections, war, death and adult topics, and not a disaster count.

Then:

1. **Prefer questions decided at one known moment.** Avoid "will X happen before date Y". News can settle those before Manifold resolves them, and before our pool closes.
2. **Set `closesAt` at least 60 minutes before the deciding moment,** and before Manifold's `closeTime`.
3. **Read the Manifold description again on the day you review.** A creator can change it later. If the meaning changes after our review, the host voids the pool. Do not hide the question by setting it back to `pending` while its pool is unsettled: void the pool first (a pool can be settled only while the question is listed and reviewed).
4. **Record one answer with a single `curl` outside the tests,** and trim it as described below. Then set `reviewedBy` and `reviewedOn`.

## How to record an answer

Do this once per question, never inside a test. Manifold needs no key (500 requests a minute per address):

```bash
curl -s "https://api.manifold.markets/v0/market/<marketId>" > raw.json
```

Keep only these keys of the answer: `id`, `slug`, `question`, `outcomeType`, `mechanism`, `token`, `closeTime`, `isResolved`, and `resolution` and `resolutionTime` if the market is resolved. Save them as `recorded/<marketId>.json` in this shape, with `recordedAt` the time of the call in UTC (with the `Z`):

```json
{"recordedAt": "2026-11-05T22:46:22Z", "source": "GET https://api.manifold.markets/v0/market/<marketId>",
 "answer": {"id": "...", "slug": "...", "question": "...", "outcomeType": "BINARY", "mechanism": "cpmm-1",
            "token": "MANA", "closeTime": 1798761540000, "isResolved": false}}
```

**Remove before saving, and never commit:** `creatorId`, `creatorUsername`, `creatorName`, `creatorAvatarUrl`, `resolverId` and `url` (the url contains the creator's username): they are personal data. Also `probability`, `p`, `pool`, `volume`, `volume24Hours` and `totalLiquidity`: that is the market price, which the desk does not show. And `description`, `textDescription`, `groupSlugs` and `coverImageUrl`.

## Reserves

Two more questions were checked on 5 Nov 2026 and have their answers in `recorded/`, but they are **not** in `questions.json`. Paste one into the list (and set `reviewedBy` and `reviewedOn`) if you want it.

Reserve A replaces `warmest-year-2026` if you drop that one (its Manifold description is empty, so the creator does not say whose record counts). The rule is clear, but the answer looks nearly certain:

```json
{
  "id": "berkeley-earth-2026",
  "source": "manifold",
  "marketId": "X3De8lrtBV1A8E63QA2p",
  "text": "Will Berkeley Earth report 2026 global warming of 1.5 °C or more?",
  "topic": "weather",
  "decidedBy": "The annual global temperature report of Berkeley Earth, as resolved on Manifold.",
  "eventAt": "2027-01-13T00:00:00Z",
  "closesAt": "2026-12-01T00:00:00Z",
  "reviewedBy": "pending",
  "reviewedOn": "pending"
}
```

Reserve B works only if the desk opens before 24 Nov 2026 (the match runs from 24 Nov to 12 Dec in Geneva). Check the wording against the Manifold question first: the recorded market asks whether Gukesh wins the 2026 World Chess Championship.

```json
{
  "id": "world-chess-2026",
  "source": "manifold",
  "marketId": "CqssL2NltN",
  "text": "Will Gukesh keep his title at the 2026 World Chess Championship?",
  "topic": "sport",
  "decidedBy": "The result of the 2026 World Chess Championship match, as resolved on Manifold.",
  "closesAt": "2026-11-23T23:00:00Z",
  "reviewedBy": "pending",
  "reviewedOn": "pending"
}
```

## What the Manifold terms say, and the credit

Checked on 6 Nov 2026 in the Manifold API documentation: reading needs no key and no sign-in; the limit is 500 requests a minute per address; integrations are a permitted use, while scraping outside the API and dodging the limit are not; the API is labelled alpha and may change. We found no clause that asks for credit. The desk credits Manifold in text anyway (the `attribution` line of `GET /api/predictions`), and Manifold's Discord is the place to ask about showing question text. Details are in `backend/server/predictions/manifold.py`.
