# Sports live activation · 6 Nov 2026

Nils authorized finishing sports after adding the football API key. Codex activated
the reviewed sports implementation without changing source code or the database.

## Changed

- Configured plain `SPORTS_API_PROVIDER=football-data.org` in production and preview.
- Added `sports` to `FEATURE_FLAGS`: `live_presence,market,predictions,arena,case,bulletin,festival,sports`.
- Redeployed reviewed main `364d178dbf9ba8008dcf1398ff36cf8ee6ea4c6e`, which includes
  removal of the cancelled AI companion.
- Production deployment: `dpl_4HmGdZCJrhgKS8DWF2qUN7eMAhPj`, READY, canonical
  [game address](https://the-great-plot-twist.vercel.app/) assigned without alias errors.
- Previous healthy deployment, including AI removal:
  `dpl_EgNDwUUXkPBpkCFHyxJLAB75YDpN`.

## Verified

The deployed server used its Vercel-managed key. No key value was read, decrypted,
printed, copied into the test Sandbox or committed.

1. Protected preview `dpl_AqjC9ijFqNZAVis4ZVH4Jywj1tuK` was READY on the same
   main SHA. A temporary share cookie established access; subsequent API GETs had
   no query parameters. Health, config and sports returned HTTP 200. Config showed
   preview, real mode, sports enabled and no `companion_llm` flag. The provider
   returned ten live Premier League fixtures with valid IDs and score types.
2. After the production redeploy, direct queryless GETs to `/api/health`,
   `/api/config` and `/api/sports` all returned HTTP 200. Health was `ok`; config
   reported production, `demoMode=false`, sports enabled and no AI flag.
3. The production board at `2026-11-06T22:44:35.169445Z` reported
   `provider=football-data.org`, `source=live`: ten Premier League fixtures, one
   finished and nine scheduled, nine picking windows open. IDs matched the
   `fd-<number>` format. The finished score parsed as integer scores 3–1.
   Existing pool totals were zero. Verification commands exited 0.

## Cleanup and limits

- Temporarily extended the sensitive key's target metadata to preview and briefly
  enabled sports while creating the preview. Both were immediately restored after
  preview creation. Final metadata confirms the key is sensitive and production-only;
  final flags include the eight names above. No branch-specific env overrides exist.
- The scoped, nonpersistent Vercel Sandbox was stopped, then deleted. It had no
  injected production secrets. Share URLs and auth cookies are absent from this file.
- Game requests used only public board/config/health GETs. No stakes, settlements, accounts,
  wallets, fixtures, saves or other gameplay data were written by this verification.
- No SQL, crons, Actions, stock provider, sign-in or G9 changes were made. The
  [sports migration](../../supabase/migrations/20261106180000_sports_desk.sql) had
  already been applied and proved before this activation.
- No fresh app test run was needed: this activation changed deployment settings,
  while the underlying reviewed code and migration already passed their release gates.
  Full authenticated sports play and the pending G9 browser flow were not retested.
- New previews do not receive the production-only sports key. Preview sports needs
  an explicitly scoped test credential or the same temporary metadata procedure.

No further action from Nils is needed for the live sports data connection.
