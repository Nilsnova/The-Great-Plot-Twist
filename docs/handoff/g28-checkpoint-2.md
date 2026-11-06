# G28 checkpoint 2 — scope clarification applied

Responsible human: Nils. Branch: `docs/g28-starter-kit`, following checkpoint 1
commit `6ffdf28`. This checkpoint supersedes its missing-source and package-scope
qualifications; it does not rewrite the earlier audit record.

## Changed

- QUICKSTART keeps the own-credits-row exercise. Read the G8 `team.js` at
  `ea89e35cd7d55df8a2dc2ed4785b0812b2233b11`: `teamMembers` is an array of four
  display-name strings, with Nils's entry and three unused placeholders. Explain
  replacing only one's own placeholder, preserving neighbours/order and adding
  no student numbers. The verified G8 menu path is Settings → Credits.
- Nils confirmed G7/G8 supplies the file and group 2 will reach main before
  teammates start. The maintainer note records that integration dependency;
  the guide no longer tells teammates to skip their first contribution.
- IDEAS now uses Nils's supplied G9–G27 scope list, including packages without
  published refs. Added an exclusion table and concrete proposed files to touch.
  Replace the vignette runner and scene-link checker with a harbor-notice gallery
  and a small read-only harbor-fact route, avoiding the Chapter 2 sandbox and
  text-linting packages. Retain thirteen independent, narrowly bounded ideas.
- The fifteen briefs remain split G/S/A/L as 4/4/3/4, each with a 2–6-hour
  estimate, goal, source/file pointers, acceptance checks and drill prompts.
  No teammate's implementation, credit entry or finished solution is supplied.

## Verification

- Fetched `origin/main` and `origin/feat/g8-islet-harbor-demo`; read G8's team
  array, shell controller and experience check. Main was still `c26f303` when
  inspected; this does not claim group 2 has already merged.
- All 49 local Markdown targets/anchors and all fifteen brief structures checked;
  `git diff --check` passed. Read-only agent review covers the scope revision.
- Secret gate: run `detect-secrets` 1.5.0 over `docs/contribute/` and both G28
  checkpoint files. Result: empty `results` object, zero files with findings.
  Evidence is outside the checkout in `/workspace/.cloud-setup/g28/`.
- No app test/build rerun for this documentation-only revision. The earlier
  fake-workshop browser check remains checkpoint 1 evidence, not a new run.

## Remaining / branch

- Group 2 integration belongs to its owners; G28 has not merged it, edited code
  or filled any credits row. All proposals must still be checked against later
  teammate changes before being claimed; their boundaries were reviewed against
  the complete scopes Nils supplied, rather than inferred from ref availability.
- The official six-type course rubric remains unspecified; EXPLAIN labels its
  prompts as practice and leaves G11's shared drills alone.
- Commit and push only `docs/g28-starter-kit`. No issue, PR, merge into main or
  deployment. All protected files remain unchanged. Teammates' own PRs retain
  D001 human peer review; D015's agent-package policy is separate.
