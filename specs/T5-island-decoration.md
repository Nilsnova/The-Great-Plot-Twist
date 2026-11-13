# T5 Island decoration

> **What this is:** visible milestones for the shared island, using existing saved progress.
>
> **Who uses it:** players and teammates reviewing Ianno's contribution.

- **Status:** agreed; implementation pending
- **Branch:** `feat/t5-island-decoration`
- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`)
- **Agent assistance:** Codex drafts code and evidence; Ianno explains and reviews it.
- **Reviewer:** another human teammate; Johannes suggested.

## Goal and scope

Show the highest beaten wave on a flag, reveal a statue after wave 25, and
grow decorative trees through three sizes for zero, one, or two built houses.
The flag follows the island being viewed, including a friend's island.
Losses keep the recorded best wave. Removing a house reduces the tree size.
These decorations change appearance only: no combat, money, collision or API rules.

## Likely files

`frontend/src/island/world.js`, a small decoration renderer under that folder,
original drawing code under `frontend/src/art/`, focused frontend tests,
`docs/ASSETS` register (the existing register is `frontend/ASSETS.md`),
`docs/WALKTHROUGH.md`, `docs/TEST-MAP.md`, `docs/OPEN-TODOS.md`,
`docs/FINAL-ROADMAP.md` and `docs/STATUS.md`.

## Acceptance and evidence

- Tests first: wave 0/24/25, invalid progress, house build/removal, visiting another
  island, repeat updates and scene cleanup.
- Before/after screenshots at 1280 × 720 and 375 × 812.
- Frontend install, tests, build, budget, text lint, accessibility and demo checks;
  record actual results and any limits in the PR.
- Keep code changes below about 400 lines; no new dependencies or services.
- Ianno rehearses the explain-back before the PR becomes ready; another human
  must approve the current change before merge.

## Contracts and limits

No public contract changes. Reuse the existing campaign wave and built spots.
Browser drawings do not award or authenticate progress. Local browser checks
do not prove live multiplayer or physical-phone behavior.
