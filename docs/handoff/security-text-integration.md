# Security and interface-text integration

For Nils and the release reviewer, 6 November 2026. Branch `integrate/security-text`, worktree `/workspace/security-text2`, source baseline `94a48ad`. G27 (`9981188`, `29bf572`) and G24 (`b2049eb`, `72650b1`, `62997b6`) were cherry-picked with their authors preserved, then reconciled with the current feature wave.

## Delivered

The security/threat/licence documents now describe current presence, Exchange v2, case/NPC, festival, host and sports contracts, all 55 API method/path pairs, private errors and default no-store. They distinguish source controls from live configuration. Old report-only findings already fixed by later packages are no longer presented as current missing functionality. Original checkpoints remain explicitly historical.

The refreshed CycloneDX inventory contains 99 components (71 npm entries and 28 Python registry packages), 25 runtime-labelled. Exact source/lock hashes, registry metadata, full-lock advisory responses and the successful official schema receipt are committed. The generator now checks the requested source ref's lock bytes before writing; it cannot silently stamp an unrelated `origin/main` commit. Validation still requires exact component/runtime/route/asset counts and full graph coverage; no guard budgets were lowered.

G24's reviewed public/domain vocabulary includes the post-checkpoint screens. The gate now includes festival and sports alongside host UI, and retains the original protected-case/report-only scope. Safe copy uses American display labels, words for number ranges and clear unknown markers. Credits retains Nils and four editable rows; unknown teammates are labelled pending rather than rendered as raw `<name>` placeholders. No private case/culprit text, SQL, G9 branch, dependency, response contract, CSP, feature flag or activation setting changed.

Vite's supported `build.license` output now emits `third-party-notices.md` for the actual bundled packages. A small hook adds the installed Vite distribution's exact notices for virtual browser helpers, which Vite's package enumeration excludes. Built Settings → Credits links the artifact. A tiny fixture build proves exact Three.js, Supabase and Vite licence text is retained; the hook refuses to proceed without Vite's automatic notice output. The normal production build currently includes Three.js; the SBOM also inventories declared runtime dependencies not currently bundled by G9.

The G16 owner was notified of the new Vite import/plugin/`build.license` fields; its build-info plugin must remain alongside the notices plugin when merged. G22's separate developer config does not overlap. Nils deliberately moved weather attribution to Settings → Credits, so the old nearby-HUD recommendation is superseded and no HUD credit was restored.

## Verification

| Check | Observed result |
| --- | --- |
| Fresh `npm audit --json` | Exit 0, zero advisories across the complete current frontend lock. |
| Pinned pip-audit 2.10.1, `--no-deps --disable-pip` | Exit 0, all 28 locked third-party Python packages, zero advisories/skips. |
| Official CycloneDX 1.6 schema | Passed with jsonschema 4.26.0/referencing 0.37.0; exact schema/SBOM hashes recorded. |
| `python3 scripts/audit/validate.py` | 99 components, 25 runtime labels, exact source/locks, graph coverage, 55 documented routes, all local links/references and tracked assets passed. |
| Four isolated audit-tool unit tests | Passed: requested ref recorded, changed locks refused before receipt, clean diff silent, synthetic secret rejected without its value. |
| Text CLI and ordinary Vitest integration | 2,656 candidates in 329 files, zero editable/spoiler errors; 26 report-only findings remain in the original protected/adapter scopes. |
| Focused frontend suite | 100 tests passed in 14 files: text lint, exact notice generation, UI kit, credits, host console, demo, sports and festival. |
| Normal frontend build | Passed with notices artifact; unchanged spoiler guard passed on 130 built text files/12 protected lines. |
| Credits browser check | 15 local development checks and 16 built-preview checks passed: pending names, provider links, exact served notices, desktop/phone wrapping, Escape/focus flow and no external requests/browser errors. |
| Audit Python Ruff / diff check | Passed. |

The first combined frontend run exposed the repository text scan reaching Vitest's unchanged five-second default under CPU contention. The name matcher now tokenizes each string once and stops impossible near-name windows early; all spelling/name mutation tests still pass, and the subsequent 100-test run completed in 4.06 seconds. No timeout or guard threshold was raised. Early integration failures for new vocabulary and a test-only package-exports lookup were corrected before the passing gate.

Report-only findings comprise existing fake-bulletin interpolation markers, protected/demo dialect labels and the generic home-islet capitalization in a protected fixture. They are visible diagnostics, not baseline suppressions or newly skipped editable text. Unknown future words still fail; the dictionary is not learned automatically from source. Runtime provider/team strings continue to render through the current safe DOM paths.

## Remaining and proof limits

The owner has not chosen a root first-party LICENSE; this integration preserves rights without assigning one. The remaining three teammate names/student numbers must come from their owners. Neither item blocks the authorised integration work.

The 60-second identity-verification cache, shared preview/production database and lack of a global pre-decode ingress/shared Auth-provider budget are documented source/configuration limits from the original audit, not newly demonstrated production exploits. No live abuse test or security bypass was claimed. Current activation constraints remain those already recorded: G9 is paused, sports lacks its configured key/current-provider proof, and ChatGPT website login needs official client approval. This package adds no further activation gate.

No live write, migration, deployment, push, Actions run or secret-value access was performed. Relevant focused checks ran; the root release gate will test the complete merged feature wave. Committed-diff secret and whitespace checks are repeated after the reconciliation commit.
