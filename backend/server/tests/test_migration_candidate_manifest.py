"""Keep the review candidate bound to exact repository migration bytes."""

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
# Independent endpoint: removing the last manifest row must not shrink its range.
LAST_PINNED_VERSION = "20261119014418"


def test_candidate_manifest_contains_every_migration_with_exact_hashes():
    manifest = json.loads((ROOT / "docs/economy/migration-candidate-20261119.json").read_text())
    paths = [
        path for path in sorted((ROOT / "supabase/migrations").glob("*.sql"))
        if path.name.split("_", 1)[0] <= LAST_PINNED_VERSION
    ]
    assert [row["path"] for row in manifest["migrations"]] == [
        path.relative_to(ROOT).as_posix() for path in paths
    ]
    for path, row in zip(paths, manifest["migrations"], strict=True):
        content = path.read_bytes()
        assert row["version"] == path.name.split("_", 1)[0]
        assert row["md5"] == hashlib.md5(content).hexdigest()
        assert row["sha256"] == hashlib.sha256(content).hexdigest()
