"""Disposable local SQL only; no deployment credentials or configured database."""

from server.tests.case_sql.conftest import database, scratch_server

__all__ = ["database", "scratch_server"]
