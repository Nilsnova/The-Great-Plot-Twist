"""Supabase identifies a migration by its timestamp, independent of its file suffix."""

from collections import defaultdict
from pathlib import Path


def test_supabase_migration_versions_are_unique():
    migrations = Path(__file__).resolve().parents[3] / "supabase" / "migrations"
    versions = defaultdict(list)
    for path in sorted(migrations.glob("*.sql")):
        versions[path.name.split("_", 1)[0]].append(path.name)
    duplicates = {version: names for version, names in versions.items() if len(names) > 1}
    assert not duplicates, f"Supabase migration versions must be unique: {duplicates}"
