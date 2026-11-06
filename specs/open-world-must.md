# Open-world must, server side: W1 weather states, D1 daily frame and bulletin, H1 Chapter 2 hook

> **What this is:** the implementation spec for the three server-side "must" items of the open world. They are W1 (weather states and the fog-night rule), D1 (the Lisbon day, the daily frame and the bulletin) and H1 (the Chapter 2 hook). For each one it gives the files, routes, JSON, reasons, tests and what the screens will read later.
>
> **Who uses it:** the agent that builds it on `feat/open-world-must`. Codex uses it for the screens. The L3 and S3 owners use it for the two hand-offs.

- **Status:** draft spec, 5 Nov 2026. Checked against `main` at `9f5bf97`. Paths are relative to the repository root.
- **Design it implements (approved, read only):** `docs/story/OPEN-WORLD.md` (branch `docs/s0-story-round`, not merged yet), sections 3.1 to 3.4, 4.2 (rows 1, 2 and 6), 5.4, 10.2, 10.3, 13.3 and 14. Also `CASE-FILE.md` sections 12 (last beat), 14.1, 14.3 and 16 (Story v2 change 13).
- **Baseline:** `cd backend && uv run pytest -q` gives 1487 passed (27.9 s) on a clean tree.
- **Name clash:** "D1" is also the case's first deduction ("D1 Where"), and decisions are numbered D001 and up. In docs, call this item "the daily frame".

## 0. The answer in one page

1. **Everything is worked out on request.** It is computed from the weather the server already fetches (one Open-Meteo call, the one `CachedSource`), the clock and three content files. There is no table, migration, cron, flag, setting, dependency or new outside source. `.env.example` does not change.
2. **The one Open-Meteo call grows.** It also asks for 4 hourly variables, 31 past days and 3 forecast days. That is 10 variables over 34 days, so Open-Meteo counts it as about 2.4 calls. At one fetch per 10 minutes per instance, that is at most about 350 a day per instance. The free limit is 10,000 a day (checked on 5 Nov 2026 at https://open-meteo.com/en/pricing).
3. **Contract changes:**
   - `GET /api/weather` gets two new fields, `state` and `tonight`.
   - A new public route, `GET /api/bulletin`, returns `day`, `lines`, `weather`, `exchange` and `chapterTwoHook`.
   - Three content files that only the server reads.
   - Two keyword-only `create_app` services, `world_stage` and `clock`.
   - One new error code, `503 bulletin_unavailable`.
4. **Some existing tests change on purpose** because the contract grows:
   - three weather route tests and the `make_client` helper in `test_weather_route.py`;
   - the `fetch()` helper and one test in `test_weather_open_meteo.py`.
5. **Six choices were made here and need Nils' OK.** The decision entry draft is in section 6.
   - A night (or day) takes a state when at least 3 of its hours have it.
   - The fog-night rule looks back 30 nights and assumes the almanac's every-third-night pattern before that.
   - The hook fires at 06:00 after its night.
   - "Calm and clear" means the `calm` state.
   - Two pieces of teaser wording.
   - The words of the Exchange line ("No company is paused", and "recent prices" for the cache feed).
6. **Size:** about 1,400 lines of code and docs and about 1,000 lines of tests, in five slices (section 7). That is more than the design's 0.75 days. The extra cost is the hourly data, which the rule needs as written.

## 1. Shared groundwork

### 1.1 The Lisbon clock (`backend/server/lisbon_time.py`, new; the first part of the daily frame)

The design says the Lisbon-day helper comes first. W1 also needs it for nights.

```python
LISBON_ZONE_NAME = "Europe/Lisbon"
BULLETIN_HOUR = 8   # the bulletin is published at 08:00; the Exchange's market day starts then too
WEEK_STARTS_ON = 0  # Monday, as date.weekday() counts

def load_lisbon_zone() -> tzinfo: ...  # ZoneInfo, or UTC plus a warning, like market/rules.py
LISBON = load_lisbon_zone()

def to_lisbon(moment: datetime) -> datetime: ...             # ValueError for a time without a timezone
def at_lisbon_hour(day: date, hour: int) -> datetime: ...    # that Lisbon wall-clock hour, as UTC
def game_day(moment: datetime) -> date: ...                  # the day id: the Lisbon date
def bulletin_day(moment: datetime) -> date: ...              # the date of the latest 08:00 not after moment
def harbor_week(moment: datetime) -> date: ...               # the Monday of the Lisbon week
```

- Always use `Europe/Lisbon` through zoneinfo, never a fixed offset. Lisbon is UTC+0 until 01:00 UTC on Sun 28 Mar 2027, then UTC+1 until 01:00 UTC on Sun 31 Oct 2027.
- All intervals are half-open. At exactly 00:00, 08:00 or 18:00 the new day, bulletin or night has begun.
- No new dependency. If the server has no tz data, the fallback is UTC, which is correct until 28 Mar 2027. `tzdata` is an open point (section 8).
- `bulletin_day` must agree with `market_day_start()` in `market/rules.py`, and a test checks that. `market/rules.py` is not changed here: switching it to this helper later is a separate, optional pull request.

### 1.2 The app clock and the world-stage reader

- `backend/server/clock.py` gains `get_clock(request)` and `ClockDep`, so routes ask `app.state.clock`.
- New file `backend/server/world_stage.py`:

  ```python
  DARK, RELIT = "dark", "relit"

  @dataclass(frozen=True)
  class WorldStage:
      stage: str                  # DARK or RELIT
      relit_at: datetime | None   # the first accepted solve (S); None while dark
      # __post_init__ refuses relit without a time, dark with a time, and a naive time

  class WorldStageReader(Protocol):
      async def read(self) -> WorldStage: ...

  class AlwaysDark:  # until package L3 builds world_state, the coast is dark
      async def read(self) -> WorldStage: return WorldStage(DARK, None)

  WorldStageDep = Annotated[WorldStageReader, Depends(get_world_stage)]
  ```

  The rule for a reader (L3): `read()` raises an `ApiError` when the stage cannot be read (the bulletin then leaves out the stage lines), and any other error becomes a 500. The bulletin calls `read()` on every request, so a reader that asks the database should keep its answer for a short time (for example 60 seconds).

- `create_app(settings=None, verifier=None, admin=None, *, weather_source=None, exchanger=None, market_service=None, world_stage=None, clock=None)`:
  - The new parameters go last and are keyword-only.
  - Defaults are `AlwaysDark()` and `utc_now`.
  - `create_app` also loads `app.state.weather_rules` (1.3 and 2.3) and `app.state.daily_content` (3.4 and 4.3). A file that cannot be read gives `None` and a log line, never a crash.

### 1.3 One Open-Meteo call, now with hours

These files are all in `backend/server/weather/`.

**`mapping.py`.** Add `HourReading(at: datetime, reading: WeatherReading)`. `at` is UTC, and the dataclass is frozen.

**`open_meteo.py`** adds:
- `HOURLY_VARIABLES = ("weather_code", "precipitation", "visibility", "wind_speed_10m")`
- `PAST_DAYS = 31`, which must equal `LOOK_BACK_NIGHTS + 1` (a test checks it).
- `FORECAST_DAYS = 3`, which covers tonight, tomorrow and the night after.
- New request parameters: `hourly`, `past_days`, `forecast_days` and `timezone=GMT`, so hourly times are UTC. No parameter name may contain "key", because an existing test checks for that.
- `parse_hours(body) -> tuple[HourReading, ...]` never raises. It returns `()` when:
  - the `hourly` block is missing or odd;
  - the lists have unequal lengths;
  - there are more than `(PAST_DAYS + FORECAST_DAYS) * 24 + 48` entries;
  - `utc_offset_seconds` is not 0.
  It leaves out any hour with no weather number, and any hour whose time is before 1 Jan 2000 or after 1 Jan 9000 (`EARLIEST_HOUR` and `LATEST_HOUR`: a broken answer must not run the date arithmetic of the nights out of calendar). A whole number of hundreds of digits counts as "no number", because it does not fit a float. Hourly precipitation is already "sum of the preceding hour", so it is used as millimetres per hour as it is.
- `parse_forecast(body) -> Forecast(now, hours)`.
- `fetch_forecast(latitude, longitude, transport)` replaces `fetch_reading`.
- Update the header comment: facts checked on 5 Nov 2026 (`past_days` 0 to 92, `forecast_days` 0 to 16 with default 7, `timezone` default GMT, hourly precipitation is the preceding-hour sum, more than 2 weeks or more than 10 variables count as extra calls).

**`source.py`.**
- `PlaceReading` gains `hours: tuple[HourReading, ...] = ()`.
- `fetch()` uses `fetch_forecast`.
- `read_recorded_file` uses `parse_forecast`. The recorded answer of 5 Nov has no hourly block, so a fallback has no hours.
- The TTL (600 s), the timeout, demo mode and the fallback order stay unchanged.

**Tests changed on purpose.** `test_weather_open_meteo.py`: the `fetch()` helper calls `fetch_forecast`, and `test_a_good_answer_becomes_a_reading` becomes `test_a_good_answer_becomes_a_forecast` (now plus `()` hours).

## 2. W1 Weather states and the fog-night rule

### 2.1 The rules

**Hour state** (`weather/states.py`, pure). This uses the same four values the game draws: `map_reading()` of an hour.
- `storm` if `wind >= 0.8`
- otherwise `fog` if `fog >= 0.5`
- otherwise `rain` if `rain >= 0.4`
- otherwise `calm`

The order storm, fog, rain, calm is the design's (5.4) and is fixed in code. The numbers are in content. In real units: wind 0.8 is 48 km/h; fog 0.5 is a visibility of 5 km or less, or a fog code (45, 48); rain 0.4 is 3.2 mm an hour, or a rain code of 0.4 or more. Cloud cover never changes the state.

**Period state** (`period_state(hour_states, rules)`). A night or a daytime takes the first of storm, fog and rain that covers at least `hoursForState` (3) of its known hours. Otherwise it is `calm`. With no known hour it is `None`. (Chosen here: the design gives states per hour but no rule for a whole night.)

**Nights** (`weather/nights.py`, pure, uses `lisbon_time`):
- Night N runs from 18:00 Lisbon on date N to 06:00 Lisbon on date N+1 (design start value).
- A daytime runs from 06:00 to 18:00.
- `night_for(now)` is the night in progress, or the next one. Before 06:00 it is the previous date's night; from 06:00 it is today's.
- `period_states(hours, rules)` sorts each hour into its night or daytime in one pass and gives the state of every night and every daytime. `states_by_night` and `states_by_daytime` are its two halves. The outlook keeps the night states for the hook (`Outlook.night_states`), so a request sorts the hours only once.
- A night is 11 hours long across the March change and 13 hours across the October change. The 3-hour rule works the same either way.

**The fog-night rule** (`weather/fog_nights.py`, pure), exactly as the design states it: "A night is a fog night if the night is in the fog state, or if neither of the last two nights was a fog night."

```python
LOOK_BACK_NIGHTS = 30            # a multiple of 3: then the teaser can never stall (test)
REAL, ALMANAC = "real", "almanac"

@dataclass(frozen=True)
class FogNight:
    night: date
    is_fog_night: bool
    kind: str | None             # REAL wins when both apply; ALMANAC; None when no fog night

def is_almanac_night(night, almanac_starts_on) -> bool:   # (night - start).days % 3 == 0
def apply_fog_night_rule(nights, real_fog, almanac_starts_on) -> list[FogNight]:
def tonight_fog_night(now, states_by_night, rules) -> FogNight:
```

- `real_fog[n]` means the night's period state is `fog`. A night without data counts as no real fog.
- `tonight_fog_night` runs the rule over the 30 nights before tonight, and then tonight. For the two nights before that window, it assumes the almanac's every-third-night pattern, counted from `almanacStartsOn` (16 Nov 2026, Day 1). Python's `%` makes the pattern hold before that date too: 1, 4 and 7 Nov are almanac nights, 5 Nov is not. Every night inside the window follows the rule exactly. (Chosen here; no table.)
- **Why 30, and why a multiple of 3.** The rule needs the last two verdicts, and those depend on the whole history before them. Two histories agree from the first real fog night onward. So the result is exact whenever there was real fog in the last 30 nights.
  - A brute-force check (look-backs 3 to 9, many random fog patterns) shows the window length matters. With a multiple of 3, the nights shown one after another never have three non-fog nights in a row. With 3k+1 the worst gap is 3 nights; with 3k+2 it is 4. A test guards it with one lonely real-fog night in each of the three places of the almanac's cycle (random weather alone cannot tell a good look-back from a bad one).
  - Worked example, with real fog only on 17 Nov: the fog nights shown are 16 Nov (almanac), 17 Nov (real), then 20, 23, ... up to 17 Dec, then 19 Dec, 22 Dec and so on. The unbounded rule would give 20 Dec and 23 Dec, so the only visible effect is that one fog night comes a night earlier.
- **When a verdict can change.**
  - The almanac part of tonight's verdict is fixed from 06:00.
  - The real part follows the latest forecast, then the observed hours, so it can appear or go during the day or the night. Past nights use the observed hours.
  - Two server instances can differ for up to 10 minutes, because each has its own cache.
  - After the first solve, fog is only weather. The weather route still sends the verdict; the screens and the bulletin use it only while the coast is dark.

### 2.2 Files

| File | Change |
|---|---|
| `backend/content/weather_states.json` | new (2.3) |
| `backend/server/weather/state_rules.py` | new: `StateRules` (frozen) and `read_state_rules()`, which raises `StateRulesError` naming the file and field. `load_state_rules()` returns `None` and logs on failure. |
| `backend/server/weather/states.py` | new: `hour_state`, `period_state` |
| `backend/server/weather/nights.py` | new: night and daytime windows and states (`period_states` sorts the hours once) |
| `backend/server/weather/fog_nights.py` | new: the rule |
| `backend/server/weather/mapping.py`, `open_meteo.py`, `source.py` | 1.3 |
| `backend/server/weather/__init__.py` | header comment lists the new files |
| `backend/server/routes/weather.py` | the two additive fields (2.4); takes `ClockDep` and the rules from `app.state.weather_rules` |
| `backend/server/app.py`, `backend/server/clock.py` | 1.2 |

### 2.3 Content: `backend/content/weather_states.json` (server only, not on the public list)

```json
{
  "stateFrom": {"storm": {"wind": 0.8}, "fog": {"fog": 0.5}, "rain": {"rain": 0.4}},
  "night": {"startsHour": 18, "endsHour": 6, "hoursForState": 3},
  "fogNightRule": {"almanacStartsOn": "2026-11-16"}
}
```

The loader refuses:
- thresholds outside the range above 0 up to 1;
- `startsHour` outside 12 to 23, or `endsHour` outside 2 to 11 (so a night spans midnight and never touches the 01:00 clock-change hour);
- `hoursForState` outside 1 to 12;
- a date that is not a valid ISO date.

### 2.4 Route: `GET /api/weather`, two additive fields

```text
200 OK   Cache-Control: public, max-age=300
{"cloudCover": 1.0, "rain": 0.6, "fog": 0.22, "wind": 0.52, "isDay": true, "summary": "Rain, windy",
 "place": "Lisbon, Portugal", "source": "live", "fetchedAt": "2026-11-05T12:00:00Z",
 "attribution": "Weather data by Open-Meteo.com, adapted for the game",
 "state": "rain",
 "tonight": {"date": "2026-11-05", "startsAt": "2026-11-05T18:00:00Z", "endsAt": "2026-11-06T06:00:00Z",
             "isNow": false, "state": null, "isFogNight": false, "fogNightKind": null}}
```

| Field | Meaning |
|---|---|
| `state` | The state now, from the four values above: `storm`, `fog`, `rain` or `calm`. `null` only if `weather_states.json` could not be read. |
| `tonight` | The night in progress, or the next one: `date` (the date it starts), `startsAt` and `endsAt` (UTC), and `isNow`. `state` is the night's period state, `null` when the answer has no hours for that night (for example the recorded fallback or demo mode). `isFogNight` and `fogNightKind` (`real`, `almanac` or `null`) come from the rule in 2.1. The whole object is `null` only if the rules file could not be read. |

**Reasons.**
- The client already polls this route every 10 minutes, and `startLiveWeather` passes only the four values to `setWeather`, so extra fields break nothing.
- The verdict comes from the same answer and the same cache, with no second request.
- Demo mode stays deterministic: no hours, so fog nights are exactly the almanac nights.
- The existing cases are unchanged (live, cache, stale, fallback, 503, 405).

### 2.5 Tests (write first)

Expected states for the saved samples (computed from the real mapping):

| Sample | State |
|---|---|
| clear-sky, drizzle, overcast, partly-cloudy, snow-showers | calm |
| fog, snow | fog |
| rain, rain-showers | rain |
| thunderstorm | storm |
| recorded fallback | calm |

| File | Tests |
|---|---|
| `test_weather_states.py` | `test_the_real_state_rules_load_with_the_design_start_values`; `test_a_gale_is_a_storm_even_in_fog_and_rain`; `test_fog_beats_rain`; `test_rain_starts_at_0_4`; `test_just_below_every_threshold_is_calm`; `test_cloud_cover_never_changes_the_state`; `test_every_saved_sample_has_its_expected_state` (parametrized); `test_a_period_takes_the_first_state_that_lasts_three_hours`; `test_a_period_with_no_known_hour_has_no_state`; `test_a_broken_or_missing_rules_file_gives_none_and_a_log_line`; parametrized refusals for each bad value |
| `test_weather_nights.py` | `test_a_winter_night_runs_from_18_00_to_06_00_utc`; `test_a_summer_night_runs_from_17_00_to_05_00_utc`; `test_the_night_of_the_march_clock_change_has_eleven_hours` (27 Mar 2027, 18:00Z to 05:00Z); `test_the_night_of_the_october_clock_change_has_thirteen_hours` (30 Oct 2027, 17:00Z to 06:00Z); `test_before_06_00_tonight_is_the_night_that_began_yesterday`; `test_from_06_00_tonight_is_the_coming_night`; `test_at_18_00_the_night_has_begun`; `test_hours_are_sorted_into_nights_and_days` (05:00Z belongs to the previous night, 06:00Z and 17:00Z to the day, 18:00Z to the night); `test_a_night_takes_fog_from_three_foggy_hours` (2 hours: calm, 3: fog); `test_storm_wins_over_fog_in_a_night` |
| `test_fog_nights.py` | `test_fog_night_at_least_every_third_night` (all 256 real-fog patterns of 8 nights, for each of three first nights, parametrized); `test_every_night_follows_the_rule_exactly` (same patterns); `test_a_real_fog_night_says_real_even_when_the_almanac_also_calls_it`; `test_with_no_real_fog_the_fog_nights_are_the_almanac_nights` (16, 19, 22, 25 Nov); `test_the_almanac_counts_backwards_too` (4 Nov yes, 5 Nov no); `test_two_clear_nights_after_real_fog_are_not_fog_nights_and_the_third_is`; `test_a_night_without_data_counts_as_no_real_fog`; `test_a_month_after_the_last_real_fog_the_almanac_pattern_takes_over` (the 17 Nov example: 17 Dec then 19 Dec); `test_the_shown_fog_nights_never_stall_as_the_nights_go_by` (seeded `random.Random(42)`, 120 nights, one verdict per evening); `test_one_lonely_real_fog_night_never_makes_the_shown_nights_stall` (real fog on 16, 17 or 18 Nov only: this is the test that fails for a wrong look-back); `test_the_look_back_is_a_multiple_of_three`; `test_open_meteo_is_asked_for_one_more_day_than_the_look_back`; `test_tonight_counts_the_hours_seen_so_far_and_the_forecast_for_the_rest` |
| `test_weather_open_meteo.py` (additions) | `test_the_request_asks_for_hours_31_days_back_and_3_days_ahead_in_utc`; `test_the_hourly_block_becomes_hours_in_utc`; `test_hourly_precipitation_is_already_per_hour`; `test_a_missing_hourly_block_gives_no_hours_and_keeps_the_weather_now`; `test_hourly_lists_of_different_lengths_are_ignored`; `test_an_hourly_block_in_another_timezone_is_ignored`; `test_an_hour_without_any_weather_number_is_left_out`; `test_an_hourly_block_that_is_too_long_is_ignored`; `test_the_request_counts_as_few_open_meteo_calls` (at most 10 variables, at most 35 days) |
| `test_weather_source.py` (additions) | `test_the_cached_data_carries_the_hours`; `test_the_recorded_fallback_has_no_hours` |
| `test_weather_route.py` | Changed on purpose: `make_client` passes `clock=clock` to `create_app`; `RAIN_ANSWER` adds `state` `rain` and the `tonight` object shown above; the field-order list adds `state` and `tonight`; the fallback answer adds `state` `calm` and the same `tonight`. New: `test_the_state_now_follows_the_current_values` (fog and thunderstorm samples); `test_tonight_is_a_real_fog_night_when_three_night_hours_are_foggy`; `test_tonight_is_an_almanac_fog_night_two_nights_after_real_fog` (3 fog hours on the night of 2 Nov, clock 5 Nov 12:00Z: `almanac`); `test_without_hours_tonight_has_no_state_and_the_almanac_decides`; `test_without_the_rules_file_the_l1_fields_still_answer` (`state` and `tonight` null); `test_in_demo_mode_tonight_is_decided_by_the_almanac_alone` |

Helpers:
- `weather_helpers.py` gains `hourly_block(...)` and `answer_with_hours(sample, hours)`. Tests build hourly blocks in code, and the sample files stay unchanged.
- `helpers.py` gains `needs_lisbon_timezone`, a skip marker like the market's.
- Tests follow ENGINEERING 5.6: no loops or `if` inside a test body. Use parametrize and helpers.

### 2.6 What the screens will read later (Codex)

- `onUpdate(answer)` in `frontend/src/net/weather.js` receives `state` and `tonight`.
- The false-light teaser in `frontend/src/world/places/settlement.js` today uses `state.weather.fog > .65` at game night. It can switch to `answer.tonight.isFogNight`, and stays off once the world is relit.
- The HUD and the sea chart may label the night "real" or "by the harbor's almanac".
- The game hour is simulated, so `isNow` is informational.

### 2.7 Out of scope

Storm warnings, sealed crates, slower crossings and rainy oil (all "should"). Desk questions belong to L5: they settle on real fog only, after the night has ended, from its observed hours (the night's state is fog), never from the forecast-based `tonight` of `GET /api/weather`.

## 3. D1 The daily frame and the bulletin

### 3.1 The frame (`backend/server/daily/frame.py`, pure)

`day_frame(now) -> DayFrame` gives:
- the game day `id` (00:00 to 24:00 Lisbon), with `startedAt` and `nextDayAt`;
- `bulletinDay` (from 08:00, the same as the Exchange's market day), with `publishedAt` and `nextBulletinAt`;
- `harborWeek` (Monday 00:00), with `nextHarborWeekAt`.

`resets` is a list in `bulletin.json`. With the must list only the Exchange has a daily cap, and it counts market days itself. Later loops add their own reset lines and count caps from the ledger between `startedAt` and `nextDayAt`.

The day seed is defined here but built with its first user (the driftline, which is "should"): `int(day.strftime("%Y%m%d"))`, plus the player id where a loop needs one per player.

### 3.2 The bulletin (`backend/server/daily/bulletin.py`, pure; the route gathers the inputs)

Lines, in this fixed order. All the same for every player. At most 6 lines.

1. `weather`: "Tonight: {tonight}. Tomorrow: {tomorrow}." Tonight is `night_for(now)`; tomorrow is the daytime after it. Unknown gives "no forecast".
2. `fog`: only while the coast is dark and tonight is a fog night. There is one text for `real` and one for `almanac`.
3. `exchange`: only while the flag `market` is on and the board answers. It is built from `market.board(admin, save=False)`, which only looks. It shows the feed (`live`, `cache`, `stale` or `replay`) and the paused companies. Any `ApiError` means no line and `exchange: null`.
4. `relit`: for 48 hours after the Relighting: "The coast is relit. The false light is out. A crew found it." (the public line of CASE-FILE 14.3).
5. `hook`: H1 (section 4.2).
6. `calendar`: the dated notice for the bulletin day, if there is one.

What stays out:
- **The next-lead line** (must in design 3.4) needs the crew's case state. Package S3 serves it signed in, for example `GET /api/bulletin/lead`. That keeps this answer public, cacheable and the same for everyone.
- **Spoilers.** Nothing names the culprit or the case's answers, before or after the solve. A test scans every text.

### 3.3 Content: `backend/content/bulletin.json` (server only, not on the public list)

```json
{
  "stateWords": {"storm": "storm", "fog": "fog", "rain": "rain", "calm": "calm and clear"},
  "noForecast": "no forecast",
  "weatherLine": "Tonight: {tonight}. Tomorrow: {tomorrow}.",
  "fogNightLines": {
    "real": "Fog tonight. Watch for the false light.",
    "almanac": "The harbor's almanac calls fog tonight. Watch for the false light."
  },
  "exchange": {
    "feedWords": {"live": "live", "cache": "recent prices", "stale": "old prices (trading paused)", "replay": "replay"},
    "allOpen": "Island Exchange: {feed}. No company is paused.",
    "somePaused": "Island Exchange: {feed}. Paused: {companies}."
  },
  "relitLine": "The coast is relit. The false light is out. A crew found it.",
  "relitLineHours": 48,
  "calendar": [{"on": "2026-11-16", "text": "Day 1. From today the harbor bulletin comes out every morning at 8."}],
  "resets": [
    {"when": "Every day at 00:00", "what": "A new game day begins."},
    {"when": "Every day at 08:00", "what": "The harbor bulletin is published."},
    {"when": "Every Monday at 00:00", "what": "A new harbor week begins."},
    {"when": "Never", "what": "Coins, buildings, shares and titles never reset."}
  ]
}
```

The loader refuses:
- `stateWords` or `feedWords` that do not have exactly the four keys;
- a template without its placeholders;
- a calendar date that is invalid or appears twice;
- `relitLineHours` outside 1 to 168;
- an empty text or an empty `resets` list.

The teaser wording deviates on purpose: the design's "The false light is out." would mean the opposite of the post-solve line (section 8).

### 3.4 Files

| File | Change |
|---|---|
| `backend/server/lisbon_time.py` | 1.1 |
| `backend/server/daily/__init__.py` | new: header comment for the package |
| `backend/server/daily/content.py` | new: loads `bulletin.json` and `chapter_two_hook.json` into frozen dataclasses. `DailyContentError` names the file and field. Split into two files if it grows past about 200 lines. |
| `backend/server/daily/frame.py`, `daily/bulletin.py` | new, pure |
| `backend/server/routes/bulletin.py` | new route. Thin: reads the weather (catches `SourceUnavailable`), the world stage (catches `ApiError`) and the Exchange, then calls the pure builders. |
| `backend/server/routes/bulletin_answer.py` | new: the shape of the answer (the Pydantic models and the small functions that fill them), so the route stays short |
| `backend/server/app.py`, `routes/__init__.py`, `server/__init__.py` | register the router; header comments |
| `backend/content/bulletin.json` | new |

### 3.5 Route: `GET /api/bulletin` (new, public)

```text
200 OK   Cache-Control: public, max-age=300
{"day": {"id": "2026-11-16", "startedAt": "2026-11-16T00:00:00Z", "nextDayAt": "2026-11-17T00:00:00Z",
         "bulletinDay": "2026-11-16", "publishedAt": "2026-11-16T08:00:00Z",
         "nextBulletinAt": "2026-11-17T08:00:00Z", "harborWeek": "2026-11-16",
         "nextHarborWeekAt": "2026-11-23T00:00:00Z",
         "resets": [{"when": "Every day at 00:00", "what": "A new game day begins."}, ...]},
 "lines": [{"kind": "weather", "text": "Tonight: fog. Tomorrow: calm and clear."},
           {"kind": "fog", "text": "Fog tonight. Watch for the false light."},
           {"kind": "calendar", "text": "Day 1. From today the harbor bulletin comes out every morning at 8."}],
 "weather": {"tonight": {"date": "2026-11-16", "startsAt": "2026-11-16T18:00:00Z",
                         "endsAt": "2026-11-17T06:00:00Z", "isNow": false, "state": "fog",
                         "isFogNight": true, "fogNightKind": "real"},
             "tomorrow": {"date": "2026-11-17", "startsAt": "2026-11-17T06:00:00Z",
                          "endsAt": "2026-11-17T18:00:00Z", "state": "calm"},
             "source": "live", "fetchedAt": "2026-11-16T08:55:00Z",
             "attribution": "Weather data by Open-Meteo.com, adapted for the game"},
 "exchange": null,
 "chapterTwoHook": null}
```

With the flag on: `"exchange": {"feed": "live", "pausedCompanies": [{"id": "harbor-trust", "name": "Saltreach Harbor Trust"}]}`.

| Case | Answer |
|---|---|
| Normal | 200 as above. A query string and an `Authorization` header are ignored. |
| Open-Meteo down and no recording | 200. `weather.source`, `fetchedAt` and `attribution` are `null`, the states read "no forecast", and the almanac still decides fog nights. |
| Flag `market` off, service missing, or board error | 200 with `exchange: null` and no Exchange line. |
| The world stage cannot be read (later, with L3) | 200 without the `fog`, `relit` and `hook` lines, and `chapterTwoHook: null`. |
| `bulletin.json`, `chapter_two_hook.json` or `weather_states.json` could not be read at start-up | `503 bulletin_unavailable` |
| Any method other than `GET` | `405 method_not_allowed` |

**Reasons.**
- It is a route, not the public content allow-list. The bulletin depends on the moment (weather, Exchange, stage), and its content file holds post-Relighting lines that the allow-list would serve to anyone at any time.
- `weather.tonight` is the same object and the same function as in `/api/weather` (a test checks this).
- The weather credit travels with it, because the licence asks for credit wherever the data is shown.

### 3.6 Tests (write first)

| File | Tests |
|---|---|
| `test_lisbon_time.py` | `test_a_winter_moment_has_the_same_date_in_lisbon_and_utc` (23:59:59Z vs 00:00Z); `test_in_summer_23_30_utc_is_already_the_next_day` (1 Jul 2027); `test_caps_reset_at_lisbon_midnight` (design name: the day of 28 Mar 2027 runs from 00:00Z to 23:00Z, 23 hours); `test_the_october_clock_change_day_lasts_25_hours` (from 30 Oct 2027 23:00Z to 1 Nov 2027 00:00Z); `test_the_bulletin_day_changes_at_08_00_lisbon` (07:59:59Z vs 08:00Z in winter; 07:00Z in summer); `test_the_bulletin_day_is_the_exchange_market_day` (parametrized, including both clock-change days, against `market_day_start`); `test_the_harbor_week_starts_on_monday_00_00_lisbon` (Sun 22 Nov 23:59:59Z vs Mon 23 Nov 00:00Z; Sun 4 Jul 2027 23:30Z is already Mon 5 Jul in Lisbon); `test_a_moment_in_another_timezone_gives_the_same_day`; `test_a_time_without_a_timezone_is_refused`; `test_a_server_without_timezone_data_uses_utc_and_says_so` |
| `test_daily_frame.py` | `test_the_frame_on_day_1_at_09_00` (the values above); `test_before_08_00_the_bulletin_is_still_yesterdays` (17 Nov 07:30Z gives bulletinDay 16 Nov and next 17 Nov 08:00Z); `test_the_frame_on_the_march_clock_change_day` (28 Mar 2027 12:00Z: started 00:00Z, next 23:00Z, published 07:00Z, week 22 Mar, next week 28 Mar 23:00Z); `test_what_resets_comes_from_the_content_file` |
| `test_daily_content.py` | `test_the_real_bulletin_and_hook_files_load`; `test_a_missing_or_broken_file_gives_no_content_and_a_log_line`; parametrized refusals; `test_open_world_texts_name_no_culprit_and_no_case_answer` (`SPOILER_WORDS`: "harbor master", "harbour master", "culprit", "schooner", "night clerk", "ledger", "twist"; see CASE-FILE 14.3) |
| `test_bulletin.py` | `test_the_bulletin_answers_without_signing_in_and_may_be_cached_for_five_minutes`; `test_bulletin_is_the_same_for_everyone_except_the_next_lead` (no header and two different tokens give identical JSON, with no lead in it); `test_the_fields_come_in_the_documented_order`; `test_the_lines_come_in_the_fixed_order`; `test_a_real_fog_night_gets_the_real_line_while_the_coast_is_dark`; `test_an_almanac_fog_night_gets_the_almanac_line`; `test_after_the_relighting_there_is_no_false_light_line`; `test_the_relit_line_shows_for_48_hours` (S+47:59 yes, S+48:00 no); `test_day_1_has_its_calendar_notice`; `test_the_exchange_line_needs_the_market_flag` (fake feed in the test file); `test_a_failing_exchange_leaves_out_the_exchange_line`; `test_with_open_meteo_down_and_no_recording_the_bulletin_still_answers`; `test_the_bulletin_and_the_weather_route_agree_on_tonight`; `test_the_bulletin_carries_the_weather_credit_whenever_it_shows_weather`; `test_without_its_content_the_bulletin_answers_503_bulletin_unavailable`; `test_only_get_is_allowed`; `test_the_bulletin_never_names_the_culprit`; `test_in_demo_mode_the_bulletin_never_calls_open_meteo`; `test_bulletin_is_listed_in_the_api_docs_as_a_get_route` |
| `test_world_stage.py` | `test_the_coast_is_dark_until_l3_builds_its_reader`; `test_a_relit_stage_needs_the_time_of_the_relighting`; `test_create_app_uses_the_reader_it_is_given` |
| `test_app.py` (addition) | `test_the_new_services_are_keyword_only` (`world_stage` and `clock`) |

Every test passes fakes: a weather transport, a `FakeClock`, a stage reader and a feed. The network guard in conftest catches anything forgotten.

### 3.7 What the screens will read later

- A plain-HTML bulletin panel that lists `lines[].text` in order. Countdowns come from `day.nextDayAt` and `day.nextBulletinAt`, and a help box shows `day.resets`.
- The weather credit (`weather.attribution` plus the CC BY 4.0 link, as `weatherAttribution()` does).
- S3's next-lead line goes below the shared lines.
- Codex adds `frontend/src/net/bulletin.js`. The bulletin is not part of the case adapter.

### 3.8 Out of scope

Elena's radio, today's beach, storm warnings, orders, matches, a presenter sources-and-sinks page (all "should"), and the next-lead line (S3).

## 4. H1 The Chapter 2 hook

### 4.1 The rule (`backend/server/daily/chapter_two_hook.py`, pure)

- **Nights after the Relighting.** Night 1 is the first night that starts at or after S, the first accepted solve (`WorldStage.relit_at`). If S is at 17:00Z on 20 Nov, night 1 is the night of 20 Nov. If S is at 21:30Z, night 1 is the night of 21 Nov.
- **When it fires.** At the end (06:00 Lisbon) of the first of nights 1 to `firesByNight` (3) whose period state is `calm`. If none of them is calm, it fires at the end of night 3. A night without data is not calm.
- **Why at the end of the night.** The verdict uses observed hours only, so it never shows on a forecast and then disappears. It also fits the past tense of "A light where no light was." (Chosen here; the design names only the trigger night.)
- `hook_fired_at(now, stage, states_by_night, rules, fires_by_night) -> datetime | None`. It returns `None` while dark or before the firing moment, otherwise the firing moment. "Fires once" is structural: one deterministic moment. After the end of night 3 it is visible for good, whatever data remains.
- **The bulletin line.** The `hook` line appears only on the bulletin day that starts at 08:00 that same morning. Between 06:00 and 08:00 the Board notice already shows.
- Example: S at 20 Nov 21:30Z, night of 21 Nov rainy, night of 22 Nov calm. It fires at 23 Nov 06:00Z, and the line is in the bulletin of 23 Nov.

### 4.2 Content: `backend/content/chapter_two_hook.json` (server only, never on the public list)

```json
{
  "id": "chapter_two_hook",
  "firesByNight": 3,
  "bulletinLine": "A light where no light was.",
  "notice": {
    "title": "A light where no light was",
    "text": "Last night a light flashed far out beyond the old fog line, where no lighthouse has ever stood: a row of long and short flashes, then dark, again and again until dawn. It was not the old false light. Whose lamp is it, and who is it calling? If you saw it, leave word here."
  },
  "beam": {
    "chart": {"x": 440, "y": 12},
    "pattern": ["short", "short", "long"],
    "flash": {"shortSeconds": 0.4, "longSeconds": 1.2, "gapSeconds": 0.5, "pauseSeconds": 4.0}
  }
}
```

- **The notice describes the flashes in words** and echoes Elena's drawing (Story v2 change 13: "a row of long and short flashes"). It names no exact pattern, so Chapter 2 can still choose one.
- **The beam is data for the beam package** (should):
  - its position is on the 448 by 256 chart, beyond Gull's Rest at (407, 34);
  - the pattern is a proposal;
  - neither the position nor the pattern is shown in a text.
- **The missing lens stays out of the public notice.** The lens count comes from the ledger at Gull's Rest, which is on the spoiler list in CASE-FILE 14.3. The solvers-only link (the reveal's last beat, "One lens is missing.") belongs with S3 and Chapter 2 content, in `backend/content/secret/`, later.
- **The loader refuses:**
  - an id other than `chapter_two_hook`;
  - `firesByNight` outside 1 to 7;
  - empty texts, or texts over 600 characters;
  - a chart position outside 0 to 447 by 0 to 255;
  - a pattern that is empty, longer than 12, uses words other than `short` and `long`, or equals the harbor alarm `long, short, long`;
  - flash seconds outside the range above 0 up to 10.

### 4.3 Files

`backend/server/world_stage.py` (1.2), `backend/server/daily/chapter_two_hook.py` (new), the hook part of `daily/content.py`, the `chapterTwoHook` field and the `hook` line in `routes/bulletin.py` and `daily/bulletin.py`, and `backend/content/chapter_two_hook.json`.

### 4.4 The field: `GET /api/bulletin` -> `chapterTwoHook`

The field is `null` while the coast is dark and until the hook fires. After that it is:

```json
{"id": "chapter_two_hook",
 "notice": {"title": "A light where no light was", "text": "Last night a light flashed ..."},
 "beam": {"chart": {"x": 440, "y": 12}, "pattern": ["short", "short", "long"],
          "flash": {"shortSeconds": 0.4, "longSeconds": 1.2, "gapSeconds": 0.5, "pauseSeconds": 4.0}}}
```

**Reasons.**
- It is world news for everyone.
- The bulletin route already reads the world stage and the night states the rule needs.
- The content file is not on the allow-list, so no browser can read the text through the API before the hook fires.
- When L3 builds `GET /api/world`, it may carry the same object; the shape is fixed here.

### 4.5 Tests (write first; `test_chapter_two_hook.py`)

- `test_hook_fires_on_first_clear_night_or_the_third_night` (design name; parametrized: calm night 1 fires 22 Nov 06:00Z; rain then calm fires 23 Nov 06:00Z; rain on all three fires 24 Nov 06:00Z)
- `test_the_first_night_after_the_relighting_is_the_first_that_starts_after_it` (17:00Z, exactly 18:00Z, 21:30Z, and 03:00Z the next day)
- `test_nights_without_data_do_not_count_as_calm`
- `test_while_the_coast_is_dark_there_is_no_hook`
- `test_before_it_fires_there_is_no_hook`
- `test_once_fired_the_hook_stays_for_good` (+1 day, and +60 days with no data)
- `test_the_bulletin_sends_the_hook_only_after_it_fired` (`null`, then exactly the content)
- `test_the_hook_line_is_only_in_the_bulletin_of_the_morning_after` (22 Nov no; 23 Nov 07:30Z notice but no line; 23 Nov 08:00Z line; 24 Nov 08:00Z no line)
- `test_the_new_light_does_not_flash_the_harbor_alarm`
- `test_the_notice_echoes_elenas_drawing`
- In `test_content.py`: `test_the_open_world_files_are_not_public_content` (the three file names are not in `PUBLIC_CONTENT`; `/api/content/bulletin` and `/api/content/chapter-two-hook` give 404)

### 4.6 What the screens will read later

- The Saltreach Harbor notice board (hotspot `notice_board`) shows `notice.title` and `notice.text` when the field is not null. A "new" mark is kept client-side by `id`.
- The sea chart's beam package (should) draws `beam` at `beam.chart`, flashing `pattern` with the `flash` timings.
- The `?demo=1` tour is browser-only and needs nothing.

### 4.7 Hand-offs

- **L3:** `world_state` must keep `relit_at timestamptz`, set in the same conditional update that turns `dark` into `relit`. The relight lock keeps it dark. L3 passes a `WorldStageReader` to `create_app(world_stage=...)`.
- **S3:** the next-lead line, and any solvers-only hook line (secret content).

## 5. Docs and contracts to change in the same work

- **`docs/INTERFACES.md`:**
  - In section 1, add `bulletin_unavailable` to the 503 row.
  - In section 2, change "Seven routes" to eight.
  - In the `GET /api/weather` section: the new example, the two field rows, the fog-night rule, the line "screens show the false light only before the first solve", and the case "rules file unreadable: `state` and `tonight` are null".
  - Add a new `GET /api/bulletin` section after it (3.5 text).
  - In section 3 (Weather), say that `onUpdate` also gets `state` and `tonight`.
  - In section 9: the L1 row now says it "also sends `state` and `tonight`"; a new row "Open-world must (W1, D1, H1)" with the three content files, `GET /api/bulletin` and `chapterTwoHook`; the L3 row gets `relit_at` and the reader; the S3 row gets the next-lead line; the L5 row says weather questions settle on real fog only.
  - Add the three files to the "Where content files live" paragraph.
- **`backend/content/README.md`:** three rows in "What lives here" (server only) and one format section per file (2.3, 3.3, 4.2). Append these, because the story branch (`docs/s0-story-round`) edits the same file.
- **`backend/content/weather/README.md`:**
  - The new curl address: `...&hourly=weather_code,precipitation,visibility,wind_speed_10m&past_days=31&forecast_days=3&timezone=GMT`.
  - "The recording of 5 Nov has no hours."
  - "Tests build hourly blocks in code."
  - No new recording is made: that would need a live call.
- **Header comments:** `server/__init__.py`, `routes/__init__.py`, `weather/__init__.py`, and every new file. Plain English, no em or en dashes.
- **Not touched:** `vercel.json`, `.github/`, `docs/STATUS.md`, `ROADMAP.md`, `supabase/`, `frontend/`, `.env.example`. `docs/ENGINEERING.md`'s repository map is outside the scope of this work, so it is decided at merge.

## 6. Decision entry draft (next free number after D017; renumbered at merge if it is taken)

The final text is entry D018 in `docs/DECISIONS.md`. This is the draft it was written from.

**D018 · Open-world must: weather states, fog-night rule, Lisbon day, bulletin and Chapter 2 hook · 2026-11-06**

**Status:** proposed in `feat/open-world-must`. It is accepted when a different teammate has reviewed it and it is merged. Points marked "chosen here" need Nils' OK.

**Decision:**
1. One pure function maps an hour's four values to storm, fog, rain or calm (in that order). The thresholds 0.8, 0.5 and 0.4 are in `weather_states.json`.
2. Nights run from 18:00 to 06:00 Lisbon. A night takes a state when 3 of its hours have it (chosen here).
3. The fog-night rule is applied exactly. It looks back 30 nights and assumes the almanac's every-third-night pattern from 16 Nov 2026 for older nights (chosen here).
4. The single Open-Meteo call adds 4 hourly variables, 31 past days and 3 forecast days.
5. Game time uses Europe/Lisbon:
   - the game day starts at 00:00;
   - the bulletin day starts at 08:00 (the Exchange's market day);
   - the harbor week starts on Monday at 00:00;
   - without tz data the server uses UTC.
6. `GET /api/bulletin` is public, computed on request and the same for everyone.
7. The Chapter 2 hook fires at 06:00 after the first calm night of the first three nights that start after the Relighting, or after the third (chosen here). It reads the stage through a reader that L3 provides.

**Why:** the design's "no timers" rule (3.3), no new outside source and no table. Everything is plain pure functions with tests. A look-back that is a multiple of 3 never stalls (a test tries one lonely real-fog night in each of the three almanac positions).

**Alternatives:**
- A `world_nights` table written once per night, with a bulletin snapshot (migration `20261106080000_world_nights.sql`, a database function, RLS with no player access, explicit grants, a memory fallback). It is stable across instances and forecast changes, but too big for 0.75 days. Rejected for now.
- 92 days of history: exact for longer, but about 6.8 Open-Meteo calls per fetch.
- A rule on real fog only: not the design's rule.
- Firing the hook at 18:00 on a forecast: it could appear and then disappear.

**Known limits:**
- Tonight's real-fog label follows the latest forecast.
- After 30 nights without real fog, one fog night can come a night early.
- Instances can disagree for up to 10 minutes.
- A freshly started instance during an Open-Meteo outage treats nights as unknown.

**Impact:** `GET /api/weather` (new fields), `GET /api/bulletin` (new), three content files, L3 (`relit_at`), S3 (next lead), L5 (real fog only).

## 7. Order of work, gates and done-when

| Slice | Contents | About (code + tests) |
|---|---|---|
| A | `lisbon_time.py`, `ClockDep`, the `clock` service, tests | 150 + 150 |
| B | Hourly Open-Meteo data (1.3), the deliberate test edits | 200 + 200 |
| C | W1 rules, nights, fog nights, route fields, INTERFACES weather section | 450 + 350 |
| D | World stage, the frame, the bulletin, the route, `bulletin.json`, INTERFACES bulletin section | 500 + 350 |
| E | H1 hook rule, content and field, decision entry, README sections | 200 + 150 |

Done when:
- [ ] `cd backend && uv run pytest -q`: all pass, count above 1487, nothing skipped except the tz-data markers.
- [ ] `cd backend && uv run ruff check .`: no problems. `uv run ruff format --check <changed files>`: clean.
- [ ] Manual check without `.env` and without live calls: `cd backend && DEMO_MODE=true uv run uvicorn main:app --port 8000`. Then `curl -s localhost:8000/api/weather` shows `state` and `tonight` (fog nights from the almanac only), and `curl -s localhost:8000/api/bulletin` shows `day`, `lines`, `exchange: null` and `chapterTwoHook: null`.
- [ ] The diff touches only the scope in section 5. No secrets, no `.env`, no `frontend/` changes.

## 8. Risks and open points

1. **Teaser wording (story author).** The design uses "The false light is out." both for the fog-night teaser (meaning it is shining) and after the solve (meaning it is extinguished). This spec changes only the teaser, to "Watch for the false light". The design also labels fog nights "by rule" (3.4) and "by the harbor's almanac" (5.4); the JSON value is `almanac`.
2. **"Calm and clear"** is the `calm` state, so an overcast dry night counts. If Nils wants "clear" to mean little cloud, add a cloud limit to the hook only.
3. **The proposed beam pattern and chart position** are for the G lane and the story author. Note that `OPEN-WORLD.md` 10.2 still says "Today the logbook holds none", which is stale since decision 3 approved change 13.
4. **Time zone data.** After the first preview deploy, look for the log line "No timezone database". If it appears, add `tzdata` before 28 Mar 2027 (a team decision about a dependency).
5. **Weather place.** With Lisbon instead of the Faroes, real fog is rarer and the almanac carries the teaser.
6. **Merge conflicts.** The story branch (`docs/s0-story-round`) also changes `backend/content/README.md` and `backend/server/tests/test_content.py`, and uses D018 too. Another branch edits INTERFACES section 7. Keep edits to separate, appended sections.
7. **Not verified:** that Open-Meteo's past hours stay stable after a night ends; how often real fog meets the 3-hour rule at the chosen place.
