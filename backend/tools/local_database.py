"""Disposable Unix-socket PostgreSQL. Optional packages are imported only after startup guards."""

import tempfile
from pathlib import Path

from tools.local_players import PLAYERS

MIGRATIONS = Path(__file__).resolve().parents[2] / "supabase" / "migrations"
BOOTSTRAP = Path(__file__).with_name("local_bootstrap.sql")


class ScratchDatabase:
    def __init__(self):
        self.directory = None
        self.server_context = None
        self.uri = None

    def start(self):
        import pgserver
        import psycopg

        self.directory = tempfile.TemporaryDirectory(prefix="plot-twist-local-")
        try:
            data = Path(self.directory.name) / "data"
            self.server_context = pgserver.get_server(data, cleanup_mode="delete")
            server = self.server_context.__enter__()
            self.uri = server.get_uri()
            host = psycopg.conninfo.conninfo_to_dict(self.uri).get("host", "")
            if not host.startswith("/"):
                raise RuntimeError("Local PostgreSQL must use a Unix socket.")
            with self.connect() as connection:
                connection.execute(BOOTSTRAP.read_text())
                # The real sorted chain, twice: tool startup also checks replay safety.
                migrations = sorted(MIGRATIONS.glob("*.sql"))
                if not migrations:
                    raise RuntimeError("No local migrations found.")
                for _ in range(2):
                    for migration in migrations:
                        connection.execute(migration.read_text())
                for player in PLAYERS:
                    # The real auth trigger creates the profile, wallet and save.
                    connection.execute("insert into auth.users(id) values (%s)", (player.id,))
        except BaseException:
            self.close()
            raise

    def connect(self):
        import psycopg

        if self.uri is None:
            raise RuntimeError("The scratch database is not running.")
        return psycopg.connect(self.uri)

    def player_exists(self, player_id: str) -> bool:
        with self.connect() as connection:
            return connection.execute(
                "select exists(select 1 from auth.users where id = %s)", (player_id,)
            ).fetchone()[0]

    def close(self):
        try:
            if self.server_context is not None:
                self.server_context.__exit__(None, None, None)
        finally:
            self.server_context = None
            self.uri = None
            if self.directory is not None:
                self.directory.cleanup()
                self.directory = None
