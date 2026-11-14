# B3 Connection retry feedback

Johannes Franz Lang (@frcola), with Codex assistance. Parent: issue #30.

## Scope

Catch a rejected Retry connection callback, show a plain recovery message and keep
Retry usable. A stale rejection must not replace a newer adapter view or update a
disposed banner. Pending clicks still issue one read-only continueGame intent.
No login, adapter, API, game-rule, backend or dependency changes.

## Proof

Real DOM regression, duplicate click, retry success, state-change and disposal cases;
before/after 1280x720 and 375x812 captures and applicable frontend checks. Keep draft;
no merge without Johannes explicit OK.
