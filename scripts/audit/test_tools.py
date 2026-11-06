"""Focused audit-tool boundaries: frozen source locks and redacted secret diagnostics.

Run with unittest discovery; uses a temporary fixture tree and no network or application data.
"""

import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import inventory
import secret_scan


class InventoryTests(unittest.TestCase):
    def generate(self, root, *, mismatch=False):
        npm = {"packages": {"": {"dependencies": {"example": "1"}}}}
        uv = {"package": [{"name": "the-great-plot-twist", "dependencies": []}]}
        rows = [("npm", "example", "1.0.0", {})]
        metadata = {"npm:example@1.0.0": {"url": "https://example.invalid", "license": "MIT"}}
        for file in ("frontend/package-lock.json", "backend/uv.lock"):
            path = root / file
            path.parent.mkdir(exist_ok=True)
            path.write_bytes(b"frozen")

        def git(args, **kwargs):
            if args[1] == "rev-parse":
                self.assertEqual(args[2], "reviewed-ref")
                return "frozen-commit\n"
            self.assertTrue(args[2].startswith("frozen-commit:"))
            return b"different" if mismatch else b"frozen"

        with patch.object(inventory, "ROOT", root), patch.object(inventory, "OUT", root):
            with patch.object(inventory.subprocess, "check_output", side_effect=git):
                with contextlib.redirect_stdout(io.StringIO()):
                    inventory.generate(npm, uv, rows, metadata, "reviewed-ref")

    def test_records_requested_source_instead_of_unrelated_remote_head(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.generate(root)
            bom = json.loads((root / "sbom.cdx.json").read_text())
            self.assertEqual(bom["metadata"]["component"]["version"], "frozen-commit")
            self.assertEqual(len(bom["components"]), 1)

    def test_refuses_changed_locks_before_writing_receipt(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaisesRegex(ValueError, "Lockfile differs"):
                self.generate(root, mismatch=True)
            self.assertFalse((root / "sbom.cdx.json").exists())


class SecretScanTests(unittest.TestCase):
    def scan(self, diff):
        stdout, stderr = io.StringIO(), io.StringIO()
        with patch.object(secret_scan.subprocess, "check_output", return_value=diff):
            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                status = secret_scan.main()
        return status, stdout.getvalue(), stderr.getvalue()

    def test_clean_diff_is_silent(self):
        self.assertEqual(self.scan("+A reviewed ordinary sentence.\n"), (0, "", ""))

    def test_synthetic_secret_is_rejected_without_printing_value(self):
        synthetic = "sb_" + "secret_" + "x" * 30
        status, stdout, stderr = self.scan("+" + synthetic + "\n")
        self.assertEqual(status, 1)
        self.assertEqual(stdout, "")
        self.assertIn("content redacted", stderr)
        self.assertNotIn(synthetic, stderr)


if __name__ == "__main__":
    unittest.main()
