"""Keep migration versions unique for Supabase's timestamp-based migration ledger.

Used by the normal backend checks; applying SQL filenames alone misses version collisions.
"""

from pathlib import Path


def test_migration_versions_are_unique() -> None:
    migrations = Path(__file__).resolve().parents[3] / "supabase" / "migrations"
    versions: dict[str, str] = {}
    for migration in sorted(migrations.glob("*.sql")):
        version = migration.name.split("_", 1)[0]
        assert version not in versions, (
            f"Duplicate migration version {version}: {versions[version]} and {migration.name}"
        )
        versions[version] = migration.name
