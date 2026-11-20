"""Opt-in system test of real local operator CLI, populated dump and fresh restore."""

import os
import stat

import pytest

pytestmark = pytest.mark.skipif(
    os.environ.get("CASE_PG_SCRATCH") != "1", reason="opt-in disposable PostgreSQL rehearsal"
)


def test_real_recovery_rehearsal_restores_history_and_removes_clusters(tmp_path):
    pytest.importorskip("pgserver")
    pytest.importorskip("psycopg")
    from tools.economy.recovery_rehearsal import rehearse

    destination = tmp_path / "rehearsal"
    report = rehearse(destination)
    assert report["status"] == "passed"
    assert report["restore"]["snapshotMatches"] is True
    assert report["restore"]["tables"] > 50
    assert report["disposableDataRemoved"] is True
    assert len(report["backups"]) == 2
    assert stat.S_IMODE(destination.stat().st_mode) == 0o700
    for path in (*destination.glob("*.dump"), *destination.glob("*-manifest.json")):
        assert stat.S_IMODE(path.stat().st_mode) == 0o600
    for directory in ("source", "stale-restore", "current-restore"):
        assert not (destination / directory / "data").exists()
