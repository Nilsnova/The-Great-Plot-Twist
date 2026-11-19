"""Safety boundaries for the real local provider harness; these are not provider evidence."""

import base64
import copy
import json
import stat

import pytest

from tools.authenticated_economy import config


def test_candidate_is_explicit_and_an_existing_runtime_cannot_be_relabelled(tmp_path):
    with pytest.raises(ValueError, match="explicit full"):
        config.create(tmp_path / "missing")
    directory = tmp_path / "provider"
    config.create(directory, "0" * 40)
    with pytest.raises(ValueError, match="different candidate"):
        config.create(directory, "1" * 40)
    assert config.load(directory / "runtime.json")["expectedCommit"] == "0" * 40


def test_private_generated_configuration_is_stable_and_never_mints_user_identity(tmp_path):
    directory = tmp_path / "provider"
    runtime = config.create(directory, "0" * 40)
    assert stat.S_IMODE(directory.stat().st_mode) == 0o700
    for name in ("runtime.json", "compose.json"):
        assert stat.S_IMODE((directory / name).stat().st_mode) == 0o600
    assert config.create(directory, "0" * 40) == runtime
    for field, expected in (("anonKey", "anon"), ("serviceKey", "service_role")):
        payload = runtime[field].split(".")[1]
        claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        assert claims["role"] == expected
        assert "sub" not in claims
    for service in config.compose(runtime)["services"].values():
        assert all(port.startswith("127.0.0.1:") for port in service["ports"])


@pytest.mark.parametrize(
    ("field", "replacement"),
    [
        ("providerUrl", "https://example.supabase.co"),
        ("providerUrl", "https://localhost:54421@evil.example"),
        ("apiUrl", "http://127.0.0.1:8000"),
        ("frontendUrl", "http://127.0.0.1:55105/other"),
        ("project", "production"),
        ("ports", {**config.PORTS, "db": 5432}),
    ],
)
def test_edited_runtime_cannot_target_other_endpoints_before_connecting(
    tmp_path, field, replacement
):
    runtime = copy.deepcopy(config.create(tmp_path / "provider", "0" * 40))
    runtime[field] = replacement
    config.private_json(tmp_path / "edited.json", runtime)
    with pytest.raises(ValueError):
        config.load(tmp_path / "edited.json")
