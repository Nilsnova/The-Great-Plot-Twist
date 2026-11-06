# G23 checkpoint 2 — standalone help page

Branch: `docs/g23-help`. Merged `origin/main` before checkpoint: already up to date at `c26f303`. C1 is `a11d405`. Push only this branch.

## Changed

- Added `frontend/help.html` with all manual topics, explicit current/rehearsal/planned labels, a return-to-game link, safe reporting guidance and short privacy text.
- Added independent `frontend/public/help/help.js` and `help.css`: optional local topic filtering, keyboard navigation, labelled search status and phone layout. All reading content survives disabled JavaScript.
- Reused the existing pixel UI kit without changing it. `frontend/public/help/kit.css` is a symlink to the original stylesheet. `frontend/public/help.html` is a symlink to `frontend/help.html`. Vite copies both into ordinary production files, so `/help.html` ships in the existing build without editing its explicit entry list or any shared page/module.
- Added `frontend/tests/help.test.js` to build with the real config, check shipped aliases/assets, strict CSP/no inline code, topic anchors and protected reveal fingerprints in the page, assets and manual.
- Read-only review corrected the default/rehearsal wording and added hash navigation recovery when a search hid the destination.

## Verified

- Red-first check: the new test failed because `help.html` was absent from build output; after implementation, all four new tests passed.
- `(cd frontend && npm test && npm run build)`: 34 files / 292 tests passed; normal production build and spoiler guard passed (55 built text files).
- Chromium production-preview check at 360px: all 12 topics readable, no horizontal overflow, filtering and Clear work, no page/console/CSP errors. Checkpoint screenshot retained outside the checkout; C3 adds the final small public captures and a repeatable browser check.
- Secret scan empty; `git diff --check` clean.

## Not verified / remaining

C3: labelled screenshots from local fake mode and browser enforcement/accessibility checks. Live integrations remain unavailable as described in C1. The root guide is shipped as a static public page; development HMR is not required by or permitted through its `connect-src 'none'` policy. Normal production-preview reading/filtering is the validation target.

## G9 link point

Add **How to play** → `/help.html` beside **Settings** in the title and pause menus in `frontend/src/shell/controller.js`, preserving return focus. No inbound link has been added by G23. Keep the two public aliases when wiring navigation; they allow the unchanged normal build to ship this page.

Branch/PR: `docs/g23-help`; no PR, main push or deployment.
