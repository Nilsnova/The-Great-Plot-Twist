# G27 checkpoint 1 · 6 November 2026

Report/docs task for Nils, with code findings handed to Claude. Branch: `docs/g27-security`, created from `origin/main`; reviewed baseline is recorded exactly in [audit-run.json](../../scripts/audit/audit-run.json). No application code, tests, dependency declarations, lockfiles, deployment config, migration, workflow, STATUS or DECISIONS was changed. No issue/PR number was provided; no policy/architecture decision is invented here.

## Changed

- [SECURITY.md](../SECURITY.md): private reporting route with fallback, safe scope and release security checklist; no invented email/SLA or permission for live scans.
- [THREAT-MODEL.md](../THREAT-MODEL.md): assets, actors, boundaries, all 20 API method/path pairs, static/Auth/Data API/docs/Realtime surfaces, thirteen-table RLS map, controls and prioritised open findings with exact baseline file/line references.
- [LICENSES-THIRD-PARTY.md](../LICENSES-THIRD-PARTY.md): every locked runtime dependency and all remaining locked components, asset-source families, provenance/obligations and unresolved first-party/notice/attribution work.
- [scripts/audit](../../scripts/audit/README.md): offline inventory generator, 90-component CycloneDX SBOM, package licence metadata, exact Python pins, raw npm/pip-audit results, acquisition/schema-validation receipts, local evidence validator and redacting committed-diff secret gate.

## Verified

- npm 11.9.0 full-lock advisory audit: exit 0, zero known advisories; 62 third-party npm entries represented.
- pip-audit 2.10.1 against all 28 exact Python lock pins, including dev/conditional platforms: exit 0, zero known vulnerabilities, zero skips. No audited package resolution/install was performed by pip-audit.
- Version-specific licence metadata fetched for all 90 entries from public npm/PyPI; all report a licence. Offline inventory regeneration succeeds with saved metadata.
- SBOM validated against official CycloneDX 1.6 JSON, SPDX and signature schemas using jsonschema; receipt includes schema/input hashes.
- Local evidence validation: lockfile-byte equality with baseline, SBOM/licence/audit package coverage, dependency references, 20 documented route/method pairs, Markdown local link/file-line existence and tracked asset counts.
- Production notice inspection of the existing local build: no served licence/notice artifact or Three.js/Vite MIT copyright/permission text found. This is the G27-L01 follow-up, not a fixed issue.
- Final committed diff secret gate must exit 0 with empty output before push; exact command/results and branch delivery are recorded in checkpoint 2 after the commit is reviewed.

## Not verified

No live Supabase/site/provider requests, secrets, OAuth tests, deployed headers/RLS, production records or Realtime policy were inspected. No remote vulnerability/load scanner ran. No Actions was invoked or workflow added; existing workflow has only schedule/manual triggers. No application test suite was re-run for these report/tooling changes; the relevant checks are evidence/schema/link/gate validation, not claims that code defects were fixed. Asset originality, current provider terms and project-wide licensing rights are not legally certified.

## Remaining for Claude / owner

Medium: pre-provider authentication abuse limits (G27-01), general CSP/frame protection (G27-02), shared preview/production boundary (G27-03), distributed third-party notices (G27-L01). Low: private cache headers (G27-04), pre-decode body limits (G27-05), identity-cache revocation window (G27-06), offline weather credit placement (G27-L02). Owner decision: explicit first-party/imported work licensing (G27-L03). Exact source locations and suggested separate acceptance checks are in the threat/licence reports. No code fix was attempted.

## Branch / delivery

Commit and push only `docs/g27-security`, never `main`; do not force-push, merge, deploy or trigger Actions. Re-run the secret gate after any amendment. No application service or credentials are needed to reproduce the audit. Human review is still required for any later fix/release.
