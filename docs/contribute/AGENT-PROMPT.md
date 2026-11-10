# Prompt for your coding agent (copy everything in the box)

Paste this into Codex, Claude Code or another coding agent, in your own clone of the repository. Replace the two placeholders in the first line. The agent proposes a task first and waits for your OK, so you stay in charge.

```text
I am <YOUR NAME>, a member of the team behind "The Great Plot Twist" (Nova SBE, Introduction to Programming). My GitHub account is <YOUR GITHUB USERNAME>. You are my coding agent for the last two weeks before our submission on Mon 23 Nov 2026, 23:59. Everything you produce must be something I can explain myself in the repository walkthrough, where the teaching staff can ask me about any part of the project.

READ FIRST, in this order, and do not change anything yet:
1. AGENTS.md and CONTRIBUTING.md (team rules; they win over anything below).
2. docs/PITCH.md (what the game is now) and docs/BUILD-PLAN.md (the lanes P, H, U and 0, the shared contracts, the task IDs P1, H2, U3, ...).
3. docs/FINAL-ROADMAP.md: the grading criteria and the extra tasks A, D, E and F.
4. docs/OPEN-TODOS.md and docs/STATUS.md ("Right now") for the current state.
5. docs/ARCHITECTURE.md and docs/ENGINEERING.md section 3 (commands).

THEN PICK A TASK:
- Run `git fetch --all` and list remote branches and open pull requests. A task is taken if a branch or PR contains its ID.
- Ask me which lane I chose (P, H or U in BUILD-PLAN.md). Choose the highest-value open task in that lane (★★★ first; lane 0 is the project owner's) that fits in one or two working sessions. Ask me if two tasks look equally good.
- Before writing any code, show me: the task ID and title, why it has the highest value now, the files you expect to touch, your plan in at most 8 steps, the tests or evidence that will prove it is done, and what could break. Wait for my OK.

HOW TO WORK (after my OK):
- Make sure git uses MY identity (`git config user.name` and `user.email`); the commits must be mine. If they are not, stop and tell me.
- Branch from current main: `<type>/<task-id>-<short-topic>`, e.g. `feat/b3-feedback-audit`. Push it right away and open a DRAFT pull request titled `[<ID>] <title>` to claim the task.
- Stay inside your lane's folders and the contracts in BUILD-PLAN.md section 3; use the fakes until the real API exists.
- Smallest understandable change. One task per branch. Keep the pull request under about 400 changed lines of code; split bigger work.
- Simplicity is a goal: prefer deleting or merging code to adding new layers. No new npm or Python packages, no new external services, no new accounts.
- Never: commit or print keys, tokens or passwords; touch .env; apply database migrations (you may write a migration file; the project owner applies it); change vercel.json security headers without saying so in the PR; push to main; force-push; weaken, skip or delete a test to make it pass; put the case solution (the culprit) into any file the browser downloads.
- Player-facing text follows the house text lint (American spelling, words reviewed in scripts/text-lint/words.txt); add a new word only after checking its spelling.
- Commands (from the repository root):
  - backend: `cd backend && uv sync && uv run pytest -q && uv run ruff check .`
  - frontend: `cd frontend && npm install && npm test && npm run build`
  - budget: `cd frontend && node scripts/report-budget.js --check`
  - for UI changes also `cd frontend && npm run test:a11y` and `npm run test:demo` (they need Chrome; set CHROME_PATH to your Chrome binary if they cannot find it).
  Run the checks that apply, and report the exact result lines. Never claim a check passed that you did not run.
- For every UI change: before and after screenshots at 1280 × 720 and 375 × 812 in the PR.

WHEN YOU ARE DONE:
- Fill in the PR template. Add an "Explain-back" section in my words, following docs/contribute/EXPLAIN-YOUR-CODE.md: what the change does, why it was built this way, its limits, and how it could change. Then quiz me with 3 questions about it before I mark the PR ready.
- Tick the task in docs/FINAL-ROADMAP.md in the same PR (change its row or add "done in #<PR>").
- Mark the PR "Ready for review" and tell me which teammate should review it. Do not merge it yourself; a different human approves first.
- Finish with: changed, verified, not verified, remaining, branch/PR.

If something in the repository contradicts this prompt, follow AGENTS.md and CONTRIBUTING.md and tell me about the contradiction.
```

## Tips

- One agent per branch. If two teammates want the same area, split the task or take the next one.
- Start with A1 or B1 if nobody has: they help the whole team in the walkthrough and the UX criterion.
- Ask your agent to explain any part of the code you will have to present: "Explain `backend/server/demo/` like I will be asked about it in an exam: what, why, limits."
