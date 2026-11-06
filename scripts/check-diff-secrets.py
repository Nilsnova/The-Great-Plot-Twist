"""Scan only the committed G16 diff. Run with uv run --no-project --with detect-secrets.

No repository settings, environment files, credentials, or outside services are read.
"""

import subprocess
import tempfile

from detect_secrets import SecretsCollection
from detect_secrets.settings import default_settings

diff = subprocess.run(
    ["git", "diff", "--no-ext-diff", "origin/main...HEAD"],
    check=True, capture_output=True, text=True,
).stdout
with tempfile.NamedTemporaryFile(mode="w", suffix=".diff") as file:
    file.write(diff)
    file.flush()
    with default_settings():
        findings = SecretsCollection()
        findings.scan_file(file.name)
count = sum(len(entries) for entries in findings.json().values())
print(f"Secret scan of git diff origin/main...HEAD: {count} findings")
raise SystemExit(bool(count))
