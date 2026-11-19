# Zero-budget recovery controls

Actual Chromium component captures for the zero-funds acceptance tests. All identities,
money, controller metadata and transport replies are synthetic fixtures; no live account
or financial operation is used in these captures.

| Capture | Viewport | Observed behavior |
|---|---|---|
| [Member crew](zero-funds-member-1280.png) | 1280 × 800 | Zero available/committed funds; ordinary paid hires are disabled. |
| [Member crew on phone](zero-funds-member-375.png) | 375 × 812 | The scrollable card retains the same exact zero budget and ordinary refusal. |
| [Owner Settings](zero-funds-owner-1280.png) | 1280 × 800 | An owner can confirm the normal reset at zero; personal progress and retired money are explained. |
| [Owner Settings on phone](zero-funds-owner-375.png) | 375 × 812 | The typed code enables the owner control without a coin price or horizontal overflow. |

The same tests separately assert that an invited member who controls the session can ring
the ordinary next-wave bell but has no reset button. Neither the captures nor their
transport fixtures establish a provider-authenticated recovery journey or a natural win.
The combined SQL/API accounting sequence and its provenance are recorded in the
[component specification](../../../specs/MP-ECO-22-zero-funds.md#combined-recovery-checkpoint--19-november-2026).

Regenerate from `frontend/`:

```sh
MP_ECO_EVIDENCE_DIR=../docs/evidence/MP-ECO-22 npm test -- --maxWorkers=1 tests/island/zero-funds-recovery-dom.test.js
```

Four cases passed in 5.31 seconds at the first complete capture. Phone member and desktop
owner images were visually inspected. No application behavior, dependency, price or
economic permission was changed to create this evidence.

## Local provider-authenticated journey

[The additional bell capture](authenticated-zero-member-normal-bell.png) is a separate
1280 × 800 screenshot from the real registered member's game. It shows exact zero island
funds, no built walls or towers, and the enabled normal wave-31 bell after the owner left.
The subsequent real pointer click started that ordinary attempt; its naturally simulated
defeat paid zero loot. The owner then returned and reset through authenticated HTTP;
the member's own reset request was forbidden. This image was visually inspected.

[The safe result](authenticated-combined-result.json) records source hashes, exact times,
transaction assertions and independent ledger reconciliation without credentials or raw
account identifiers. This disposable local provider run used explicit advanced-state
and trusted market fixtures. It observed the actual five-minute product clock and natural
combat defeat, but does not establish a natural market result, an achieved ship score,
the complete authenticated acceptance matrix or every cohort's playability. The
[provider checkpoint](../../../specs/MP-ECO-22-zero-funds.md#provider-authenticated-combined-journey--19-november-2026)
documents the distinction and reproduction command.
