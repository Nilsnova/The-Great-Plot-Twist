"""Fail-closed worker hints and CLI bounds; positive writes use real SQL tests."""

import asyncio

import pytest

from server.island.catalogue import load_island
from server.island.rules import weather_for
from server.island.shared_session_worker import run_once
from server.settings import Settings
from server.supabase_admin import SupabaseRejected
from tools.shared_session_worker import main


class Replies:
    def __init__(self, *values):
        self.values = list(values)
        self.calls = []

    async def call_function(self, name, arguments):
        self.calls.append(name)
        return self.values.pop(0)


@pytest.mark.parametrize(
    "reply",
    [
        None,
        {},
        {"status": "done", "islands": True, "closed": 0},
        {"status": "done", "islands": 0, "closed": -1},
    ],
)
def test_unreadable_due_result_never_becomes_a_start(reply):
    catalogue = load_island()
    admin = Replies(reply)
    with pytest.raises(SupabaseRejected):
        asyncio.run(run_once(admin, catalogue, Settings(), weather_for(catalogue, None)))
    assert admin.calls == ["shared_session_process_due"]


def test_unknown_candidate_generation_never_reaches_template_or_writer():
    catalogue = load_island()
    admin = Replies(
        {"status": "done", "islands": 0, "closed": 0},
        {"status": "done", "candidates": [{"connectionGeneration": "01"}]},
    )
    with pytest.raises(SupabaseRejected):
        asyncio.run(run_once(admin, catalogue, Settings(), weather_for(catalogue, None)))
    assert admin.calls == ["shared_session_process_due", "shared_session_auto_candidates"]


@pytest.mark.parametrize(
    "arguments", [["--interval", "nan"], ["--interval", "31"], ["--limit", "0"], ["--limit", "101"]]
)
def test_cli_rejects_bad_bounds_before_reading_server_configuration(monkeypatch, arguments):
    monkeypatch.setattr("sys.argv", ["worker", *arguments])
    with pytest.raises(SystemExit) as caught:
        main()
    assert caught.value.code == 2
