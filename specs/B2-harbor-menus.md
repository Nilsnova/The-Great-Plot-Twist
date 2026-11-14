# B2 — Harbor and menus on phones

Johannes Franz Lang (@frcola), assisted by Codex. Claim: https://github.com/Nilsnova/The-Great-Plot-Twist/issues/65

## Scope and proof

Audit the current Harbor and pause/settings/help/credits at 375x812, 390x844 and
1280x720 using existing models/components/fixtures. Add focused layout/interaction
checks, then correct only a reproduced defect. If a view already works, preserve
it and report the evidence. Login/account, APIs, adapters, backend, game rules,
dependencies and migrations stay unchanged; no file deletions.

Plan: capture baseline; measure bounds/readability/44px targets; verify scroll,
focus/Escape and controlled selections; fix the smallest confirmed issue; run
applicable frontend gates; publish screenshots, walkthrough/test map and results.
Any larger content needs more vertical room, so preserve dismissal and reachable
actions. Keep draft, no merge; independent of #58/#61/B3. Physical devices and real
provider/settlement/multiplayer behavior are outside this local browser pass.
