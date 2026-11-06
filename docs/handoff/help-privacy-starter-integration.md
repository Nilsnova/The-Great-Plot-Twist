# Help, privacy and teammate starter integration

> Later scope update, 6 Nov: Nils cancelled the AI companion. AI-related remaining work and flag snapshots below are historical; its code and flag are removed. See [the cancellation record](ai-earned-context.md).

Codex for Nils, 6 November 2026. Branch `integrate/help-privacy`, based on `94a48ad`.

## Changed

Preserved all eight Nils-authored checkpoints from `origin/docs/g23-help`, `origin/docs/g26-privacy` and `origin/docs/g28-starter-kit`: `a11d405`, `8da0e90`, `90e0995`, `d4677b3`, `d3439c4`, `6ffdf28`, `3acd903`, `c9738e6`.

Reconciled the player manual and standalone help with the current islet, Exchange v2, predictions, Lantern Duels and festival screens. The ordinary game still lacks its complete G9 account/case connection. A visible account control is not described as a completed sign-in; local crew/case examples remain labelled rehearsals. Festival timing starts at the first Relighting. Sports is closed without provider access, and the optional ChatGPT helper remains inactive. The contributor starter kit explains these pending boundaries without reserving another teammate's work.

Settings now links to `help.html` and `privacy.html` in separate tabs with `noopener noreferrer`. The links use existing button styles. No account/session behaviour or feature flag changed. G16's owner confirmed no overlapping shell-controller edit.

The privacy notice and technical inventory now cover 39 current application tables / 308 columns through migration `180000`, including current Exchange replacements and the case/world/NPC/festival/host/sports records. The coverage reader respects dropped tables. N4 deletion removes every own ledger row, hands a surviving crew to the lowest other human seat, and distinguishes retained shared history from player-owned rows. Supabase security audit records and provider logs/backups remain outside the game's purge. The feed list now includes actual Finnhub, Manifold and football/basketball providers.

The README gains navigation links only. STATUS and ROADMAP are unchanged.

## Verified

- `python -m unittest discover -s docs/tests -v`: 2 inventory coverage checks passed.
- Focused Ruff check of the inventory reader passed.
- 100 local Markdown links in the current manual/privacy/inventory/starter docs resolve.
- `npm test -- --run tests/help.test.js tests/shell.test.js tests/account.test.js`: 20 tests passed.
- `npm run build`: passes; spoiler guard checks 137 public text files with no protected reveal or suspect-elimination data.
- `node scripts/check-help.js`: 33 Chromium checks passed, covering 320/375/960 px help, keyboard/filter/anchor navigation, no-JavaScript reading, restrictive CSP denials, privacy content/phone layout, local-only page requests and both Settings links.
- `node scripts/check-loading.js`: 18 checks passed; cold title JavaScript is 20,504 bytes, below the 21,080-byte budget. Generated loading captures were restored.
- Current phone captures and browser report are in `/tmp/g23-current/` in this workspace; inspected both captures for readable text and layout.

## Not verified

No hosted provider retention settings, live account deletion, real player records, external login or production deployment was exercised. Inventory coverage is source evidence, not a claim about which migrations have been applied live. No full backend suite was needed for this documentation and navigation change.

## Remaining

The integrator reviews/merges this source and runs its combined release gates. G9 remains paused until the laptop returns. Sports needs provider access before opening; the ChatGPT helper needs official website-client approval. Those are existing project dependencies, not blockers to these standalone pages.
