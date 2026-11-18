"""Trusted-source adapters and historical-receipt preflight order; no runtime auth claim."""

import asyncio
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from server.errors import ApiError
from server.island import wager_service
from server.island.wager_rules import WagerIntent
from server.island.wager_store import find_replay, open_wager
from server.market.calendars import ALWAYS_OPEN
from server.market.readings import Reading
from server.market.states import CompanyState
from server.sports.models import Match
from server.sports.source import SportsReading
from server.supabase_admin import SupabaseRejected, SupabaseUnavailable
from server.tests.market_helpers import island_company
from server.tests.test_island_treasury import ACTOR, EPOCH, OWNER, FakeAdmin
from server.tests.test_wager_store import reply


def test_market_evidence_contains_the_asset_and_server_quote_without_a_payout():
    now = datetime(2026, 11, 18, 15, tzinfo=UTC)
    state = CompanyState(island_company(id="harbor-trust"),
                         Reading(Decimal("123.456"), now, now, "live"), ALWAYS_OPEN,
                         "open", None, False, True)
    evidence = wager_service.market_evidence(state)
    assert evidence == {"asset": "harbor-trust", "source": "live", "price": "123.456",
                        "quotedAt": now.isoformat(), "fetchedAt": now.isoformat()}


def test_football_evidence_binds_official_provider_identity_and_scores_without_a_payout():
    now = datetime(2026, 11, 18, 15, tzinfo=UTC)
    match = Match("fd-123", "football", "League", "Home", "Away",
                  now - timedelta(hours=2), "finished", 2, 1)
    evidence = wager_service.football_evidence(
        SportsReading(match, "football-data.org", "live", now),
    )
    assert (evidence["fixtureId"], evidence["provider"],
            evidence["homeScore"], evidence["awayScore"]) == (
        "fd-123", "football-data.org", 2, 1
    )
    assert "payout" not in evidence and "accountId" not in evidence


def test_own_historical_market_receipt_returns_before_preflight_and_source_calls(monkeypatch):
    data = reply()
    data["repeat"] = True
    data["currentEconomy"] = None
    admin = FakeAdmin(data)

    async def forbidden_preflight(*args, **kwargs):
        pytest.fail("A historical receipt must resolve before current permission preflight.")

    monkeypatch.setattr(wager_service, "require_economy_action", forbidden_preflight)
    result = asyncio.run(wager_service.open_market_call(
        admin, object(), ACTOR, OWNER, EPOCH, "wager001", "harbor-trust", "up", 50,
    ))
    assert result.currentEconomy is None
    assert [call[0] for call in admin.calls] == ["island_wager_replay"]


def test_missing_current_authority_stops_new_wagers_before_source_or_mutation(monkeypatch):
    admin = FakeAdmin({"status": "missing"})

    async def unavailable(*args, **kwargs):
        raise ApiError(409, "economy_path_unavailable", "Authority is unavailable.")

    monkeypatch.setattr(wager_service, "require_economy_action", unavailable)
    with pytest.raises(ApiError) as error:
        asyncio.run(wager_service.open_market_call(
            admin, object(), ACTOR, OWNER, EPOCH, "wager001", "harbor-trust", "up", 50,
        ))
    assert error.value.code == "economy_path_unavailable"
    assert len(admin.calls) == 1


def test_unreadable_mutation_reply_keeps_outcome_unknown_instead_of_refunding():
    admin = FakeAdmin({"status": "done", "incomplete": True})
    with pytest.raises(SupabaseUnavailable):
        asyncio.run(open_wager(admin, ACTOR, OWNER, EPOCH, "wager001",
                               WagerIntent("market_call", "harbor-trust", "up", 50), {}))
    assert len(admin.calls) == 1


def test_unknown_replay_response_is_never_treated_as_an_absent_personal_operation():
    admin = FakeAdmin({"status": "missing", "extra": True})
    with pytest.raises(SupabaseRejected):
        asyncio.run(find_replay(admin, ACTOR, OWNER, EPOCH, "wager001",
                               WagerIntent("market_call", "harbor-trust", "up", 50)))
