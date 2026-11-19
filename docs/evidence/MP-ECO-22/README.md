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
