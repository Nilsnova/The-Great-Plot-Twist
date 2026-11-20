# Nearby interaction browser test budget

## Problem and evidence

The nearby E/Use regression boots the complete local fake game before checking
building input, fallen-Captain blocking and revive-action ownership. It inherits
the shared component harness's 20-second whole-test budget, including browser
context setup, the cold game module graph, artwork and context cleanup.

The unfiltered frontend run at `b239bdf0` completed with 5,464 passed and one failed
test. The desktop nearby case exceeded 20 seconds; its phone case passed. A single
same-budget `DEBUG=pw:api` diagnostic reproduced the timeout. E opened the build
card, the fallen-Captain check completed, the revive action hid Use, and the final
building click and E press completed. The whole-test deadline interrupted the
remaining assertions. This was not a blocked E/Use wait. The earlier `581b65db` desktop
case passed in 19.121 seconds, already close to that budget.

## Bounded change

Give this full-game parameterized test an explicit 60-second budget, matching the
existing village-game and defense-report ownership tests. Keep the shared
20-second component default, all assertions, fake-game setup and production code
unchanged. Do not prewarm the game, skip a case or replace an input path. This
behavior test does not establish a loading-performance budget.

## Verification

Run both original desktop and phone cases with the explicit budget, then the full
unfiltered one-worker frontend suite and the standard build. Retain both failed
`b239bdf0` results with their original source, commands and timings. Later passing
checks must identify the new test source separately. Backend, migration, runtime
and dependency bytes are unchanged by this test-only correction.
