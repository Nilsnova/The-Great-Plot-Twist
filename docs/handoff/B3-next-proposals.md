# Johannes — Proposed work after B3

Concrete next scopes for Johannes Franz Lang; proposals for author/team review,
not claims or implemented features. Checked against main `908d376` and the open
branches/PRs on 14 Nov. Recheck claims before starting. Login and API contracts
remain out of scope. Prefer a confirmed improvement over increasing line counts.

| Order | Proposal | Value now | Small first PR | Evidence / risk |
|---|---|---|---|---|
| 1 | **B2: current-v3 phone layout/input pass** | Three-star UX task; validates the actual Create/Join → lobby → build → wave path | Audit 375x812 and 390x844, long game/player names, keyboard opening, scroll, focus and 44px targets. Fix one reproduced overlap/cut-off at a time in its owning CSS/component, under about 400 code lines. Candidate folders: `frontend/src/front-door/`, `src/island/`, `src/ui/`. Do not revive the retired lock/quest flow from the old task wording. | Before/after captures, focused browser regression, full frontend/build/budget/text/a11y/demo checks. Physical-phone keyboard and touch require a human check; inspect before promising a fix. |
| 2 | **B5: measured slow entry and recovery** | Finds a frozen-looking start without redesigning login or adding another layer | Record a repeatable Fast 3G title → island run, then repair one confirmed gap. `src/main.js` already shows “Preparing the coast…” and a load-failure notice; measure those before adding UI. Review Help/Shortcuts behavior after #31/#32 land. | Throttled browser evidence, cancel/retry/late-result tests, same frontend gates. Throttling changes network timing, not device CPU; real provider failures still need separate evidence. |
| 3 | **Optional practice from the menu (new proposal)** | Lets players rehearse chain/cannon/duel outside a boss encounter | Agree with Ianno (T28) and Nils (#26, T38/T39) first. Reuse `src/pirates/finisher/scene.js`, `introduction.js` and `practice.js`; first PR only adds an explicit chooser/exit path if the scene can run without real-wave settlement. No new practice engine, rewards, server calls or persistent best score. | Show that exit restores game focus and practice never submits real finisher/reward input. Test keyboard/touch, cancellation and repeated entry. Main risk: accidentally using shared boss input/settlement; do not implement until the isolation contract is agreed. |

## Review order for work already prepared

1. #31 Help failure/retry, then #32 Shortcuts failure/retry: independent source fixes.
2. #38 Connection retry: pending label, recoverable callback rejection and stale-result guard.
3. #39 Repeatable B3 feedback audit: test-only, eight existing cases at two sizes.

Every PR stays draft until Johannes reviews its diff. No combined-branch result is
claimed. Preserve each teammate's status entries when resolving documentation
conflicts; update from main and rerun affected checks before any later merge.
Independent human approval and Johannes's explicit OK are still needed to merge.
