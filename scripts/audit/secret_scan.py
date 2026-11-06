#!/usr/bin/env python3
"""Scan only the committed branch diff. Success produces no output; redact findings."""

import re
import subprocess
import sys

PATTERNS = (
    r"sb_secret_[A-Za-z0-9_-]{20,}",
    r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.",
    r"(?:SECRET|SERVICE_ROLE)[A-Z_]*=[^\s]+",
    r"(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})",
    r"(?:npm_[A-Za-z0-9]{30,}|pypi-[A-Za-z0-9_-]{40,})",
    r"AKIA[0-9A-Z]{16}",
    r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
)


def main():
    diff = subprocess.check_output(
        ["git", "diff", "--no-ext-diff", "--no-textconv", "origin/main...HEAD"], text=True
    )
    matches = []
    for number, line in enumerate(diff.splitlines(), 1):
        if any(re.search(pattern, line) for pattern in PATTERNS):
            matches.append(number)
    if matches:
        print(f"Potential secret in diff at line(s) {matches}; content redacted", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
