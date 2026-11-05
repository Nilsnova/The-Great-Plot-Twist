<!--
What this file is: the blank spec that every work package starts from.
Who uses it: the teammate who owns a package (and their coding agent) fills it in BEFORE any code is written.
Reviewers use the finished spec to check the pull request against what was agreed.

How to use it:
1. Copy this file to specs/[ID]-[short-name].md, for example specs/F0-foundation.md.
   The ID is a letter and a number, such as F0 or G1.
2. Replace everything in square brackets. Delete the hint comments (the ones like this) when you are done.
3. Keep it short. One page is better than three.
4. Link the spec from the issue. The sections match what CONTRIBUTING.md asks an issue to hold:
   goal (Why), scope (What, Out of scope), acceptance checks (Done when), responsible teammate (Owner and reviewer)
   and likely affected files (What).
5. Delete this whole top comment. The filled-in spec starts with its title and the two lines
   "What this is" and "Who uses it", so every spec explains itself in its first lines.
-->

# [ID] [Short name]

> **What this is:** [what this package delivers, in one sentence].
>
> **Who uses it:** [who relies on it, such as the whole team or one lane].

- **Status:** draft | agreed | in progress | done
- **Branch:** `[type]/[short-topic]`
- **Issue and pull request:** [links, once they exist]

## Why

<!-- Two to five sentences in plain English. What problem does this package solve, and for whom?
Why now? What breaks or stays hard if we skip it? -->

[Why this package exists.]

## What

<!-- Say what will exist when the package is done. Name real files and folders.
Use short bullets, one deliverable per bullet. -->

- [deliverable 1]
- [deliverable 2]

**Files likely to change:**

- `[path]`: [one line on what changes]

## Out of scope

<!-- Things a reader might expect but that this package does NOT do. Say where each one goes
instead (another package, later, never). This is what keeps the pull request small. -->

- [not doing this: where it goes instead]

## Done when (acceptance checks)

<!-- Each check must be something a teammate can run or look at, with a clear pass or fail.
Write the exact command and what a pass looks like. "Works well" is not a check. -->

- [ ] [command or action]: [what a pass looks like]
- [ ] [command or action]: [what a pass looks like]
- [ ] No secrets, private data or generated caches are in the diff.
- [ ] A different human teammate has reviewed and approved the current change.

## Tests to write first

<!-- List the tests BEFORE writing the code. For each: the file, a test name that reads like a
sentence, and what it proves. Cover the normal path and the important failure cases. -->

| Test file | Test name | What it proves |
|---|---|---|
| `[backend/server/tests/test_topic.py]` | `[test_buy_fails_when_balance_too_low]` | [the failure case is refused and nothing changes] |

## Contracts touched

<!-- A contract is a shared agreement other people or code rely on. Tick what this package
adds or changes, and write where the new version is documented. Write "none" if nothing applies. -->

- [ ] API endpoints (request, answer, errors): [which]
- [ ] Browser events (name and payload): [which]
- [ ] Database tables, policies or functions: [which, and the policy matrix updated]
- [ ] Shared lists (wallet reasons, feature flags, setting names): [which]
- [ ] Content format (story and world data): [which]
- [ ] Decisions to record in `docs/DECISIONS.md`: [which, or none]

## Owner and reviewer

<!-- CONTRIBUTING.md: any teammate may own a task, and a different human teammate reviews it. -->

- **Responsible teammate:** [name]
- **Coding agent used, if any:** [name or none]. The teammate stays responsible for its output.
- **Reviewer (a different human teammate):** [name]
- **Last updated:** [YYYY-MM-DD]
