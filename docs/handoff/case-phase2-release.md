# Case Phase 2 release proof · 6 Nov 2026

Used by: Nils and integrating agents; branch feat/case-board-night, based on live Phase 1.

- Added pure board/night decisions, deterministic chart geometry and the five board/finale intents.
  Every route uses verified own-crew scope, strict bodies and private no-store responses, including
  errors. Repeats precede current rules; wrong pairs and misses retain their original cooldowns.
- Scoped validated snapshots include earned pins/posts and bounded signal summaries. Quiet locks
  and successful parted locks survive the latest-40 history limit, preserving payout eligibility.
  Exact target coordinates reach only crews that found the schooner; glow is rounded and night-only.
- Connected existing home-islet stations/timber through a read-only port. Added version-only crew
  nudges with a one-second timeout; reads, pure refusals and repeats send nothing.
- Proved all 35 four-player kit mixes with production board/night rules. Applied the approved
  specification's two geometry explanation corrections; no private case data or applied file changed.
- Full backend with disposable PostgreSQL: **10,269 passed**. Final wrapper/registry/solvability
  checks after annotations and the committed-parting regression: **74 passed**. Frontend: **1,603
  passed**. Ruff, diff check, production build and spoiler guard pass (111 files /12 protected lines).
- Independent code review approved 09b4387; 107 integrated focused checks passed. Independent
  migration review: 61 scratch/contract checks, real pin/post races, non-superuser ownership,
  broad default grants and actual live apply order/replay preservation passed.
- Redacted Gitleaks found no credentials after excluding the exact existing RFC7636 public PKCE
  test-vector fingerprint; no broad path exclusion or source allowlist was added.
- Applied one file verbatim: **20261106080000_case_board_and_night.sql**, name case_board_and_night.
  Repository and stored MD5 **3d68856dbe9082e2c8e413f0db5dce0f** agree. Tool version
  20261106191049 was re-recorded as **20261106080000**.
- Live totals: **27 tables +1 view /16 public policies /5 realtime policies /17 wallet reasons
  /39 project functions excluding rls_auto_enable /8 sequences /6 public triggers**.
- Security advisor: only known items, including three additional intentional server-only RLS/no-policy
  INFO notices. [Advisor explanations](https://supabase.com/docs/guides/database/database-linter).
- Case remains off; RELIGHT_OPEN remains unset. No live solve, payout or Relighting is claimed.
- Remaining: Phase 3 world switch, Phase 4 partners, hardening and complete case proofs, then G9
  integration when Nils' laptop returns. Direct stock-price proof still needs cloud network access.
