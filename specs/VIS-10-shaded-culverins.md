# VIS-10: shaded culverin family

Responsible human: Johannes Franz Lang (`frcola`). Issue #215.
Writing agent: `culverin_art`; branch `feat/vis-10-shaded-culverins`.
Pinned composed review base: `68330ddf9b66a2657f482c50eb60243498775fdc`.

Replace the existing culverin family's presentation with an original transparent
sprite sheet: five actual levels, intact/firing/damaged/broken state IDs. Reuse
VIS32's shared world/atlas normalizer; the coordinator serializes registration.
The long barrel must distinguish this weapon from the cannon and mortar.

The coordinator authorized visual dimensions56×48/anchor7, matching cannon and
mortar volume. Paid2×2 footprint, source simulation coordinates, targeting,
health, costs, unlocks and damage remain authoritative and unchanged. Common
per-tier fit bounds preserve hardware scale and ground feet across all states.

Expected files: village/culverins.js metadata, original PNG/README, focused
source/bounds/normalization tests and source audit. No shared runtime edits,
new dependency, .env change, live flag, migration, deployment or merge.

Before activation, inspect original alpha/bounds, canonical IDs, complete crops,
nonoverlap and shared feet/scales at densities1.5/2/4; run build/cold guard/text
lint. Actual composed world/combat/phone appearance, muzzle alignment, screenshots
and lifecycle checks remain coordinator work. This claim does not assert checks
or final style acceptance passed. Draft pending explain-back and human review.
