"""Manifest-bound local operator CLI and populated backup/restore rehearsal.

This command refuses hosted/TCP targets and never reads a configured database URL or .env.
"""

from __future__ import annotations

import argparse
import json
import re
from collections.abc import Sequence
from decimal import Decimal
from pathlib import Path
from typing import Any

from tools.economy.recovery_manifest import RecoveryError, connect_manifest, read_manifest
from tools.economy.recovery_snapshot import reconcile

ROOT = Path(__file__).resolve().parents[3]


def operator(
    manifest_path: str | Path,
    action: str,
    uid: str | None = None,
    revision: str | int | None = None,
) -> dict[str, Any]:
    manifest = read_manifest(manifest_path, ROOT)
    with connect_manifest(manifest) as connection:
        connection.execute("set local lock_timeout='2s'")
        connection.execute("set local statement_timeout='15s'")
        connection.execute("set local role service_role")
        if action == "context":
            return connection.execute(
                "select public.island_economy_operator_context(%s)", (manifest["islandOwner"],)
            ).fetchone()[0]
        if action not in ("pause", "resume") or not uid or revision is None:
            raise RecoveryError("control_arguments_required")
        if not re.fullmatch(r"0|[1-9][0-9]*", str(revision)):
            raise RecoveryError("control_revision_invalid")
        before, target = ("active", "paused") if action == "pause" else ("paused", "active")
        arguments = (
            uid,
            manifest["islandOwner"],
            manifest["accountId"],
            manifest["runEpoch"],
            Decimal(revision),
            before,
            target,
        )
        return connection.execute(
            "select public.island_economy_set_offers(%s,%s,%s,%s,%s,%s,%s)", arguments
        ).fetchone()[0]


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    rehearsal = commands.add_parser("rehearse", help="create disposable populated clusters only")
    rehearsal.add_argument("--output", type=Path, required=True)
    for name in ("context", "pause", "resume", "verify"):
        command = commands.add_parser(name)
        command.add_argument("--manifest", type=Path, required=True)
        if name in ("pause", "resume"):
            command.add_argument("--uid", required=True)
            command.add_argument("--expected-revision", required=True)
    args = parser.parse_args(argv)
    try:
        if args.command == "rehearse":
            from tools.economy.recovery_rehearsal import rehearse

            result = rehearse(args.output)
        elif args.command == "verify":
            with connect_manifest(read_manifest(args.manifest, ROOT)) as connection:
                result = reconcile(connection)
        else:
            result = operator(
                args.manifest,
                args.command,
                getattr(args, "uid", None),
                getattr(args, "expected_revision", None),
            )
        print(json.dumps(result, sort_keys=True))
        return 0 if result.get("status") != "refused" else 1
    except RecoveryError as error:
        print(json.dumps({"status": "refused", "reason": str(error)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
