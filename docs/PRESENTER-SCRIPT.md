# Class demo: the coast, then the schooner

Used by Nils and the presenter. Two timed scripts use the live site and stop at the schooner: **no twist, accusation, identity reveal or later celebration is shown**. Explain only capabilities present in the deployed build. Keep the [release checklist](RELEASE-CHECKLIST.md) beside this script.

## Current scope, 6 November 2026

The completed case release proves 69 player-kit mixes and actual solo+NPC/four-player API-to-SQL journeys. It does not connect the normal browser mystery: G9 is paused until the laptop returns. Original sound is implemented. Festival and host console are deployed; sports code is deployed with its flag off. Festival waits for the first shared Relighting. Sports lacks its provider key and stays off. The optional ChatGPT helper lacks an approved official website client and stays off. See [presentation sources](presentation/sources.md) for pinned evidence and limits.

The live minimum case/bulletin release is verified, but `RELIGHT_OPEN` stays unset and no production solve is used for the demo. `?demo=1` is a local presentation stand-in. The optional `?demo=1&festival=1` practice is memory-only and creates no real claim, match or coins; it is outside these mystery scripts, which still stop at the schooner.

## Before the audience arrives

- **Day before:** open the Supabase dashboard and check the project is active; resume if paused. Read the latest **Keep Supabase awake** Actions result without triggering another run. Follow the release checklist and keep private settings off screen.
- Open a private window at <https://the-great-plot-twist.vercel.app/?demo=1>. Confirm that the production build matches the release candidate and that the presenter panel exists after play. Keep private dashboards, Console, course pages and account settings on a separate, unprojected desktop.
- Set browser zoom to **100%** (`Ctrl+0`, or `Cmd+0` on macOS), use the final projector resolution, and test keyboard focus, movement and chart travel on the actual laptop. Try low quality if needed. Avoid unexpected system shortcuts and notifications.
- Sound on: check system and browser output, open game Settings, set a comfortable volume, then click a game button to unlock Web Audio. Keep visible captions enabled. Respect reduced-motion preference; do not disable it solely to make a longer shot.
- Check the laptop frame rate with browser performance tooling during rehearsal. **`?perf=1` is not implemented on current main**, and the built-in FPS view is development-only; that URL is not a measured pass. A smooth short sample is not a sustained hardware guarantee.
- Record the approved run with the operating system's screen recorder, **save it locally**, play it once with network disconnected, and check audio and the final frame. **`?demo=1&record=1` currently acts like `?demo=1`; it does not record a file.** Keep an external player ready on the title frame, not an autoplaying video with later story content.
- Confirm complete teammate credits in the existing `frontend/src/shell/team.js`. Current Credits has three placeholders: do not present those as verified names. Nils checks the public-name inventory below once before demo day.

## Presenter controls: use this safe route

| Address/control | Actual behavior on audited main |
| --- | --- |
| `/?demo=1` | Adds **Highlights tour** on title and **Presenter · local rehearsal** during play |
| `/?demo=1&record=1` | Same presenter tools; no implemented recorder |
| `/?perf=1` | No production FPS overlay; does not enable presenter tools |
| **Highlights tour** / **Start highlights tour** | Starts an automated, memory-only rehearsal that continues beyond the schooner unless stopped |
| **Next beat · Space** | Advances the active automated tour; not a safe universal stop key |
| **End rehearsal** | Stops/restores an active automated tour; hidden in individual-shot mode |
| **Individual shots** → **Visual beat** → **Play visual** | Plays only the selected shot, without chaining to another |
| **Skip · Escape** / Escape during a shot | Ends that current visual; it also closes automatically after its duration |

**Default for both scripts: do not start the automated tour.** Click **New game**, show the intro, then **Return to the island** (or Escape). That closes the intro modal so the presenter panel can be used. Open **Individual shots** and play only these visible dropdown labels, one at a time:

1. **three lights** (`three_lights`, about 8 seconds);
2. **fog lift** (`fog_lift`, about 5 seconds);
3. **schooner reveal** (`schooner_reveal`, about 6 seconds; this is the ship visual, not the identity reveal).

Allow for bounded asset loading and reduced-motion behavior. Wait until each modal closes before selecting the next. **After the schooner closes, press Escape to open Pause, then Return to title. Do not select any later visual or return to case screens.** There is no automatic next shot in this route. If a shot hangs, its **Skip · Escape** button ends it; do not hammer Space.

For a private rehearsal of the memory-only intro, title **Highlights tour** uses bundled data even when the API is down. Its **End rehearsal** button is visible while the tour is active. End it during the intro/arrival, before later beats. The complete tour is not approved for the class demo: it includes board/finale presentation and a post-schooner destination. If it was started accidentally, press **End rehearsal** as soon as enabled; switch to the prepared recording rather than waiting through an uncertain stop.

## Five minutes

| Time | Click/do | Say |
| --- | --- | --- |
| 0:00–0:30 | Show title at `?demo=1`; click **New game** | “The Great Plot Twist is our browser mystery, built around an explorable pixel coast and a choice-based introduction.” |
| 0:30–1:20 | Show the intro and one available, non-ending action; do not rush to an ending | “Choices have requirements. The same intro rules are tested in Python and JavaScript. Continue replays this browser's accepted moves; it is not a claim of a cloud save.” |
| 1:20–2:20 | **Return to the island**; walk briefly; open Settings, show quality/sound, then Back/Resume | “The world is original pixel art. Input, collision and presentation have separate responsibilities; HTML controls remain readable.” |
| 2:20–3:30 | Open sea chart, choose **Saltreach Harbor** and let travel finish; point at the Exchange/crew-table hooks without opening a case | “The chart connects places and the world loads the current destination. The Exchange, prediction desk and Lantern Duels now have screens and server contracts. Signed-out reading is separate from authenticated play-money actions; the normal browser mystery connection is still paused.” |
| 3:30–4:00 | Return focus to the world and open **Individual shots** | “The static browser client calls a Python API. Python and database constraints decide authoritative account, crew and play-money changes; rehearsal visuals do not award progress.” |
| 4:00–4:40 | Play the three approved shots, waiting between them | “Three beams trace a bearing; the fog parts; a ship appears. This is a local visual rehearsal, not a shared-case verdict.” |
| 4:40–5:00 | Stop at the schooner; Escape → **Return to title** | “That is our demo boundary. The rest of the case is for the players. The repository includes reproducible checks and a walkthrough for each lane.” |

If travel/loading uses the buffer, shorten narration or drop the settings visit; never recover time by skipping into an unapproved shot.

## Ten minutes

| Time | Click/do | Say |
| --- | --- | --- |
| 0:00–0:45 | Title, **New game** | Introduce the project, four equal teammates and agent-assisted development with independent automated review gates. Do not invent missing credit names. |
| 0:45–2:15 | Show two available non-ending intro choices and inventory if available | Explain condition checks, accepted/refused actions and mirrored engine tests. Do not read any server-only story file or explain the solution. |
| 2:15–3:30 | Return to island, walk, pause/settings, resume | Explain normalized movement, collision, native pixels, visible focus, sound after a gesture and reduced-motion support. |
| 3:30–5:00 | Chart → Harbor; show the office, Exchange and table as world landmarks | Explain route search, one active place and cleanup on travel. Distinguish the implemented feature screens from the still-paused normal mystery/multiplayer connection. |
| 5:00–6:15 | Point at the weather attribution/source shown by the current build | Explain live/cache/stale/recorded fallback. If it says fallback, say “recorded fallback”; do not call it live. Do not change global server configuration on stage. |
| 6:15–7:30 | Keep game view visible while describing the eight-line README architecture | Explain API identity checks, server-only changes, safe repeats, versioned saves and row-level read restrictions. State that the complete case backend has real solo/four-player API-to-SQL proof, while G9 browser integration is paused. |
| 7:30–8:30 | Pause → Credits; optionally show the art workshop in a prepared second public tab; return to game | Credit original generated graphics/audio, Open-Meteo adaptation and package licences. Explain tests, build, spoiler guard and independent agent review. Label placeholder names as a release gap if still present. |
| 8:30–9:20 | Open **Individual shots** and play only the three approved visuals | Describe light projection, fog and the schooner without a culprit, accusation or interpretation of the mystery. |
| 9:20–10:00 | After schooner, Escape → **Return to title**; invite code questions | Offer a lane walkthrough or explain-back question. Keep the title on screen; do not open later case screens. |

## Network, audio or graphics failure

If only the API fails but world assets have loaded, recorded presenter content may still work; do not refresh a working cached page during the talk. Normal New game intro needs its API content, whereas the explicit tour intro is bundled. Do not diagnose sign-in, reconfigure Supabase or use the later fake case workshop in front of the class.

If the live workflow cannot complete, say: “The connection is unavailable; this is our prepared recording of the same release.” Switch to the **local recording**, checked beforehand, and stop its playback on the schooner. The URL's `record=1` is not a fallback recording service. If sound fails, use captions and narration; if graphics fails, use the recording rather than exposing debug consoles. If no verified recording exists, show the README/lane architecture and state the demo could not run; do not claim a prerecorded pass.

## Nils's public-name check

This is a wording/collision review, not a claim of legal clearance. Include aliases and rehearsal/gallery-only labels so they can be checked too. Do not connect any role to a culprit or solution. Generated player names are not a fixed cast and real player identities are not listed here.

| Category | Names/labels to check | Where used/defined |
| --- | --- | --- |
| Setting and destinations | Saltreach Isles; Lighthouse Isle; Saltreach Harbor; Home islet; Smugglers’ Cove; Wreck Point; The Teeth; Gull’s Rest | `frontend/src/shell/controller.js`; `frontend/src/world/places/registry.js`; chart and arrival labels |
| Lighthouse hotspots | Keeper’s cottage; Elena’s writing desk; The old jetty; Lighthouse door; Keeper’s lamp | `frontend/src/world/places/registry.js` |
| Harbor hotspots | Harbor Office; Office window; Harbor Light; Ferry pier; Jail; Island Exchange; Prediction kiosk; Sports pavilion; Signal station; Reward notice; Captain’s Table; Keepers’ post room; Wall of Lights | Same registry; harbor interactions |
| Home hotspots | Cabin plot; Workshop plot; Windmill plot; Greenhouse plot; Islet signal station; Your driftline beach | Same registry; islet interactions |
| Other hotspots | Back room; Low-tide cave; Arena gate; Salvage yard; Salvage-yard gate; Wreck beach; Reef; Watchtower ruin; Raid arch; Fog bank | Same registry; cove/wreck/reef interactions |
| Intro room labels | The Keeper’s Cottage; The Writing Desk; The Boathouse; Foot of the Lighthouse; The Stairwell; The Lamp Room | `backend/content/story.json` scene titles; mirrored `frontend/src/demo/intro-story.json` |
| Public intro cast | Elena Vos / Elena; Keeper | Same public intro; `frontend/src/story/intro.js` |
| Gallery character/crew labels | Explorer; Crew Deckhand; Crew Navigator; Crew Cook; Crew Salvager; Character Harbor Master; Character Masked Captain; Character Fisherman; Character Coastguard Commander; Character Salvage Foreman; Character Elena Vos | `frontend/src/pixel/story-catalog.js`, `frontend/src/pixel/library.js`; pose/portrait variants share the same role label; gallery/rehearsal is not an identity mapping |
| Case-rehearsal cast titles | The fisherman in the yellow coat; The salvage foreman; The coastguard commander; The harbor master | Public `suspectTitles` in `frontend/src/adapter/fake/data.js`; do not open deduction data on stage |
| Rehearsal captains and partners | Captain Lantern; Captain Shoal; Navigator partner; Cook partner; Salvager partner; Deckhand partner | `frontend/src/adapter/fake/state.js`, `arrival-crew.js` and role definitions in `data.js` |
| Ambient roles | ferry clerk; doorman; dockhand; day clerk | `frontend/src/adapter/fake/routes.js` |
| Server crew partner titles | the Lookout; the Deckhand; the Bosun; the Cook | `backend/server/crews/seats.py`, `PARTNERS`; not identical to gallery archetypes |
| Exchange companies | Saltreach Harbor Trust (SHT); Tidewright Works (TIDE); Swiftwater Ferries (SWFT); Pier Post Courier (PIER); Market Hall Guild (MHG); Two Shores Change Bureau (TWSH); Greyfathom Salvage (GREY) | `backend/content/market/companies.json`; public board; dataset name check is still pending |
| Real weather location | Torshavn, Faroe Islands | Default settings and recorded weather; a real data-source location, not an invented island |
| Generated captain names | Approved adjective + noun + number combinations; no fixed list of player identities | `backend/content/names.json`, `backend/server/account/names.py`; review the word lists privately, not account responses |

After G9/G10 or other main updates, recheck the registry, public story, company list and team module. Update this inventory from actual source changes rather than adding planned names. Keep private case content out of this page.
