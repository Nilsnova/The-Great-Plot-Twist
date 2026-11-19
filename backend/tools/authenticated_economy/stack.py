"""Start official local provider services and install only this checkout's migrations."""

import argparse
import base64
import hashlib
import json
import os
import socket
import ssl
import subprocess
import time
import urllib.error
import urllib.request
from http.client import HTTPException
from pathlib import Path

from tools.authenticated_economy.config import create, private_json

ROOT = Path(__file__).resolve().parents[3]
REALTIME_TENANT_VERSION = 20261009120000  # Latest actual tenant migration in v2.148.3.


def compose(runtime: dict, *arguments: str) -> str:
    result = subprocess.run(
        [
            "docker",
            "compose",
            "-p",
            runtime["project"],
            "-f",
            str(Path(runtime["directory"]) / "compose.json"),
            *arguments,
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout


def sql(runtime: dict, statement: str) -> str:
    container = compose(runtime, "ps", "-q", "db").strip()
    result = subprocess.run(
        [
            "docker",
            "exec",
            "-i",
            container,
            "psql",
            "-X",
            "-q",
            "-v",
            "ON_ERROR_STOP=1",
            "-U",
            "postgres",
            "-d",
            "postgres",
            "-t",
            "-A",
        ],
        input=statement,
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


def wait_database(runtime: dict) -> None:
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        try:
            if sql(runtime, "select 1") == "1":
                return
        except subprocess.CalledProcessError:
            pass
        time.sleep(0.5)
    raise RuntimeError("Disposable PostgreSQL did not become ready within 90 seconds")


def wait_http(url: str, *, headers: dict | None = None, cafile: str | None = None) -> None:
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        try:
            context = ssl.create_default_context(cafile=cafile)
            opener = urllib.request.build_opener(
                urllib.request.ProxyHandler({}), urllib.request.HTTPSHandler(context=context)
            )
            with opener.open(
                urllib.request.Request(url, headers=headers or {}), timeout=2
            ) as response:
                if response.status == 200:
                    return
        except (urllib.error.URLError, TimeoutError, OSError, HTTPException):
            pass
        time.sleep(0.5)
    raise RuntimeError("Local provider health endpoint did not become ready: " + url)


def realtime_ready(runtime: dict) -> bool:
    if not sql(runtime, "select to_regclass('realtime.schema_migrations')::text"):
        return False
    return sql(
        runtime,
        f"select coalesce(max(version),0)>={REALTIME_TENANT_VERSION} "
        "and exists(select 1 from pg_inherits "
        "where inhparent=to_regclass('realtime.messages')) from realtime.schema_migrations",
    ) == "t"


def up(runtime: dict) -> None:
    compose(runtime, "up", "-d", "db")
    wait_database(runtime)
    sql(runtime, Path(__file__).with_name("provider_roles.sql").read_text())
    # This password was generated locally from URL-safe characters by config.py.
    password = runtime["databasePassword"]
    statements = [
        f"alter user {role} with password '{password}'"
        for role in ("authenticator", "supabase_auth_admin", "supabase_admin")
    ]
    statements += [
        "create schema if not exists _realtime authorization supabase_admin",
        "grant anon, authenticated, service_role to authenticator",
    ]
    sql(runtime, ";\n".join(statements) + ";")
    compose(runtime, "up", "-d", "auth", "rest", "realtime", "gateway")
    compose(runtime, "restart", "gateway")
    container = compose(runtime, "ps", "-q", "gateway").strip()
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        copied = subprocess.run(
            [
                "docker",
                "cp",
                container + ":/data/caddy/pki/authorities/local/root.crt",
                runtime["caFile"],
            ],
            capture_output=True,
            text=True,
        )
        if copied.returncode == 0:
            break
        time.sleep(0.5)
    wait_http(runtime["providerUrl"] + "/auth/v1/health", cafile=runtime["caFile"])
    context = ssl.create_default_context(cafile=runtime["caFile"])
    with socket.create_connection(("localhost", 54421), timeout=3) as connection:
        with context.wrap_socket(connection, server_hostname="localhost") as secure:
            certificate = ssl.DER_cert_to_PEM_cert(secure.getpeercert(binary_form=True))
    public = subprocess.run(
        ["openssl", "x509", "-pubkey", "-noout"],
        input=certificate,
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    binary = subprocess.run(
        ["openssl", "pkey", "-pubin", "-outform", "DER"],
        input=public.encode(),
        capture_output=True,
        check=True,
    ).stdout
    runtime["certificateSpki"] = base64.b64encode(hashlib.sha256(binary).digest()).decode()
    private_json(Path(runtime["directory"]) / "runtime.json", runtime)
    wait_http("http://127.0.0.1:54424/")
    wait_http(
        "http://127.0.0.1:54425/api/tenants/realtime-dev/health",
        headers={"Authorization": "Bearer " + runtime["anonKey"]},
    )
    if not realtime_ready(runtime):
        subprocess.run(
            [
                "node",
                "scripts/authenticated-economy/bootstrap-realtime.mjs",
                str(Path(runtime["directory"]) / "runtime.json"),
            ],
            cwd=ROOT / "frontend",
            check=True,
            env={"PATH": os.environ["PATH"], "NODE_EXTRA_CA_CERTS": runtime["caFile"]},
        )
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            if realtime_ready(runtime):
                break
            time.sleep(0.5)
        else:
            raise RuntimeError("The actual Realtime tenant migrations/partitions are incomplete")


def migrate(runtime: dict) -> dict:
    files = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
    for path in files:
        sql(runtime, path.read_text())
    sql(runtime, "notify pgrst, 'reload schema';")
    evidence = {
        "migrationCount": len(files),
        "files": [
            {"name": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
            for path in files
        ],
    }
    private_json(Path(runtime["directory"]) / "migrations.json", evidence)
    return evidence


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("init", "up", "migrate", "status", "down"))
    parser.add_argument("--directory", type=Path, default=Path("/tmp/mp505-provider"))
    args = parser.parse_args()
    runtime = create(args.directory)
    if args.action == "up":
        up(runtime)
    elif args.action == "migrate":
        migrate(runtime)
    elif args.action == "down":
        compose(runtime, "down", "--volumes", "--remove-orphans")
    elif args.action == "status":
        print(compose(runtime, "ps", "--format", "json"))
        return
    print(
        json.dumps(
            {
                "action": args.action,
                "status": "completed",
                "privateRuntime": str(args.directory / "runtime.json"),
            }
        )
    )


if __name__ == "__main__":
    main()
