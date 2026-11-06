"""Public content caching must avoid rereads while noticing file updates and removals."""

import json
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from server.app import create_app
from server.routes import content
from server.tests.helpers import CONFIGURED_SETTINGS


def test_public_payload_is_read_once_and_changes_are_not_hidden(tmp_path, monkeypatch):
    monkeypatch.setattr(content, "CONTENT_DIR", tmp_path)
    story = tmp_path / "story.json"
    story.write_text('{"title":"First"}')
    with TestClient(create_app(CONFIGURED_SETTINGS), raise_server_exceptions=False) as client:
        original = Path.read_text
        with patch.object(Path, "read_text", autospec=True, side_effect=original) as reads:
            for _ in range(3):
                assert client.get("/api/content/intro-story").json() == {"title": "First"}
            assert reads.call_count == 1
        story.write_text(json.dumps({"title": "Updated public content"}))
        assert client.get("/api/content/intro-story").json()["title"] == "Updated public content"
        story.unlink()
        assert client.get("/api/content/intro-story").status_code == 500
