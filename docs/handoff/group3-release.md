# Group 3 release proof · 6 Nov 2026

Used by: Nils and the integrating agent. Branch: integrate/group3, based on main 60f7fd0.

## Changed

Merged Exchange v2 4d5aa5b, predictions e90a620 and Lantern Duels 8af962b with merge commits.
Preserved group 2 world, islet, bulletin and account behavior. Adapted the bulletin to Exchange v2
snapshots without sweeps. Connected all three panels to the shared in-memory account session.
Guarded lazy arena/market lifetime and kept all panel overlays blocking movement. New arena tests
prove pending loads cannot recreate a disposed game's panel. Mainline in-game sign-in still awaits G9.

## Verified

- Backend/story: 9692 passed; Ruff clean.
- Frontend: 1601 passed; 12 focused audio/adapter/lifecycle tests passed (includes two new race tests).
- Production build and spoiler guard: 111 text files, 12 protected lines, no elimination data.
- Independent code reviewer: no remaining code blocker after fixes; independent focused 18 passed.
- Per-file SQL reviewers: 090000 contract60 + races, 100000 source1683, 110000 source672 passed.
  Each independently exercised the sorted chain and grants/RLS using scratch pgserver/psycopg.
- Live files applied one per call in order, stored text hash matched repository, then history version
  re-recorded. No applied file edited. Security advisor after each: expected known findings only.

| Version | Name | MD5 |
|---|---|---|
| 20261106090000 | exchange_leverage | 2466eed8daf719b18806b56ca5309ac3 |
| 20261106100000 | prediction_desk | 97c8a006598c8c1b7c7f1ff0f23d7613 |
| 20261106110000 | lantern_duels | af6f9038f00ccff1550aad2501b08ce4 |

Final live counts: 18 public tables, 1 view, 16 public policies, 5 realtime policies, 17 wallet reasons,
24 project functions excluding rls_auto_enable, 4 sequences, 5 public triggers. V1 market tables were
empty at preflight. Post-apply advisor: is_crew_member/rls_auto_enable, server-only RLS tables and the
leaked-password notice only. [Advisor explanations](https://supabase.com/docs/guides/database/database-linter).

## Not verified and remaining

Cloud Chromium uses SwiftShader. The living-world 55fps assertion fails on unchanged main too
(25fps baseline versus 40fps candidate in these samples; both 112 draw calls); this is not proof of
hardware performance. Physical device/audio listening and live two-player sign-in await G9.
The sequential browser regression continues; record its final outcomes before calling every gate green.
Deployment, FEATURE_FLAGS activation and live stock/market checks are the next release step.
The roadmap also records existing sound and the optional ChatGPT hint helper, pending OAuth registration.

## Final release checkpoint

Reconciled G10 remote checkpoint6041a63 without overwriting its work; preserved all token/lifetime fixes.
Final full backend9693 passed3 optional skips; frontend1603 passed; opt-in SQL3 passed. World66,
production7 and lifecycle9 browser assertions passed. Gitleaks2.73MB diff: no leaks. Mainc12a707 is live;
flag redeploydpl_eTT4FDsNYCG6QAqJK7xdbjU2pw3S is READY. Production/api/config confirms market,
predictions,arena,live_presence true. Direct live-market/stock verification remains pending: the connector
adds a shared-access query marker rejected by the intentional cache guard; the browser connection is
unavailable and the cloud network does not allow the production hostname. No guard was changed.
