# G27 checkpoint 2 · final verification · 6 November 2026

Report commit: `9981188` on `docs/g27-security`, based on the `origin/main` source commit recorded in [audit-run.json](../../scripts/audit/audit-run.json). This checkpoint adds verification evidence only. The authorised delivery is a push of this branch; no main push, force-push, merge, live scan, secret access or Actions dispatch.

## Gate evidence

| Check | Observed result |
| --- | --- |
| `python3 scripts/audit/validate.py` | Exit 0: 90 SBOM/licence components, graph connectivity, unchanged baseline lockfiles, all 28 Python pins, 20 documented route/method pairs, local links/file-line bounds and asset counts. |
| `python3 scripts/audit/inventory.py` with saved metadata | Exit 0; repeated generation is byte-identical. All 90 components are reachable from the application graph, including direct development roots. |
| Official CycloneDX 1.6 schema | Passed with jsonschema 4.26.0/referencing 0.37.0; regenerated SBOM hash matches [receipt](../../scripts/audit/sbom-schema-validation.json). |
| `python3 scripts/audit/secret_scan.py` | Exit 0, **empty stdout and stderr** on committed `git diff origin/main...HEAD`. Covers the engineering checklist patterns plus additional token/key patterns; no binary files were added. |
| Secret gate behavior | Synthetic plain-text diff accepted silently; synthetic secret-shaped diff rejected with only redacted location, never content. Synthetic material was not written to the repository. |
| `git diff --check origin/main...HEAD` | Exit 0, no whitespace errors. |
| Scope/branch guard | Only three requested security/licence documents, G27 handoff notes and new `scripts/audit/` files. Baseline application/protected files and both locks unchanged; current branch is `docs/g27-security`. |
| Independent read-only reviews | Checked threat/control references, licence/version/runtime/asset coverage and audit-script behavior. Corrections incorporated: precise RLS/auth references and limitations, development-root graph edges, and textual/binary secret-scan limits. |

The committed-diff secret gate and whitespace/scope checks are repeated after this checkpoint commit and before branch push. No application suites were rerun for this documentation/tooling scope. The earlier cloud-onboarding tests are not substituted for a G27 application security test.

## Handoff

See [checkpoint 1](g27-checkpoint-1.md) for changed/verified/unverified/remaining scope. npm and pip-audit returned zero known advisories; the SBOM is an inventory, not a security certificate. Claude should take separate code tasks for G27-01/02/04/05/06 and G27-L01/02; owner review is needed for G27-03 preview isolation and G27-L03 first-party licensing. None was fixed by this branch. No PR or issue was created; the pushed branch is the review handoff.
