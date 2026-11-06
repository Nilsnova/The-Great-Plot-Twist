"""Tests for GET /api/content/{name}: the public game content the browser may download.

No test needs a login, a database or the network. The expected story is read straight from
backend/content/story.json, not through the code that is being tested.

The last tests prove that nothing in backend/content/secret/ (the case, which names the culprit)
can be downloaded, whatever name a visitor tries.
"""

import json
from pathlib import Path
from urllib.parse import quote

import pytest
from fastapi.testclient import TestClient
from starlette.routing import Mount

from plot_twist.engine import CONTENT_DIR
from server.app import create_app
from server.routes.content import PUBLIC_CONTENT
from server.tests.helpers import CONFIGURED_SETTINGS, assert_error

# This file is backend/server/tests/test_content.py, so the backend folder is two levels up.
STORY_FILE = Path(__file__).resolve().parents[2] / "content" / "story.json"


def make_client() -> TestClient:
    return TestClient(create_app(CONFIGURED_SETTINGS))


def read_story_file() -> dict:
    return json.loads(STORY_FILE.read_text(encoding="utf-8"))


def test_intro_story_answers_200_without_signing_in():
    response = make_client().get("/api/content/intro-story")

    assert response.status_code == 200


def test_intro_story_is_exactly_the_story_file():
    response = make_client().get("/api/content/intro-story")

    assert response.json() == read_story_file()


def test_intro_story_is_sent_as_json():
    response = make_client().get("/api/content/intro-story")

    assert response.headers["content-type"] == "application/json"


def test_intro_story_may_be_kept_by_anyone_for_five_minutes():
    response = make_client().get("/api/content/intro-story")

    assert response.headers["cache-control"] == "public, max-age=300"


def test_unknown_content_name_is_404_in_the_standard_error_shape():
    response = make_client().get("/api/content/no-such-content")

    assert_error(response, 404, "content_not_found")


def test_an_error_answer_is_never_marked_as_cacheable():
    response = make_client().get("/api/content/no-such-content")

    assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize(
    "path",
    [
        "/api/content/secret",
        "/api/content/story.json",
        "/api/content/..%2Fcontent%2Fstory.json",
        "/api/content/secret%2Fcase",
    ],
)
def test_names_that_are_not_public_get_404_and_show_no_content(path):
    response = make_client().get(path)

    assert response.status_code == 404
    assert list(response.json()) == ["error"]
    assert read_story_file()["title"] not in response.text


def test_the_intro_story_is_on_the_public_list():
    assert PUBLIC_CONTENT["intro-story"] == "story.json"


@pytest.mark.parametrize("name, filename", PUBLIC_CONTENT.items())
def test_every_public_name_serves_a_plain_json_file_in_the_content_folder(name, filename):
    path = CONTENT_DIR / filename

    assert Path(filename).name == filename  # a file name only, no folder and no ".."
    assert filename.endswith(".json")
    assert path.is_file()
    assert "secret" not in path.relative_to(CONTENT_DIR).parts


# ---- Nothing in backend/content/secret/ can be served ----------------------------------------

SECRET_FOLDER = CONTENT_DIR / "secret"
PUBLIC_FILES = set(PUBLIC_CONTENT.values())
# Files that a route of their own shows on purpose (GET /api/weather and GET /api/bulletin): a
# content address such as '../bulletin' is normalised to /api/bulletin before it reaches the API.
# The open-world tests at the end of this file prove that the content route never serves them.
SHOWN_BY_THEIR_OWN_ROUTE = {"weather_states.json", "bulletin.json", "chapter_two_hook.json"}


def secret_files() -> list[Path]:
    return sorted(path for path in SECRET_FOLDER.rglob("*") if path.is_file())


def json_files_that_are_not_public() -> list[Path]:
    """Every JSON file under backend/content/ that is not on the public list and has no route."""
    return [
        path
        for path in sorted(CONTENT_DIR.rglob("*.json"))
        if path.relative_to(CONTENT_DIR).as_posix() not in PUBLIC_FILES
        and path.relative_to(CONTENT_DIR).as_posix() not in SHOWN_BY_THEIR_OWN_ROUTE
    ]


def names_to_try(path: Path) -> list[str]:
    """The names a visitor might try to reach a file: its path, its file name, its stem."""
    relative = path.relative_to(CONTENT_DIR).as_posix()
    bases = {relative, relative.removesuffix(".json"), path.name, path.stem}
    names = set(bases)
    names |= {"../" + base for base in bases}
    names |= {"../content/" + base for base in bases}
    return sorted(names)


def long_texts(data, minimum: int = 12) -> list[str]:
    """Every text inside a JSON value that has at least `minimum` characters."""
    if isinstance(data, str):
        return [data] if len(data) >= minimum else []
    if isinstance(data, dict):
        return [text for value in data.values() for text in long_texts(value, minimum)]
    if isinstance(data, list):
        return [text for value in data for text in long_texts(value, minimum)]
    return []


def texts_to_look_for(path: Path) -> list[str]:
    """Texts that must never appear in an answer: a JSON file's texts, or other files' lines."""
    content = path.read_text(encoding="utf-8")
    if path.suffix == ".json":
        return long_texts(json.loads(content))
    return [line.strip() for line in content.split("\n") if len(line.strip()) >= 12]


def assert_not_served(client: TestClient, path: Path) -> None:
    """Try every name for the file, with the slashes written plainly and as %2F."""
    secrets = texts_to_look_for(path)
    for name in names_to_try(path):
        for address in (f"/api/content/{name}", f"/api/content/{quote(name, safe='')}"):
            response = client.get(address)
            assert response.status_code == 404, address
            route = response.request.url.path
            if route in ("/api/case", "/api/festival") or route.startswith(
                ("/api/case/", "/api/festival/", "/api/sports/")
            ):
                # Literal parent probes can normalize to an existing private feature route.
                assert response.headers["cache-control"] == "private, no-store", address
            else:
                assert response.headers["cache-control"] == "no-store", address
            assert not [text for text in secrets if text in response.text], address


def test_the_secret_folder_holds_the_case_file_with_texts_to_look_for():
    # Without this, the tests below would have no file to try, or no text to look for, and would
    # quietly prove nothing.
    case_file = SECRET_FOLDER / "case.json"

    assert case_file.is_file()
    assert len(long_texts(json.loads(case_file.read_text(encoding="utf-8")))) > 100


def test_no_public_name_leads_into_the_secret_folder():
    for name, filename in PUBLIC_CONTENT.items():
        assert "secret" not in name
        assert "secret" not in Path(filename).parts
        assert (CONTENT_DIR / filename).parent == CONTENT_DIR  # directly in content/, not deeper


@pytest.mark.parametrize("path", secret_files(), ids=lambda path: path.name)
def test_a_secret_file_cannot_be_downloaded_under_any_name(path):
    assert_not_served(make_client(), path)


@pytest.mark.parametrize(
    "path",
    json_files_that_are_not_public(),
    ids=lambda path: path.relative_to(CONTENT_DIR).as_posix(),
)
def test_a_content_file_that_is_not_on_the_public_list_cannot_be_downloaded(path):
    assert_not_served(make_client(), path)


def test_the_app_mounts_no_folder_of_static_files():
    # A mounted folder would serve files by their path and skip the public list.
    routes = create_app(CONFIGURED_SETTINGS).routes

    assert [route for route in routes if isinstance(route, Mount)] == []


# --- the open-world files are for the server only ---

# The three content files of the open world (weather states, the daily bulletin and the Chapter 2
# hook). They are read by the server and shown only through GET /api/weather and GET /api/bulletin.
OPEN_WORLD_FILES = ("weather_states.json", "bulletin.json", "chapter_two_hook.json")


def test_the_open_world_files_are_not_public_content():
    assert set(PUBLIC_CONTENT.values()).isdisjoint(OPEN_WORLD_FILES)
    assert all((CONTENT_DIR / filename).is_file() for filename in OPEN_WORLD_FILES)


@pytest.mark.parametrize(
    "name",
    [
        "bulletin",
        "bulletin.json",
        "chapter-two-hook",
        "chapter_two_hook",
        "chapter_two_hook.json",
        "weather-states",
        "weather_states",
        "weather_states.json",
    ],
)
def test_the_open_world_files_cannot_be_read_through_the_content_route(name):
    response = make_client().get(f"/api/content/{name}")

    assert_error(response, 404, "content_not_found")
    assert "A light where no light was" not in response.text
