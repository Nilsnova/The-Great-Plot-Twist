#!/usr/bin/env bash
# Checks a disposable checkout. Used by release owners, without editing the caller's checkout.
# Usage: bash scripts/fresh-clone-check.sh [repository-url-or-path] [branch-or-tag]
# Only clone, uv sync and npm ci download; checks use installed local tools.
set -uo pipefail

repository=${1:-https://github.com/Nilsnova/The-Great-Plot-Twist.git}
revision=${2:-main}
failures=0
scratch=$(mktemp -d "${TMPDIR:-/tmp}/plot-twist-fresh.XXXXXXXX") || exit 1
checkout="$scratch/repo"

finish() {
  if [ "$failures" -eq 0 ]; then
    rm -rf -- "$scratch"
  else
    printf 'Logs retained at %s\n' "$scratch" >&2
  fi
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

step() {
  local label=$1
  shift
  if "$@" >"$scratch/$label.log" 2>&1; then
    printf 'PASS %s\n' "$label"
    return 0
  fi
  printf 'FAIL %s\n' "$label"
  failures=$((failures + 1))
  return 1
}

blocked() {
  printf 'FAIL %s (prerequisite failed)\n' "$1"
  failures=$((failures + 1))
}

if step clone git clone --quiet --depth 1 --single-branch --branch "$revision" -- "$repository" "$checkout"; then
  if step backend-install bash -c 'cd "$1/backend" && uv sync --locked' _ "$checkout"; then
    step backend-tests bash -c 'cd "$1/backend" && .venv/bin/python -m pytest -q --tb=no' _ "$checkout" || :
    step backend-ruff bash -c 'cd "$1/backend" && .venv/bin/ruff check .' _ "$checkout" || :
  else
    blocked backend-tests
    blocked backend-ruff
  fi
  if step frontend-install bash -c 'cd "$1/frontend" && npm ci --no-audit --no-fund' _ "$checkout"; then
    step frontend-tests bash -c 'cd "$1/frontend" && npm_config_offline=true npm test' _ "$checkout" || :
    if step frontend-build bash -c 'cd "$1/frontend" && npm_config_offline=true npm run build' _ "$checkout"; then
      step spoiler-guard bash -c 'cd "$1/frontend" && node scripts/check-spoilers.js' _ "$checkout" || :
    else
      blocked spoiler-guard
    fi
  else
    blocked frontend-tests
    blocked frontend-build
    blocked spoiler-guard
  fi
else
  for label in backend-install backend-tests backend-ruff frontend-install frontend-tests frontend-build spoiler-guard; do
    blocked "$label"
  done
fi

exit "$failures"
