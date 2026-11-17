#!/usr/bin/env bash
# Deletes every GitHub branch of The Great Plot Twist except main. Run it from a clone on a laptop
# with push rights (the repo owner):
#   bash scripts/cleanup-branches.sh          shows what it would do, changes nothing
#   bash scripts/cleanup-branches.sh --go     does it
# Nothing is lost: a branch that is not merged into main is first saved as the tag archive/<name>.
# To get one back later: git push origin archive/<name>:refs/heads/<name>
# Works with the bash 3.2 that ships with macOS.
set -euo pipefail

GO=0
if [ "${1:-}" = "--go" ]; then GO=1; fi

git fetch origin --prune --quiet

ALL=$(git for-each-ref --format='%(refname:lstrip=3)' refs/remotes/origin | grep -vx 'main' | grep -vx 'HEAD' || true)
UNMERGED=$(git for-each-ref --no-merged origin/main --format='%(refname:lstrip=3)' refs/remotes/origin | grep -vx 'HEAD' || true)

n_all=$(printf '%s\n' "$ALL" | grep -c . || true)
n_unmerged=$(printf '%s\n' "$UNMERGED" | grep -c . || true)
echo "Branches to delete: $n_all (of which $n_unmerged are not merged into main and get an archive tag first)."

if [ "$GO" -ne 1 ]; then
  echo
  echo "Not merged (will be tagged archive/<name>):"
  printf '  %s\n' $UNMERGED
  echo
  echo "Nothing changed. Run again with --go to do it."
  exit 0
fi

if [ "$n_unmerged" -gt 0 ]; then
  echo "Saving $n_unmerged tags ..."
  for b in $UNMERGED; do
    git tag -f "archive/$b" "origin/$b" >/dev/null
  done
  # shellcheck disable=SC2046
  git push origin $(for b in $UNMERGED; do printf 'refs/tags/archive/%s ' "$b"; done)
fi

echo "Deleting $n_all branches on GitHub ..."
# 25 per push, so one bad name cannot block the rest.
printf '%s\n' $ALL | xargs -n 25 git push origin --delete --quiet

git fetch origin --prune --quiet
left=$(git for-each-ref --format='%(refname:lstrip=3)' refs/remotes/origin | grep -vx 'HEAD' | tr '\n' ' ')
echo "Done. Branches left on GitHub: $left"
