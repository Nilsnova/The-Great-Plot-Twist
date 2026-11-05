# Working together

## Equal teammates, shared responsibility

All four teammates have equal say and the same contribution, review and merge responsibilities. Any teammate may own a task or review a change; rotate these roles. The GitHub account owner handles administrative settings, not extra product authority. Everyone should have collaborator write access.

Each teammate uses their own Git identity, makes real code contributions and understands the code the team ships. A coding agent supports a named teammate, who remains responsible for its output.

## 1. Agree the task

For a feature or non-trivial fix, open an issue with: **goal, acceptance checks, scope, responsible teammate and likely affected files**. A small documentation fix can use its pull request instead.

Check existing work first. Coordinate changes to shared files, interfaces and dependencies before coding. Discuss shared product or architecture choices in the issue and record the agreed outcome in [DECISIONS.md](docs/DECISIONS.md). If agreement is unresolved, keep the current behavior and continue independent work.

## 2. Work on one clear branch

Start from current `main`. Name branches `<type>/<short-topic>` in lowercase:

| Type | Example |
|---|---|
| Feature | `feat/save-game` |
| Bug fix | `fix/score-reset` |
| Documentation | `docs/team-workflow` |
| Refactoring, tests or maintenance | `refactor/game-state`, `test/save-game`, `chore/dependencies` |

One task per branch, one writing agent at a time. Parallel writers use separate clones or worktrees and separate branches. Keep changes small; split unrelated work. Never push directly to `main`, force-push or overwrite another teammate’s changes.

Use clear commit messages, such as `feat: add save-game validation`.

## 3. Verify and open a pull request

Review the full diff yourself. Run the relevant checks documented in the README; verify the normal path and important failure cases. Add meaningful tests for changed game behavior. For UI changes, include a screenshot or short demo. Documentation-only changes need a link/content check, not app tests.

Use the pull request template. State what changed, why, the issue, exact checks/results and known limits. Say when a check was not run. Keep unfinished work in a draft PR; use its description for the next step or blocker.

Never commit credentials, private data, local environments or generated caches. Use `.env.example` with placeholders when configuration is needed.

## 4. Review, merge and hand over

A different human teammate reviews the code and evidence, asks questions and approves. AI review can help; it does not replace that approval. Re-review material changes made after approval.

Bring the task branch up to date with `main`, resolve conflicts without dropping others’ work, and rerun affected checks. Any teammate may merge once there is a current peer approval, passing configured checks and no unresolved concerns. No person is a mandatory gatekeeper.

Use a merge commit to preserve individual commits and authorship. Update the issue and relevant documentation, and leave a short handover: **done, verified, remaining, next step**.

## Repository settings to enable

The account owner should give all teammates write access and protect `main`: require a PR and one approval, dismiss stale approvals, resolve review conversations and block force pushes/deletion. Apply the same rules to the owner. Require automated checks once real CI exists.

These are settings to configure separately; this guide does not enable them.
