# Third-party licences and dependency audit (G27)

Inventory for Nils, Claude and release reviewers, 6 November 2026. Sources are the unchanged lockfiles, version-specific public package metadata and the repository's asset provenance records. This report preserves existing rights; it does not assign a licence to project-authored work. [Threat model](THREAT-MODEL.md) · [security process](SECURITY.md) · [audit reproduction](../scripts/audit/README.md).

## Dependency advisory results and SBOM

| Check | Scope and exact outcome |
| --- | --- |
| npm 11.9.0 `npm audit --json` | Full frontend lock, including dev/build/optional dependencies; exit 0; zero advisories at any severity. npm metadata counts 62 total entries; its prod/dev/optional categories overlap and include the root in some totals. |
| pip-audit 2.10.1 | All 28 third-party Python pins from uv.lock, including dev and conditional-platform packages; `--no-deps --disable-pip`; exit 0; zero known vulnerabilities and zero skips. Packages were queried, not installed by the audit. |
| CycloneDX 1.6 | [sbom.cdx.json](../scripts/audit/sbom.cdx.json): 90 third-party components, purls, graph, npm integrity hashes, runtime/optional annotations, reviewed source commit and both lockfile SHA-256 values. Sixteen runtime components. |

Raw evidence: [npm-audit.json](../scripts/audit/npm-audit.json), [pip-audit.json](../scripts/audit/pip-audit.json), [audit-run.json](../scripts/audit/audit-run.json). Version/licence metadata and its source URLs: [license-metadata.json](../scripts/audit/license-metadata.json). Full machine-readable licence table: [dependency-licenses.json](../scripts/audit/dependency-licenses.json).

No dependency fix or lockfile update was made. No known advisory was returned, so there is no asserted CVE/fix-version list; future scans must be treated independently. Zero database matches is not an assurance against unknown issues, malicious packages, inherited binary subcomponents or deployment defects. Registry/advisory requests were permitted; no live game/provider endpoint or secret was used. Audit-tool, OS, browser, managed hosting and optional unpinned authoring software are outside the application SBOM.

## Runtime dependency licences

Runtime here means Three.js plus the transitive Python graph reachable from the three manifest dependencies FastAPI/httpx/Pydantic. Versions are from locks, not ranges in manifests. Uvicorn is declared in the backend dev group; its authoring/runtime deployment role must be reviewed again if deployment packaging changes. Upstream metadata is evidence of the declared licence, not an independent legal review of every source file.

| Ecosystem / package | Locked version | Declared licence | Evidence |
| --- | --- | --- | --- |
| npm / `three` | 0.187.0 | MIT | [version metadata](https://registry.npmjs.org/three/0.187.0) |
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

MIT/BSD recipients must retain applicable copyright/permission/disclaimer notices when distributing copies. Apache-2.0 requires the licence and applicable attribution/NOTICE preservation and change notices where required; it includes patent terms. PSF-2.0 has attribution/notice requirements. Certifi's MPL-2.0 concerns covered files and source availability when distributed in executable form; assess the actual distribution and any modifications rather than treating all server code as MPL. Providing a hosted service alone is different from distributing a container/source snapshot. Do not infer a project-wide licence from dependency licences.

## Build, test and optional package licences

The following table covers every remaining lockfile component, including platform-specific binaries absent from this machine. These can affect the build supply chain even though they are not declared runtime dependencies. See metadata JSON for version-specific licence evidence URLs; bundled upstream notices can add obligations beyond top-level metadata.

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

Pillow is an **optional, unpinned art-authoring dependency**, mentioned in `frontend/ASSETS.md:59`, not a locked application component. The register labels it HPND (`frontend/ASSETS.md:65`). No generator or Pillow install was needed for this report; verify the actual authoring version and its licence/notices if redistributing that tool. Chromium, Python, Node, uv and the isolated pip-audit toolchain are environment tools, not assets bundled into the game or components claimed by this SBOM.

## Asset-source licence table

These rows cover the tracked asset-source families, including archived/review material. Counts were taken from Git-tracked files, not stale prose totals. Individual visual originality and ownership were not independently proven; the first-party assertions below cite the repository's provenance evidence.

| Asset/source and footprint | Declared rights/licence; evidence | Release obligations or uncertainty |
| --- | --- | --- |
| Original pixel kit: **195 PNGs**, 186 under `frontend/public/pixel/` including ground, nine under `frontend/public/places/` | Project-authored generator, `frontend/ASSETS.md:3`, `:59`, `:69`, `:194`, `:204`; entry `frontend/scripts/pixel_art/generate.py:23` | Retain author/provenance records. No explicit first-party redistribution grant found. Historical counts differ; inventory includes ground separately. |
| Generator sources: common, nature, buildings, people, props, ground, destinations, nautical, settlements, case_places, crew, story_props, relighting, place_ground, chart, title | Original code-drawn sprites/maps according to the same asset register; no extracted pack/image-generation output claimed | No outside art licence to substitute for the missing project licence. Pillow is an authoring tool, not the output's author. |
| Favicon SVG and shell lighthouse emblem | Original; `frontend/public/favicon.svg:1`, `frontend/src/shell/screens.js:4` | Same first-party grant uncertainty. |
| Water/rain/beams/sky/fireworks and procedural visual effects | Original code graphics, `frontend/ASSETS.md:65`; `frontend/src/world/festival.js:1` | Same first-party status; no downloaded texture/model library identified. |
| **117 archived paper SVGs**, including procedural paper noise | `frontend/archive/paper/ARCHIVE.txt:3`; 116 “Original” headers, paper noise at `archive/paper/public/art/paper.svg:2` | Excluded from active build but still distributed in source checkout; retain provenance. No independent originality verification. |
| **149 PNG review captures** in `frontend/captures/` | Screenshots of project iterations, local repository evidence | Review-only, not runtime assets. Underlying game/dependency rights still apply; individual captured content was not visually audited. |
| Fonts | System Courier New/monospace (`frontend/src/ui/styles.css:2`); archived styles use system Georgia/Avenir/Segoe families | No font files/provider URLs/@font-face found. Font names do not redistribute font files; no invented font licence grant. |
| Sound effects, ambience and original 16-step music | Executable Web Audio synthesis, no audio files; `frontend/src/audio/synth.js:1`, `ambience.js:1`, `music.js:1`; `frontend/ASSETS.md:196` | Project-authored; no sample/music-pack licence claimed. First-party grant remains unspecified. |
| Intro story and Python/JS engines, including demo story copy | Authorised import from Nils' private Plot-Twist commit `e235ee4`; hashes/changes in `backend/content/README.md:482`; provenance decision D007, `docs/DECISIONS.md:138` | Preserve upstream authorship. An authorised import is not proof of a public reuse licence; owner should confirm intended rights. No private repository was accessed. |
| Case/NPC/names/entry-kit/company fiction, captions and rehearsal text | Project-authored content; original/licensed-text rule `docs/STORY.md:173`, formats in `backend/content/README.md` | Same project-licence gap; do not copy case reveal prose into this audit. |
| Open-Meteo recording, ten modified weather samples and demo subset | **CC BY 4.0**; source/time/credit `backend/content/weather/recorded-fallback.json:2`; sample/credit rules `weather/README.md:14`, `:47`; adaptations `frontend/ASSETS.md:198` | Credit Open-Meteo, link source/licence and state adaptation. Preserve credit next to displayed weather per repo policy. Demo path consistency is open below. [Licence](https://creativecommons.org/licenses/by/4.0/). |
| Binance Vision price replay, seven pair archives transformed into 90-minute minute closes | **CC BY-NC-SA 4.0**, author/source/changes and dataset terms recorded at `backend/content/market/replay.json:2`, `market/README.md:59`, archive checksums `:73` | Credit Binance Vision, identify changes, retain licence, noncommercial use and share-alike for adapted dataset; do not blanket-relicense unrelated code. [Licence](https://creativecommons.org/licenses/by-nc-sa/4.0/). Provider terms link is in source; current terms were not re-fetched or legally verified. |
| Live external weather/market data | Open-Meteo credit at `backend/server/weather/source.py:59` and response transport `backend/server/routes/weather.py:100`; market attribution/licence transport `backend/server/market/feed.py:353` | No live data was requested. Confirm current provider API terms separately before enabling/reusing beyond the documented student use; a dataset licence does not automatically govern every live API response. |
| Supplied screenshot; Minit/Carto/TOEM/Chicory style references | Inspiration only; `frontend/20261105_Pixel-Direction.txt:3`, `frontend/20261105_Style-References.txt:8`; screenshot excluded by `.gitignore:33` | No grant to distribute reference artwork; no tracked screenshot copy or extraction identified. Do not package reference files. |
| Three.js/Vite code and helper material in built browser chunks | MIT upstream package metadata and installed notices; see runtime/build tables | This is third-party software as well as a distribution source; preserve applicable exact notices in the served artifact. |

No tracked audio, font, video or model files and no remote SVG image references were found. This does not establish rights to every historical screenshot. Package/source metadata and repo provenance were checked; external image licences and provider terms were not newly certified.

## Open licence and distribution items

These are report-only follow-ups for Claude/owner; source/build/configuration fixes are outside G27.

| ID / priority | Exact evidence and follow-up |
| --- | --- |
| **G27-L01 · Medium release compliance** | The inspected `frontend/dist` build contains no licence/notice artifact and no Three.js/Vite copyright/permission text in JS. Credits only names licences (`frontend/src/shell/screens.js:20`); build setup is `frontend/vite.config.js:9`. Three.js notice retention: installed `frontend/node_modules/three/LICENSE:3`, `:12`; Vite MIT notice: `frontend/node_modules/vite/LICENSE.md:6`, `:15`. Installed files are evidence, not tracked deliverables. In a separate task, ship exact applicable upstream notices (including bundled helpers) through the static distribution and test presence in dist. Do not solve this by relabelling the whole project MIT. |
| **G27-L02 · Low attribution consistency** | Offline tour applies recorded weather at `frontend/src/demo/tour.js:20`; live credit updates return early at `frontend/src/game.js:81`; HUD credit starts hidden at `frontend/src/ui/hud.js:40`. Credits contains correct links, but adjacent weather credit can be absent, conflicting with `backend/content/weather/README.md:53`. Separate task: initialise/restore correct tour credit and test with APIs unavailable. This is a documented placement gap, not a blanket infringement conclusion. |
| **G27-L03 · Owner decision** | No root LICENSE/NOTICE defines first-party redistribution, despite `frontend/ASSETS.md:204` referring to a project-authored licence. Confirm contributor/import permissions and desired grant; retain rights as unspecified until the owner chooses. G27 does not create a licence on their behalf. |

All package metadata fetched for this audit reports a licence (no NOASSERTION rows), but top-level metadata alone does not prove every bundled file is covered or all distribution notices are satisfied. Recheck on upgrades and when producing downloadable builds/containers.
