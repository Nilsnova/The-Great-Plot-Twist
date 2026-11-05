"""Tests for GET /api/content/{name}: the public game content the browser may download.

No test needs a login, a database or the network. The expected story is read straight from
backend/content/story.json, not through the code that is being tested.
"""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

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

    assert "cache-control" not in response.headers


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
