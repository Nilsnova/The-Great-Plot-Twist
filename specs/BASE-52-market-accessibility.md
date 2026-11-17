# BASE-52: readable Harbor limits and refresh-safe focus auditing

For Johannes Franz Lang (`frcola`), assisted by coding agents. Issue [#339](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/339).

## Problem and immutable base

This bounded follow-up branches from `1fd16f1fc0055edc832f3a849b6959e77e78ca2b`.
The affected Harbor, accessibility audit and helper files are identical to main
`8759fc80`; the failures predate the perimeter implementation.

The existing full audit records seven failures: the placed market state reports
3.9664425132344356 contrast at widths 1280, 375 and 320; four market states report
keyboard order errors after the ordinary 15-second refresh replaces buttons.
Every recorded bad focus remains visible, inside and trapped, but its one-time
audit marker is missing. The report lacks stable semantic identities, so those
keyboard entries cannot establish that the refreshed logical order is correct.

## Accepted behavior

- Keep the project contrast threshold at 4.5 and the normal stake/payment rules.
- Retain focusable `aria-disabled` limit buttons and their no-op limit behavior.
  Increase their muted-state readability without adding an audit exception.
- Snapshot the original unique stable `data-key` identities and native DOM order.
  After a real Tab, require the active control at the same current native index
  and the same original semantic identity. Unkeyed controls retain their original
  audit markers; new nodes must not acquire guessed markers.
- Refuse duplicate keys, reordered or substituted identities, changed control
  counts and positive tabindex. Preserve visible-focus, containment and trap checks.
- Polling continues. Do not restamp replacement controls, suppress checks, omit a
  market state or relax a timeout or threshold.

## Plan and boundaries

1. Claim this spec in a Draft before implementation.
2. Add refresh-safe audit helpers and meaningful rejection cases.
3. Improve only the existing Harbor muted-limit CSS.
4. Exercise the production market entry, including its actual 15-second refresh,
   a real Tab, stable identity and minimum-limit no-op behavior.
5. Record computed contrast and exact semantic control identity at all three widths.
6. Run the existing accessibility script in the coordinator's exclusive Chrome lane.
7. Report exact affected checks and source revisions; let the coordinator own the
   final integrated suite. Keep the PR Draft for independent human review.

Expected files are `frontend/src/harbor/harbor.css`, accessibility helper/audit
scripts and focused tests/probe evidence. No perimeter geometry, payment code,
new dependency, external service, live migration, deployment or merge is in scope.

## Evidence and risks

The initial seven-failure report remains unchanged as before evidence. Focus
regressions must prove a production timer redraw actually replaces the old node,
preserves the same focused `data-key` and loses only the old audit marker. Negative
cases must still reject duplicate/reordered/replaced/missing controls.

Readability changes are small but visible; before/after evidence belongs at
1280×720 and 375×812. Audit-helper errors could hide genuine focus regressions,
so current-index and original-identity checks are both mandatory. Prior complete
backend/frontend and wall screenshots remain evidence of their own revisions,
not an automatic pass for this CSS/audit follow-up.

## Explain-back

The market refresh keeps a player's focus by a stable control key. The old audit
watched a temporary attribute on the old button instead. I check the new button's
real position and original key together, so a redraw can pass while a reorder
still fails. I also keep the muted limit button readable and preserve its action.

Before marking ready, explain why matching only a key is insufficient, why matching
only the current index is insufficient, and how a real refresh test differs from
manually replacing some test nodes.
