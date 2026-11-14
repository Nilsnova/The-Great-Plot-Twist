"""G21: exercise the complete settings contract without reading the process environment."""

import random
import uuid
from dataclasses import fields
from pathlib import Path

import pytest
from pydantic import SecretStr

from server import settings as module
from server.flags import UnknownFlagError

FLAGS = (
    "market",
    "predictions",
    "sports",
    "arena",
    "raid",
    "live_presence",
    "case",
    "sign_in",
    "bulletin",
    "festival",
    "demo",
    "islands",
    "rescue",
)
VARIABLES = {
    "APP_ENV": " PrEvIeW ",
    "SUPABASE_URL": " https://g21-fixture.supabase.co/// ",
    "SUPABASE_PUBLISHABLE_KEY": " g21-public-placeholder ",
    "SUPABASE_SECRET_KEY": " fake-a ",
    "CRON_SECRET": " fake-b ",
    "DEMO_MODE": " TrUe ",
    "FEATURE_FLAGS": " raid, market,raid, ",
    "WEATHER_PLACE_NAME": " Tórshavn, Føroyar ",
    "WEATHER_LATITUDE": " -12.345 ",
    "WEATHER_LONGITUDE": " 123.456 ",
    "RELIGHT_OPEN": " FaLsE ",
    "STOCK_API_PROVIDER": " FiNnHuB ",
    "STOCK_API_KEY": " fake-c ",
    "SPORTS_API_PROVIDER": " football-data.org ",
    "SPORTS_API_KEY": " fake-d ",
    "SPORTS_COMPETITIONS": " ppl, cl,PPL, ",
    "VERCEL_GIT_COMMIT_SHA": " g21-synthetic-commit ",
    "HOST_PLAYER_IDS": " 00000000-0000-4000-8000-000000000021, ",
    "AUTH_PROVIDERS": " Email, github,email, ",
}


def test_every_documented_variable_is_in_the_complete_fixture():
    """A new template variable must receive an explicit correctness assertion here."""
    template = Path(module.__file__).resolve().parents[2] / ".env.example"
    names = {
        line.split("=", 1)[0]
        for line in template.read_text().splitlines()
        if line and not line.startswith("#") and "=" in line
    }
    # VITE_ belongs to the browser; VERCEL_GIT_COMMIT_SHA is injected by the host, not the template.
    assert names - {"VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"} == set(VARIABLES) - {
        "VERCEL_GIT_COMMIT_SHA"
    }


def test_all_variables_are_parsed_together_and_the_input_is_not_mutated():
    environment = dict(VARIABLES)
    settings = module.load_settings(environment)

    assert settings.app_env == "preview"
    assert settings.supabase_url == "https://g21-fixture.supabase.co"
    assert settings.supabase_publishable_key == "g21-public-placeholder"
    assert isinstance(settings.supabase_secret_key, SecretStr)
    assert settings.supabase_secret_key.get_secret_value() == "fake-a"
    assert isinstance(settings.cron_secret, SecretStr)
    assert settings.cron_secret.get_secret_value() == "fake-b"
    assert settings.demo_mode is True
    assert settings.flags == {name: name in {"raid", "market"} for name in FLAGS}
    assert settings.weather_place_name == "Tórshavn, Føroyar"
    assert settings.weather_latitude == -12.345
    assert settings.weather_longitude == 123.456
    assert settings.relight_open is False
    assert settings.stock_api_provider == "finnhub"
    assert settings.sports_api_provider == "football-data.org"
    assert isinstance(settings.stock_api_key, SecretStr)
    assert isinstance(settings.sports_api_key, SecretStr)
    assert settings.stock_api_key.get_secret_value() == "fake-c"
    assert settings.sports_api_key.get_secret_value() == "fake-d"
    assert settings.sports_competitions == ("PPL", "CL")
    assert settings.build_commit == "g21-synthetic-commit"
    assert settings.host_player_ids == frozenset({"00000000-0000-4000-8000-000000000021"})
    assert settings.auth_providers == ("email", "github")
    assert environment == VARIABLES


@pytest.mark.parametrize("blank", ["", " \t\n "])
def test_every_blank_value_matches_omission_for_all_fields(blank):
    empty = module.load_settings({name: blank for name in VARIABLES})
    default = module.load_settings({})
    assert empty == default == module.Settings()
    assert len(fields(empty)) == len(VARIABLES)


def test_environment_adapter_reads_only_the_supplied_mapping(monkeypatch):
    """Replace environ itself so this test cannot depend on or expose injected secrets."""
    monkeypatch.setattr(module.os, "environ", dict(VARIABLES))
    assert module.settings_from_environment() == module.load_settings(VARIABLES)


@pytest.mark.parametrize("mask", range(1 << len(FLAGS)))
def test_every_flag_subset_round_trips_with_duplicates_and_empty_pieces(mask):
    selected = [name for index, name in enumerate(FLAGS) if mask & (1 << index)]
    value = " , ".join(["", *reversed(selected), *selected, ""])
    settings = module.load_settings({"FEATURE_FLAGS": value})
    assert settings.flags == {name: name in selected for name in FLAGS}


@pytest.mark.parametrize("name", FLAGS)
def test_a_malformed_flag_is_not_accepted_alongside_known_flags(name):
    with pytest.raises(UnknownFlagError):
        module.load_settings({"FEATURE_FLAGS": f"market,{name.upper()},raid"})


def test_loaded_settings_do_not_share_flags_or_retain_the_input_mapping():
    environment = dict(VARIABLES)
    first = module.load_settings(environment)
    second = module.load_settings(environment)
    environment["APP_ENV"] = "production"
    first.flags["arena"] = True
    assert second.app_env == first.app_env == "preview"
    assert second.flags["arena"] is False
    assert module.load_settings({}).flags == {name: False for name in FLAGS}


def test_seeded_host_lists_normalize_order_case_duplicates_and_empty_pieces():
    rng = random.Random(210602)
    for _ in range(64):
        ids = [str(uuid.UUID(int=rng.getrandbits(128))) for _ in range(rng.randrange(1, 12))]
        pieces = [f" {value.upper()} " for value in ids + ids]
        rng.shuffle(pieces)
        value = ",," + ",,".join(pieces) + ","
        assert module.load_settings({"HOST_PLAYER_IDS": value}).host_player_ids == frozenset(ids)
