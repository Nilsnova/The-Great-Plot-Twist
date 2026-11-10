"""Tests for the story engine. Run them with: uv run pytest   (from the backend folder)

What is here:
    test_acceptance.py    the original acceptance scenarios A1-A6 and the checks on the story file
    test_engine_rules.py  engine rules the other tests do not pin down, and "no save_path means
                          no file" (added when the engine was imported)
    test_story_format.py  the format rules for story.json, checked on the real story and on
                          stories that break them (added when the engine was imported)
    test_story_v2.py      the Story v2 edits to story.json: an ending line for each decision, the
                          third choice, the log lead, the planted hints and the two shore fixes
    story_search.py       helpers for test_story_v2.py: what the player sees, and searches over
                          every playthrough of the story

No test uses the network, and none writes outside a temporary folder. The browser engine and its
parity tests (test_web_parity.py, test_act1_web_correctness.py) were removed on 10 Nov 2026 when the
mystery left the game (D031).
"""
