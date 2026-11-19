"""Strict local-cluster manifests for the MP-ECO-21 operator rehearsal.

No hosted URL, environment credential, arbitrary libpq option or admission is supported.
"""

import hashlib
import json
import os
import re
from pathlib import Path
from uuid import UUID


class RecoveryError(ValueError):
    """A bounded refusal safe to print without database rows or credentials."""


def digest(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def migrations(root):
    files = sorted((Path(root) / "supabase/migrations").glob("*.sql"))
    if not files or len(files) != len({path.name.split("_", 1)[0] for path in files}):
        raise RecoveryError("migration_manifest_invalid")
    return {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in files}


def validate_connection(connection):
    if not isinstance(connection, dict) or set(connection) != {"host", "port", "dbname", "user"}:
        raise RecoveryError("connection_fields_invalid")
    if (
        not isinstance(connection["host"], str)
        or not connection["host"].startswith("/")
        or "," in connection["host"]
        or "\x00" in connection["host"]
    ):
        raise RecoveryError("unix_socket_required")
    if (
        not isinstance(connection["port"], str)
        or not connection["port"].isdigit()
        or not 1 <= int(connection["port"]) <= 65535
    ):
        raise RecoveryError("connection_port_invalid")
    for name in ("dbname", "user"):
        if not isinstance(connection[name], str) or not re.fullmatch(
            r"[A-Za-z_][A-Za-z0-9_-]*", connection[name]
        ):
            raise RecoveryError("connection_identity_invalid")


def local_environment():
    if any(name.startswith("PG") for name in os.environ):
        raise RecoveryError("libpq_environment_unsupported")


def validate_manifest(value):
    fields = {
        "version",
        "purpose",
        "connection",
        "dataDirectory",
        "systemIdentifier",
        "migrations",
        "islandOwner",
        "accountId",
        "runEpoch",
    }
    if not isinstance(value, dict) or set(value) != fields:
        raise RecoveryError("manifest_fields_invalid")
    if (
        type(value["version"]) is not int
        or value["version"] != 1
        or value["purpose"] != "disposable-economy-rehearsal"
    ):
        raise RecoveryError("manifest_purpose_invalid")
    validate_connection(value["connection"])
    if not isinstance(value["dataDirectory"], str):
        raise RecoveryError("data_directory_invalid")
    directory = Path(value["dataDirectory"])
    if not directory.is_absolute() or directory.is_symlink():
        raise RecoveryError("data_directory_invalid")
    if not isinstance(value["systemIdentifier"], str) or not value["systemIdentifier"].isdigit():
        raise RecoveryError("cluster_identity_invalid")
    for name in ("islandOwner", "accountId", "runEpoch"):
        try:
            valid = str(UUID(value[name])) == value[name]
        except (ValueError, TypeError, AttributeError):
            valid = False
        if not valid:
            raise RecoveryError("origin_invalid")
    if not isinstance(value["migrations"], dict) or not value["migrations"]:
        raise RecoveryError("migration_manifest_invalid")
    return value


def read_manifest(path, root):
    try:
        value = validate_manifest(json.loads(Path(path).read_text()))
    except (OSError, json.JSONDecodeError):
        raise RecoveryError("manifest_unreadable") from None
    if value["migrations"] != migrations(root):
        raise RecoveryError("migration_source_mismatch")
    return value


def assert_cluster(connection, manifest):
    row = connection.execute(
        "select inet_server_addr(), current_database(), session_user, "
        "current_setting('data_directory'), system_identifier::text "
        "from pg_control_system()"
    ).fetchone()
    target = manifest["connection"]
    if row != (
        None,
        target["dbname"],
        target["user"],
        manifest["dataDirectory"],
        manifest["systemIdentifier"],
    ):
        raise RecoveryError("cluster_identity_mismatch")


def connect_manifest(manifest):
    import psycopg

    # A libpq service/host/password environment must not override a reviewed local target.
    local_environment()
    validate_manifest(manifest)
    passfile = Path(manifest["dataDirectory"]) / "unused-rehearsal-password-file"
    if passfile.exists() or passfile.is_symlink():
        raise RecoveryError("unexpected_password_file")
    connection = psycopg.connect(
        **manifest["connection"],
        password="",
        passfile=str(passfile),
        connect_timeout=5,
        options="-c timezone=UTC",
    )
    try:
        assert_cluster(connection, manifest)
        connection.commit()
    except Exception:
        connection.close()
        raise
    return connection


def write_manifest(path, uri, root, owner, account, epoch):
    import psycopg

    local_environment()
    try:
        target = psycopg.conninfo.conninfo_to_dict(uri)
    except psycopg.ProgrammingError:
        raise RecoveryError("connection_uri_invalid") from None
    if not target.keys() <= {"host", "port", "dbname", "user"}:
        raise RecoveryError("connection_fields_invalid")
    connection = {
        name: str(target.get(name, "5432" if name == "port" else ""))
        for name in ("host", "port", "dbname", "user")
    }
    validate_connection(connection)
    passfile = Path(path).with_name("unused-rehearsal-password-file")
    if passfile.exists() or passfile.is_symlink():
        raise RecoveryError("unexpected_password_file")
    with psycopg.connect(
        **connection,
        password="",
        passfile=str(passfile),
        options="-c timezone=UTC",
        connect_timeout=5,
    ) as database:
        directory, identity = database.execute(
            "select current_setting('data_directory'), system_identifier::text "
            "from pg_control_system()"
        ).fetchone()
    value = {
        "version": 1,
        "purpose": "disposable-economy-rehearsal",
        "connection": connection,
        "dataDirectory": directory,
        "systemIdentifier": identity,
        "migrations": migrations(root),
        "islandOwner": str(owner),
        "accountId": str(account),
        "runEpoch": str(epoch),
    }
    validate_manifest(value)
    path = Path(path)
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as stream:
        json.dump(value, stream, indent=2)
    return value
