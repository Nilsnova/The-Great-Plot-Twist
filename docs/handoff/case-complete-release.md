# Case minimum, server followups and economy release · 6 Nov 2026

Used by: Nils and integrating agents; source branch integrate/case-npc, following live main40ba1d5.

- Completed the four minimum case-backend phases: earned clues, shared board, three-light night,
  once-only Relighting and free NPC partners. The original applied files remain byte-identical.
- NPC orders use stored effective seconds, exact player/uid/crew receipts, deterministic validated
  dialogue, ordering-player pin credit and bounded history. A target NPC/kit changed during reopen
  returns 409 before another RPC; eight actual-adapter regression cases prove the fix.
- All **69 player-kit mixes** finish using production player/NPC decisions, distinct seats for
  deductions and three lights. A signal station is affordable from starting resources alone;
  the proof uses no purchased clue, market income or world event. Sabotage tests prevent bypassing
  the production fetch/light rules. Witness pin-only jobs preserve ordering-player credit.
- Real **solo+NPC and four-player HTTP → production services/views → scratch SQL** playthroughs
  complete intro grants, crew start, station build, clues, deductions, night, locks, accusation,
  locked reveal and exact repeats. Ledger sums match stored paid rewards; a new crew sees no old
  reveal. The disposable server has no production credentials or network database transport.
- Server followups add private/default no-store responses, secure deployed URL and bounded
  three-part-token validation, own-account host/reroll metadata and bounded crew hints. The local
  fixture API is explicitly opt-in, refuses Vercel, binds loopback and cleans up its scratch database.
- Fixed account-deletion ownership/version races before applying the new file: affected crews
  lock in UUID order before the auth row; handover runs with a fresh snapshot. Independent
  **15 permanent SQL checks and 100 concurrent trials** pass, including overlapping crews/retries.
- G12 now tests actual Exchange v2 RPCs/math, retains save encoding/NUL and early token bounds,
  and reproduces the 1,000-player/14-day/seed12 simulation byte for byte. Original authored commits
  are preserved. G12 needs **no migration**; reserved150000 remains unused.
- Final combined backend/story gate with disposable PostgreSQL: **10,859 passed**. Ruff and diff
  checks pass. Independent NPC code review:281 focused checks. Independent followups/G12 review:
 669 focused plus315 Exchange/world/case checks; obsolete malformed-token fixture expectations
  were adapted, retaining real upstream rejection for valid-shaped forged tokens.
- Frontend source/assets are unchanged in this release; Phase2's1,603-test/build/spoiler proof
  remains applicable. Redacted Gitleaks uses only the exact existing RFC7636 public-vector exclusion.
- Applied **one file at a time**, passing repository text directly, then proving exact stored MD5:

| Repository version and name | Exact MD5 | Tool clock version restored |
|---|---|---|
| 20261106130000 npc_partners | 39f269d1fd2e8e43e2b3d0055c97ecb2 | 20261106193927 |
| 20261106140000 followups | a59dccb2d3447614454f94a37cc3bb40 | 20261106193955 |

Counts after each file: **31 tables +1 view /16 public policies /5 realtime policies /17 reasons
/43 project functions excluding rls_auto_enable /8 sequences /6 public triggers**.
Security advisors show known items only:15 intentional server-only RLS/no-policy INFOs, intended
is_crew_member, Supabase rls_auto_enable and the email-disabled leaked-password notice.
[Advisor explanations](https://supabase.com/docs/guides/database/database-linter).

Release sequence: deploy with existing flags, verify READY/health/config, then activate completed
case/bulletin and redeploy before checking config. RELIGHT_OPEN remains unset, so the live coast
stays dark. No production solve/reward or Relighting was used as a test. G9 is paused until the
laptop returns; normal browser multiplayer still needs that adapter. Festival/host/sports are the
next wave. Full case extras and the approved-client ChatGPT helper remain later work.
