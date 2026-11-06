# G24 player-facing text audit

Audit and handover for the requesting teammate and reviewer. Branch: `chore/g24-text`, based on `origin/main` at `c26f3032b150af970d57fbbcd6eea439eb26f4c4`.

## Scope and house spelling

The dependency-free linter lives in `scripts/text-lint/`. It audits potential display strings in frontend source/public HTML/JavaScript/JSON and display fields in non-secret backend content. No secret content is read by the linter. The approved story and its identical demo copy are report-only, as are account/adapter/case files and nested market/weather data. The ordinary frontend suite will run the linter in C3.

American English follows the majority. The content sample contains 27 `harbor` spellings and no `harbour`; in editable frontend prose there are four generic `harbor` occurrences versus two clear British labels (`Colour-blind-safe` and `licences`). Three `toward` occurrences support that choice. Counts are audit evidence, not a requirement to rename proper names. Keep Saltreach Harbor, Harbor Office, Harbor Light and Greyfathom Salvage as written in their canonical sources. Preserve approved story wording and straight/curly apostrophe variants.

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
- `frontend/src/screens/relighting.js:7`: British `colour` in a case-screen label. These three dialect findings remain with their owning packages; the linter reports them without failing editable-copy checks.
- `backend/content/story.json` and `frontend/src/demo/intro-story.json`: no dash/template issues found; preserve both approved texts. Their public intro endings are intentional and are not case-reveal leaks.
- Eight partner strings use `{minutes}`, `{light}` or `{price}`. All fields match their event/global declarations. Representative long values (9999 minutes, 1000000 coins, `the Islet signal station`) leave no braces and fit `max_characters: 80`. This does not certify arbitrary runtime values. S4's live partner renderer does not yet exist; its owner must test filled output before delivery.
- Generated captain names fit their documented 24-character limit. The UI kit defines no button/title character caps. Existing geometry checks, not invented limits, assess fit. Secret case-card limits (400-character cards/240-character found lines) remain with the case package; no secret file was opened or edited for this audit.
- Known case-reveal fingerprints and direct named-identity associations are checked without copying reveal prose. No matching wording was found in audited sources at C1. Indirect inference and arbitrary paraphrases still need human review. The existing build guard remains required.
- Source extraction cannot prove every dynamically assembled string, external/service error or runtime interpolation. See `scripts/text-lint/README.md` for exact coverage. The visible team notice is intentionally pending; real member names/student numbers must come from the team before release.

## Verification and remaining work

C1: CLI deliberately exits 1 with the eight editable findings above, plus three report-only dialect findings. C2 will apply safe fixes; C3 will add mutation coverage and run the linter in the normal suite. Final gate results and commits will be recorded here after execution. No merge or production deployment is authorized by this task.
