# Quest recovery and boat wave transitions

What this is: the scope and verification handover for [issue #462](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/462). Used by Ianno and the peer reviewer.

- Responsible teammate: Ianno Hollensteiner (`Iannomh123456`); agent assistance: Codex, one writer and read-only reviewers.
- Branch: `fix/boat-quest-flow`, based on main `48aee0e7`.
- Status: implementation and verification in progress; independent human review remains required.

## Scope and agreed behavior

1. Reconcile existing own-island achievements with the ordered goal prefix. A player who hired both gunners before reaching that goal must continue without another hire. Fresh own-island snapshots and a completed event goal both trigger reconciliation. Keep version-1 saved counts and never rewind them; visiting another island grants none of its building/crew achievements. Demolished buildings and earlier transient invite/Harbor/stake events cannot be reconstructed from the current island snapshot.
2. The user selected immediate boat interruption at wave countdown and requested clear notification, including refunds when applicable. Dispose the personal scene without reopening the wreck, reset input and restore game focus. Invalidate delayed scene launches, including a wave that starts and stops during import. Explain that attempts are free, so an unfinished round spends no coins and claims no reward. There is no entry fee to refund. A completed round's pending payout continues and reports its eventual result.
3. The choice between best-score topups and the existing first-success payout is unresolved. Preserve D057's payout and clarify it on the ship card before play. No wallet, API, migration or server change is included.

## Files and contracts

`first-quests.js` holds the pure reconciliation; `hud.js` persists and renders it; `island/index.js` supplies own snapshots through `game.js` and owns boat cancellation. `island/ui.js` shows a seven-second nonblocking interruption notice independent of other toasts; `card-model.js` explains the current payout. The callback is documented in INTERFACES; the local transition is recorded in DECISIONS. No room message, dependency or storage format is added.

## Verification

- Tests first: the three saved-achievement regressions failed before implementation. The real Chromium boat test reproduced retained scene/input at countdown; the delayed-launch regression also failed.
- Focused result before the final pending-payout case: 3 files, 18 tests passed. Final commands/results and screenshots will be added after verification.
- Browser coverage uses production controllers/scenes with the local fake transport. It does not prove real Supabase delivery, live payment settlement or a second physical device.
- Required checks: focused regressions, full `npm test`, `npm run build`, `npm run test:mp`, diff review; record any failure without claiming it passed.

## Explain-back

The goals still advance in order, but purchases do not have to happen in that order. The saved own island proves achievements that still exist. Boat interruption uses disposal because the normal Close callback reopens a dialog and would continue blocking captain controls. A finished round already submitted its reward, so closing its screen must not cancel or duplicate the payment.
