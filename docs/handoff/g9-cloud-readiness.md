# G9 cloud integration readiness · 6 Nov 2026

Owner: Nils with Codex. Nils confirmed G9 is actively being developed in a cloud session;
the laptop pause is lifted. This note updates the published starter's requests without
claiming that its unpublished work or the complete browser journey has been reviewed.

Reviewed baseline: main `db4ddba`; last published G9 starter `cfbabd7`. G9's older
`frontend/HANDOFF-G9.md` is pinned to `c26f303` and predates the completed backend releases.
Use this note and current source contracts when syncing. Do not replace current main with
the starter's historical server/configuration proposals.

## Current answers to the starter requests

| Request | Current answer | Source / remaining proof |
|---|---|---|
| R1: disposable API/login | Ready: four local identities, configured host, actual migrated SQL and enabled case | [Local API guide](../LOCAL-TEST-SERVER.md), `backend/tools/local_server.py`, `local_players.py` |
| R2: deployed headers | Implemented and deployed: enforcing strict CSP, exact Supabase HTTPS/WSS origins and popup-compatible COOP | Current `vercel.json`; [production proof](stabilization-release.md). Preserve these headers |
| R3: sign-in flag | Registered, default false, present in config; production remains off | `backend/server/flags.py`, `routes/config.py`. Enable only after real G9 integration/settings proofs |
| R4: retire temporary auth | Deferred until the in-game sign-in works | Remove `/api/auth/exchange`, `auth-check.html` and coupled tests/checklist together. G9 must not depend on them |
| R5: public build values/redirect | Public Vite binding names exist for Production and Preview; production host binding exists | Metadata-only Vercel check, no values read. Exact new callback/actual OAuth round trip still needs verification |
| R6: bulletin flag | Registered, default false, enabled in production; disabled routes refuse before reads | `routes/bulletin.py`, `test_bulletin_flag.py` |
| R7: own-crew member IDs | Ready under existing authenticated SELECT/RLS; outsiders see no rows and player writes are forbidden | Foundation grants/policies; `case_sql/test_crew_member_read.py`. No API/schema addition needed |
| R8: crew push hints | Successful join/muster emits one version-only hint after commit; browser A4 maps it to `live_crew_updated` | `routes/crews.py`, `crew_nudges.py`, `frontend/src/net/live-view.js`, `test_crew_nudges.py` |
| R9: preview join | Optional, absent; extra request fields remain forbidden | Keep the browser's two-step code-shape preview. Do not send `preview:true` |
| R10: account metadata | GET `/api/me` includes `rerollsLeft` and verified `isHost` | `routes/me.py`, `test_me_browser_metadata.py` |
| R11: case contract/fixtures | All four minimum case phases, NPCs and followups are published on main | Current route models and view builders; [complete case proof](case-complete-release.md). Browser fixtures need placeholders; never copy protected server fixture text |
| R12: weather attribution | Resolved: source/licence/adaptation notices belong in Settings → Credits | [Interfaces](../INTERFACES.md), `frontend/src/shell/credits.js`. Preserve the clean HUD |
| R13: reveal fingerprints | Build verifies hash-only fingerprints against protected content and scans the production bundle | `frontend/scripts/check-spoilers.js`, `generate-reveal-fingerprints.js`. Private-content changes need the same reviewed fingerprint/build gate |
| R14: G9 preview stamp | Pending G9's own pushed checkpoint and reachable preview | Main's verified `build-info.json` is a different contract from G9's `build-stamp.json`; it cannot substitute for that preview proof |

Config now has ten registered flags and `capabilities.hostCaseClock`. Host clock UI also
requires the verified caller's `me.isHost`. The current production flags remain presence,
market, predictions, arena, case, bulletin and festival on; sign-in, sports and
raid off. This note changes no configuration.

## Integration issues to reconcile

1. **Published starter CSP collision.** Its `scripts/security-headers.js` rejects current main
   with “Platform CSP differs from the strict policy.” Its old exact proposal includes
   `media-src 'none'`. Reconcile the helper with the current deployed policy and original media;
   copying the old proposal over main would block shipped festival WAVs. Current unpushed G9
   work may already address this issue.
2. Keep main's host HTML entry, build-info plugin, third-party-notices plugin and licence output
   alongside G9's build-stamp work. Preserve strict CSP, production manifest restrictions and
   the opt-in case-lab restriction.
3. The current measured cold title is **20,504 /21,080 bytes: 576 bytes remain**. The starter's
   19,679-byte baseline and historical 35 kB budget comment are obsolete. Recheck actual merged
   output; keep account/auth/world code lazy.
4. Use R1's case-enabled four-player API for case golden paths. The separate G22 general-dev
   launcher deliberately leaves case/festival/sports off. Both default to port 8000; run only
   the appropriate owner on that port.
5. Keep stable action IDs after uncertain writes, clear private state on session changes, and
   map the current real DTOs/reasons/presence events. No browser outcome may award coins, resolve
   sports or open Relighting.

R1 command, from `backend/`:

```sh
LOCAL_TEST_SERVER=1 APP_ENV=local uv run --with pgserver --with 'psycopg[binary]' python -m tools.local_server
```

All guards are mandatory: exact local opt-in, `APP_ENV=local`, no `VERCEL`, loopback only.
Its normal API routes execute real disposable SQL; the fixture tokens never work on production.
Stop it with Ctrl-C to remove its owned scratch database. See the linked guide for the four
identities, local-only sign-in and bounded proof commands.

## Evidence and next release step

Independent bounded audit: **45 checks passed** for config/account metadata, crew nudges,
bulletin gating, local-server guards and real authenticated own-crew SQL/RLS reads/refused
writes. Scratch checks apply the complete chain twice. No live write, secret access, G9 edit
or full-suite rerun was performed by this audit.

After G9 publishes its cloud checkpoint: review and merge against current main, resolve the
items above, run its conformance and actual local-API solo/crew journeys plus affected browser,
spoiler, CSP and loading gates, then verify the preview/callback and production rollout. Turn
on sign-in only when that evidence is complete. Retire temporary auth as the coupled R4 step.
RELIGHT_OPEN stays unset. Physical-device and consented live OAuth/Realtime proofs remain
separate from disposable SQL or recorded-answer tests.

No new input is needed from Nils for G9 development at this stage. Sports still needs its
provider key directly in Vercel. The AI companion idea is cancelled and no longer blocks any work.
Direct production checks from this cloud host remain blocked
by its hostname network policy; the Vercel fetch helper's share query/401 masking limits still
apply. Do not relax application guards to make the helper pass.
