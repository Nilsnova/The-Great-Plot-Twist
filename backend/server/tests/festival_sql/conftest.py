"""Reuse the private Unix-socket full-chain PostgreSQL fixture; never read credentials."""

from server.tests.case_sql.conftest import database, scratch_server

__all__ = ["database", "scratch_server"]
