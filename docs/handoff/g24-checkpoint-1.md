# G24 checkpoint 1

Handover for the requesting teammate: linter and initial audit (C1).

- Created `chore/g24-text` from fetched `origin/main`; clean starting tree, no other branch modified.
- Read repository policy, content rules, UI-kit contracts and existing spoiler guard. Read-only parallel audits covered content/names and editable UI text; one agent writes this branch.
- Added dependency-free source extraction, reviewed vocabulary, American spelling/name/style rules, declared template/sample length checks, generated-name bounds and existing spoiler fingerprints.
- `node scripts/text-lint/index.mjs --json`: 1,056 candidate strings, 156 files, eight expected editable errors and three protected dialect findings. The pre-fix nonzero result establishes the fixes needed for C2.
- No backend content correction is warranted. Approved story, demo story copy, online/adapter/case code, secret content, migrations and protected configuration/docs remain unchanged.
- Next: safe copy fixes (C2), then normal-suite integration, mutation tests and requested gates (C3). Read the report for coverage limits and future S4 template-rendering responsibility.
