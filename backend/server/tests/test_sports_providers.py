"""Synthetic provider-shaped responses exercise adapters through fake HTTP only."""

import asyncio
from copy import deepcopy
from dataclasses import replace

import httpx
import pytest
from pydantic import SecretStr

from server.settings import Settings, SettingsError, load_settings
from server.sports.providers import provider_from_settings
from server.sports.rules import outcome


def football_answer():
    # Synthetic schema fixture, not a captured provider response or a real fixture id.
    return {
        "id": 101, "utcDate": "2023-08-11T19:00:00Z", "status": "FINISHED",
        "competition": {"name": "Test league", "type": "LEAGUE"},
        "homeTeam": {"name": "Home"}, "awayTeam": {"name": "Away"},
        "score": {"duration": "REGULAR", "fullTime": {"home": 0, "away": 3}},
    }


def basketball_answer():
    return {"data": {
        "id": 102, "datetime": "2023-08-11T19:00:00Z", "status": "Final",
        "period": 4, "postseason": False, "home_team": {"full_name": "Home"},
        "visitor_team": {"full_name": "Away"}, "home_team_score": 110,
        "visitor_team_score": 100,
    }}


def configured(name="football-data.org"):
    return Settings(
        sports_api_provider=name, sports_api_key=SecretStr("synthetic-adapter-key"),
        flags={"sports": True},
    )


@pytest.mark.parametrize("name,answer,header,path,expected", [
    ("football-data.org", football_answer, "X-Auth-Token", "/v4/matches/101", "away"),
    ("balldontlie", basketball_answer, "Authorization", "/nba/v1/games/102", "home"),
])
def test_fixed_hosts_headers_and_results(name, answer, header, path, expected):
    seen = []

    def respond(request):
        seen.append(request)
        return httpx.Response(200, json=answer())

    provider = provider_from_settings(configured(name), transport=httpx.MockTransport(respond))
    match = asyncio.run(provider.get_match(int(path.rsplit("/", 1)[1])))
    assert outcome(match) == expected
    assert seen[0].url.scheme == "https"
    assert seen[0].url.host == (
        "api.football-data.org" if name == "football-data.org" else "api.balldontlie.io"
    )
    assert seen[0].url.path == path
    assert seen[0].headers[header] == "synthetic-adapter-key"
    assert not seen[0].url.query


@pytest.mark.parametrize("settings", [
    Settings(), replace(configured(), sports_api_provider=""),
    replace(configured(), sports_api_key=SecretStr("")),
    replace(configured(), demo_mode=True), replace(configured(), flags={"sports": False}),
])
def test_unconfigured_demo_and_flag_off_make_no_requests(settings):
    def forbidden(_request):
        pytest.fail("Recorded-only selection must not contact a provider")
    assert provider_from_settings(settings, transport=httpx.MockTransport(forbidden)) is None


@pytest.mark.parametrize("status", [401, 403, 429, 500])
def test_http_failures_are_not_misread_as_results(status):
    provider = provider_from_settings(configured(), transport=httpx.MockTransport(
        lambda _request: httpx.Response(status, json={"message": "not a fixture"})
    ))
    with pytest.raises(httpx.HTTPStatusError):
        asyncio.run(provider.get_match(101))


def test_timeout_propagates_without_a_result_or_retry_storm():
    seen = []
    def timeout(request):
        seen.append(request)
        raise httpx.ReadTimeout("synthetic timeout")
    provider = provider_from_settings(configured(), transport=httpx.MockTransport(timeout))
    with pytest.raises(httpx.ReadTimeout):
        asyncio.run(provider.get_match(101))
    assert len(seen) == 1


@pytest.mark.parametrize("change", [
    {"id": 999}, {"utcDate": "2023-08-11T19:00:00"}, {"status": "AWARDED"},
    {"competition": {"name": "Cup", "type": "CUP"}},
    {"score": {"duration": "EXTRA_TIME", "fullTime": {"home": 2, "away": 1}}},
    {"score": {"duration": "REGULAR", "fullTime": {"home": True, "away": 1}}},
])
def test_unsafe_or_mismatched_football_answers_never_settle(change):
    answer = deepcopy(football_answer())
    answer.update(change)
    provider = provider_from_settings(configured(), transport=httpx.MockTransport(
        lambda _request: httpx.Response(200, json=answer)
    ))
    with pytest.raises(ValueError):
        asyncio.run(provider.get_match(101))


@pytest.mark.parametrize("status,expected", [
    ("SCHEDULED", None), ("IN_PLAY", None), ("PAUSED", None),
    ("POSTPONED", "void"), ("CANCELLED", "void"), ("SUSPENDED", "void"),
])
def test_provider_statuses_do_not_turn_zero_scores_into_a_draw(status, expected):
    answer = football_answer()
    answer["status"] = status
    answer["score"]["fullTime"] = {"home": None, "away": None}
    provider = provider_from_settings(configured(), transport=httpx.MockTransport(
        lambda _request: httpx.Response(200, json=answer)
    ))
    assert outcome(asyncio.run(provider.get_match(101))) == expected


def test_settings_keep_key_redacted_and_reject_unknown_provider_without_echoing_it():
    settings = load_settings({
        "SPORTS_API_PROVIDER": "balldontlie", "SPORTS_API_KEY": "synthetic-adapter-key",
    })
    assert settings.sports_api_provider == "balldontlie"
    assert "synthetic-adapter-key" not in repr(settings)
    with pytest.raises(SettingsError, match="SPORTS_API_PROVIDER") as caught:
        load_settings({"SPORTS_API_PROVIDER": "bad-private-input"})
    assert "bad-private-input" not in str(caught.value)


@pytest.mark.parametrize("change", [
    {"id": True}, {"postseason": True}, {"datetime": None},
    {"home_team_score": 100}, {"visitor_team_score": -1},
])
def test_unsafe_basketball_finals_are_rejected(change):
    answer = basketball_answer()
    answer["data"].update(change)
    provider = provider_from_settings(configured("balldontlie"), transport=httpx.MockTransport(
        lambda _request: httpx.Response(200, json=answer)
    ))
    with pytest.raises(ValueError):
        asyncio.run(provider.get_match(102))


@pytest.mark.parametrize("status,period,expected", [
    ("7:00 pm ET", 0, "scheduled"), ("Q3", 3, "playing"),
    ("Unrecognized", 0, "unknown"), ("Postponed", 0, "postponed"),
    ("Cancelled", 0, "cancelled"), ("Suspended", 2, "suspended"),
])
def test_basketball_zero_scores_never_create_a_final_result(status, period, expected):
    answer = basketball_answer()
    answer["data"].update({
        "status": status, "period": period, "home_team_score": 0, "visitor_team_score": 0,
    })
    provider = provider_from_settings(configured("balldontlie"), transport=httpx.MockTransport(
        lambda _request: httpx.Response(200, json=answer)
    ))
    match = asyncio.run(provider.get_match(102))
    assert match.status == expected
    refunded = expected in ("postponed", "cancelled", "suspended")
    assert outcome(match) == ("void" if refunded else None)


@pytest.mark.parametrize("match_id", [True, 0, -1, "101", "https://example.test"])
def test_untrusted_ids_never_reach_the_network(match_id):
    def forbidden(_request):
        pytest.fail("An invalid id must not reach HTTP")
    provider = provider_from_settings(configured(), transport=httpx.MockTransport(forbidden))
    with pytest.raises(ValueError):
        asyncio.run(provider.get_match(match_id))


@pytest.mark.parametrize("date,accepted", [
    ("2023-08-11T19:00:00Z", True), ("2023-08-11", False),
])
def test_basketball_date_field_needs_an_aware_kickoff(date, accepted):
    answer = basketball_answer()
    del answer["data"]["datetime"]
    answer["data"]["date"] = date
    provider = provider_from_settings(configured("balldontlie"), transport=httpx.MockTransport(
        lambda _request: httpx.Response(200, json=answer)
    ))
    if accepted:
        assert outcome(asyncio.run(provider.get_match(102))) == "home"
    else:
        with pytest.raises(ValueError):
            asyncio.run(provider.get_match(102))


def test_nba_overtime_final_counts_as_the_winner_of_the_game():
    answer = basketball_answer()
    answer["data"]["period"] = 5
    provider = provider_from_settings(configured("balldontlie"), transport=httpx.MockTransport(
        lambda _request: httpx.Response(200, json=answer)
    ))
    assert outcome(asyncio.run(provider.get_match(102))) == "home"
