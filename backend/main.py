"""Vercel entry point: vercel.json names this file ("entrypoint": "main:app").

All the real code is in server/. This file only builds the app from the real environment
(create_app() with no arguments) and exposes it as `app`.

Used by: Vercel (the backend service, preview and production) and, on your laptop,
`uv run uvicorn main:app` from inside the backend/ folder.
"""

import sys
from pathlib import Path

# Python may be started from another folder (Vercel does this), and then it does not look
# next to this file for the server/ package. We add this file's own folder (backend/) to
# Python's import path. After that, "from server.app import create_app" works on Vercel, in
# the tests and on your laptop.
BACKEND_ROOT = Path(__file__).resolve().parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from server.app import create_app  # noqa: E402  (must come after the path fix above)

# The app is built HERE and not in server/app.py. Building it reads the real environment
# variables, and importing server.app (as the tests do) must never do that.
app = create_app()
