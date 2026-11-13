# T5 Island decoration

> **What this is:** visible milestones for the shared island, using existing saved progress.
>
> **Who uses it:** players and teammates reviewing Ianno's contribution.

- **Status:** implemented; explain-back and human review pending
- **Branch:** `feat/t5-island-decoration`
- **Issue and PR:** [#11](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/11), [#10](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/10)
- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`)
- **Agent assistance:** Codex drafts code and evidence; Ianno explains and reviews it.
- **Reviewer:** another human teammate; Johannes suggested.

## Goal and scope

Show the highest beaten wave on a number-only league shield beside the cabin,
reveal a statue after wave 25, and
grow decorative trees through three sizes for zero, one, or two built houses.
The shield follows the island being viewed, including a friend's island.
Losses keep the recorded best wave. Removing a house reduces the tree size.
These decorations change appearance only: no combat, money, collision or API rules.

Ianno approved this revision on 13 Nov: replace the rectangular flag, remove the
"BEST WAVE" label, put the shield above and right of the cabin, and keep the
island cartoon style (original Canvas shapes using the existing paint kit).
Only the number is drawn; rank names below describe the artwork.

| Best wave | Design |
|---|---|
| 0 | Unranked |
| 1–9 | Wood |
| 10–19 | Bronze |
| 20–29 | Silver |
| 30–39 | Gold |
| 40–49 | Crystal |
| 50–59 | Master |
| 60–69 | Champion |
| 70–79 | Titan |
| 80–89 | Legend |
| 90–99 | Mythic |
| 100+ | Crowned (the game currently ends at 100) |

Each rank changes the palette or ornament: planks, rivets, wings, gems,
a halo and finally a crown. No third-party game artwork is used.

## Likely files

`frontend/src/island/world.js`, a small decoration renderer under that folder,
original drawing code under `frontend/src/art/`, focused frontend tests,
`frontend/ASSETS.md`,
`docs/WALKTHROUGH.md`, `docs/TEST-MAP.md`, `docs/OPEN-TODOS.md`,
`docs/FINAL-ROADMAP.md` and `docs/STATUS.md`.

## Acceptance and evidence

- Tests first: each ten-wave rank boundary, wave 0/24/25, invalid progress, house build/removal, visiting another
  island, repeat updates and scene cleanup.
- Recorded wins update the number every wave (21 → 22 → 29 → 30); only the
  ten-wave threshold changes the rank. Losses and repeated earlier wins keep the best record.
- Before/after screenshots at 1280 × 720 and 375 × 812, plus all twelve rank designs.
- Frontend install, tests, build, budget, text lint, accessibility and demo checks;
  record actual results and any limits in the PR.
- Keep code changes below about 400 lines; no new dependencies or services.
- Ianno rehearses the explain-back before the PR becomes ready; another human
  must approve the current change before merge.

## Contracts and limits

No public contract changes. Reuse the existing campaign wave and built spots.
Browser drawings do not award or authenticate progress. Local browser checks
do not prove live multiplayer or physical-phone behavior.
