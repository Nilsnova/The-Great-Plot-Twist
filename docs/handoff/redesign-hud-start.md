# Quiet title and HUD

Responsible teammate: Nils. Task branch: `feat/redesign-hud-start`, based on `f91f541`.

The first screen now gives one premise and objective: the lighthouse is dark; find the missing keeper. New game, Play with friends, Continue and Settings remain visible. Account and save details sit inside a closed native disclosure. The backdrop fills the viewport with ordinary image smoothing; the integrating branch supplies the new `places/title.webp` artwork.

The world has a single status bar. Journal contains the existing Crew, Board, Log, What next? and gated Festival actions. Controls starts closed, and opening either quick panel closes the other. Menu keeps the supplied shell entry reachable. The old arrival card, duplicate location badge and persistent controls strip are hidden. Existing captain/save text is preserved, with literal DOM text assignment.

## Integration hooks

- Supply `actions.menu: () => shell.show('pause')` to `createHud` for the full menu. Without it, the existing settings action is used.
- In `game.runtime.handleEscape`, after earlier higher-priority overlay dismissals and before returning false, call `if (hud.closeQuickPanels()) return true;`. The shell capture listener registers before the HUD, so this hook prevents opening Pause while dismissing a quick panel. The HUD also supports standalone Escape dismissal and restores focus to the invoking button.
- `createShell` accepts optional `ctx.onPlayFriends`. Supply it only when the real connection flow is ready. Without it, the friends page says online crews are not connected in this build, offers solo play and accurately describes browser progress. No fabricated online session, new flag or G9 adapter is added.
- Existing shell public methods, account summary, Continue and local journal behavior remain supported. Settings form CSS loads only when Settings opens; presenter-only CSS moves to the world HUD chunk to preserve the cold title budget.

## Verification

- `npx vitest run tests/shell.test.js tests/redesign-hud-start.test.js`: 9 tests pass. Covers closed defaults, Escape/focus, retained actions, literal captain text, save status, real local continuation, friends fallback/delegation and bounded status/action layout.
- `npm run build`: passes, including spoiler guard (141 text files, 12 protected lines, no suspect elimination data).
- `node scripts/report-budget.js --check`: passes with title JavaScript 20,812 bytes (limit 21,080), CSS 11,888 bytes (limit 12,000). This branch still has the original 29,530-byte PNG; the integrating artwork package must measure and document its new image budget separately.
- `node scripts/check-redesign-hud.js`: production-preview title/world checks at 1280×720, 375×667 and 320×568; verifies friends entry/fallback, collapsed account details, hidden controls/tools, nonoverlapping status/actions, quick panel exclusivity, reachable menu and no browser errors/external requests.
- Screenshots and report are local evidence in `/workspace/redesign-hud-evidence`; browser log `/workspace/redesign-hud-browser.log`. Source script accepts `CAPTURE_DIR` to reproduce them.
- Text lint: 0 editable errors, 26 existing report-only findings. Syntax and whitespace checks pass.

Not verified here: production deployment, genuine multiplayer, cloud saves, touch hardware and integrated new artwork/interior/story packages. G9 is still being built in another cloud session. Parent integration must rerun the complete experience after wiring the hooks and combining packages.
