# G9 browser handoff

Checkpoint notes and server requests for Claude. Authored changes stay under `frontend/`, except Nils’s approved eight-word dictionary update.
Nils explicitly authorized cloud continuation. G10 publishes the case contract on
`feat/case-backend`; use its published contract and fixtures only.

Current scope and pickup queue: [G9-ROADMAP.md](G9-ROADMAP.md). Nils confirmed that all required
G9 features remain in scope and all 17 overflow items are deferred. Historical remaining-work
lists below are superseded by that decision. Work is now reported in 30–60-minute slices.

## Stopped at Nils’s chunk boundary (7 Nov 2026)

**Work is stopped. Do not start another chunk until Nils asks to continue.** The regression slice
ran about 40 minutes; it exceeded the requested 30-minute boundary. No test/browser/agent task is
still running. No application source changed during this slice.

Completed implementation: Exchange source `95de0b6`, all 11 stream gates green as recorded below.
The subsequent clean-source driver was stopped during online: **35/44 completed, 32 passed,
three failed; nine not completed.** It is not a completed full run or checkpoint. Failures:
night storm **31 FPS /108 calls**, cinematics **16 FPS /97 calls**, and the local chaos suite's
bulletin opening timeout. World passes all 62 checks at **32 FPS /97 calls** after ten trips.
Accessibility passes; cold title stays **21,071 JS /11,878 CSS bytes**.

The bulletin failure is an older pending-import/flag-off ownership race plus an outdated off-modal
expectation. A four-file fix and native regression tests are prepared and independently reviewed,
but **not applied or runtime-tested**. Next chunk is its red-first verification and stream gate.
Later draft ownership and the forming-crew polling/editor issue are preserved in coordinator notes.

Evidence: `captures/20261107_G9-C3-market-paused/paused-proof.json`; all 35 rows, three failed logs
and full selected numeric reports are preserved. Every raw generated capture/log is archived;
historical committed captures were restored exactly. User cancellation is recorded separately from
functional failure. All C3 evidence remains under 3 MB. No real service/account/database was used.

**26 chunks remain, each estimated 30–60 minutes, about 21½ active hours in total.** The counted
queue, completion checks, parallel ownership and R11/R16 dependencies are in `G9-ROADMAP.md`.
All 17 overflow items are deferred. No new decision is needed from Nils.

Local source is `95de0b6`; last verified remote remains `8844962`. Exchange and these latest notes
are **not pushed**. Finish verification before publishing the team baseline. No main merge,
deployment or external message was performed.

Paste-ready update for Claude:

> G9 is paused at Nils’s requested chunk boundary. Exchange is locally committed at 95de0b6 with
> all 11 stream gates passing. The following full regression was interrupted at 35/44 commands:
> 32 passed, two FPS failures and one local bulletin-opening failure; nine did not complete.
> A bounded bulletin fix is prepared, unverified. Latest remote is still 8844962. There are 26
> required 30–60-minute chunks left; all 17 overflow items are deferred. R11 needs the exact
> published serialized nested case DTOs/placeholder fixtures; R16 needs presenter-hardware proof.
> Read frontend/G9-ROADMAP.md and HANDOFF-G9.md. Do not merge this as a completed checkpoint.

## Chunk 1: Exchange verified locally (7 Nov 2026)

Changed: stream 9 wires the adopted Island Exchange to the current private service lease and
anonymous price client. Strict flags, server prices/limits, original uncertain click IDs and fresh
read-before-resend remain authoritative. Accepted or uncertain trades reconcile the shared wallet
and own ledger through fresh server reads. Older ledger replies cannot overwrite newer ones.
US stock reopening captions use Lisbon time; exact server credits appear only in Settings → Credits.
Expiry closes private market UI without reopening it over Account. A successful Check again keeps
its confirmation visible while the unresolved trade still requires an explicit resend.

Verified: **all 11 stream commands passed**, including **3,130 tests / 208 files**, build/spoiler,
loading, CSP/inventory, the full recorded online and fault runs, accessibility and the world check.
The market passes **106 checks at 1280/375 px** and **14 fault cases / 81 checks at 375/320 px**.
The actual Rewards screen and shared coin counter follow accepted, unknown and repeated trades;
recorded ledger rows and Settings-only credits are checked through native controls. Accessibility
passes **50 contexts / 150 viewport samples**, including the short 375 × 400 market audit.
World passes all **62 checks**, including ten trips at **32 FPS / 97 calls** and later travel/error
assertions. Cold title remains **21,071 JS / 11,878 CSS bytes**, within the unchanged caps.

Evidence: `captures/20261107_G9-C3-market/stream9-proof.json`, its 54 source fingerprints and
normalized logs, plus the market/fault reports and selected desktop/phone captures. Earlier C2/C3
evidence is preserved. Failed attempts and the red/green regressions are recorded; no check was
weakened. Source base is `8844962`; the committed candidate is pinned by those fingerprints.

**Local stream delivery; not a pushed checkpoint.** Next is roadmap chunk 2: run the full
44-command driver on this clean committed source, perform the engineering check, then push and
verify the remote SHA. Last verified remote remains `8844962`. Main `64fc731` is already adopted;
the latest fetch found no new main or published case-contract commit.

Not verified: R16 presenter/night-storm proof, R11's live case paths, native background-tab pause,
other engines, assistive technology or physical devices. Live OAuth/services/databases were not
used. All test clients/endpoints are injected or intercepted with generated placeholders.
Remaining: required streams **10–21**; all **17 overflow items are deferred**. Prepared later
modules are unverified coordinator drafts. R11/R16 remain external; no decision is pending for Nils.
Schema 1, 24 view keys, 25 intents, exact events, accepted replay and server-free demo remain intact.
No package, asset, font, budget, main merge or deployment was added.

## Stream 8 committed; full regression recorded (7 Nov 2026, source `e720eaf`)

Changed: authoritative islet integration is committed as `e720eaf`. Main `64fc731` is already
adopted; the latest fetch found no new main or published case-contract commit. Branch remains
`feat/g9-real-adapter`. This note and its evidence do not change application source.

Verified: the full driver ran all **44 commands on clean committed source `e720eaf`: 41 passed**.
Initial failures were living, world and a production intro-view timeout. The isolated diagnostic
and **two unchanged original production-command reruns passed all seven assertions**, on the same
clean source. The initial timeout remains recorded; its cause is unproved and no application fix
is claimed. Latest individual command outcomes are **42 passed / two failed**, combining that full
run with the production reruns, not claiming a second full run. Evidence, all 44 logs and every
rerun: `captures/20261107_G9-C3-after/clean-regression-proof.json`. Historical C2/C3 evidence and
its source/hash chains are preserved.

Browser pass: **streams done so far, not a checkpoint**. The unchanged storm gate measured
**12 FPS / 112 calls** (requires 55 FPS); travel after ten trips measured **14 FPS / 97 calls**
(requires 30 FPS). Cinematics passed this run at **30 FPS / 97 calls**, including its later cleanup
and event assertions. R16 still requests presenter-hardware proof. No frame threshold, density,
art, weather, crowd count or loading budget was reduced. Cold title remains **21,071 JS /
11,878 CSS bytes**. All 11 stream gates and **2,896 unit tests / 195 files** passed.

Not verified: R11's live case connection, real OAuth/services/databases, native hidden-tab pause,
other engines, assistive technology and physical devices. Tests use intercepted/injected endpoints
and generated placeholders only. Remaining: streams **9–21**, all **17 overflow items**, R11/R16.
Continue market, predictions/arena, bulletin and available final-readiness work. No new decision
is needed from Nils. No main merge, deployment or external message was performed.

## G9 stream 8: islet path passed; continuing G9 (7 Nov 2026)

Merged from main: `64fc731`, already adopted through `ca80469`; latest main and published case
contract remain unchanged. Branch: `feat/g9-real-adapter`. Source base: `4d2b7e2`;
the verified candidate is pinned by all 60 source fingerprints in the evidence.

Changed: one factory-owned L2 engine supplies the real islet panel and existing `buildLight` intent.
Authenticated startup reads, complete five-plot validation, account/read epochs, fresh read-before-retry,
original uncertain click IDs and fresh wallet/ledger reconciliation keep server answers authoritative.
Crew reminders open the same panel; the finale displays the supplied station card. Expiry opens one
real Account expired/report state, and old-account controller work cannot block or unlock a new send.
The world clears private builds at account boundaries. No new package, asset, font or budget.

Verified: all **11 stream-gate commands passed**, including **2,896 unit tests / 195 files**,
build/spoiler, loading, CSP/inventory, L2 panel/world, the actual local panel-to-world-to-third-light
rehearsal, complete production online and HTTP-fault paths, and accessibility. The production islet
path passes **42 checks** at 1280/375 px, all three unknown-outcome scenarios and expiry.
Islet faults pass **7 cases / 42 checks**. Accessibility passes **45 contexts / 135 viewport samples**
and the short 375 × 400 crew/islet audits. Cold title is **21,071 JS / 11,878 CSS bytes**,
within unchanged caps. Actual server-confirmed stations and healthy native save status were reviewed
in both world captures. Evidence: `captures/20261107_G9-C3/stream8-proof.json`; failed attempts and
corrections are identified there. Every endpoint is injected/intercepted with generated placeholders.

Browser pass: stream 8 green on the fingerprinted candidate. **Streams done so far, not a checkpoint.**
The clean full 44-command driver must run on committed source before the next push. R16 remains
open for the three unchanged cloud frame failures; no threshold, density, art or weather was reduced.

Not verified: live case third-light projection/post-build refresh (R11), real OAuth/services/databases,
native hidden-tab pause, other engines, assistive technology or physical devices. The local third-light
rehearsal does not claim that the live case is connected.

Remaining: streams **9–21** and all **17 overflow items**; continue market, prediction/arena, bulletin
and available final-readiness work while R11 blocks case streams 12–15. Requests for Claude: R11/R16
unchanged. No new decision for Nils. No main merge, deployment or external message was performed.

Contract mirror for Claude: optional nested schema-1 `crew.isletReminder {message, actionLabel}`,
`finale.islet {id, name, built, canBuild, buildLabel, caption}`, and `finale.isletFailure`
`{reason, message, status?, retryAfterSeconds?, retryUntil?}`; absent legacy fields remain valid and
private fields clear outside signed-in state. `retryUntil` is a presentation deadline only. Shared
conformance validates these fields. No new reason, top-level view key, intent or event: schema 1,
24 keys, 25 intents and accepted replay remain intact. L2 maps `not_enough_timber`→`materials_required`,
`insufficient_funds`→`no_coins`, `plot_occupied`→`already_built`, `not_buildable_yet`→`light_not_ready`;
`already_applied` starts an authoritative readback; the world still requires an accepted GET. A4 emotes remain wave/cheer/point/lantern/shrug.

## G9 streams done so far, not a checkpoint (7 Nov 2026, source `443400c`)

Merged from main: `64fc731`, already adopted through `ca80469`; the final fetch found no new main
or published case-contract commit. Branch: `feat/g9-real-adapter`.

Changed: stream 6 wires authoritative crews/muster and their recorded recovery paths (`3788db5`);
stream 7 wires scoped A4 presence, crew pushes, cleanup and private display guards (`443400c`).
The compact control fixes are in `a0b9ad1`. Each stream has its own gate evidence below.

Verified: `npm run test:g9 -- --phase=after --keep-going` ran with the installed Chromium selected
through `CHROME_PATH`. It ran all
**44 commands on committed source `443400c`: 41 passed, three failed**. All rows record
`sourceDirty: false`; application source was also checked unchanged after the run. The run includes
**2,545 unit tests / 182 files**, build/spoiler, loading, CSP/inventory, accessibility, exact events,
replay, cleanup, the server-free demo tour, and the production online/account/crew/presence and
HTTP-fault paths. Cold title remains **21,073 JS / 11,878 CSS bytes**, within unchanged caps.
Evidence: `captures/20261107_G9-C2/clean-regression-proof.json`; all 44 result rows and logs remain in
`captures/20261106_G9-C1-after/`. Earlier stream evidence remains intact.

Browser pass: **41/44 at `443400c`**. The unchanged storm check recorded **34 FPS / 108 calls**
(required 55 FPS), ten-trip world **15 FPS / 97 calls** (required 30 FPS), and active cinematic
**17 FPS / 97 calls** (required 30 FPS). Each failed command stopped at its frame assertion; its
subsequent assertions are not claimed. R16 now requests all three unchanged checks on approved
hardware. No frame threshold, crowd, density, art, weather or first-load budget was changed.

Not verified: target-hardware frames, native background-tab pause in headless Chrome, real OAuth or
services/databases, other engines, assistive technology and physical devices. Every online test uses
injected clients or intercepted endpoints and runtime-generated credential placeholders.

Remaining: streams **8–21** and the **17 overflow items**. Continue the islet, market, prediction,
arena and bulletin streams now; case streams 12–15 still need R11's exact serialized nested DTOs.
Requests for Claude: R11 remains open; R16 includes the cinematic check. No new decision from Nils.
Contract changes Claude must mirror: **wave, cheer, point, lantern, shrug** in the protected A4
docs. Schema 1, all 24 view keys, 25 intents, exact events and accepted replay remain intact.
No main merge or deployment was performed.

## Stream 7 passed; continuing G9 (7 Nov 2026)

A4 now uses strict flag/name/account gates, opaque peer views, movement/emotes, crew-seat RLS reads
and scoped crew pushes. Hidden-tab cleanup rejects late imports/events/reads; a new visible sample
observes the original 500 ms allowance. Public config reads survive private cleanup. Detached cached
pages clear private display data, stable arrival controls retain focus, and cosmetic receipts keep
authoritative notices. Forced crew push reads supersede older polls without a second retry owner.

Verified: **2,545 unit tests / 182 files**, build/spoiler guard, loading, CSP and inventory, production
online, recorded HTTP faults and accessibility. Online passes 18 anonymous, 21 auth, seven sign-in
flag/expiry, 45 account, **44 crew** and **37 presence** checks, at 1280/375 px. Presence includes five
strict flag/name/account cases, real SDK WebSocket framing, movement/stopping, waves/cooldown,
eight peers plus two hidden, crew hints, reconnect, sign-out and deletion. All endpoints are
intercepted and credentials are generated for each run. No real account, service or database is used.
Actual browser sends are matched by sequence and enforce the unchanged **500 ms** allowance;
endpoint arrival and monotonic timings remain separate diagnostics. The reviewed send-boundary
follow-up passed all 37 presence checks after the full gate, without changing application code.
HTTP fault coverage remains partial: account/create, join and muster are covered; later panel/case
groups remain pending rather than receiving artificial passing coverage. Accessibility passes 43
contexts / 129 viewport samples and the short 375 × 400 crew audit. Cold title is **21,073 JS /
11,878 CSS bytes**, within unchanged caps. Evidence: `captures/20261107_G9-C2/stream7-proof.json`.

Native hidden-tab pause remains **unverified**: installed headless Chrome keeps the background tab
visible. Visibility was observed, never mocked. A display machine can run the same intercepted
check with `G9_BROWSER_HEADLESS=0`. Real OAuth/services, other engines, assistive technology and
target-hardware frames remain outside this recorded proof.

This is **streams done so far, not a checkpoint**. Source base is `3788db5`; the next full driver
must run on this stream's clean committed source before push. Origin is still `367189d` at this
note. Main `64fc731` is adopted. R11 and R16 remain open; no budget or quality gate was relaxed.
Next: streams 8–11 and available final-readiness work, then case streams 12–15 when R11 is published.
No new decision is needed from Nils. No main merge, deployment, new package or browser download.

Contract mirror for Claude: A4's approved emotes are exactly **wave, cheer, point, lantern, shrug**.
Please mirror this list in `docs/INTERFACES.md` section 7 and `specs/A4-live-presence.md`; those
protected files were read only. Schema 1, 24 view keys, 25 intents, exact events and replay persist.

## Stream 6 passed; continuing stream 7 (7 Nov 2026)

Crew create/join/muster now use server snapshots, normalized two-tap joins and owned-seat
permissions. Visible forming crews poll every 5 s; read-monitor recovery remains the sole
5/15/30-second retry owner. Successful/uncertain writes start fresh readbacks, so an older held
poll cannot restore seats, publish a stale failure or delay the next healthy poll. Input and
clipboard continuations guard account readiness and the currently displayed code.

Verified: **2,425 unit tests / 177 files**, build/spoiler guard, loading and production online.
The online run includes **44 crew checks at 1280/375 px**; join and muster fault journeys each
pass **7 cases / 42 assertions**. Accessibility passes **43 contexts / 129 viewport samples**
plus the new **375 × 400 crew audit** (focus, keyboard attributes, 16/18 px text, 44 px targets,
clipping and overflow). Cold title remains **21,072 JS / 11,878 CSS bytes**, within unchanged caps.
Two server-mustered partners are visible on the crew screen and as idle harbor art in both reviewed
world captures. Cosmetic staging stays inside the renderer; actual case poses/jobs/orders await R11.
Evidence: `captures/20261107_G9-C2/stream6-proof.json`, source fingerprints and recorded reports.

This is **streams done so far, not a checkpoint**. Source base is local `a0b9ad1`; origin remains
verified at `367189d`. Main `64fc731` is already adopted. No real account, service, database,
deployment, main merge, package addition, browser download or budget change was used.
The final online gate passed after correcting two test-fixture issues; the failed attempts remain
summarized in the proof. The fixture now also answers cloud saves with versioned replay data.

Next: stream 7, including the prepared closed-screen privacy/controller guard and public-config
lifetime regression before any push. Then finish 8–11 and available final-readiness work while
R11 is open. R16 frame proof still blocks checkpoint 1; run the full driver on final committed
source before the next push. Remaining streams: 7–21 and overflow; case streams 12–15 need R11.
Public schema 1, 24 view keys, 25 intents, events and accepted-action replay are unchanged.
No new decision is needed from Nils. Real OAuth/services, native tab behavior in a headless browser,
other engines, assistive technology and target hardware remain outside this recorded proof.

## Verified UI follow-up; continuing stream 6 (7 Nov 2026)

Origin is verified at `367189d`; exact clean source `03dd379` remains the 37/44 baseline below.
The UI-only follow-up passes **2,333 tests / 172 files**, build/spoiler guard and production online.
Targeted browser, experience/input, bulletin/Journal, build-stamp controls, islet controls,
accessibility and loading checks pass. Cold title remains **21,072 JS / 11,878 CSS bytes**.
Those targeted UI checks ran with a same-pixel culling experiment; the final full stream gate ran
again after restoring main rendering. The experiment is parked, with no FPS improvement claimed.
The 55-FPS storm / 30-FPS travel proof remains unresolved (R16); no gate or quality changed.
Evidence: `captures/20261106_G9-C1/ui-integration-followup.json`. This is **not a completed checkpoint**.

Next: continue crew/presence and panel streams. Their preparations are isolated and untested until
applied; original stream-6/7 files remain SHA-preserved. The next full driver must use its final
committed source. R11 still blocks exact case DTO projections; R16 requests unchanged target-hardware
frame proof. No real account, service, database, deployment or main merge has been used.

## G9 streams done so far, not a checkpoint (7 Nov 2026; source 03dd379)

Streams 2–5 are implemented and the sign-in/account stream gate is green. **Checkpoint 1 is incomplete.**
Main `64fc731` is adopted through `ca80469`, after earlier merges through `db4ddba`, `f23e86e`,
`f91f541` and `364d178`. Branch stays `feat/g9-real-adapter`; Claude integrates. No reset, rebase,
force push, main integration, manual deployment, real account or live database was used.

Changed: stream 2 (`c8e94d7`) supplies the real adapter core; stream 3 (`387e01b`) wires lazy GitHub
PKCE/renewal/logout; stream 4 (`9772f3e`) adds authoritative names/kit/rewards/replay saves/conflicts/
deletion; stream 5 (`74d9a82`, `89aa9bc`) adds loading/retry/cooldown/report states and recorded chaos.
Cloud proof portability is `ca20f61`. Integration `03dd379` adopts main's compact rooms/story/quiet HUD,
fixes stale logout/preview/conflict state, and prevents autosaves or Continue from bypassing the current
identity's cloud reconciliation. Phone text/targets, contrast and arrival focus are preserved.

Verified on exact clean source `03dd379`: `npm test` **2,326 tests / 171 files**, build/spoiler guard,
`npm run test:online` (**18 anonymous + 21 auth + 7 flag/expiry + 45 account checks**), production chaos
(**28 cases / 160 assertions**, four groups; nine future groups explicitly pending), loading, CSP and
CSP inventory. Accessibility passes **43 contexts / 129 viewport samples**. Original golden/chaos,
production, both pixel/UI-kit modes, lifecycle, presenter and main's six visual-release checks pass.
Cold title: **21,072 JS / 11,878 CSS bytes**, unchanged caps **21,080 / 12,000**. No dependency or
browser was added. Phone arrival/deletion were reviewed. Independent account/save review found no
critical issue. Commit-range secret scan and final push checks are recorded at the push.

Full `npm run test:g9 -- --phase=after --keep-going` completed **37/44**, retaining source-identical
passes with `--resume` after an environment restart. Every row identifies `03dd379` and clean source.
Evidence: `captures/20261106_G9-C1/checkpoint1-03dd379-driver.json` and the after logs. Temporary
capture paths are normalized; the interrupted first-run history is retained separately.

Open failures (no gate or quality was reduced):
- `living`: night storm **33 FPS / 109 calls** on SwiftShader, versus **55 FPS / <150 calls**; initial
  same-source run was 26 FPS / 111 calls. `world`: ten-trip sample **20 FPS / 97 calls**, versus 30 FPS.
- `browser`: obsolete fixed-DPR retina assertion conflicts with main's bounded adaptive framebuffer.
- `experience`: title-pad fixture needs the new Friends step before Settings.
- `bulletin`: Tonight is unconditionally hidden by quiet HUD; prepared fix puts it inside opt-in Journal.
- `build-stamp`: opt-in Performance panel blocks the native room Exit click.
- `claude-islet`: fixture waits for a deliberately blocked world prompt while the panel is open.

Next: continue from these passed streams under this non-checkpoint label (the brief allows early
stream pushes after three hours), profile unchanged workloads, then apply hash-checked fixes and gates.
Do not call checkpoint 1 complete until the full driver passes. Keep all frame/draw/title limits and
onscreen art/weather/crowd/density unchanged. Original stream-6/7 files remain SHA-preserved and absent;
restore only after proof/push, checking main deltas before replacing tracked files. Continue streams
6–11, then available final-readiness work while R11 is open; finish case streams when DTO examples arrive.

Requests for Claude: **R11 remains open for sanitized serialized case response examples**. Published
four-phase routes/fixtures at `3098c0a` still expose CaseSnapshot inputs, not exact nested response
shapes for earned cards/leads/jobs/lights/partners/credits. Workaround: existing approved placeholder
schema fixtures only; never read secret case data or the server serializer. R2/R5/R14 deployed/callback/
public-preview proof remains external. Dictionary R15 is resolved by Nils's exact eight-word exception.

Contract changes: mode `online`, reason `sign_in_required`, additive account sign-in/setup/name/
connection/retry/save fields and `rewards.status`; schema 1, 24 keys, 25 intents and exact events remain.
Replay data is `{kind:'intro'|'world', actions:[accepted_id,...], place:known_place_id}` (max 300 IDs /
100,000 bytes), never snapshots/auth/case answers. Default SDK persistence is tab-only sessionStorage
with guarded fallback/verifier; bearer stays in A2 memory. Callback/auth headers use approved public
build bindings. No decision is needed from Nils. Actual services, OAuth, databases, sockets, deployed
callbacks, Safari/Firefox, VoiceOver, physical devices and the presenter laptop remain unverified.

## Checkpoint-1 cloud portability follow-up (not yet a completed checkpoint)

The first full committed run at `89aa9bc` passed 30 of 38 commands. All failures are retained in
`captures/20261106_G9-C1/checkpoint1-first-driver.json`; this is not a green checkpoint. The account
mapper now keeps the controller's explicit setup message. Cloud browser runs use installed Chromium
through `CHROME_PATH`, with no browser download. The intro check owns an anonymous loopback fixture
serving unchanged public story bytes through Vite's actual proxy, rather than assuming a laptop API.
World presentation uses the existing fictional sports board; demo allows only anonymous config/weather
GETs while preserving every timed-tour, journal and event assertion. SDK origin inventory classifies
only exact pinned-library literals without adding CSP permissions. HTML inventory checks the exact
four compiled entries plus the existing auth-check/help/privacy pages, rejecting extra/missing pages.

Main has advanced from `364d178` to `64fc731` with the approved visual/interior release. Adopt its
modules and original actions before final checkpoint proof. The latest published G10 contract at
`3098c0a` still lacks sanitized serialized case DTO examples; R11 remains open for those examples.
No actual service/account/database or deployed proof is claimed. Prepared streams 6–7 remain backed up
and separate. Next: finish targeted portability checks, merge main, then the full committed driver.

## Checkpoint-1 review follow-up in progress

Stream-5 foundation is committed at `74d9a82`; the complete driver is not yet accepted. Its first pass
found a night-storm frame miss (49 FPS, 112 draw calls on SwiftShader) and review found one ungated
previous-request sign-in control. The follow-up gates that control from the latest view, blocks hidden
activation, avoids unchanged status DOM updates and keeps failed Continue on the title. A queued native
close event no longer clears a reopened modal's active state. A new production journey covers a loaded
account modal, live flag-off, expired Continue, reachable report action and return to title (7 assertions).
Targeted tests pass 111/6 plus 8/2; the storm rerun passes at 60 FPS / 112 calls without changing its
55-FPS gate, quality or art. Full checkpoint verification must run again on the committed follow-up.

The 11 prepared stream-6/7 files are SHA-256 preserved in the coordinator's ignored node cache, with
another temporary backup. They are intentionally absent from the committed checkpoint workspace.
Restore/verify them after the checkpoint push. The driver now stamps the commit and source-dirty state;
resume cannot reuse a different commit or changed source. No reset/rebase/force push or second worktree.

## G9 stream 5: core request-state foundation verified (cloud, November 2026)

Checkpoint 1's full committed driver remains pending. Main is merged through `364d178` via `6b65028`;
stream 3 is `387e01b`, stream 4 is `9772f3e`. Main cancelled the AI companion; do not restore the old
`companion_llm` flag from the portable brief. The adopted privacy notice is unchanged; its stale test
now checks the cancelled feature is absent while preserving all provider/deletion/security assertions.

Changed: 300-ms loading, five-second slow reads, global/inline connection words, explicit report/retry,
original-control cooldowns, quiet screen-reader start/end announcements and first-sign-in actions.
GETs retry at 5/15/30 seconds, then on a tap; hidden timers pause and stale account finishes cannot apply.
Config focus respects both backoff and exhaustion. Recovered own-account reads finish name/save/crew/
ledger hydration, including recovery during pending name setup; recovered saves recheck conflicts.
SDK failures retain safe numeric status only. Ledger failures show unavailable, not an empty history.
Manual captain-setup retry is explicit. An anonymous arrival's sign-in action is flag/build gated;
its accepted journal survives OAuth return and Continue confirms the first server grant exactly once.
Expired writes require another explicit action. Account copy is 18 px; controls remain 16 px / 44 px.

Verified: `npm test` **2,284 / 163 files**, build (166-file/twelve-line spoiler guard), loading, CSP,
recorded online, shared call states and production chaos. Full working-tree counts include prepared
stream-6/7 files; the exact committed checkpoint driver will exclude them. Online has 45 account checks
plus 21 auth checks; chaos has **28 cases / 159 assertions** across account, intro, save and crew.
Accessibility passes **38 contexts / 114 viewport samples** at 1280/375/320 with no findings/errors.
Phone deletion/cooldown captures were reviewed. Exact evidence: `captures/20261106_G9-C1/stream5-verification.json`.
Cold title remains **20,873 JS / 11,771 CSS bytes** (caps 21,080 / 12,000). No new dependency or browser.
Independent review fixes and regressions cover read hydration, busy initialization, deadline/focus races,
and sign-in gating; native typing/restoration fixture races were fixed without weakening outcomes.

Coverage limit: remaining chaos groups are explicitly pending until their streams; `--all-groups`
fails while any are missing. Later streams must extend the same production runner. Not verified:
actual OAuth/accounts/database/socket, deployment, other engines, VoiceOver or physical devices.
Contract additions: account.connection/namePending/canRetryName and rewards.status; no new public intent,
top-level schema key or event. Prepared crew/presence files remain uncommitted and unwired.
Next: preserve those files, run the complete checkpoint-1 driver on the committed code and push; then
wire/verify/commit streams 6–7 and continue checkpoints 3–5 and overflow. Claude integrates; no deploy.

## G9 stream 4: account and replay saves verified (6 Nov 2026, UTC)

Checkpoint 1 remains incomplete. Main is merged through `f91f541` via `708b7eb`; stream 3 is `387e01b`.
Changed: server-owned name initialization/reroll, confirmed first kit and replay arrival, own-row rewards,
versioned accepted-action saves, minute/scene autosaving, both conflict choices and two-tap deletion.
Cloud selection also updates the device journal, so a later timer cannot overwrite that choice. Anonymous
Act 1 immediately updates its device-save view without a cloud write. Sign-in generation and account
scopes reject late auth, save and deletion completions. Normal logout keeps the journal; deletion clears it.

Verified: `npm test` **2,175 passed / 157 files**, build (162-file/twelve-line spoiler guard), loading,
recorded online, CSP and accessibility. The full count includes prepared, uncommitted stream-5 kit/tests;
the combined checkpoint gate remains required. Evidence: `captures/20261106_G9-C1/stream4-verification.json`.
Account has 42 browser assertions at 1280/375; auth has 21. Accessibility passes 29 contexts / 87 viewport
samples at 1280/375/320 with no findings/errors. The phone deletion warning/focus was reviewed and fixed.
The final frozen gate passes after fixing cold test imports and fake-socket ownership/cleanup, preserving
all assertions and timeouts. Independent review also found and fixed auth/logout and anonymous-save races.
Cold title: **20,874 JS bytes / 11,771 CSS bytes**; caps unchanged at 21,080 / 12,000.

Cloud `data`: `{kind: 'intro' | 'world', actions: [accepted_id, ...], place: known_place_id}`; max 300
validated IDs / 100,000 bytes, no snapshots, auth or case answers. Details are in GRAPHICS.md.
Not verified: live accounts/OAuth/database/socket, deployed callbacks/preview, other browsers or hardware.
Remaining: stream 5 states/retries/chaos, checkpoint-1 full driver/push, then checkpoints 2–5 and overflow.
Prepared stream-5 files stay separate. Requests remain in the table; no new intent/event/schema change.
Decisions for Nils: none. Branch `feat/g9-real-adapter`; Claude integrates; no main merge or deployment.

## G9 stream 3: in-game PKCE wired and locally verified (6 Nov 2026, Berlin)

Checkpoint 1 remains incomplete. Merged main `db4ddba` through `1da59ae`, then `f23e86e`.
Changed: lazy GitHub/S256 auth, callback cleaning, default tab-only SDK persistence, idle restoration,
access-token renewal, immediate persisted logout and bounded SDK cleanup. Private views clear on expiry.
A2 renews a 401 once, retains the same request body, and rejects late identity changes before replay.
Cached public reads never carry a bearer, including callers in the adopted festival module.
Production controls require `flags.sign_in`; missing build values show plain setup text. The installed
Supabase MIT notice is under Settings → Credits, with main's exact generated notices retained.

Verified: `npm test` **2,141 passed / 152 files** (includes 23 prepared, uncommitted stream-4 tests),
`npm run build` (161-file/twelve-line spoiler guard), `node scripts/check-online-golden.js`,
`node scripts/check-loading.js`, `node scripts/check-csp.js`, `node scripts/check-a11y.js`.
Exact logs: `captures/20261106_G9-C1/stream3-verification.json`. Production auth has 20 assertions at
1280/375, runtime-generated placeholders, intercepted endpoints, tab reload and SDK sign-out. Public
requests remain anonymous. Independent review found three lifecycle races; regression fixes were
independently re-reviewed with no unresolved findings. Phone account capture was reviewed.
Cold title: **20,873 JS bytes**, **11,771 CSS bytes**, contrast **6.48:1**. Caps remain 21,080 / 12,000.
Title gamepad polling, world preload inventory and call-state styles now load lazily. The redundant
module-preload polyfill is omitted for Vite's supported modern-browser target.

Not verified: actual OAuth/account/database/socket, deployed callback/preview, Safari/Firefox,
VoiceOver or physical devices. No real services/accounts, browser downloads or configuration writes.
Remaining: wire prepared stream 4, finish stream 5, then checkpoint-1 complete driver and checkpoints 2–5.
Requests: R15 resolved by Nils's explicit exception: only eight reviewed dictionary words outside
frontend were added; the linter and assertions are unchanged. Main's current readiness note answers
R1/R3/R6/R7/R8/R10/R11/R12; update the detailed request table during checkpoint-1 completion.
Contract changes: additive `account.canSignIn` / `account.signInMessage`; no intent/event/schema change.
Decisions for Nils: none. Branch: `feat/g9-real-adapter`; Claude integrates; no main merge/deploy.

## Cloud handoff: laptop work stopped cleanly (6 Nov 2026, Lisbon; handoff commit accompanies this note)

Nils explicitly moves the continuation to a cloud session because the laptop is closing. This
supersedes the old laptop-only setup. Read `CLOUD-HANDOVER-G9.md` then the full portable `G9-BRIEF.md`.
Stable stream 2 is committed and pushed at **`c8e94d7`**. Main last verified: `60f7fd0`, via `93386f8`.
This handoff adds only tested, unused auth storage/return helpers and portable instructions; no
sign-in wiring is claimed. Latest full unit suite: **1,127 passed / 93 files**. Production build and
117-file/twelve-line spoiler guard pass; recorded online, loading, CSP and a11y are green.
The regression manifest remains **37/37 green**, refreshed for the helper handoff. Exact results:
`captures/20261106_G9-C1/cloud-handoff-verification.json`.
Resume at **stream 3**, then 4–5 to finish checkpoint 1. Checkpoints 2–5 and overflow remain.
No live OAuth/database/Realtime or deployed proof. Do not resume laptop implementation unless Nils
requests it. The cloud session has all necessary code, brief, contracts and evidence on this branch.

## G9 streams done so far: real adapter core (6 Nov 2026, Lisbon; stream 2 commit accompanies this note)

This is a partial checkpoint 1, not its completion. Merged main `60f7fd0` via `93386f8`; adopted A4's
pinned library/presence modules, L2's panel and enforcing headers. STATUS conflict took main's version.
Changed: `src/online/case-adapter/` owns held answers, schema-1 projections, validation, reason/UID
mapping, guarded recovery and config refresh. Shared kit display data carries no rehearsal rules.
`adapter/lazy-online.js` starts after the first title frame. Production checks share recorded API
answers; `test:online` and the sequential G8-plus-G9 driver are added. Header preview mirrors main.
Verified: `npm ci --offline`; `npm test` — 1,096 passed, 91 files; `npm run build` and its spoiler guard;
`npm run test:online` at 1280/375. `npm run test:g9 -- --phase=after --keep-going`, followed by
`--resume --rerun=tests,build,loading,csp,online`, finishes **37/37 passed**. Exact commands/results:
`captures/20261106_G9-C1/stream2-verification.json` and `captures/20261106_G9-C1-after/Verification.json`.
Browser pass: all existing G8 checks plus build stamp, report privacy, call states, inventory and
recorded online intro. Cold title is **20,971 bytes**, 109 below the unchanged 21,080 cap. The adapter
request starts after the first title frame. Title contrast is 6.48:1. World round trips retain resources.
Not verified: actual OAuth/session/socket/database, public preview/deployed headers, physical devices,
Safari/Firefox and VoiceOver. The online browser test currently covers the anonymous part only.
Remaining: streams 3–5 for checkpoint 1, then checkpoints 2–5 and overflow. The library is on main.
Requests for Claude: R2 is now on main (deployed proof pending); R11's phase 1 is published by G10.
Contract changes Claude must mirror: `mode: online`; additive reason `sign_in_required`; 25 intents,
all 24 schema keys, exact events and local replay preserved. Replayed case refusals stay refused,
per G10's published contract. No real adapter dependency imports fake rules.
Decisions for Nils: none needed to finish stream 2. A paste-ready main-chat update is due at completion.

## G9 checkpoint 0: playtest identity and online slot ready (6 Nov 2026, Lisbon; verified build ee72758-dirty)

Merged from main: `c26f303`, via `996daef`; the final sync found nothing newer on main.
Changed: stream 0 (`ee72758`) completes title/perf stamps, dirty/environment labels, public issue drafts,
validated context/outcomes and report-link hooks. Stream 1 defers the account summary, preserves the
contract while splitting refusal vocabulary, reserves selection/PKCE entry points and adds the shared
validated security-header builder. No real adapter or sign-in is claimed at this checkpoint.
Verified: `npm test` — 500 passed, one canonical-bulletin parity check skipped until its input reaches
main, 67 files; `npm run build` — built, 112-file/twelve-line spoiler guard green. Stream 1 browser commands
and exit codes are in `captures/20261106_G9-C0/Verification.json` and `stream1-verification.json`.
Browser pass: loading, title timing, build stamp, report privacy, CSP/tour, inventory and accessibility
are green on the candidate build: `node scripts/check-loading.js`,
`node scripts/check-title-start.js --phase=after`, `node scripts/check-build-stamp.js`,
`node scripts/check-problem-report.js`, `node scripts/check-csp.js`,
`node scripts/check-csp-inventory.js`, `node scripts/check-a11y.js`. Cold title 19,679 bytes, 1,401 bytes of room. 23 a11y contexts pass.
Not verified: public Vercel preview stamp (R14), deployed headers, real OAuth/session/Realtime, physical
phone/controller, Safari/Firefox and VoiceOver. Title timing observations are not a controlled speed comparison.
Remaining: stream 2 real-adapter core, then 3–5 for checkpoint 1. Group 2/library and panels are not on
main yet. The canonical bulletin test resumes automatically when its main input exists.
Requests for Claude: R1–R13 retained; R14 asks for an accessible public preview URL/stamp check.
Contract changes Claude must mirror: none to schema/methods/reasons/events. Reports add only fixed enums,
coarse browser version, numeric perf fields and contract-vocabulary outcomes; no arguments or player data.
Decisions for Nils: none required for checkpoint 0.

### Coordinator resume state

The latest note at the top supersedes old stream-resume instructions below earlier checkpoints.
Root owns shared hooks/configuration/docs and all sequential browser/GPU checks. Keep source frozen
while a browser gate runs. Continue checkpoint-1 verification before restoring later-stream source.

The preparations below are **ignored and uncommitted**. Their presence does not establish active
integration or a passed gate. Paths are relative to `frontend/`. Preserve these bytes and their SHA
manifests outside the node cache before any `npm ci`, which can remove them:

- Original eleven stream-6/7 files and manifest: `node_modules/.cache/g9-pending67-h4lu91ts/`.
  It also has an independent coordinator backup. Apply only after checkpoint-1 proof/push, checking
  every recorded SHA and reconciling changed main files rather than overwriting them blindly.
- Presence identity/roster-race fixes and regressions:
  `node_modules/.cache/g9-presence-fix-4f86c4ea29/` (mirrored paths start with `frontend/`).
- Presence renderer identity/pool correction and regressions:
  `node_modules/.cache/g9-presence-render-6bd5bae39249/` (manifest; syntax/static review only).
- Auth/lazy-auth own-crew-seat read helpers and test copies:
  `node_modules/.cache/g9-crew-seats-009362ab55e0/`.
- Crew UI candidate: `node_modules/.cache/g9-crew-ui-fm2FwB/src/screens/crew.js`.
  Root still composes authoritative permission flags, polling and change hooks.
- Market modules/tests: `node_modules/.cache/g9-market-e86f9c6a984c/`.
  Root still injects the adopted A2/session hooks and runs stream gates.
- Bulletin modules, generic fixtures/tests and manifest:
  `node_modules/.cache/g9-bulletin-c3f71def23/`.
  Root still wires strict flag loading, safe projections/observations and stale/attribution wording.

`node_modules/.cache/g9-legacy-light-gates-z1j1mmau/` is an archived SHA-backed preparation for the
three legacy harness fixes already applied by root; do not restore it again over newer source.
Never stage or commit an ignored preparation tree. Verify and commit each restored stream separately.
Use relative evidence paths; add only changed-screen PNGs and keep the checkpoint near 3 MB.

## Requests for Claude

Request status is carried forward through merged main `64fc731`. Do not repeat a request; update its status.
Settings and database changes belong to Claude/G10. No request authorizes G9 to change them.

| Id / status | Route or setting | Missing behaviour / why it matters | Proposed shape | Blocks | Meanwhile |
| --- | --- | --- | --- | --- | --- |
| R1 · ready on main `f23e86e` | Disposable API/test identities | Current readiness note documents four local identities and an opt-in scratch startup | `docs/handoff/g9-cloud-readiness.md` / local test-server guide | Stream 20 B proof remains | Recorded/intercepted part A; no live services |
| R2 · on main / team deployment proof | `vercel.json` headers | Preserve main’s enforcing CSP, exact Supabase origins, audio and popup-compatible COOP | Source of truth remains current main; fixture substitutes only the placeholder origin | G9 deployed callback/preview proof | Exact local enforcing preview |
| R3 · ready / production off | `flags.sign_in` | Registered and default false; enable externally after callback/settings proof | Existing boolean contract | Live sign-in rollout | Production controls strictly gated |
| R4 · open | `/api/auth/exchange`, `/auth-check.html`, coupled backend tests/checklist | Temporary team check should retire together after in-game sign-in is live | Remove temporary route/page/tests together in a server/integration package | Nothing | G9 never calls the exchange route and leaves public auth-check files untouched |
| R5 · bindings ready / callback proof pending | Public build values and redirect | Main confirms Production/Preview binding names; G9’s actual callback round trip is not verified | Existing `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`, root game return | Live sign-in proof | Generated placeholder build and intercepted PKCE |
| R6 · ready / team reports enabled | Bulletin flag | Flag and fail-before-read behavior are on main | Existing `flags.bulletin` boolean | G9 bulletin integration/proof | Read only when strictly true |
| R7 · ready on main | Own-crew member read | Existing authenticated SELECT/RLS permits own crew and rejects outsiders | Auth client reads bounded own-crew rows | G9 presence mapping/proof | Empty member list on refusal |
| R8 · ready on main | Crew push hints | Successful join/muster emits one post-commit version hint | Existing A4 `live_crew_updated` contract | G9 crew/presence wiring | Five-second poll only while forming crew screen is open |
| R9 · optional/open | `POST /api/crews/join` | Optional server preview before spending a wrong guess | `{code, preview:true}` returns preview only, never joins | Nothing | First tap normalizes/previews code shape locally, second confirms |
| R10 · ready on main | Account metadata | GET me supplies verified `rerollsLeft` and `isHost` | Existing additive fields; still initialize the idempotent name after sign-in | G9 mapping/proof | Host controls remain hidden unless verified/capable |
| R11 · all phases published; serialized nested DTO needed | Published case contract / `case_fixtures` at `3098c0a` and main | Current fixtures are CaseSnapshot inputs; exact nested card/lead/search/job/light/partner/credit DTO keys/types are not published there | Add redacted serialized GET-case fixtures for active/night/solved states, replacing every ID/prose value with placeholders while preserving exact keys/types | Verified streams 12–15 projections | Use approved frontend schema fixtures; never inspect secret data or view implementation |
| R12 · resolved on main | Weather attribution | Readiness confirms credits only in Settings → Credits | Existing contract | Nothing | Preserve clean HUD and weather check |
| R13 · process/open | G10 changes to `backend/content/secret/` | New secret content can invalidate committed reveal fingerprints | Same server commit runs frontend build and commits regenerated hash-only fingerprint fixture | Subsequent build gates | Regenerate only the hash fixture after a merge if build requests it |
| R14 · open | Public preview URL / Vercel system build values | GitHub reports successful deployment but only links an inaccessible dashboard; preview SHA cannot be checked without login | Give an accessible preview origin and confirm `build-stamp.json` has a real SHA and `environment: preview`; enable Vercel system build values if SHA is dev | Stream 0 preview verification only | Compiled local stamp/env/fallback and browser checks pass; no account login attempted |

| R15 · resolved by Nils’s explicit eight-word exception | `scripts/text-lint/words.txt` | G24's shared dictionary rejects correctly spelled existing G9 copy and browser names, so the full unit gate fails | Review/add `chrome`, `firefox`, `safari`, `submitting`, `enable`, `perf`, `attempts`, `mit` | All full stream/checkpoint unit gates | Targeted tests/build/browser still run; only the eight approved vocabulary lines changed outside frontend; linter/assertions unchanged |
| R16 · open | Presenter-laptop frame proof | Cloud SwiftShader misses unchanged 55-FPS storm / 30-FPS travel and cinematic gates; checkpoint 1 is incomplete | Run unchanged offline checks on approved hardware and publish numeric evidence; see `requests/R16-presenter-frame-proof.md` | Checkpoint 1 / stream 19 | Continue independent crew/presence and panels; keep the non-checkpoint label; no quality or budget waiver |

## Browser pass

Checkpoint 0 local browser checks pass; exact evidence is linked above. Public preview verification is R14. Real OAuth, a live
Supabase session/socket, deployed headers, Safari/Firefox, VoiceOver, a physical phone and controller are
not verified by the recorded-answer Chrome checks.

Additional isolated preparations (syntax/static review only, unapplied and untested):
- `node_modules/.cache/g9-islet-c521ce3c44cc/`: stream-8 L2 identity guards and host hooks.
- `node_modules/.cache/g9-online67-candidates-f91e65db69/`: stream-6/7 intercepted browser fixtures.
- `node_modules/.cache/g9-production-proof-8supx1iy/`: stream-16 production boundary proofs.
All have hash manifests and integration notes; apply only after checkpoint-1 proof, then run real gates.

Further isolated candidates (syntax/static review only; unapplied, untested):
- `node_modules/.cache/g9-stream10-integration-review-8aag_jnp/`: prediction/arena modules, tests and G13 handoff note.
- `node_modules/.cache/g9-presence-render-6bd5bae39249/`: unchanged-quality captain-label layout optimization plus tests.
