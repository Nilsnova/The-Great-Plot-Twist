# Island Exchange data files

> **What this folder is:** the data of the Island Exchange (package L4): the list of fictional companies and the recorded prices that play back in demo mode.
>
> **Who uses it:** the server reads both files when it starts (`backend/server/market/companies.py` and `backend/server/market/feed.py`). Nothing else may read them. The browser never sees these files, only the answers of `GET /api/market`.

Play money only. Everything in the Exchange is a simulation.

| File | What it is |
|---|---|
| `companies.json` | The seven fictional island companies. Each one follows one real instrument. |
| `replay.json` | 90 minutes of recorded 1-minute closing prices for the seven instruments, with its credit and licence. Played only in demo mode. |

## companies.json

```json
{
  "id": "harbor-trust",
  "name": "Saltreach Harbor Trust",
  "ticker": "SHT",
  "follows": "BTC",
  "symbol": "BTCUSDT",
  "startPrice": 60.00,
  "tagline": "The old harbor bank. When it moves, the whole market feels it."
}
```

| Field | Meaning |
|---|---|
| `id` | Lowercase letters, digits and hyphens, 2 to 40 characters. It is the key in the database (`company_id`) and in the API (`companyId`). Never rename it after players hold shares, and **never remove a company while players may hold shares of it**: a company that is not in the file has no price, so its shares could never be sold. |
| `name` | The name players see. Invented. |
| `ticker` | 2 to 5 capital letters. |
| `follows` | The real instrument, in words, for the screen. |
| `symbol` | The Binance trading pair the price comes from. One pair per company, and each pair only once. |
| `startPrice` | The first game price, in coins, from 4.00 to 125.00 with at most 2 decimals. Write it with a decimal point (`60.00`), so it is read as an exact number. The price of the company always stays between a quarter and four times this number (floor 25 %, ceiling 400 %, see `rules.py`), and the limits of 4.00 and 125.00 make sure that one unit is still worth a whole coin at the floor and still fits into one purchase (500 coins) at the ceiling. Do not change it after the launch: the floor and the ceiling move with it. |
| `tagline` | One line of flavour text. |

The server checks every field when it starts and refuses a bad file with a message that names the company and the field. `backend/server/tests/test_market_companies.py` checks the real file too.

The seven companies follow BTC, ETH, SOL, XRP, BNB, EUR/USD (the Binance pair EURUSDT, euro against the US-dollar stablecoin) and gold (PAXG, a token backed by gold). They all trade around the clock, so they move during a class at 11:00.

**Names:** all names are invented. `Greyfathom Salvage` comes from the story ([docs/STORY.md](../../../docs/STORY.md)). The name check against published games and real companies (story rule 5) has not been done yet, so do it before the names ship.

## replay.json

Recorded closing prices, one per minute, for 90 minutes: Wednesday 4 November 2026, 11:00 to 12:29 UTC, which is the time of the class. In demo mode (`DEMO_MODE=true`) the server never calls Binance and plays this recording as if it were happening now: the recorded minute that plays is worked out from the clock, so every server instance plays the same minute at the same moment. After the last minute it plays backward, then forward again, so the price never jumps.

**The live Exchange never plays this recording.** The file is public (it is in the repository) and the minute that plays comes from the clock, so anybody can read the next prices from it and trade against them without risk. That is acceptable in a demo or a rehearsal, where nothing real is at stake, and wrong for a live market. If Binance is away, the live Exchange shows the old prices and pauses trading. Coins won on demo prices must never count for anything real (a leaderboard, a prize).

| Field | Meaning |
|---|---|
| `credit`, `licence`, `licenceUrl`, `termsUrl` | Whom to credit and under which licence. The server refuses to start the replay if `credit` or `licence` is missing, or if `licenceUrl` is not an `https://` address. It shows the credit and the licence next to the prices when the replay is playing, and sends `licenceUrl` with the board so the screen can link to the licence text. |
| `changes` | What we changed (the licence asks for it). |
| `candleSeconds`, `firstCandleUtc`, `candles` | One price per 60 seconds, 90 of them, starting at 11:00 UTC. |
| `closes` | For each Binance pair, the closing price of each minute. |

### Where the data comes from, and the licence

The prices are a **derivative of Binance Vision public data** (`data.binance.vision`), licensed **CC BY-NC-SA 4.0** (Attribution, NonCommercial, ShareAlike), credit: **Binance Vision**. The licence terms are in the "Binance Vision Dataset Terms" (`https://data.binance.vision/Binance_Vision-Terms_of_Use.pdf`, checked on 5 Nov 2026) and at <https://creativecommons.org/licenses/by-nc-sa/4.0/>.

What that means for us:

- **Credit.** "Binance Vision" is named in the file and on screen while the replay plays.
- **Same licence.** `replay.json` stays CC BY-NC-SA 4.0 wherever it is copied. This applies to the data file, not to the rest of the code.
- **Non-commercial.** The game is a class project and must stay non-monetized. Do not use the file, or a service built on it, to earn money.
- **Changes are stated.** We kept only the closing price of each minute and cut the 90 minutes.
- **No Binance branding.** Do not use the Binance name or logo to promote the game.

Never add recorded prices from CoinGecko, Coinbase or other services to the repository. Their terms do not allow it ([INTERFACES.md, section 9](../../../docs/INTERFACES.md#9-reserved-interfaces)).

### How it was made

The seven daily files were downloaded on 5 Nov 2026 from `https://data.binance.vision/data/spot/daily/klines/<SYMBOL>/1m/<SYMBOL>-1m-2026-11-04.zip`. Their SHA-256 sums (they match the `.CHECKSUM` files next to them on the server):

| Pair | SHA-256 of the daily zip file |
|---|---|
| BTCUSDT | `44c7dfc10dff28bd3050f0129c201872994f3f09e2b2d00a76bd44fb419e509d` |
| ETHUSDT | `424d1b522fb215beddcb6a77b3b17aa9c04033816ac1f1fe8afc0c45606cb5d1` |
| SOLUSDT | `c30722ee735da1e8f91d034d78a815a0f9774d9a2b00305e5b531e842a637835` |
| XRPUSDT | `32d4ea4bb47b0a75f7101ed7ec4675428330db10c29f7793c043be5cdbc8e61b` |
| BNBUSDT | `5211a2810f2c630ec11c825c6371df18a3772bc1b4468f9587ef693180c9e210` |
| EURUSDT | `221f90c354b4693000b4bd1d8e6d42c45224bfb2b41853637caff3ded5f49f56` |
| PAXGUSDT | `de7cbb882a3d94a5b15df72b6583a263cc4d971eb85dfc590ec7e4504ad7157a` |

Each zip holds one CSV with 1440 rows (one per minute of the day). Column 1 is the candle's open time (in **microseconds** in the 2026 files), column 5 is the close. The 90 closes from 11:00 to 12:29 UTC were copied into `replay.json` without trailing zeros. To check or rebuild a pair, download its zip into an empty folder and run this (it reads the zip in memory and writes nothing):

```python
import csv, io, sys, zipfile
from datetime import datetime, timezone

zip_path = sys.argv[1]  # for example BTCUSDT-1m-2026-11-04.zip
with zipfile.ZipFile(zip_path) as archive:
    text = archive.read(archive.namelist()[0]).decode("utf-8")
for row in csv.reader(io.StringIO(text)):
    opened = datetime.fromtimestamp(int(row[0]) / 1_000_000, timezone.utc)  # microseconds
    if opened.hour in (11, 12) and not (opened.hour == 12 and opened.minute >= 30):
        print(opened.strftime("%H:%M"), row[4])  # the close, to compare with closes[...]
```

`backend/server/tests/test_market_feed.py` checks that the file has 90 minutes for all seven pairs, only prices above zero, no jump of more than half a percent between two minutes, and the credit and licence fields.

## Why 90 minutes

The class slot is 90 minutes (11:00 to 12:30 Lisbon time). A longer recording would only make the repository bigger. The recording is for demo mode, a demo or a rehearsal without internet, not a history.
