# Festival, host console and sports release · 6 Nov 2026

Responsible: Codex for Nils. Branch: `integrate/festival-host-sports`, following live main
`fa0e49b` and production `dpl_2AAkC2Ta6Xegr5JNRk9yByvt2a85`.

Festival adds twelve private lamp reservations, the exact first-Relighting 48-hour timer and
friendly zero-stake A7 matchmaking. Claims never advance world lights or mint coins. The UI
includes original pixel media and gesture-started sound on the existing volume buses. Its
local demo uses memory only. Host tools expose sanitized private aggregates and allow a
configured host to close only their own forming test crew without another human. Sports adds
provider-verified fixtures, own stakes and atomic payouts/refunds; it stays off pending a provider
key and a credentialed read-only source check.

Original authored commits and package proofs are preserved in the merge history. SQL reviewers
checked the complete ordered chain against live read-only state and disposable PostgreSQL,
including non-superuser invoker grants, broad default grants, reapplication and real concurrent
join/account-deletion/settlement races. Rejected draft lock orders were fixed before applying.
Applied files are now immutable; any future fix needs a new timestamp after 180000.

| Repository version / name | Exact stored and file MD5 | Tool clock version restored |
|---|---|---|
| 20261106160000 festival | e5df5d833e6b2d733736a6a8e8585858 | 20261106203207 |
| 20261106170000 host_console | bea4b851018f4f97beccb15c88fe1e09 | 20261106203239 |
| 20261106180000 sports_desk | bb6e0b40dea6ea6abdba7b62b89ed7dd | 20261106203308 |

Each apply passed its exact repository text directly to the migration tool, one file per call,
after a live history/counts/ownership/privilege preflight. Stored MD5 was proved before normalizing
the tool-clock version to the filename. Counts and security advisor were checked after each file:

| After file | Tables | Project functions | Sequences | Triggers | Intentional RLS/no-policy INFOs |
|---|---:|---:|---:|---:|---:|
| 160000 | 35 | 50 | 8 | 6 | 19 |
| 170000 | 37 | 54 | 8 | 6 | 21 |
| 180000 | 39 | 57 | 9 | 7 | 23 |

All retain one view, 16 public policies, five realtime policies and 17 wallet reasons. Functions
exclude Supabase's own `rls_auto_enable`. The other advisor items remain the intended authenticated
`is_crew_member`, Supabase's `rls_auto_enable` and the leaked-password notice with email sign-in off.
[Advisor explanations](https://supabase.com/docs/guides/database/database-linter).

Verification of final runtime `b37c434`:

- **11,168 backend tests passed** with `CASE_PG_SCRATCH=1 uv run --with pgserver --with
  'psycopg[binary]' --with pglast pytest -q --tb=no`, including mounted production routes and
  actual HTTP/service/SQL festival, host and sports proofs. The existing solo+NPC/four-human case
  proofs and 69 kit-mix proof remain included.
- **1,672 frontend tests** in 108 files passed; production build/spoiler guard checked 130 text
  files and twelve protected lines, with no elimination data. Ruff, whitespace and redacted
  Gitleaks pass; the only exclusion is the exact pre-existing public RFC7636 test vector.
- Chromium: festival 35, sports 23 plus eight real pavilion-hotspot checks, host twelve,
  lifecycle nine, loading eighteen and CSP checks pass. Cold title: 20,316 bytes, below the
  existing 21,080-byte ceiling. Festival's CPU-contention bootstrap timeout passed on an isolated
  unchanged rerun; no test budget was relaxed.
- Independent final integration review approved `b37c434`, including actual app wiring,
  explicit local RPC/read allowlists, zero-argument RPC handling, private sports errors and
  strict private content-path probes; 128 bounded checks passed.

Deployment sequence: push only after the SQL proof above; verify the production build and
health/config on the existing six flags; then add festival, redeploy the same reviewed commit
and verify config. Keep sports and sign-in off. Do not set `RELIGHT_OPEN`, alter Finnhub or add
Vercel crons. The live coast stays dark; no production solve, payout or Relighting is a test.

Live verification limits: the connector's temporary-share query is rejected by strict no-query
boards, and its authentication helper masks application 401s. This cloud network currently blocks
direct requests to the production hostname. Do not describe those masked responses as a verified
authenticated playthrough. G9 remains paused until Nils' laptop returns, so normal browser
multiplayer/the complete mystery still await its adapter. The optional ChatGPT helper needs an
approved official website client; no borrowed client or paid fallback is active.
