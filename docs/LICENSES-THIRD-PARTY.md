# Third-party licences and dependency audit

For Nils and release reviewers, refreshed 6 November 2026 against `94a48ad1c445f4cfb70c539daba3fcb1fe7e7d99`. This preserves upstream rights without assigning a licence to project-authored work. [Threat model](THREAT-MODEL.md) · [security process](SECURITY.md) · [reproduction](../scripts/audit/README.md).

## Advisory and composition evidence

The unchanged current locks contain **99 third-party components**: **71 npm entries and 28 Python registry packages**, including development and other-platform entries. **25 are runtime-labelled**: Three.js, Supabase's browser dependency graph and the transitive FastAPI/httpx/Pydantic graph. Uvicorn is declared in the local dev group.

Full-lock `npm audit --json` and pinned pip-audit 2.10.1 both exited 0 with zero known advisories and no Python skips. See [audit-run.json](../scripts/audit/audit-run.json), [npm output](../scripts/audit/npm-audit.json) and [Python output](../scripts/audit/pip-audit.json) for exact time/inputs. No dependency upgrade, audit fix or lock change was made. A clean advisory result describes that database snapshot, not unknown vulnerabilities or provider configuration.

The [CycloneDX 1.6 SBOM](../scripts/audit/sbom.cdx.json) includes all components, purls, dependency edges, npm artifact integrity hashes, runtime/optional annotations and reviewed source/lock hashes. [Version-specific metadata](../scripts/audit/license-metadata.json) retains public evidence URLs; [machine-readable licence rows](../scripts/audit/dependency-licenses.json) preserve declared upstream expressions. OS, browser, hosting and isolated audit tools are outside the application inventory.

MIT/BSD notices must accompany distributed copies where required. Apache-2.0 and PSF-2.0 have notice obligations; MPL-2.0 concerns its covered files rather than every application file. Hosted use and redistribution are different activities. Top-level registry metadata does not replace reviewing bundled upstream notices.

## Runtime packages

| Ecosystem / package | Locked version | Declared licence | Evidence |
| --- | --- | --- | --- |
| npm / `@supabase/auth-js` | 2.118.0 | MIT | [version metadata](https://registry.npmjs.org/%40supabase%2Fauth-js/2.118.0) |
| npm / `@supabase/functions-js` | 2.118.0 | MIT | [version metadata](https://registry.npmjs.org/%40supabase%2Ffunctions-js/2.118.0) |
| npm / `@supabase/phoenix` | 0.4.5 | MIT | [version metadata](https://registry.npmjs.org/%40supabase%2Fphoenix/0.4.5) |
| npm / `@supabase/postgrest-js` | 2.118.0 | MIT | [version metadata](https://registry.npmjs.org/%40supabase%2Fpostgrest-js/2.118.0) |
| npm / `@supabase/realtime-js` | 2.118.0 | MIT | [version metadata](https://registry.npmjs.org/%40supabase%2Frealtime-js/2.118.0) |
| npm / `@supabase/storage-js` | 2.118.0 | MIT | [version metadata](https://registry.npmjs.org/%40supabase%2Fstorage-js/2.118.0) |
| npm / `@supabase/supabase-js` | 2.118.0 | MIT | [version metadata](https://registry.npmjs.org/%40supabase%2Fsupabase-js/2.118.0) |
| npm / `iceberg-js` | 0.8.1 | MIT | [version metadata](https://registry.npmjs.org/iceberg-js/0.8.1) |
| npm / `three` | 0.187.0 | MIT | [version metadata](https://registry.npmjs.org/three/0.187.0) |
| npm / `tslib` | 2.8.1 | 0BSD | [version metadata](https://registry.npmjs.org/tslib/2.8.1) |
| pypi / `annotated-doc` | 0.0.5 | MIT | [version metadata](https://pypi.org/pypi/annotated-doc/0.0.5/json) |
| pypi / `annotated-types` | 0.8.0 | MIT | [version metadata](https://pypi.org/pypi/annotated-types/0.8.0/json) |
| pypi / `anyio` | 4.16.0 | MIT | [version metadata](https://pypi.org/pypi/anyio/4.16.0/json) |
| pypi / `certifi` | 2026.10.23 | MPL-2.0 | [version metadata](https://pypi.org/pypi/certifi/2026.10.23/json) |
| pypi / `fastapi` | 0.162.0 | MIT | [version metadata](https://pypi.org/pypi/fastapi/0.162.0/json) |
| pypi / `h11` | 0.16.0 | MIT | [version metadata](https://pypi.org/pypi/h11/0.16.0/json) |
| pypi / `httpcore` | 1.0.9 | BSD-3-Clause | [version metadata](https://pypi.org/pypi/httpcore/1.0.9/json) |
| pypi / `httpx` | 0.28.1 | BSD-3-Clause | [version metadata](https://pypi.org/pypi/httpx/0.28.1/json) |
| pypi / `idna` | 3.20 | BSD-3-Clause | [version metadata](https://pypi.org/pypi/idna/3.20/json) |
| pypi / `opentelemetry-api` | 1.45.2 | Apache-2.0 | [version metadata](https://pypi.org/pypi/opentelemetry-api/1.45.2/json) |
| pypi / `pydantic` | 2.14.3 | MIT | [version metadata](https://pypi.org/pypi/pydantic/2.14.3/json) |
| pypi / `pydantic-core` | 2.50.4 | MIT | [version metadata](https://pypi.org/pypi/pydantic-core/2.50.4/json) |
| pypi / `starlette` | 1.10.0 | BSD-3-Clause | [version metadata](https://pypi.org/pypi/starlette/1.10.0/json) |
| pypi / `typing-extensions` | 4.16.0 | PSF-2.0 | [version metadata](https://pypi.org/pypi/typing-extensions/4.16.0/json) |
| pypi / `typing-inspection` | 0.4.5 | MIT | [version metadata](https://pypi.org/pypi/typing-inspection/0.4.5/json) |

## Build, test and optional packages

| Ecosystem / package | Locked version | Declared licence | Evidence |
| --- | --- | --- | --- |
| npm / `@jridgewell/resolve-uri` | 3.1.2 | MIT | [version metadata](https://registry.npmjs.org/%40jridgewell%2Fresolve-uri/3.1.2) |
| npm / `@jridgewell/sourcemap-codec` | 1.6.0 | MIT | [version metadata](https://registry.npmjs.org/%40jridgewell%2Fsourcemap-codec/1.6.0) |
| npm / `@jridgewell/trace-mapping` | 0.3.31 | MIT | [version metadata](https://registry.npmjs.org/%40jridgewell%2Ftrace-mapping/0.3.31) |
| npm / `@oxc-project/types` | 0.156.0 | MIT | [version metadata](https://registry.npmjs.org/%40oxc-project%2Ftypes/0.156.0) |
| npm / `@rolldown/binding-android-arm-eabi` | 1.2.16 | MIT | [version metadata](https://registry.npmjs.org/%40rolldown%2Fbinding-android-arm-eabi/1.2.16) |
| npm / `@rolldown/binding-android-arm64` | 1.2.16 | MIT | [version metadata](https://registry.npmjs.org/%40rolldown%2Fbinding-android-arm64/1.2.16) |
| npm / `@rolldown/binding-darwin-arm64` | 1.2.16 | MIT | [version metadata](https://registry.npmjs.org/%40rolldown%2Fbinding-darwin-arm64/1.2.16) |
| npm / `@rolldown/binding-darwin-x64` | 1.2.16 | MIT | [version metadata](https://registry.npmjs.org/%40rolldown%2Fbinding-darwin-x64/1.2.16) |
| npm / `@rolldown/binding-freebsd-x64` | 1.2.16 | MIT | [version metadata](https://registry.npmjs.org/%40rolldown%2Fbinding-freebsd-x64/1.2.16) |
| npm / `@rolldown/binding-linux-arm-gnueabihf` | 1.2.16 | MIT | [version metadata](https://registry.npmjs.org/%40rolldown%2Fbinding-linux-arm-gnueabihf/1.2.16) |
| npm / `@rolldown/binding-linux-arm64-gnu` | 1.2.16 | MIT | [version metadata](https://registry.npmjs.org/%40rolldown%2Fbinding-linux-arm64-gnu/1.2.16) |
| npm / `@rolldown/binding-linux-arm64-musl` | 1.2.16 | MIT | [version metadata](https://registry.npmjs.org/%40rolldown%2Fbinding-linux-arm64-musl/1.2.16) |
| npm / `@rolldown/binding-linux-ppc64-gnu` | 1.2.16 | MIT | [version metadata](https://registry.npmjs.org/%40rolldown%2Fbinding-linux-ppc64-gnu/1.2.16) |
| npm / `@rolldown/binding-linux-s390x-gnu` | 1.2.16 | MIT | [version metadata](https://registry.npmjs.org/%40rolldown%2Fbinding-linux-s390x-gnu/1.2.16) |
| npm / `@rolldown/binding-linux-x64-gnu` | 1.2.16 | MIT | [version metadata](https://registry.npmjs.org/%40rolldown%2Fbinding-linux-x64-gnu/1.2.16) |
| npm / `@rolldown/binding-linux-x64-musl` | 1.2.16 | MIT | [version metadata](https://registry.npmjs.org/%40rolldown%2Fbinding-linux-x64-musl/1.2.16) |
| npm / `@rolldown/binding-openharmony-arm64` | 1.2.16 | MIT | [version metadata](https://registry.npmjs.org/%40rolldown%2Fbinding-openharmony-arm64/1.2.16) |
| npm / `@rolldown/binding-win32-arm64-msvc` | 1.2.16 | MIT | [version metadata](https://registry.npmjs.org/%40rolldown%2Fbinding-win32-arm64-msvc/1.2.16) |
| npm / `@rolldown/binding-win32-x64-msvc` | 1.2.16 | MIT | [version metadata](https://registry.npmjs.org/%40rolldown%2Fbinding-win32-x64-msvc/1.2.16) |
| npm / `@rolldown/pluginutils` | 1.0.1 | MIT | [version metadata](https://registry.npmjs.org/%40rolldown%2Fpluginutils/1.0.1) |
| npm / `@types/chai` | 5.2.3 | MIT | [version metadata](https://registry.npmjs.org/%40types%2Fchai/5.2.3) |
| npm / `@types/deep-eql` | 4.0.2 | MIT | [version metadata](https://registry.npmjs.org/%40types%2Fdeep-eql/4.0.2) |
| npm / `@types/estree` | 1.0.10 | MIT | [version metadata](https://registry.npmjs.org/%40types%2Festree/1.0.10) |
| npm / `@vitest/mocker` | 5.1.0 | MIT | [version metadata](https://registry.npmjs.org/%40vitest%2Fmocker/5.1.0) |
| npm / `@vitest/spy` | 5.1.0 | MIT | [version metadata](https://registry.npmjs.org/%40vitest%2Fspy/5.1.0) |
| npm / `assertion-error` | 2.0.1 | MIT | [version metadata](https://registry.npmjs.org/assertion-error/2.0.1) |
| npm / `chai` | 6.3.0 | MIT | [version metadata](https://registry.npmjs.org/chai/6.3.0) |
| npm / `detect-libc` | 2.1.2 | Apache-2.0 | [version metadata](https://registry.npmjs.org/detect-libc/2.1.2) |
| npm / `es-module-lexer` | 2.3.2 | MIT | [version metadata](https://registry.npmjs.org/es-module-lexer/2.3.2) |
| npm / `estree-walker` | 3.0.3 | MIT | [version metadata](https://registry.npmjs.org/estree-walker/3.0.3) |
| npm / `expect-type` | 1.4.0 | Apache-2.0 | [version metadata](https://registry.npmjs.org/expect-type/1.4.0) |
| npm / `fdir` | 6.5.0 | MIT | [version metadata](https://registry.npmjs.org/fdir/6.5.0) |
| npm / `fsevents` | 2.3.3 | MIT | [version metadata](https://registry.npmjs.org/fsevents/2.3.3) |
| npm / `lightningcss` | 1.33.0 | MPL-2.0 | [version metadata](https://registry.npmjs.org/lightningcss/1.33.0) |
| npm / `lightningcss-android-arm64` | 1.33.0 | MPL-2.0 | [version metadata](https://registry.npmjs.org/lightningcss-android-arm64/1.33.0) |
| npm / `lightningcss-darwin-arm64` | 1.33.0 | MPL-2.0 | [version metadata](https://registry.npmjs.org/lightningcss-darwin-arm64/1.33.0) |
| npm / `lightningcss-darwin-x64` | 1.33.0 | MPL-2.0 | [version metadata](https://registry.npmjs.org/lightningcss-darwin-x64/1.33.0) |
| npm / `lightningcss-freebsd-x64` | 1.33.0 | MPL-2.0 | [version metadata](https://registry.npmjs.org/lightningcss-freebsd-x64/1.33.0) |
| npm / `lightningcss-linux-arm-gnueabihf` | 1.33.0 | MPL-2.0 | [version metadata](https://registry.npmjs.org/lightningcss-linux-arm-gnueabihf/1.33.0) |
| npm / `lightningcss-linux-arm64-gnu` | 1.33.0 | MPL-2.0 | [version metadata](https://registry.npmjs.org/lightningcss-linux-arm64-gnu/1.33.0) |
| npm / `lightningcss-linux-arm64-musl` | 1.33.0 | MPL-2.0 | [version metadata](https://registry.npmjs.org/lightningcss-linux-arm64-musl/1.33.0) |
| npm / `lightningcss-linux-x64-gnu` | 1.33.0 | MPL-2.0 | [version metadata](https://registry.npmjs.org/lightningcss-linux-x64-gnu/1.33.0) |
| npm / `lightningcss-linux-x64-musl` | 1.33.0 | MPL-2.0 | [version metadata](https://registry.npmjs.org/lightningcss-linux-x64-musl/1.33.0) |
| npm / `lightningcss-win32-arm64-msvc` | 1.33.0 | MPL-2.0 | [version metadata](https://registry.npmjs.org/lightningcss-win32-arm64-msvc/1.33.0) |
| npm / `lightningcss-win32-x64-msvc` | 1.33.0 | MPL-2.0 | [version metadata](https://registry.npmjs.org/lightningcss-win32-x64-msvc/1.33.0) |
| npm / `magic-string` | 1.4.5 | MIT | [version metadata](https://registry.npmjs.org/magic-string/1.4.5) |
| npm / `nanoid` | 3.3.20 | MIT | [version metadata](https://registry.npmjs.org/nanoid/3.3.20) |
| npm / `obug` | 3.0.0 | MIT | [version metadata](https://registry.npmjs.org/obug/3.0.0) |
| npm / `picocolors` | 1.1.1 | ISC | [version metadata](https://registry.npmjs.org/picocolors/1.1.1) |
| npm / `picomatch` | 4.0.7 | MIT | [version metadata](https://registry.npmjs.org/picomatch/4.0.7) |
| npm / `playwright-core` | 1.64.1 | Apache-2.0 | [version metadata](https://registry.npmjs.org/playwright-core/1.64.1) |
| npm / `postcss` | 8.5.32 | MIT | [version metadata](https://registry.npmjs.org/postcss/8.5.32) |
| npm / `rolldown` | 1.2.16 | MIT | [version metadata](https://registry.npmjs.org/rolldown/1.2.16) |
| npm / `source-map-js` | 1.2.2 | BSD-3-Clause | [version metadata](https://registry.npmjs.org/source-map-js/1.2.2) |
| npm / `std-env` | 4.3.0 | MIT | [version metadata](https://registry.npmjs.org/std-env/4.3.0) |
| npm / `tinybench` | 6.2.3 | MIT | [version metadata](https://registry.npmjs.org/tinybench/6.2.3) |
| npm / `tinyexec` | 1.3.1 | MIT | [version metadata](https://registry.npmjs.org/tinyexec/1.3.1) |
| npm / `tinyglobby` | 0.2.17 | MIT | [version metadata](https://registry.npmjs.org/tinyglobby/0.2.17) |
| npm / `vite` | 8.3.6 | MIT | [version metadata](https://registry.npmjs.org/vite/8.3.6) |
| npm / `vitest` | 5.1.0 | MIT | [version metadata](https://registry.npmjs.org/vitest/5.1.0) |
| npm / `why-is-node-running` | 3.2.1 | MIT | [version metadata](https://registry.npmjs.org/why-is-node-running/3.2.1) |
| pypi / `click` | 8.5.0 | BSD-3-Clause | [version metadata](https://pypi.org/pypi/click/8.5.0/json) |
| pypi / `colorama` | 0.4.6 | OSI Approved :: BSD License | [version metadata](https://pypi.org/pypi/colorama/0.4.6/json) |
| pypi / `httpcore2` | 2.16.0 | BSD-3-Clause | [version metadata](https://pypi.org/pypi/httpcore2/2.16.0/json) |
| pypi / `httpx2` | 2.16.0 | BSD-3-Clause | [version metadata](https://pypi.org/pypi/httpx2/2.16.0/json) |
| pypi / `httpx2-jsfetch` | 1.0 | BSD-3-Clause | [version metadata](https://pypi.org/pypi/httpx2-jsfetch/1.0/json) |
| pypi / `iniconfig` | 2.3.1 | MIT | [version metadata](https://pypi.org/pypi/iniconfig/2.3.1/json) |
| pypi / `packaging` | 26.3 | Apache-2.0 OR BSD-2-Clause | [version metadata](https://pypi.org/pypi/packaging/26.3/json) |
| pypi / `pluggy` | 1.7.0 | MIT | [version metadata](https://pypi.org/pypi/pluggy/1.7.0/json) |
| pypi / `pygments` | 2.21.0 | BSD-2-Clause | [version metadata](https://pypi.org/pypi/pygments/2.21.0/json) |
| pypi / `pytest` | 9.2.0 | MIT | [version metadata](https://pypi.org/pypi/pytest/9.2.0/json) |
| pypi / `ruff` | 0.17.3 | MIT | [version metadata](https://pypi.org/pypi/ruff/0.17.3/json) |
| pypi / `truststore` | 0.10.5 | MIT | [version metadata](https://pypi.org/pypi/truststore/0.10.5/json) |
| pypi / `uvicorn` | 0.54.0 | BSD-3-Clause | [version metadata](https://pypi.org/pypi/uvicorn/0.54.0/json) |

## Asset-source licence table

These rows cover the tracked asset-source families, including archived/review material. Counts were taken from Git-tracked files, not stale prose totals. Individual visual originality and ownership were not independently proven; the first-party assertions below cite the repository's provenance evidence.

| Asset/source and footprint | Declared rights/licence; evidence | Release obligations or uncertainty |
| --- | --- | --- |
| Original pixel kit: **260 PNGs**, 251 under `frontend/public/pixel/` including ground, nine under `frontend/public/places/` | Project-authored generator, `frontend/ASSETS.md`; entry `frontend/scripts/pixel_art/generate.py` | Retain author/provenance records. No explicit first-party redistribution grant found. Historical counts differ; inventory includes ground separately. |
| Generator sources: common, nature, buildings, people, props, ground, destinations, nautical, settlements, case_places, crew, story_props, relighting, place_ground, chart, title | Original code-drawn sprites/maps according to the same asset register; no extracted pack/image-generation output claimed | No outside art licence to substitute for the missing project licence. Pillow is an authoring tool, not the output's author. |
| Favicon SVG and shell lighthouse emblem | Original; `frontend/public/favicon.svg`, `frontend/src/shell/screens.js` | Same first-party grant uncertainty. |
| Water/rain/beams/sky/fireworks and procedural visual effects | Original code graphics, `frontend/ASSETS.md`; `frontend/src/world/festival.js` | Same first-party status; no downloaded texture/model library identified. |
| **117 archived paper SVGs**, including procedural paper noise | `frontend/archive/paper/ARCHIVE.txt`; 116 “Original” headers, paper noise at `archive/paper/public/art/paper.svg:2` | Excluded from active build but still distributed in source checkout; retain provenance. No independent originality verification. |
| **488 PNG review captures** in `frontend/captures/` | Screenshots of project iterations, local repository evidence | Review-only, not runtime assets. Underlying game/dependency rights still apply; individual captured content was not visually audited. |
| Fonts | System Courier New/monospace (`frontend/src/ui/styles.css`); archived styles use system Georgia/Avenir/Segoe families | No font files/provider URLs/@font-face found. Font names do not redistribute font files; no invented font licence grant. |
| Sound effects, ambience, original 16-step music and four festival WAVs | Executable Web Audio synthesis plus four original generated WAVs under `frontend/public/audio/`; `frontend/src/audio/synth.js`, `ambience.js:1`, `music.js:1`; `frontend/ASSETS.md` | Project-authored; no sample/music-pack licence claimed. First-party grant remains unspecified. |
| Intro story and Python/JS engines, including demo story copy | Authorised import from Nils' private Plot-Twist commit `e235ee4`; hashes/changes in `backend/content/README.md`; provenance decision D007, `docs/DECISIONS.md` | Preserve upstream authorship. An authorised import is not proof of a public reuse licence; owner should confirm intended rights. No private repository was accessed. |
| Case/NPC/names/entry-kit/company fiction, captions and rehearsal text | Project-authored content; original/licensed-text rule `docs/STORY.md`, formats in `backend/content/README.md` | Same project-licence gap; do not copy case reveal prose into this audit. |
| Open-Meteo recording, ten modified weather samples and demo subset | **CC BY 4.0**; source/time/credit `backend/content/weather/recorded-fallback.json`; sample/credit rules `weather/README.md:14`; adaptations `frontend/ASSETS.md` | Credit Open-Meteo, link source/licence and state adaptation. Preserve credit next to displayed weather per repo policy. Demo path consistency is open below. [Licence](https://creativecommons.org/licenses/by/4.0/). |
| Binance Vision price replay, seven pair archives transformed into 90-minute minute closes | **CC BY-NC-SA 4.0**, author/source/changes and dataset terms recorded at `backend/content/market/replay.json`, `market/README.md:59`, archive checksums `:73` | Credit Binance Vision, identify changes, retain licence, noncommercial use and share-alike for adapted dataset; do not blanket-relicense unrelated code. [Licence](https://creativecommons.org/licenses/by-nc-sa/4.0/). Provider terms link is in source; current terms were not re-fetched or legally verified. |
| Live external weather/market data | Open-Meteo credit at `backend/server/weather/source.py` and response transport `backend/server/routes/weather.py`; market attribution/licence transport `backend/server/market/feed.py` | No live data was requested. Confirm current provider API terms separately before enabling/reusing beyond the documented student use; a dataset licence does not automatically govern every live API response. |
| Supplied screenshot; Minit/Carto/TOEM/Chicory style references | Inspiration only; `frontend/20261105_Pixel-Direction.txt`, `frontend/20261105_Style-References.txt`; screenshot excluded by `.gitignore:33` | No grant to distribute reference artwork; no tracked screenshot copy or extraction identified. Do not package reference files. |
| Three.js/Vite code and helper material in built browser chunks | MIT upstream package metadata and installed notices; see runtime/build tables | This is third-party software as well as a distribution source; preserve applicable exact notices in the served artifact. |

Four original festival WAV files are now tracked; no font, video or model files and no remote SVG image references were found. This does not establish rights to every historical screenshot. Package/source metadata and repo provenance were checked; external image licences and provider terms were not newly certified.

## Remaining distribution and owner items

The source credit screen lists current weather, market and sports providers and tool licences. Four original festival WAVs and the new drawings retain source-generation provenance in [ASSETS.md](../frontend/ASSETS.md). No downloaded music or font pack is introduced by this audit.

The build now emits `third-party-notices.md` with Vite's supported `build.license` API for the actual bundled dependencies. A small post-generation hook appends the installed Vite distribution's exact licence/notice text because virtual browser helpers are excluded from automatic package enumeration. Settings → Credits links the built artifact. Tests compare exact installed Three.js, Supabase and Vite notice text and reject a build missing its automatic notice asset.

Nils deliberately placed weather attribution in Settings → Credits. The current screen retains the Open-Meteo source/licence and adaptation statement; public weather and bulletin responses retain their attribution fields. The old nearby-HUD recommendation is superseded, so this integration does not restore HUD credits.

There is still no root LICENSE defining first-party redistribution. The owner must choose the intended grant with contributor/import permissions; no licence is assigned here. Public package metadata and source provenance are evidence, not legal certification of every historical image or provider term. Current live sports access remains off pending its key and provider proof.
