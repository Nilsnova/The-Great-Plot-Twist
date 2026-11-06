# Explain your own change

For the teammate who made a contribution, before review and the course explain-back. Use your own PR and actual code, not a memorized answer written by an agent. Start with [QUICKSTART.md](QUICKSTART.md); choose a small change from [IDEAS.md](IDEAS.md) or bring your own.

The [roadmap](../../ROADMAP.md#weekly-rhythm) schedules drills on **Thursday 19 and Saturday 21 November 2026**, including a file outside your usual lane. G11 owns the lane pages and forty drill cards; after that package is integrated, use `docs/lanes/` and `docs/drills/` as the shared question bank. Those paths are not yet on the audited main. This page helps you prepare **your new change** rather than duplicating that pack. The course's six official question types are not defined in the audited sources; the six prompts below are practice prompts, not a claimed course rubric.

## Prepare a one-page map · about 15 minutes

Write brief notes in your own words. Keep personal rehearsal notes local rather than committing a prewritten exam answer.

1. **Purpose:** What problem did you choose, who benefits, and what deliberately stays outside your change?
2. **Route through the code:** Name the entry function, input, important decision, output and cleanup. Follow an actual example from input to result. Include the API/database boundary only if your change crosses it.
3. **Your decisions:** Identify two choices you made, an alternative to each and why your choice fits this small task. Say which existing functions you reused and who originally wrote them.
4. **Evidence:** Point to one normal-case check and one boundary/failure check. Explain what bug each could catch, what was mocked and what was exercised for real.
5. **Limits:** Name one untested case, input-size limit or trade-off. Do not turn a successful local fake into a claim about a live account, database policy or deployed game.
6. **Authorship:** Find your commits and changed functions. Explain what the agent drafted, what you changed or rejected, and how you verified the final result. Credits and a Git commit name alone do not prove understanding.

## Rehearse six practical prompts · about 20 minutes

Ask a teammate to pick the inputs and follow-up questions. Keep the source open, but hide your prepared notes on the second pass.

| Prompt | What to demonstrate with your change |
|---|---|
| Explain these lines. | Walk through one short function: name types, data structures, branches and return value; explain the reason for each important step. |
| Trace this input. | On paper, update the variables after each step and predict the exact output before running it. |
| What if this changes? | Try empty/malformed input, an exact boundary or a repeated action; predict the result and explain the guard that decides it. |
| Find a bug. | Describe a small plausible mistake in your change, show its consequence, and identify the assertion/manual observation that would catch it. Work in a disposable local edit and restore it; do not push broken code. |
| Test it. | Explain the setup, action and assertion of a real test. Show one meaningful failed expectation if you safely introduce that mistake locally, then restore and rerun. |
| Defend a choice. | Compare one alternative, explain a trade-off, and state a case where you would reconsider your design. |

For an offline tool, follow file input → parsing → validation → calculation → report. For a browser feature, follow user action → local state or intent → result → rendered text and cleanup. If money, progress or authentication is involved, identify the real server authority: the browser cannot award coins, prove identity or make a game save legitimate. See [architecture](../ARCHITECTURE.md) and [interfaces](../INTERFACES.md).

## Use an agent as a questioner

Give the agent your diff and ask it to question you **one prompt at a time, without supplying the answer first**. Ask it to choose an edge case not already in your notes, challenge an unclear explanation, and point you back to the relevant function. Do not paste secrets, login responses or server-only story content.

If you cannot explain a line, pause and learn the concept, or simplify the change with tests still passing. Do not submit someone else's completed package as yours or let an agent invent decisions you never made. Understanding borrowed code does not transfer its authorship to you.

## Bring evidence, not just a rehearsed speech

- Your branch/PR, commit ids and small diff; acknowledge existing code separately.
- Exact commands/results from this version, plus one reproducible manual example. Say explicitly when a check was not run, skipped or used a fake.
- One safe input you can trace, one rejected input, and one design trade-off.
- A final clean diff after restoring any deliberate local bug. Do not project `.env`, tokens, private course identifiers, player data or case solution files.

Finish by explaining a small file from a different lane to another teammate and letting them question your own change. For a teammate's PR, that practice is separate from the independent **human approval** required by D001; D015 does not remove that rule. Review the current version and use a merge commit as [CONTRIBUTING.md](../../CONTRIBUTING.md) requires.
