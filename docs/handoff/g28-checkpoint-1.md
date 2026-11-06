# G28 checkpoint 1 — teammate starter kit

Responsible human: Nils; task: G28. Branch: `docs/g28-starter-kit`, created from
fetched `origin/main` at `c26f3032b150af970d57fbbcd6eea439eb26f4c4`.
Main was fetched again before the checkpoint and still has that HEAD.

## Changed

- [Quickstart](../contribute/QUICKSTART.md): one-hour target, own Git identity,
  credential-free fake workshop, optional API, task branch, own credits row,
  checks, PR and independent human review/merge. Review availability and the
  missing credits module qualify the one-hour target.
- [Ideas](../contribute/IDEAS.md): fifteen 2–6-hour code proposals, distributed
  G/S/A/L as 4/4/3/4. Each has a goal, source pointers, acceptance checks and
  explain-back prompts. They are separate offline tools/creative exercises,
  with no game-runtime integration or completed implementation to misattribute.
- [Explain-back](../contribute/EXPLAIN-YOUR-CODE.md): preparation, six practice
  prompts, tests, boundaries and honest agent attribution; defers shared lane
  cards to G11 rather than duplicating that package.

## Verified

- Read AGENTS, CONTRIBUTING, README, engineering commands and D001/D015.
  Reviewed fake adapter/workshop, credits renderer, actual package scripts,
  roadmap and fetched G9/G11/G12/G13/G14/G15/G16/G20/G21/G23/G25 branches.
- Local Markdown target check: 45 links in the three guides resolve. All 15
  briefs have the four required fields. `git diff --check` passes.
- Chromium check of the documented workshop URL: opens the crew screen, creates
  a local fake crew, resets it on refresh, and makes zero `/api/` requests.
  An initial ad-hoc probe used a nonexistent captain field and timed out;
  correcting the probe to the actual `arrival.kit` field passed. No source fix.
- Independent read-only agent review: corrected shell portability, the order of
  the missing-file caveat, two source descriptions and explicit tool-test
  discovery requirements. No concrete idea overlap found with visible packages.
- Secret gate: `detect-secrets` 1.5.0, run via
  `UV_CACHE_DIR=/workspace/.cache/uv uvx --from detect-secrets==1.5.0 detect-secrets scan --all-files docs/contribute docs/handoff/g28-checkpoint-1.md`.
  Final scan result: empty `results` object, zero files with findings.
  Scan evidence stays outside the checkout in `/workspace/.cloud-setup/g28/`.

## Not verified / remaining

- Requested `frontend/src/shell/team.js` does not exist on fetched main; current
  `shell/screens.js` still renders four placeholders. No rows or code were
  edited. Quickstart explicitly skips the credits commit/PR until its owning
  package lands; do not create an alternative schema in G28.
- G10, G17–G19, G22, G24 and G26–G27 briefs/refs were unavailable. Asked the user
  asynchronously for the complete scope index; no answer was available when
  writing this checkpoint. The ideas exclude visible deliverables and shared
  runtime changes, but a full unseen-package non-overlap claim is unverified.
  Compare the missing briefs before teammates claim the proposals.
- The official six-question course rubric is absent; these are labelled practice
  prompts. G11's shared drill pack is on its branch, not this main.
- App suites/build were not rerun for this docs-only change; this checkpoint does
  not reuse onboarding results as new test evidence. No timed novice run,
  credits edit, live sign-in, PR review/merge or deployment was performed.

## Branch / integration

Only the three `docs/contribute/` guides and this permitted checkpoint are in
scope. No code, migrations, `vercel.json`, STATUS or DECISIONS changes. No GitHub
issue or PR is created. Commit and push only `docs/g28-starter-kit`; never push
`main`. Claude can integrate later under the applicable policy; G28 does not
merge itself. Teammates' own contributions retain D001 human peer review.
