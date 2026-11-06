# G27 audit evidence and reproduction

Local, read-only dependency/source review for Nils, 6 November 2026. These scripts do not import the game or contact its services. Findings are in [THREAT-MODEL.md](../../docs/THREAT-MODEL.md) and the [licence report](../../docs/LICENSES-THIRD-PARTY.md).

## Scope and results

Reviewed source baseline `94a48ad`; the exact full commit is recorded in `audit-run.json` and `sbom.cdx.json`. Both original lockfiles are unchanged. The SBOM contains **99** components: all **71** npm lock entries and **28** Python registry entries, including development and other-platform packages. The local application itself is metadata, not a third-party component. Twenty-five components are runtime-labelled dependencies: Three.js, the Supabase browser graph and fifteen Python packages reachable from FastAPI/httpx/Pydantic. Python uvicorn is a local development server in this manifest, not a declared production dependency.

`npm-audit.json`: npm 11.9.0, full dependency audit, exit 0, zero known advisories. `pip-audit.json`: pip-audit 2.10.1, 28 exact pins, exit 0, zero known advisories or skipped dependencies. See [audit-run.json](audit-run.json) for acquisition time and input hashes. These are point-in-time database results, not proof of absence of vulnerabilities. A failure to contact an advisory service must never be reported as a clean scan.

## Reproduce without touching manifests

Run from the repository root with Python 3.12+ and the configured HTTPS proxy/CA trust:

```bash
# Offline regeneration from checked-in licence metadata and current lockfiles.
python3 scripts/audit/inventory.py --source-ref 94a48ad
# Check all 99 components, frozen source/locks, 55 routes, links and tracked assets.
python3 scripts/audit/validate.py
# Optional: refresh only public package metadata, then regenerate.
python3 scripts/audit/inventory.py --refresh-metadata --source-ref 94a48ad

# Read-only npm advisory request, no audit fix or installation.
(cd frontend && npm audit --json) > /tmp/g27-npm-audit.json

# Audit the complete locked Python inventory, including conditional/dev entries.
UV_CACHE_DIR=/workspace/.cache/uv uvx --from pip-audit==2.10.1 pip-audit \
  --no-deps --disable-pip -r scripts/audit/python-requirements.txt \
  --format json --output /tmp/g27-pip-audit.json

# After committing, this must exit 0 with empty stdout and stderr.
python3 scripts/audit/secret_scan.py
```

Preserve each audit command's exit status. npm/pip-audit use nonzero status for advisories or errors; inspect the JSON to distinguish them. `--no-deps --disable-pip` prevents resolution/installation of audited packages: the script has already enumerated every package in uv.lock. pip-audit's unhashed-input warning concerns installation/resolution; it does not mean a package was omitted. Lockfile hashes and artifact checksums remain unchanged. The audit tool's isolated dependencies are not application dependencies and are outside this SBOM.

`inventory.py` queries only fixed public npm/PyPI metadata endpoints; no application URLs, secret files or secret environment variables are read. Raw licence strings/classifiers and version-specific source URLs are retained in `license-metadata.json`. CycloneDX 1.6 JSON uses licence names to preserve upstream expressions without guessing SPDX identifiers. It includes purls, npm artifact integrity hashes, dependency edges, reviewed source commit, input SHA-256 hashes, and explicit runtime/optional properties. It inventories all platform branches rather than claiming every package ships on this Linux machine. Optional npm edges are included; peer relationships and bundled upstream subcomponents are not a complete binary composition analysis. Python wheel/sdist hashes remain in uv.lock. Assets are catalogued separately in the licence report; OS/browser/hosting/audit-tool packages are excluded.

The secret scan covers the complete textual committed `git diff origin/main...HEAD`, including removed lines. Git reports binary files as summaries, so this gate does not inspect binary content; G27 adds only text files; the integrated text/browser checks may update original review captures. It uses the engineering checklist's Supabase/JWT/setting patterns plus common package/GitHub/AWS/private-key patterns, without echoing potential secrets. It is a bounded pattern gate, not a history-wide secret audit. Run it again after every amendment and before pushing.

The checked-in [schema-validation receipt](sbom-schema-validation.json) records a successful official CycloneDX 1.6 schema validation with jsonschema 4.26.0/referencing 0.37.0 and the hashes of `bom-1.6.schema.json`, `spdx.schema.json` and `jsf-0.82.schema.json`, fetched from the public CycloneDX specification's `1.6/schema/` directory. The small local validator checks the receipt's SBOM hash; it does not silently claim to re-run the external schema validator. Re-run `uv run --with jsonschema==4.26.0 --with referencing==0.37.0 python scripts/audit/validate_schema.py` after SBOM changes; this fetches only the three fixed public official schemas. Validation of file/line references to installed upstream notices requires the locked dependencies to be installed.

No live site, Supabase project, database, secret, GitHub Actions run or deployment was accessed for this audit. External requests were limited to Git transport, package registries, advisory metadata and the public SBOM schema. Do not use these scripts as authorization to scan deployed services.

Run `python3 -m unittest discover -s scripts/audit -p 'test_*.py'` for frozen-source mismatch and redacted-secret negative cases. The SBOM labels manifest runtime reachability; it does not claim every declared package is bundled in the browser. `build.license` separately records actual bundled modules in the delivered notices.
