# Open-panel visual polish · 8 Nov 2026

Nils requested nicer visuals with the game's panels open. Branch `feat/open-panel-polish`
adds a single shared stylesheet without changing game behavior, story text, account actions
or server requests. This work starts from G9 checkpoint `dda021b`.

## Integration

The integration writer must add these imports; this branch deliberately changes no existing JS/CSS:

- `src/game.js`: `import './ui/open-panels.css';` (world-lazy).
- `src/screens/account/index.js`: `import '../../ui/open-panels.css';` (lazy Account).
- `src/settings/view.js`: `import '../ui/open-panels.css';` (lazy Settings).

Keep it out of the cold title/kit entry. The stylesheet contains no title, story-dialogue,
interior, chart or presenter selectors. The existing 330px/420px story dialogue and full-room
presentation are unaffected. Existing case width/height rules are preserved.

## What changes

Account, case pages (Crew, Board, What next?, arrival and Lights), Settings, Exchange,
Predictions, Lantern Duels, Sports and Islet share teal surfaces, brass outlines, warm headings,
clear active tabs and consistent cards/forms. Body and tab copy uses system fonts; crew codes
remain monospace. Controls retain native semantics, visible focus and 44px minimum targets.
Save conflicts and deletion notices retain all their text and visibly distinct sections.
Closed/stale market cards, NPC seats and locked islet cards preserve dashed borders;
market directions and completed/built cards preserve their state borders.

Noncase panels keep a reachable header above one scrolling body. Case keeps its existing fixed
frame and content scroller. Phone layouts wrap cards/actions and never shrink copy to fit.
No animation, external asset, font, dependency, feature flag or backend change is introduced.

## Verified

`cd frontend && node scripts/check-open-panels.js` passed **48 layouts**: 12 real panels at
1280×800, 375×667, 320×568 and 844×390. It verifies viewport containment, no horizontal
overflow, native targets at least 44px (including their associated radio/checkbox labels),
text at least 16px, no page errors and no external requests. Shared CSS is loaded before
the lazy screen stylesheets to exercise actual import ordering. The local fixtures do not
authenticate, write saves or contact a provider.

The fixture writes `frontend/captures/open-panels/report.json` and 36 screenshots. Crew,
Account conflict, Exchange, Arena, Sports, Lights and Settings images were visually inspected
at desktop/phone sizes. Representative case frames remain 1040×760 at 1280×800,
359×651 at 375×667 and 304×552 at 320×568.

New palette contrast ratios, calculated with the existing WCAG helper:

| Pair | Ratio |
| --- | ---: |
| Body / darkest-gradient endpoint | 10.65:1 |
| Muted copy / card | 8.47:1 |
| Button | 7.12:1 |
| Quiet button | 9.96:1 |
| Selected tab | 8.95:1 |
| Notice | 8.31:1 |
| Deletion action | 8.67:1 |
| Conflict notice | 9.29:1 |

## Remaining integration checks

The parent writer must build after adding the imports, verify the cold-title budgets and
run the integrated accessibility/world checks. This isolated visual branch did not run the
full suite, test real OAuth/multiplayer, push, deploy or touch production. Captures are local
review evidence and are deliberately excluded from the commit.
