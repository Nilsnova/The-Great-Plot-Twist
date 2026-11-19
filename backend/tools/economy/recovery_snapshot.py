"""Consistent whole-database row fingerprints and exact treasury reconciliation.

Used only by the isolated recovery tool; reports contain hashes/counts, never raw player rows.
"""

from __future__ import annotations

import hashlib
from typing import TYPE_CHECKING, Any

from tools.economy.recovery_manifest import RecoveryError, digest

if TYPE_CHECKING:
    from psycopg import Connection


def snapshot(connection: Connection[Any]) -> dict[str, Any]:
    from psycopg import sql

    tables = connection.execute(
        "select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace "
        "where c.relkind='r' and n.nspname not in ('pg_catalog','information_schema') "
        "and n.nspname not like 'pg_toast%' and n.nspname not like 'pg_temp%' "
        "order by n.nspname,c.relname"
    ).fetchall()
    result = {}
    for schema, name in tables:
        checksum, count = hashlib.sha256(), 0
        query = sql.SQL(
            'select row_to_json(t)::text from {}.{} t order by row_to_json(t)::text collate "C"'
        ).format(sql.Identifier(schema), sql.Identifier(name))
        for (row,) in connection.execute(query):
            checksum.update(row.encode())
            checksum.update(b"\n")
            count += 1
        result[f"{schema}.{name}"] = {"count": count, "sha256": checksum.hexdigest()}
    definitions = connection.execute(
        "select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),"
        "pg_get_functiondef(p.oid),p.prosecdef,p.proconfig "
        "from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
        "where n.nspname not in ('pg_catalog','information_schema') "
        "and p.prokind in ('f','p') order by n.nspname,p.proname,"
        "pg_get_function_identity_arguments(p.oid)"
    ).fetchall()
    return {"tables": result, "functionDigest": digest(definitions), "digest": digest(result)}


def protected_state(connection: Connection[Any]) -> dict[str, Any]:
    state = snapshot(connection)
    return {
        name: value
        for name, value in state["tables"].items()
        if name
        in {
            "public.wallets",
            "public.wallet_transactions",
            "public.islands",
            "public.islet_buildings",
            "public.arsenal_copies",
        }
        or name.startswith("public.personal_captain_")
    }


def reconcile(connection: Connection[Any]) -> dict[str, Any]:
    invalid = connection.execute("""
      select count(*) from public.island_economy_accounts a where
        a.balance_coins<>(select coalesce(sum(t.balance_delta),0)
          from public.island_treasury_transactions t where t.account_id=a.id)
        or a.committed_coins<>(select coalesce(sum(t.committed_delta),0)
          from public.island_treasury_transactions t where t.account_id=a.id)
        or a.revision<>(select count(*) from public.island_treasury_transactions t
          where t.account_id=a.id)
        or a.committed_coins<>(select coalesce(sum(r.committed_delta),0)
          from public.island_treasury_transactions r where r.account_id=a.id and r.kind='reserve'
          and not exists(select 1 from public.island_treasury_transactions s
            where s.source_reservation_id=r.id))
    """).fetchone()[0]
    if invalid:
        raise RecoveryError("treasury_reconciliation_failed")
    return {
        "accounts": connection.execute(
            "select count(*) from public.island_economy_accounts"
        ).fetchone()[0],
        "ledgerReconciles": True,
    }


def verify_restore(connection: Connection[Any], expected: dict[str, Any]) -> dict[str, Any]:
    observed = snapshot(connection)
    if observed != expected:
        raise RecoveryError("restore_snapshot_mismatch")
    reconcile(connection)
    return {
        "snapshotMatches": True,
        "digest": observed["digest"],
        "tables": len(observed["tables"]),
    }
