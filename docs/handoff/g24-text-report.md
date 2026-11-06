# G24 player-facing text audit

Audit and handover for the requesting teammate and reviewer. Branch: `chore/g24-text`, based on `origin/main` at `c26f3032b150af970d57fbbcd6eea439eb26f4c4`.

## Scope and house spelling

The dependency-free linter lives in `scripts/text-lint/`. It audits potential display strings in frontend source/public HTML/JavaScript/JSON and display fields in non-secret backend content. No secret content is read by the linter. The approved story and its identical demo copy are report-only, as are account/adapter/case files and nested market/weather data. The ordinary frontend suite will run the linter in C3.

American English follows the majority. Backend display fields contain 15 `harbor` spellings and no `harbour` (including canonical names, without counting the frontend story copy again); in editable frontend prose there are four generic `harbor` occurrences versus two clear British labels (`Colour-blind-safe` and `licences`). Three `toward` occurrences support that choice. Counts are audit evidence, not a requirement to rename proper names. Keep Saltreach Harbor, Harbor Office, Harbor Light and Greyfathom Salvage as written in their canonical sources. Preserve approved story wording and straight/curly apostrophe variants.

Canonical places come from `frontend/src/world/places/registry.js`: Lighthouse Isle, Saltreach Harbor, Home islet, Smugglers' Cove, Wreck Point, The Teeth and Gull's Rest. Companies come from `backend/content/market/companies.json`. Public character spelling includes Elena Vos; partner titles and entry-kit names were checked against their content. No inconsistent place/character/company spelling was found. Company-name clearance against real businesses is a separate existing human task, not performed by this spelling audit.

## C1 findings before fixes

The initial audit extracted 1,056 candidate strings from 156 source files. It found eight editable errors:

| File | Finding | Safe correction planned |
| --- | --- | --- |
| `frontend/src/settings/view.js` | British color label; en-dash choice range | American label; `1 to 9` |
| `frontend/src/shell/screens.js` | Four visible `<name>` credit entries; British licenses label | Pending-credit notice, no invented identities; American label |
| `frontend/src/ui/kit-gallery.js` | En-dash choice range | `1 to 9` |
| `frontend/src/ui/kit/hud-bar.js` | Em-dash missing-time marker | `?` |
| `frontend/src/ui/kit/logic.js` | Em-dash missing-coin marker | `?`, preserving unknown versus zero |
| `frontend/src/ui/kit/table.js` | Em-dash missing-cell marker | `?` |

No obvious spelling errors were found in the reviewed vocabulary. The dictionary retains public nautical vocabulary and names; no general-purpose dictionary or new package is installed.

## Report-only findings and limits

- `frontend/src/adapter/fake/relighting.js:4`: British `colours` and `colour` in a demo action notice.
- `frontend/src/screens/relighting.js:7`: British `colour` in a case-screen label.
- `frontend/src/adapter/fake/partners.js:45` and `frontend/src/screens/partners.js:22`: British `Travelling` in partner status labels. These two findings became visible when the American double-L spelling rules were added in C3. All five dialect findings remain with their owning packages; the linter reports them without failing editable-copy checks.
- `backend/content/story.json` and `frontend/src/demo/intro-story.json`: no dash/template issues found; preserve both approved texts. Their public intro endings are intentional and are not case-reveal leaks.
- Eight partner strings use `{minutes}`, `{light}` or `{price}`. All fields match their event/global declarations. Representative long values (9999 minutes, 1000000 coins, `the Islet signal station`) leave no braces and fit `max_characters: 80`. This does not certify arbitrary runtime values. S4's live partner renderer does not yet exist; its owner must test filled output before delivery.
- Generated captain names fit their documented 24-character limit. The UI kit defines no button/title character caps. Existing geometry checks, not invented limits, assess fit. Secret case-card limits (400-character cards/240-character found lines) remain with the case package; no secret file was edited. The linter excludes secret content entirely.
- Known case-reveal fingerprints and direct named-identity associations are checked without copying reveal prose. No matching wording was found in audited sources at C1. Indirect inference and arbitrary paraphrases still need human review. The existing build guard remains required.
- Source extraction cannot prove every dynamically assembled string, external/service error or runtime interpolation. See `scripts/text-lint/README.md` for exact coverage. The visible team notice is intentionally pending; real member names/student numbers must come from the team before release.

## Delivery and verification

- C1 (`b2049eb`): linter, reviewed vocabulary, initial audit and checkpoint. The pre-fix CLI deliberately exited 1 with eight editable findings and three report-only dialect findings.
- C2 (`72650b1`): fixed the eight editable findings across six UI files and updated the existing missing-coin assertions. There were no backend content changes.
- C3: `frontend/tests/text-lint.test.js` runs the actual repository linter through its shared CLI/library entry point in ordinary `npm test`. Seventeen tests cover real-repository integration, spelling, dash forms, names, capitalization, declarations/substitution, size bounds, comments/escapes/nested templates/regexes, HTML and JavaScript HTML templates, protected scopes, secret-directory exclusion and spoiler redaction. Deliberately bad fixtures exposed extraction/escape issues before the fixes; no protected reveal prose is in fixtures. The existing browser credits assertion now checks the new pending notice and absence of raw placeholders, retaining its attribution assertions.

| Gate / command | Result |
| --- | --- |
| `node scripts/text-lint/index.mjs` | 1,137 candidates in 156 files; zero errors, five report-only dialect findings |
| `cd frontend && npm test -- --maxWorkers=2` | 305 tests passed, 34 files; includes 17 new linter tests |
| `cd frontend && npm run build` | Passed; existing spoiler guard passed on 51 built text files |
| `cd backend && UV_CACHE_DIR=/workspace/.cache/uv uv run --frozen pytest -q` | 3,100 passed; no skips reported |
| Existing `check-ui-kit.js` in Chromium | 19 checks passed; readable text and no overflow at 1365×768 and 700×900 |
| Existing `check-readability.js` in Chromium | Passed at 1365×768, 1920×1080 and 1100×700; labels at least 14px, chart labels at least 16px, no overlap/overflow, settings within viewport |
| Existing `check-experience.js` in Chromium | 26 checks passed, including updated credits and phone layout |
| Repository-pattern secret scan of branch commits and complete staged branch diff | No matches |
| `git diff --check` | Passed |

Browser scripts used `TEST_URL=http://127.0.0.1:5173`, `CHROME_PATH=/usr/bin/chromium` and external working directory `/tmp/g24-ui`, so historical tracked captures were preserved. Screenshots/reports are local review evidence under `/tmp/g24-ui/captures/`; they are not committed. No dependencies, manifests or lockfiles changed. The secret scan follows the patterns in `docs/ENGINEERING.md` and emits no candidate values.

Remaining: the owning packages should reconcile the five protected dialect labels; S4 must test live interpolation; the team must supply real credits before release. Arbitrary dynamic text and spoiler paraphrases require human review. No merge or production deployment is authorized by this task. Only `chore/g24-text` is the push target; `main` is unchanged.
