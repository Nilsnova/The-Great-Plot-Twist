"""Real isolated pg_dump/pg_restore rehearsal with stale-backup refusal and exact replay.

Creates only new disposable clusters. Auth/Realtime are SQL stand-ins; no external jobs run.
"""

import hashlib
import json
import os
import subprocess
import sys
from contextlib import ExitStack
from datetime import UTC, datetime
from pathlib import Path

from tools.economy.recovery import ROOT, operator
from tools.economy.recovery_fixture import prove_replays, require, seed, settle_pending
from tools.economy.recovery_manifest import RecoveryError, digest, local_environment, write_manifest
from tools.economy.recovery_snapshot import protected_state, reconcile, snapshot, verify_restore


def utc():
    return datetime.now(UTC).isoformat()


def connect(uri):
    import psycopg

    connection = psycopg.connect(uri, options="-c timezone=UTC")
    require(connection.info.host.startswith("/"), "unix_socket_required")
    return connection


def install(uri):
    stub = ROOT / "backend/server/tests/case_sql/stub.sql"
    with connect(uri) as connection:
        connection.execute(stub.read_text())
        for path in sorted((ROOT / "supabase/migrations").glob("*.sql")):
            connection.execute(path.read_text())


def binary(name):
    import pgserver

    return str(Path(pgserver.pg_config(["--bindir"]).strip()) / name)


def command(arguments):
    # Explicit local URIs are generated inside this process; no libpq environment is inherited.
    environment = {name: value for name, value in os.environ.items() if not name.startswith("PG")}
    subprocess.run(
        arguments, check=True, capture_output=True, text=True, env=environment, timeout=60
    )


def backup(uri, destination):
    with connect(uri) as connection:
        connection.execute("set transaction isolation level repeatable read read only")
        snapshot_id, started, observed, transaction_snapshot = connection.execute(
            "select pg_export_snapshot(),transaction_timestamp(),clock_timestamp(),"
            "pg_current_snapshot()::text"
        ).fetchone()
        state = snapshot(connection)
        reconcile(connection)
        command(
            [
                binary("pg_dump"),
                "--format=custom",
                "--no-password",
                "--snapshot",
                snapshot_id,
                "--dbname",
                uri,
                "--file",
                str(destination),
            ]
        )
    destination.chmod(0o600)
    return {
        "snapshot": state,
        "snapshotTransactionStartedAt": started.isoformat(),
        "snapshotObservedAt": observed.isoformat(),
        "transactionSnapshot": transaction_snapshot,
        "backupCompletedAt": utc(),
    }


def restore(uri, dump):
    with connect(uri) as connection:
        connection.execute(
            "create role anon nologin; create role authenticated nologin; "
            "create role service_role nologin bypassrls"
        )
    command(
        [
            binary("pg_restore"),
            "--clean",
            "--if-exists",
            "--exit-on-error",
            "--single-transaction",
            "--no-password",
            "--dbname",
            uri,
            str(dump),
        ]
    )


def manifest(path, uri, fixture):
    origin = fixture["initial"]["currentEconomy"]
    return write_manifest(
        path, uri, ROOT, fixture["owner"], origin["accountId"], origin["runEpoch"]
    )


def reapply_populated(uri):
    files = [
        ROOT / "supabase/migrations/20261118050150_island_economy_operations.sql",
        next((ROOT / "supabase/migrations").glob("*_island_economy_operator_recovery.sql")),
    ]
    with connect(uri) as connection:
        require(
            connection.execute("show transaction_isolation").fetchone() == ("read committed",),
            "migration_transaction_isolation_wrong",
        )
        before = snapshot(connection)
        for path in files:
            connection.execute(path.read_text())
        require(snapshot(connection) == before, "populated_migration_reapply_changed_history")


def permissions(connection):
    for signature in [
        "public.island_economy_operator_context(uuid)",
        "public.island_economy_set_offers(text,uuid,uuid,uuid,numeric,text,text)",
    ]:
        for role in ("anon", "authenticated", "service_role"):
            actual = connection.execute(
                "select has_function_privilege(%s,%s,'execute')", (role, signature)
            ).fetchone()[0]
            require(actual == (role == "service_role"), "restored_operator_grants_wrong")
    require(
        connection.execute(
            "select relrowsecurity from pg_class where "
            "oid='island_economy_private.operator_offer_receipts'::regclass"
        ).fetchone()
        == (True,),
        "restored_operator_rls_missing",
    )


def cli(path, action, uid, revision):
    completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "tools.economy.recovery",
            action,
            "--manifest",
            str(path),
            "--uid",
            uid,
            "--expected-revision",
            str(revision),
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=20,
    )
    result = json.loads(completed.stdout)
    require(result.get("status") == "done", "operator_cli_failed")
    return result


def rehearse(output):
    import pgserver

    local_environment()
    output = Path(output).resolve()
    if output.is_relative_to(ROOT):
        raise RecoveryError("backup_outside_repository_required")
    if output.exists():
        raise RecoveryError("new_output_directory_required")
    output.mkdir(mode=0o700, parents=True)
    report = {
        "status": "running",
        "startedAt": utc(),
        "checks": [],
        "scope": "disposable SQL clusters; Auth/Realtime stand-ins; no hosted operations",
    }
    with ExitStack() as stack:
        servers = []
        for label in ("source", "stale-restore", "current-restore"):
            directory = output / label
            directory.mkdir()
            server = stack.enter_context(
                pgserver.get_server(directory / "data", cleanup_mode="delete")
            )
            servers.append(server)
        source, stale, current = servers
        install(source.get_uri())
        with connect(source.get_uri()) as connection:
            fixture = seed(connection)
            protected = protected_state(connection)
        source_manifest = output / "source-manifest.json"
        description = manifest(source_manifest, source.get_uri(), fixture)
        report["migrationDigest"] = digest(description["migrations"])
        report["migrationCount"] = len(description["migrations"])
        paused = cli(source_manifest, "pause", "operator_pause01", 0)
        reapply_populated(source.get_uri())
        report["checks"].append(
            "populated registry/control migration reapply preserves all history"
        )
        first = backup(source.get_uri(), output / "before-settlement.dump")
        pgserver.pg_ctl(["restart", "-w", "-m", "fast"], pgdata=output / "source/data")
        restarted = operator(source_manifest, "context")
        require(
            restarted["admissionState"] == "paused" and restarted["controlRevision"] == "1",
            "pause_not_persistent",
        )
        require(
            restarted["economy"]["runEpoch"] == fixture["initial"]["currentEconomy"]["runEpoch"],
            "epoch_changed_after_restart",
        )
        report["checks"].append(
            "pause/account/epoch/control generation survive actual PostgreSQL restart"
        )
        with connect(source.get_uri()) as connection:
            settlement = settle_pending(connection, fixture)
            require(
                protected_state(connection) == protected,
                "pause_or_settlement_changed_personal_data",
            )
        cli(source_manifest, "resume", "operator_resume01", 1)
        repeated = cli(source_manifest, "pause", "operator_pause01", 0)
        require(
            repeated["repeat"]
            and repeated["receipt"] == paused["receipt"]
            and repeated["current"]["admissionState"] == "active",
            "old_pause_reapplied",
        )
        cli(source_manifest, "pause", "operator_pause02", 2)
        latest = backup(source.get_uri(), output / "current-checkpoint.dump")
        restore(stale.get_uri(), output / "before-settlement.dump")
        with connect(stale.get_uri()) as connection:
            try:
                verify_restore(connection, latest["snapshot"])
            except RecoveryError as error:
                require(str(error) == "restore_snapshot_mismatch", "unexpected_stale_restore_error")
            else:
                raise RecoveryError("stale_backup_silently_accepted")
        report["checks"].append("older backup refuses the later committed reconciliation manifest")
        restore(current.get_uri(), output / "current-checkpoint.dump")
        with connect(current.get_uri()) as connection:
            verified = verify_restore(connection, latest["snapshot"])
            permissions(connection)
            require(protected_state(connection) == protected, "restore_changed_personal_data")
        recovered_manifest = output / "restored-manifest.json"
        manifest(recovered_manifest, current.get_uri(), fixture)
        cli(recovered_manifest, "resume", "operator_resume02", 3)
        replay = cli(recovered_manifest, "pause", "operator_pause01", 0)
        require(
            replay["repeat"] and replay["current"]["admissionState"] == "active",
            "restored_old_pause_reapplied",
        )
        with connect(current.get_uri()) as connection:
            prove_replays(connection, fixture, settlement)
            reconcile(connection)
            require(protected_state(connection) == protected, "replay_changed_personal_data")
            require(
                connection.execute(
                    "select balance_coins,committed_coins from "
                    "public.island_economy_accounts where id=%s",
                    (fixture["otherInitial"]["currentEconomy"]["accountId"],),
                ).fetchone()
                == (200, 0),
                "settlement_changed_other_island",
            )
        report["checks"].extend(
            [
                "latest backup restores every populated table hash before enabling offers",
                "original settlement/starting grant/control UIDs replay without duplicate effects",
                "restored shared island refuses legacy wave/personal payout fallback",
                "other island and personal wallets remain unchanged; all accounts reconcile",
            ]
        )
        report.update(
            status="passed",
            restore=verified,
            firstBackup={key: value for key, value in first.items() if key != "snapshot"},
            recoveredBackup={key: value for key, value in latest.items() if key != "snapshot"},
        )
    report["completedAt"] = utc()
    report["backups"] = {
        path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in output.glob("*.dump")
    }
    report["toolSourceDigest"] = digest(
        {
            path.name: hashlib.sha256(path.read_bytes()).hexdigest()
            for path in Path(__file__).parent.glob("recovery*.py")
        }
    )
    report["disposableDataRemoved"] = all(
        not (output / label / "data").exists()
        for label in ("source", "stale-restore", "current-restore")
    )
    require(report["disposableDataRemoved"], "disposable_data_cleanup_failed")
    report["limits"] = [
        "Fresh checkpoint includes every observed source commit before backup.",
        "The synthetic source is otherwise quiescent; pause alone does not stop old settlements.",
        "No WAL/PITR or post-checkpoint replay mechanism is claimed.",
        "No provider Auth/storage/config backup, natural feed or live cutover is claimed.",
    ]
    (output / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    return report
