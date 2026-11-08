# G9 core release

Nils authorizes continuing through publication. This replaces the earlier stop-after-package and
no-deploy instructions. All authored changes stay in frontend. Backend serializer/schema reads
are allowed; secret case content and real player data remain excluded.

## Implemented and focused checks passed

- Sign-in/account, intro/save, crews/presence, islet, Exchange, predictions, duels and public Bulletin.
- Earned case views and all eight server intents, explicit same-ID uncertain retries, bounded reads,
  account/crew cleanup, searches/partners/night/signals, accusation, runtime reveal and public Relighting.
- Null cases return to Crew. Private cinematic queues cancel on account/crew changes and disposal.
- Desktop and320 px production case journeys use generated credentials and intercepted schematic
  responses under enforcing CSP. Native cleanup/navigation tests and build/spoiler/loading pass.
  Cold title remains20,881 JS /11,878 CSS; the21,080 JS cap is unchanged.

## Remaining release work, in order

1. Run the complete frozen regression on the committed source, including all core browser flows,
   faults, production/CSP, accessibility, lifecycle and existing frame/resource limits. Fix concrete
   failures only. Earlier cloud frame failures remain recorded until this fresh result replaces them.
2. Push the verified branch without rewriting it. Deploy the repository root to the existing Vercel
   project, activate sign-in while preserving existing configuration, verify the published build,
   and record the exact source SHA, URL, results and remaining limits in HANDOFF-G9.md.

No further feature package is queued for the core release. Teammates can review the branch and
published contract; Claude retains main integration. Publication does not require merging main.
Real-account/service/database tests, migrations and secret-content reads are outside this work.

## Deferred

All 17 overflow items, expanded gamepad certification, physical-device/other-engine/assistive
technology certification, extra instrumentation, galleries, new packages/art/fonts and redesigns
remain deferred. Preserve existing inputs,44 px targets, readable text,320 px fit, server authority,
privacy/spoiler protections, exact events/replay and the server-free demo.

Historical package budgets and blocked notes are available in Git history at6eb2499. They no longer
control continuation. A failed gate or unverified live account flow must never be described as passed.
