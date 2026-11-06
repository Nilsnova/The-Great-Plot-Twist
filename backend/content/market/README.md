# Island Exchange data files

> **What this folder is:** the data of the Island Exchange (package L4): the list of companies, the opening hours of the stock markets and the recorded prices that play back in demo mode.
>
> **Who uses it:** the server reads the three files when it starts (`backend/server/market/companies.py`, `calendars.py` and `replay.py`). Nothing else may read them. The browser never sees these files, only the answers of `GET /api/market`.

Play money only. Everything in the Exchange is a simulation. The prices are the **real** prices, one to one: there is no amplification, no floor, no ceiling and no pause. Every investment is a 10x position (decision [D017](../../../docs/DECISIONS.md)).

| File | What it is |
|---|---|
| `companies.json` | The twelve companies: seven invented island companies that follow Binance, and five real US stock companies that follow their real share prices. |
| `calendars.json` | The opening hours, holidays and short days of New York, Euronext and Xetra from 6 Nov to 31 Dec 2026. A stock trades only while its market is open. |
| `replay.json` | 90 minutes of recorded 1-minute closing prices for the seven island instruments, with its credit and licence. Played only in demo mode. |

## companies.json

```json
{
  "id": "harbor-trust",
  "name": "Saltreach Harbor Trust",
  "ticker": "SHT",
  "kind": "island",
  "follows": "Bitcoin",
  "symbol": "BTCUSDT",
  "market": "always",
  "currency": "USDT",
  "priceDecimals": 2,
  "tagline": "The old harbor bank. When it moves, the whole market feels it."
}
```

```json
{
  "id": "apple",
  "name": "Apple",
  "ticker": "AAPL",
  "kind": "stock",
  "follows": "Apple Inc. shares (Nasdaq)",
  "market": "us",
  "currency": "USD",
  "priceDecimals": 2,
  "tagline": "Phones, laptops and the shop in every pocket."
}
```

| Field | Meaning |
|---|---|
| `id` | Lowercase letters, digits and hyphens, 2 to 40 characters. It is the key in the database (`company_id`) and in the API (`companyId`). Never rename it after players hold positions, and **never remove a company while players may hold open positions in it**: a company that is not in the file has no price, so its positions could never be closed. (The portfolio shows such a position as unavailable and the server refuses to close it.) |
| `name` | 2 to 40 characters. Island companies: invented. Stock companies: the real company name. |
| `ticker` | Capital letters and digits, 1 to 6 characters, unique across all companies. Island: invented. Stock: the real exchange ticker, which is also the symbol sent to the stock provider. |
| `kind` | `island` (an invented company that follows a Binance pair) or `stock` (a real listed company). |
| `follows` | 2 to 60 characters: the real instrument or share, in words. The board shows it next to every name. |
| `symbol` | Island only: the Binance trading pair the price comes from (capital letters and digits, 5 to 20). One pair per company, and each pair only once. A stock has none and the loader refuses one. |
| `market` | `always` for island companies. For a stock: a market id from `calendars.json` (the loader refuses an unknown one). |
| `currency` | 3 to 5 capital letters: `USDT` for Binance pairs (a dollar token), `USD` or `EUR` for stocks. |
| `priceDecimals` | 0 to 8. How many decimals the screen shows (display only). |
| `tagline` | 1 to 120 characters of flavour text. |
| `delistAtRelighting` | Optional, and only `true`. After the Relighting the company takes no new positions; its open positions can still be closed. Only Greyfathom Salvage has it (it is delisted in the story, [docs/STORY.md](../../../docs/STORY.md)). |

At most 20 companies. The server checks every field when it starts and refuses a bad file with a message that names the company and the field. `backend/server/tests/test_market_companies.py` checks the real file too.

**The seven island companies** follow Bitcoin, Ether, Solana, XRP, BNB, the euro in US dollars (the Binance pair EURUSDT, the euro against the US-dollar stablecoin) and gold (PAXGUSDT, a token backed by one troy ounce of gold). They trade around the clock, so they move during a class at 11:00. Their names, tickers and stories are invented. `Greyfathom Salvage` comes from the story. The name check against published games and real companies (story rule 5) has not been done yet, so do it before the names ship.

**The five stock companies** are real: Apple, NVIDIA, Tesla, Coca-Cola and Spotify. They are shown with their real names and real prices in a play-money simulation. There is no link to or endorsement by any of them, and no logos. Their prices come from a stock-price API with a free key that a teammate creates (setting `STOCK_API_PROVIDER` and `STOCK_API_KEY`, see [.env.example](../../../.env.example)). Until the key exists, and until the provider has agreed in writing that the prices may be shown to the players, the stocks stay off and the board does not list them. "Tesla" carries a person's surname as a company name; the team may swap it (for example for Amazon). No European company is listed, because no free source gives fresh European prices; Euronext and Xetra are in `calendars.json`, so a European company is one entry once a source exists.

## calendars.json

The opening hours of the markets behind the stock companies, with their holidays and short days, in local exchange time. The server needs no timezone package: each market carries its UTC offset, which holds for the whole window because no clock change falls between 6 Nov and 31 Dec 2026 (a test compares the offsets with the timezone database where it exists).

| Field | Meaning |
|---|---|
| `validFrom`, `validTo`, `checkedOn` | The window the file is good for (dates, 6 Nov to 31 Dec 2026), and the day the hours were checked (5 Nov 2026). Outside the window a market is closed with the reason `no_calendar`. |
| `markets[].id`, `name` | A short id (`us`, `euronext`, `xetra`; `always` is reserved for island companies) and the name the board shows. |
| `markets[].timeZone`, `utcOffset` | The real timezone (for people, and for the test) and the fixed offset used for the window, for example `-05:00`. |
| `markets[].opens`, `closes` | Regular hours, local time. A market is open at `opens` and closed at `closes`. |
| `markets[].closedDays` | Holidays: `{date, name}`. The name is shown ("Closed for Thanksgiving Day"). |
| `markets[].shortDays` | Early closes: `{date, closes, name}`. `closes` is after `opens` and before the regular close. A day is not both a closed day and a short day. |
| `markets[].source` | Where the hours were read (an `https://` address). |

At the 11:00 class (Lisbon time, the same as UTC in this window) Euronext and Xetra are open and New York is closed (14:30 to 21:00 UTC), so only the island companies trade. **To confirm:** Euronext lists its half-day closing times for 24 and 31 Dec 2026 as "to be announced"; 14:05 Paris (the time of earlier years) is assumed. Deutsche Boerse may announce other hours for Wed 30 Dec by circular. Update the file when they publish.

Extending the window: add the holidays and short days of the new months to each market, check the UTC offset on every day of the new window (a clock change inside the window needs a different design), move `validTo` and `checkedOn`, and update the sources. `backend/server/tests/test_market_calendars.py` checks the real file.

## replay.json

Recorded closing prices, one per minute, for 90 minutes: Wednesday 4 November 2026, 11:00 to 12:29 UTC, which is the time of the class. In demo mode (`DEMO_MODE=true`) the server never calls Binance or the stock provider and plays this recording as if it were happening now: the recorded minute that plays is worked out from the clock, so every server instance plays the same minute at the same moment. After the last minute it plays backward, then forward again, so the price never jumps. The recording holds only the seven island pairs: the stock companies are not part of it and are hidden in demo mode. A position opened on the recording is stored with `price_mode = 'replay'` and can only be closed in demo mode; a live position can only be closed on live prices.

**The live Exchange never plays this recording.** The file is public (it is in the repository) and the minute that plays comes from the clock, so anybody can read the next prices from it and trade against them without risk. That is acceptable in a demo or a rehearsal, where nothing real is at stake, and wrong for a live market. If Binance is away, the live Exchange shows the old prices marked stale and pauses trading. Coins won on demo prices must never count for anything real (a leaderboard, a prize). Trading on the recording is allowed (decision D017) and changes real coins, so the board carries a label (`demoNote`) and the credit with a link to the licence.

| Field | Meaning |
|---|---|
| `credit`, `licence`, `licenceUrl`, `termsUrl` | Whom to credit and under which licence. The server refuses to start the replay if `credit` or `licence` is missing, or if `licenceUrl` is not an `https://` address. It shows the credit and the licence next to the prices when the replay is playing: `GET /api/market` sends them in `credits` (`licenceText` and `licenceHref`) so the screen can link to the licence text. |
| `changes` | What we changed (the licence asks for it). |
| `candleSeconds`, `firstCandleUtc`, `candles` | One price per 60 seconds, 90 of them, starting at 11:00 UTC. The day of `firstCandleUtc` is named in the demo label ("prices from 4 November 2026"). |
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

`backend/server/tests/test_market_replay.py` checks that the file has 90 minutes for all seven pairs, only prices above zero, no jump of more than half a percent between two minutes, and the credit and licence fields.

## Why 90 minutes

The class slot is 90 minutes (11:00 to 12:30 Lisbon time). A longer recording would only make the repository bigger. The recording is for demo mode, a demo or a rehearsal without internet, not a history.
