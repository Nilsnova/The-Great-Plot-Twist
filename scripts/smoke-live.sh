#!/usr/bin/env bash
# Signed-out deployment checks. See docs/RUNBOOK.md; accepts only public URL/build/flag arguments.
set -euo pipefail
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec node "$script_dir/smoke-live.mjs" "$@"
