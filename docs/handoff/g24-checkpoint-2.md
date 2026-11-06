# G24 checkpoint 2

> Historical authored checkpoint against the original pre-integration source. Current evidence, contracts and remaining work are in [the security/text integration](security-text-integration.md); maintained audit files now describe its newer baseline.

Handover for the requesting teammate: safe text fixes (C2).

- Fixed all eight editable findings across six UI source files. Ranges now say `1 to 9`; missing supplied values use `?`, not an invented zero. The settings/credits labels use American spelling. A pending-credit notice replaces four raw `<name>` placeholders without inventing team members.
- Updated the three existing unknown-coin assertions to require the new marker; valid coin formatting is unchanged.
- `node scripts/text-lint/index.mjs`: 1,053 candidates in 156 files, zero errors and three report-only British spellings in protected relighting code.
- `cd frontend && npm test -- tests/ui-kit.test.js --maxWorkers=2`: five tests passed.
- Browser UI-kit fit/accessibility check is running with captures outside the checkout. Final result belongs in the final report. No backend content or protected file changed.
- Next: C3 adds the ordinary-suite gate and deliberate-bad-copy tests, including escaped strings and missing fields. Full frontend/build/backend/secret gates remain to run.
