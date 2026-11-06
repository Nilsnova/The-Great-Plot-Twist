# Case Phase 1 release proof · 6 Nov 2026

Used by: Nils and the integrating agent; branch integrate/case-phase1, based on verified group 3.

- Integrated source feat/case-backend 2a2fccd: immutable case data reading, earned views, scoped searches,
  accusation/reveal eligibility, safe stored-intent repeats and own-crew host clock. Four new routes.
- Preserved existing app services and every decision entry; assigned predictions D025, duels D026 and
  appended case D027. No private case content or applied migration bytes changed.
- Backend/story: 10035 passed, 30 optional skips. Disposable case + group 3 SQL: 25 passed.
- Independent 060000 review: 367 file tests +22 SQL checks passed; actual group3-then060000 apply order,
  broad default grants and non-superuser runner checked; no blocker. Independent code review approved.
- Ruff, build and spoiler guard pass; frontend artifacts unchanged (111 files, 12 protected lines).
- Applied one file: 20261106060000_case_rules.sql, name case_rules.
- Repository and stored MD5: 278a16fcf87bbf2f46d81ec803f1e94b; history restored to 20261106060000.
- Final live counts: 24 tables + 1 view / 16 public policies / 5 realtime policies / 17 wallet reasons /
  32 project functions excluding rls_auto_enable /6 sequences /6 public triggers.
- Security advisor: only known items, including six additional intentional RLS/no-policy INFO notices
  on the server-only case tables. [Advisor explanations](https://supabase.com/docs/guides/database/database-linter).
- Case remains off; RELIGHT_OPEN remains unset. No live solve/reward/Relighting proof is claimed.
- Remaining: Phase2 board/night, Phase3 world rewards/Relighting, Phase4 partners, final hardening;
  migrations 080000,120000,130000 then 140000 in the authorized order. G9 is implemented in another cloud
  session. Direct live-market pricing verification awaits this cloud environment's network allowlist.

## Final registry proof

Installed the exact existing frontend dependencies and ran the five registry checks that were optional
skips in the full backend run. Adopted Nils-approved coordinate-only correction 2093652 (home light chart
Y 192.87); registry and solvability now 43 passed. Regenerated 12 reveal fingerprints unchanged; production
build/spoiler guard passed again. No protected story line or applied migration changed.
