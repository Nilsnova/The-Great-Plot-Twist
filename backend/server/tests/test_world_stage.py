"""Tests for world_stage.py: is the coast still dark, or has a crew relit it?

L3 reads world_state by default; isolated tests may inject any reader with the same method.
No network here.
"""

import asyncio
from datetime import UTC, datetime, timedelta, timezone

import pytest

from server.app import create_app
from server.game.world_state import DatabaseWorldStage
from server.tests.helpers import CONFIGURED_SETTINGS
from server.world_stage import DARK, RELIT, AlwaysDark, WorldStage

RELIT_AT = datetime(2026, 11, 20, 21, 30, tzinfo=UTC)


class FixedStage:
    """A pretend reader that always answers with the stage a test gives it."""

    def __init__(self, stage: WorldStage) -> None:
        self.stage = stage

    async def read(self) -> WorldStage:
        return self.stage


def test_the_isolated_dark_reader_keeps_the_coast_dark():
    stage = asyncio.run(AlwaysDark().read())

    assert stage == WorldStage(DARK, None)


def test_the_two_stages_are_called_dark_and_relit():
    assert (DARK, RELIT) == ("dark", "relit")


def test_a_relit_stage_needs_the_time_of_the_relighting():
    with pytest.raises(ValueError, match="relit"):
        WorldStage(RELIT, None)


def test_a_relit_stage_keeps_the_time_of_the_relighting():
    stage = WorldStage(RELIT, RELIT_AT)

    assert stage.stage == "relit"
    assert stage.relit_at == RELIT_AT


def test_a_dark_stage_has_no_time_of_relighting():
    with pytest.raises(ValueError, match="dark"):
        WorldStage(DARK, RELIT_AT)


def test_a_time_without_a_timezone_is_refused():
    with pytest.raises(ValueError, match="timezone"):
        WorldStage(RELIT, datetime(2026, 11, 20, 21, 30))


def test_a_time_in_another_timezone_is_accepted():
    lisbon_summer = timezone(timedelta(hours=1))

    stage = WorldStage(RELIT, RELIT_AT.astimezone(lisbon_summer))

    assert stage.relit_at == RELIT_AT


def test_a_stage_that_is_neither_dark_nor_relit_is_refused():
    with pytest.raises(ValueError, match="stage"):
        WorldStage("twilight", None)


def test_a_stage_cannot_be_changed_after_it_was_made():
    stage = WorldStage(DARK, None)

    with pytest.raises(AttributeError):
        stage.stage = RELIT


def test_create_app_reads_the_shared_coast_when_no_reader_is_given():
    app = create_app(CONFIGURED_SETTINGS)

    assert isinstance(app.state.world_stage, DatabaseWorldStage)


def test_create_app_uses_the_reader_it_is_given():
    reader = FixedStage(WorldStage(RELIT, RELIT_AT))

    app = create_app(CONFIGURED_SETTINGS, world_stage=reader)

    assert app.state.world_stage is reader
