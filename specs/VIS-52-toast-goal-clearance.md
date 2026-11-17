# VIS52: responsive toast clearance below Goals

Responsible teammate: Johannes Franz Lang (`frcola`). [Issue #419](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/419). Immutable composed review base: `52f6bb158b03188b57260c1872e273391598debf`.

## Actual failure

The unchanged native overlap audit found Goals/toast intersections at **390×844 (366×11px)** and **844×390 (538×13px)**. On these screens Goals end at 183/185px, while the responsive toast top is still fixed at 172px. The new two-row purse correctly shifts Goals below both top controls; the toast rule does not follow that shift. Desktop and wave-toast cases passed their existing checks.

## Bounded implementation plan

1. Reuse the existing HUD header measurement and ResizeObserver, observing the Goals strip too.
2. Publish its current layout bottom plus 10px as shared toast spacing; keep the existing 172px minimum.
3. Reset spacing for hidden/display-none/zero-size Goals and HUD disposal. Preserve reserved space for visibility-hidden Goals under docked cards so closing a card does not leave stale spacing.
4. Keep the existing more-specific wave and modal toast rules authoritative. Do not hide Goals, change content, reduce touch/text sizes or alter the overlap audit.
5. Add a meaningful native geometry/lifecycle regression and verify the full unchanged overlap matrix in the coordinator's Chrome slot.
6. Preserve actual before/after at 1280×720 and 375×812, plus the failing portrait and landscape sizes.

Likely source files are `frontend/src/ui/hud.js` and `frontend/src/ui/toasts.css`; no new observer class, package, layout layer, asset, gameplay, backend or migration change. A new guessed constant is not sufficient evidence of dynamic clearance.

This claim preceded implementation. Source `46fe08ab` implements the existing-observer measurement and CSS maximum; `ea87f882` preserves all four screenshots before assertions. Identical-helper native checks on actual source52 fail all three expected geometry cases; corrected source passes **3/3 in 8.92s**, with unchanged before/after component PNGs at 1280×720, 375×812 and both failing sizes. Syntax/diff and independent source review passed. Full-game overlap, combined full/frontend/UI/build, physical-device and human acceptance remain pending. [Exact source, raw red/green logs and unchanged images](../docs/evidence/VIS-52-toast-clearance/README.md). The PR stays Draft for explain-back and a different human's current-revision review. No PR merge to main or rollout.
