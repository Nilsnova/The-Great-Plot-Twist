"""Local recovery target guards reject hosted/overriding connections before connecting."""

import copy
import json
import sys
from types import SimpleNamespace

import pytest

from tools.economy.recovery_manifest import (
    RecoveryError,
    connect_manifest,
    migrations,
    read_manifest,
    validate_manifest,
    write_manifest,
)


def manifest():
    return {
        "version": 1,
        "purpose": "disposable-economy-rehearsal",
        "connection": {
            "host": "/tmp/disposable-socket",
            "port": "5432",
            "dbname": "postgres",
            "user": "postgres",
        },
        "dataDirectory": "/tmp/disposable-data",
        "systemIdentifier": "123",
        "migrations": {"001_test.sql": "abc"},
        "islandOwner": "00000000-0000-0000-0000-000000005130",
        "accountId": "00000000-0000-0000-0000-000000005131",
        "runEpoch": "00000000-0000-0000-0000-000000005132",
    }


@pytest.mark.parametrize(
    "host",
    [
        "localhost",
        "127.0.0.1",
        "db.example.test",
        "/tmp/socket,db.example.test",
        "postgresql://host/db",
    ],
)
def test_tcp_and_multi_host_targets_are_refused_before_connect(host, monkeypatch):
    value = manifest()
    value["connection"]["host"] = host
    monkeypatch.setitem(
        sys.modules,
        "psycopg",
        SimpleNamespace(connect=lambda **kwargs: pytest.fail("Forbidden target reached libpq")),
    )
    with pytest.raises(RecoveryError, match="unix_socket_required"):
        connect_manifest(value)


@pytest.mark.parametrize("field", ["password", "options", "service", "hostaddr"])
def test_arbitrary_libpq_options_cannot_be_hidden_in_the_manifest(field):
    value = manifest()
    value["connection"][field] = "not-allowed"
    with pytest.raises(RecoveryError, match="connection_fields_invalid"):
        validate_manifest(value)


@pytest.mark.parametrize(
    "name,value",
    [
        ("dbname", "postgresql://remote/db"),
        ("user", "service=remote"),
        ("dbname", "dbname=x host=y"),
    ],
)
def test_connection_identity_cannot_expand_into_another_conninfo(name, value):
    current = manifest()
    current["connection"][name] = value
    with pytest.raises(RecoveryError, match="connection_identity_invalid"):
        validate_manifest(current)


def test_libpq_environment_is_never_an_alternate_target(monkeypatch):
    monkeypatch.setenv("PGHOST", "db.example.test")
    monkeypatch.setitem(
        sys.modules,
        "psycopg",
        SimpleNamespace(connect=lambda **kwargs: pytest.fail("Environment target reached libpq")),
    )
    with pytest.raises(RecoveryError, match="libpq_environment_unsupported"):
        connect_manifest(manifest())


def test_source_changed_after_manifest_refuses_the_operation(tmp_path):
    directory = tmp_path / "supabase/migrations"
    directory.mkdir(parents=True)
    source = directory / "001_test.sql"
    source.write_text("select 1;\n")
    value = copy.deepcopy(manifest())
    value["migrations"] = migrations(tmp_path)
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps(value))
    assert read_manifest(path, tmp_path) == value
    source.write_text("select 2;\n")
    with pytest.raises(RecoveryError, match="migration_source_mismatch"):
        read_manifest(path, tmp_path)


@pytest.mark.parametrize("field", ["islandOwner", "accountId", "runEpoch"])
def test_malformed_origin_is_a_structured_refusal(field):
    value = manifest()
    value[field] = {"unexpected": "object"}
    with pytest.raises(RecoveryError, match="origin_invalid"):
        validate_manifest(value)


@pytest.mark.parametrize(
    "uri",
    [
        "postgresql://postgres@db.example.test/postgres",
        "postgresql://postgres@/postgres?host=/tmp/socket&hostaddr=127.0.0.1",
        "postgresql://postgres@/postgres?host=/tmp/socket&service=remote",
        "postgresql://postgres@/postgres?host=/tmp/socket&options=-c%20search_path%3Dpublic",
        "not a conninfo",
    ],
)
def test_manifest_export_rejects_unsafe_uri_before_connect(uri, monkeypatch, tmp_path):
    psycopg = pytest.importorskip("psycopg")
    monkeypatch.setattr(psycopg, "connect", lambda *a, **k: pytest.fail("Unsafe URI connected"))
    with pytest.raises(RecoveryError):
        write_manifest(tmp_path / "manifest.json", uri, tmp_path, "owner", "account", "epoch")


def test_manifest_export_rejects_libpq_environment_before_connect(monkeypatch, tmp_path):
    psycopg = pytest.importorskip("psycopg")
    monkeypatch.setenv("PGHOSTADDR", "127.0.0.1")
    monkeypatch.setattr(psycopg, "connect", lambda *a, **k: pytest.fail("Environment connected"))
    with pytest.raises(RecoveryError, match="libpq_environment_unsupported"):
        write_manifest(
            tmp_path / "manifest.json",
            "host=/tmp/socket user=postgres dbname=postgres",
            tmp_path,
            "owner",
            "account",
            "epoch",
        )
