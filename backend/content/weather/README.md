# Weather content: the recorded answer and the saved sample answers

> **What this folder is:** the real weather answer that the API falls back on when Open-Meteo is down (or in demo mode), and ten saved sample answers that the tests use. They are plain JSON files that look like Open-Meteo's own answers.
>
> **Who uses it:** `backend/server/weather/source.py` (loads the recorded answer when the server starts) and the tests in `backend/server/tests/test_weather_*.py`, through their helper `weather_helpers.py` (load the samples). Nobody else reads these files.

The folder is inside `backend/`, so it travels with the API. No file here holds a key, a token or a password: Open-Meteo's free service needs none, and a test checks every file for words such as `apikey`, `secret` and `token`.

## The files

| File | What it is |
|---|---|
| `recorded-fallback.json` | **One real answer** from Open-Meteo, saved on 5 Nov 2026 at 17:14 UTC for Torshavn. It has five parts: `recordedAt` (when it was saved, in UTC), `place` (the name the game shows with it), `request` (the exact address that was called), `credit` (the credit and licence line for this data, which the server ignores) and `answer` (Open-Meteo's JSON, unchanged apart from indentation). It was a dark, overcast evening (`is_day` is 0), so a fallback shown in the daytime says "night". The game does not use `isDay` for its own sky yet. |
| `samples/*.json` | **Ten made-up answers in the real shape**, one for each group of weather codes: `clear-sky`, `partly-cloudy`, `overcast` (the sky codes 0 to 3), `fog` (45, 48), `drizzle` (51 to 57), `rain` (61 to 67), `snow` (71 to 77), `rain-showers` (80 to 82), `snow-showers` (85, 86) and `thunderstorm` (95 to 99). Each is a copy of the real answer with only the numbers inside `current` changed to fit the group. They are **not recordings**: nobody measured that weather. They exist so the tests can check every group without the network. |

## The format of an answer

This is Open-Meteo's own format, so a new sample can be copied straight from a real call. The part the server reads is the `current` block:

| Field in `current` | Unit | Meaning |
|---|---|---|
| `weather_code` | WMO code | 0 clear sky, 3 overcast, 45 fog, 63 rain, 95 thunderstorm, and so on |
| `cloud_cover` | percent | 0 to 100 |
| `precipitation` | millimetres | what fell in the last `interval` seconds |
| `interval` | seconds | 900, because "current" is built from 15-minute data |
| `visibility` | metres | how far you can see |
| `wind_speed_10m` | km/h | wind speed |
| `is_day` | 1 or 0 | 1 by day, 0 by night |

`backend/server/weather/open_meteo.py` explains these fields and links to Open-Meteo's documentation.

## How to record a new fallback

Do this when the default place changes, or when you want a daytime answer. The `place` in the file must be the place whose coordinates are in the `request`, because the API shows that name with the fallback weather.

1. Call Open-Meteo once, with the coordinates of the place. The free service needs no key:

   ```bash
   curl -s "https://api.open-meteo.com/v1/forecast?latitude=62.01&longitude=-6.77&current=weather_code,cloud_cover,precipitation,visibility,wind_speed_10m,is_day&wind_speed_unit=kmh&precipitation_unit=mm"
   ```

2. Paste the JSON it prints into `answer` in `recorded-fallback.json`, and set `recordedAt` to the time of the call in UTC (for example `2026-11-05T17:14:33Z`, with the `Z`), `place` to the name, and `request` to the address you called. Keep the `credit` line.
3. Run `cd backend && uv run pytest`. The tests load the file the way the server does. If you changed the place or the numbers, update the expected values in `test_weather_source.py` and `test_weather_route.py` too, and say so in the pull request.

## Credit and licence

The weather data comes from [Open-Meteo](https://open-meteo.com/) and is under the Creative Commons Attribution 4.0 licence (CC BY 4.0). That licence is why these files may be in the repository. The free service is for non-commercial use (checked on 5 Nov 2026 at `https://open-meteo.com/en/terms` and `https://open-meteo.com/en/licence`).

The licence lets us share and change the data on three conditions. The credit link alone does not meet them. This is how we meet each one:

| Condition (from the licence page) | How we meet it |
|---|---|
| Give appropriate credit, with a link next to every place where the data is shown | The API sends the words **"Weather data by Open-Meteo.com, adapted for the game"** with every answer, in the field `attribution`. The game must show them as a link to `https://open-meteo.com/`, next to the weather. |
| Provide a link to the licence | The game must also show the name **CC BY 4.0** as a link to `https://creativecommons.org/licenses/by/4.0/`. `weatherAttribution()` in `frontend/src/net/weather.js` gives both addresses. The `credit` line in `recorded-fallback.json` names both addresses too. |
| Indicate if changes were made | The words "adapted for the game" in the credit say that we turned the data into the game's four values. The sample files are changed copies of one real answer: only the numbers inside `current` differ from the recording (see `samples/*.json` in the first table). The recorded answer itself is unchanged apart from indentation. |

The licence also forbids suggesting that Open-Meteo endorses the game. The credit says only where the numbers come from.
