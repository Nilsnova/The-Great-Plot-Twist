"""Keep the archived and current review candidates bound to exact migration bytes."""

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
# Independent endpoints stop removing the last manifest row from shrinking either range.
ARCHIVED_END = "20261119014418"
CURRENT_END = "20261119144620"
REPOSITORY_ADDITIONS_AFTER_ARCHIVE = {
    "20261118080000_recovery_finish_checkpoint_guard.sql",
    "20261118090000_normal_wall_build_clearance.sql",
}


def check_candidate(date: str, end: str, excluded: frozenset[str] = frozenset()) -> None:
    manifest = json.loads((ROOT / f"docs/economy/migration-candidate-{date}.json").read_text())
    paths = [
        path
        for path in sorted((ROOT / "supabase/migrations").glob("*.sql"))
        if path.name.split("_", 1)[0] <= end and path.name not in excluded
    ]
    assert [row["path"] for row in manifest["migrations"]] == [
        path.relative_to(ROOT).as_posix() for path in paths
    ]
    for path, row in zip(paths, manifest["migrations"], strict=True):
        content = path.read_bytes()
        assert row["version"] == path.name.split("_", 1)[0]
        assert row["md5"] == hashlib.md5(content).hexdigest()
        assert row["sha256"] == hashlib.sha256(content).hexdigest()


def test_archived_candidate_preserves_its_original_migration_inventory_and_hashes():
    check_candidate("20261119", ARCHIVED_END, frozenset(REPOSITORY_ADDITIONS_AFTER_ARCHIVE))


def test_current_candidate_contains_every_migration_with_exact_hashes():
    check_candidate("20261121", CURRENT_END)
