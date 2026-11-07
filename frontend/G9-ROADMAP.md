# G9: shortest path to a working core release

## Latest scope review

Nils asked to reduce the 26-chunk /21½-hour completion plan toward five hours. That earlier
plan mixed gameplay delivery with full input certification, instrumentation, submission evidence
and repeated regression cycles. This release queue supersedes it; history is in `753e530`.
**Implementation remains stopped until Nils asks to continue.** This review changed docs only.

**Five hours is a capped target, not a verified all-core completion estimate.** It assumes the
missing R11 response fixtures are published before case integration, closely match the existing
screens, and parallel leaf work integrates without a new blocking defect. These assumptions are
not yet established. Case integration is real unfinished implementation, not just a test switch.
Do not hide missing gameplay or silently extend the budget to claim this target was met.

## Keep for the first working release

- Existing GitHub PKCE sign-in, account/name, entry kit, cloud save/conflicts, own wallet/ledger,
  sign-out/deletion, crews, solo NPC seats, live presence and emotes.
- Existing islands/story/weather, home-islet build and Exchange. Reuse the completed source.
- Reuse the prepared prediction/duel and public-bulletin connections; do not rebuild their UI.
- The complete mystery: earned case view, board/pairs, searches, NPC orders, night/posts/aim/locks,
  accusation/cooldown, runtime-only reveal, once-only rewards and Relighting.
- Usable native keyboard/touch controls, focus/Back/Escape, readable text, 44 px targets and320 px
  fit. Preserve current gamepad behavior; do not claim full new-dialog gamepad parity.
- Server authority, stable write IDs/read-before-retry, wallet/save integrity, account cleanup,
  spoiler/privacy protections, strict CSP, current byte budgets and the server-free demo.

## Five-hour sprint budget: ten 30-minute blocks

These are maximum work allocations for an attempted release, not ten independently proven
half-hour completion estimates. **After each authorized block, stop and report what passed,
what remains, and whether the five-hour target is still credible.** Do not start the next block
without Nils asking to continue. An unfinished block remains unfinished.

| Blocks | Budget | Necessary result |
|---|---:|---|
| 1 | 30 min | Apply/verify the prepared bulletin opening fix with its focused red/green and meaningful native ownership tests. |
| 2–3 | 60 min | Reconcile prepared prediction/duel/bulletin code and shared hooks; run changed-domain checks. Fold the small production boundary proof into existing verification. |
| 4–6 | 90 min | **R11 first.** Compose case validation/projection, server intents, world/effects and refresh ownership. Case leaf preparation runs in parallel with blocks1–3 after fixtures exist. This allocation is provisional until the DTOs are inspectable. |
| 7 | 30 min | One coherent core gameplay journey plus critical refusal/retry/save/account tests and keyboard/touch/phone smoke checks. Fix release-blocking defects only. |
| 8–10 | 90 min | One final frozen-source regression, including build/spoiler, conformance, online/faults, production/CSP, loading and accessibility; concise handoff, selected evidence, normal push and remote-SHA verification. |

This is a five-hour active-work budget for the coordinator, excluding user pauses and external
waits. Bounded leaf preparation runs in parallel; total agent working hours can be higher. If the case or final checks exceed their allocation,
stop and report the concrete remainder. Do not call an incomplete case, interrupted test run or
failed gate complete. Core playability is the finish line; a time cap does not change that.

## Remove from the pre-release path

- **Intermediate full44 baseline/push cycles.** Existing evidence is the baseline. Run focused
  checks while integrating, then one full frozen final suite. Preserve all prior failures.
- Repeated standalone panel/fault journeys already executed with identical options by an aggregate.
  Keep distinct coverage, including server cooldowns, unknown writes and actual wallet/save checks.
- New gamepad text editor, full three-mode golden parity, expanded six-size certification and
  other-engine/physical-device/assistive-technology certification. Keep basic keyboard/touch and
  existing accessibility checks; record the remaining input limits explicitly.
- Copy numbers enhancements, expanded load tables and additional performance instrumentation.
  Keep existing loading/resource/frame gates and unchanged limits. Stop exploratory cloud FPS tuning.
- A separate new composed-CSP harness rollout before gameplay. Keep current exact enforcing
  headers and inventory checks. Authenticated prediction/duel/bulletin and new case journeys must
  run under those exact enforcing headers and fail on CSP violations or unexpected origins, using
  the existing production fixture. Add missing assertions or reuse prepared composition if needed;
  the public/tour CSP pass alone does not establish this authenticated coverage.
- Submission screenshot galleries, broad explanatory-doc polishing and presentation packaging.
  Keep required changed contracts/credits, a concise accurate handoff and only useful selected shots.
- All17 overflow items, new packages/art/fonts, visual redesigns and unrelated refactoring.

Deferred work remains in the full-G9 follow-up backlog. A first working release is not completion
of every original G9 acceptance criterion. Do not remove existing working features or weaken tests
and budgets to manufacture a passing release.

## Dependencies and ownership

- **R11, currently blocked:** at authorized case ref `3098c0a`, routes/bodies/reasons and outer
  fields exist; fixtures are `CaseSnapshot` inputs. Exact nested serialized active/jobs/partners,
  night/parting and solved/reveal/credits responses are not published. G10 must publish one
  redacted response-fixture file, keeping keys/types/nullability and replacing IDs/prose. Never
  inspect private implementation/secret case data or guess these fields.
- Once R11 exists, one bounded owner prepares case validation/projection/effects, another prepares
  intents/reasons/recovery. Root owns shared hooks, scheduling, composition and all runtime checks.
- **R16:** unchanged cloud FPS failures remain red. Presenter-hardware proof is separate; no
  hardware pass or full completed checkpoint is claimed. It can run alongside development.
- **Claude:** owns main integration, production sign-in rollout and deployment. This sprint pushes
  only the G9 branch; it does not authorize merging or deploying.
- Tests use injected clients, intercepted endpoints and generated placeholders. No real accounts,
  services or databases; no new packages or browser downloads. All authored changes stay frontend.

## Current evidence and next block

Source `95de0b6`: Exchange all11 stream gates passed; 3,130 tests /208 files. Last remote remains
`8844962`; source and latest docs are local. The interrupted driver completed35/44 commands:
32 passed; living/cinematics FPS and a bulletin opening failure remain recorded; nine commands did
not complete. Evidence: `captures/20261107_G9-C3-market-paused/paused-proof.json`.

The existing prepared four-file bulletin fix is the first implementation block. Case work cannot
start until R11 is ready. See `HANDOFF-G9.md` for exact source/evidence and historical checks.
