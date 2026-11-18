"""Disposable local PostgreSQL only; no configured database or credentials are read."""

from server.tests.case_sql.conftest import database, scratch_server

__all__ = ["database", "scratch_server"]
