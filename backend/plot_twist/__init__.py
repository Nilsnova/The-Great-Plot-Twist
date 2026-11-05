"""The Plot Twist story engine: the rules of the text adventure, with no web code in it.

The story itself is data, not code. It lives in backend/content/story.json and the format is
explained in backend/content/README.md. This package only knows the rules: which actions are
allowed, what they change and how progress is saved.

Where things are (one job per file):
    engine.py   the game rules: scenes, actions, conditions, inventory, endings and saving
    tests/      the original acceptance tests (A1-A6), the story checks and the parity test,
                plus tests added at import: engine rules (test_engine_rules.py) and the format
                of story.json (test_story_format.py)

The browser has its own copy of these rules in frontend/src/story/engine.js. The two engines
must stay rule for rule equal. The parity test (tests/test_web_parity.py) plays the same moves
through both and fails when they disagree.

This code was imported from Nils' solo game Plot Twist (commit e235ee4, decision D007). The
original also had a terminal version (cli.py). It is not part of the web game, so it was not
imported.

Used by: server/routes/content.py (it takes the content folder from engine.py), the tests in
plot_twist/tests and, in later packages, more server routes.
"""
