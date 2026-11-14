# B3 Feedback audit for the current island game

For players and reviewers of Johannes Franz Lang's feedback changes, with Codex assistance.

## Scope

Audit existing current-game rejection feedback and fix confirmed gaps in small PRs.
Login, APIs, server rules, dependencies and migrations stay unchanged. Retired mystery/class-demo
paths are not reintroduced. No merge without Johannes's explicit approval.

## Delivery

- [ ] PR 1: How to play loading, failure, retry and cancellation (`fix/b3-help-feedback`).
- [ ] PR 2: Shortcuts failure recovery on keyboard/phone and notice cleanup (separate branch).
- [ ] Current-game audit table, screenshots, checks, walkthrough and test map.

## Checks

Real Chromium fixtures exercise the normal path, failed loads, retry, duplicate open,
cancellation and disposal. UI evidence uses 1280x720 and 375x812. Run frontend tests,
build, budget, house text lint, accessibility and demo checks; document exact results and limits.

## Risks

A stale response must not reopen a closed view. Focus must return to the game, and
waiting or failed views must not leave movement blocked after cancellation.
