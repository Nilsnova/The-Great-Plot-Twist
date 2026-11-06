"""Developer tools: programs that help the team but are not part of the game server.

Nothing in backend/server/ imports this folder. Each file runs on its own from the backend folder.

- lint_content.py checks the data files in backend/content/ (run it with
  `cd backend && uv run python tools/lint_content.py`). Its header comment is its contract.

Used by: developers on the command line, and the tests in backend/server/tests/.
"""
