# Acute warning clearance

Native production-component evidence for Ianno's CF1 review fix. Used by the CF1 reviewer and integration owner; these are component compositions, not running-wave or multiplayer screenshots.

The narrator now temporarily suppresses its caption only when its measured rectangle covers a visible acute-danger instruction. It preserves the current line, text, Skip button and logical visibility; large captions use the same rule without a smaller font. The same active line returns when the warning clears. Existing audio and reading timers continue normally, so an already expired line is not replayed.

The card observes its own and the wave bar's sizes, coalesces layout work to one animation frame, and disconnects/cancels that work on hide/disposal. Suppressed text is inert and hidden from accessibility APIs, and does not reserve sound-caption space. Ordinary positioning and caption content are unchanged.

## Reproduction and checks

The dedicated regression mounts the actual play HUD, wave HUD, touch controls and narrator card, using the authored `wave_5` line and native weather disclosure. No element receives an injected position or height. Chromium uses a real mobile/touch context, and the test checks `(pointer:coarse)`.

- Base task source: `4fe16d9f`. The initial real component run reproduced narrator overlap at 375×812 with expanded weather. At 320×568 it also exposed the expanded fire control covering the danger strip.
- The integration owner's separate portrait fire-control changes (`580d07de`, `ea58fc8a`; locally cherry-picked as `641872b8`, `3b4da2cd`) keep Fire below the measured bar and reserve the joystick column. The strengthened test reproduced both the original bar overlap and the intermediate joystick overlap before those fixes. Narrator ownership is limited to `card.js`, `narrator.css` and this dedicated test/evidence.
- Final current-source command, from `frontend/`: `CF1_NARRATOR_SHOTS=/tmp/cf1-warning-after npm exec vitest -- run tests/narrator/danger-clearance-dom.test.js tests/narrator/narrator.test.js tests/ui/combat-hud.test.js` — **19 tests passed across 3 files, 13.71s**.
- The real touch regression checks normal and large captions at 320×568, native weather expansion, complete warning text, retained line/Skip and their restoration, fire/bar separation, fire/joystick separation, viewport bounds and untruncated range text. The 375×812 case checks weather expansion and cleanup. Large caption placement on a short screen without a warning remains the previous behavior; its retained Skip is exercised after a native resize to 375×812.
- Independent narrator review found no actionable lifecycle/restoration issue; its scoped narrator run passed **16 tests across 2 files**. `git diff --check` passed.

## Compatibility with the open visual draft

PR #489's relevant narrator/card CSS and docking/fallback implementation at `9c2be0ee974438638dbf220b8d0ce32a1b431cf6` were inspected and copied into a separate temporary composition checkout. The native test reproduced the reported normal-caption fallback overlap at 320×568: caption y=184.0–316.0 covered danger y=270.0–311.6.

The warning guard was then manually composed at that implementation's final `position()` hook, preserving its docking/fallback code and separate observer state. With the integration owner's final fire/joystick layout CSS, the same final dedicated test passed **3/3 in 6.35s**. This verifies the explicit shared-hook composition; it does not claim that the two branches automatically merge without resolving `card.js`, or that the unrelated visual draft was merged.

## Captures

Chromium headless on Linux, CSS viewports named below, real touch media, reduced motion. Data is the declared native component fixture; no server, recovery transport, live account, combat simulation or physical phone is exercised.

| Composition | Before | After |
|---|---|---|
| 320×568 with the visual draft's fallback | [Warning covered](320x568-draft-before.png) | [Manually composed guard and current control layout](320x568-draft-composed-after.png) |
| 320×568 current task source | — | [Warning, Fire and joystick clear](320x568-current-after.png) |
| 375×812 current task source | [Caption covers the warning](375x812-current-before.png) | [Both fit without suppressing the caption](375x812-current-after.png) |

Full game, full frontend/build and broader browser checks belong to the combined integration verification. No PR publication, main update, merge or deployment was performed by this fix writer.

## Combined task-branch verification

The integration owner cherry-picked this fix as `a881b551` and retained both source/control layout changes. The [recorded combined run](../review-range/combined-tests.txt) passes 224 tests across 21 files, including all current narrator/touch cases; [build](../review-range/build.txt), [actual-game checks](../review-range/native-feedback.txt) and [overlaps](../review-range/overlaps.txt) also pass. The isolated helper counts above came from retained tool output rather than saved raw files; the manually composed #489 check remains a bounded compatibility observation, not an automatic-merge or full-game claim.
