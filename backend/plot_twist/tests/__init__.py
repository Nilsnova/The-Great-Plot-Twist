"""Tests for the story engine. Run them with: uv run pytest   (from the backend folder)

What is here:
    test_acceptance.py    the original acceptance scenarios A1-A6 and the checks on the story file
    test_web_parity.py    plays the same moves through the Python and the JavaScript engine
    parity_runner.mjs     the Node.js helper that test_web_parity.py starts
    test_engine_rules.py  engine rules the other tests do not pin down, and "no save_path means
                          no file" (added when the engine was imported)
    test_story_format.py  the format rules for story.json, checked on the real story and on
                          stories that break them (added when the engine was imported)

No test uses the network, and none writes outside a temporary folder. The parity test needs
Node.js and is skipped, with a reason, when Node.js is not installed.
"""
