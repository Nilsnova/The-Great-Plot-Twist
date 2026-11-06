"""Content route: GET /api/content/{name} gives the browser public game content.

Today there is one public item:

    GET /api/content/intro-story   the story of the intro game: backend/content/story.json, as it is

Who may call it: anyone, no sign-in. The content is public by design. The browser needs the whole
intro story to play it.

What comes back: 200 with the JSON of the file and the header "Cache-Control: public,
max-age=300" (browsers may keep it for five minutes, so an open page can hold an old story for that
long after a change). Only browsers obey max-age. It does not ask Vercel's network to cache the
answer; that would need s-maxage, which is an open question in decision D016. An unknown name gets
the standard 404:

    {"error": {"code": "content_not_found", "message": "..."}}

Public and secret content stay apart. The names below are the ONLY files this route can ever
serve, and a name that is not in the list is a 404. Content that the browser must never see (for
example the real solution of a case) lives in backend/content/secret/ and is never put on this
list. Read backend/content/README.md before you add a name.

Used by: the game client (it will load the intro story from here) and the tests in
server/tests/test_content.py.
"""

import json
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, Response
from fastapi.responses import JSONResponse

from plot_twist.engine import CONTENT_DIR
from server.errors import ApiError

router = APIRouter()

# The allow-list: each public name and the file in backend/content/ that it serves.
# Only plain file names belong here, never a path and never anything from backend/content/secret/.
PUBLIC_CONTENT: dict[str, str] = {
    "intro-story": "story.json",
}

# The browser may keep an answer for 5 minutes (300 seconds) before asking again.
CACHE_CONTROL = "public, max-age=300"


@lru_cache(maxsize=8)
def encoded_content(path: Path, modified_ns: int, size: int) -> bytes:
    """Cache only allow-listed public bytes, never a response or any player's data.

    Revision arguments invalidate the bounded cache when local content is replaced.
    """
    return JSONResponse(json.loads(path.read_text(encoding="utf-8"))).body


# A plain "def", not "async def": it reads a file, and FastAPI runs a plain "def" in a worker
# thread, so the file read never holds up other requests.
@router.get("/content/{name}")
def get_content(name: str) -> Response:
    filename = PUBLIC_CONTENT.get(name)
    if filename is None:
        raise ApiError(404, "content_not_found", "There is no public content with that name.")
    path = CONTENT_DIR / filename
    revision = path.stat()
    payload = encoded_content(path, revision.st_mtime_ns, revision.st_size)
    return Response(
        payload, media_type="application/json", headers={"Cache-Control": CACHE_CONTROL}
    )
