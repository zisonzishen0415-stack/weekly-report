#!/usr/bin/env bash
# Demo: run the weekly-report skill's evidence flow against a git repo.
#
# Usage:
#   bash scripts/demo.sh /path/to/repo [--days N] [--author you@example.com]
#
# Prints the raw evidence the skill would gather, plus a skeleton of the
# report it would write. This is a *preview of the evidence sources*, not a
# substitute for running the skill itself (the skill clusters and writes
# the final report).
set -euo pipefail

REPO="${1:?usage: bash scripts/demo.sh /path/to/repo [--days N]}"
shift || true
DAYS=7
AUTHOR_FILTER=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --days) DAYS="$2"; shift 2 ;;
    --author) AUTHOR_FILTER="--author=$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

START=$(date -d "$DAYS days ago" +%F 2>/dev/null || date -v-"$DAYS"d +%F 2>/dev/null || date +%F)
SINCE="$START 00:00:00"

echo "=== demo: weekly-report evidence flow ==="
echo "repo:    $REPO"
echo "window:  last $DAYS days (since $SINCE)"
echo

echo "── 1) Commit history since $SINCE ─────────────────────────"
if git -C "$REPO" rev-parse --git-dir >/dev/null 2>&1; then
  git -C "$REPO" log --since="$SINCE" ${AUTHOR_FILTER:+"$AUTHOR_FILTER"} \
    --pretty='%h | %ad | %an | %s' --date=short || true
  echo "-- (last commit overall) --"
  git -C "$REPO" log -1 --pretty='%h | %ad | %an | %s' --date=short || true
else
  echo "(not a git repo — skipping commit history)"
fi
echo

echo "── 2) Uncommitted changes ─────────────────────────────────"
git -C "$REPO" status --short 2>/dev/null | head -30 || true
git -C "$REPO" diff --stat 2>/dev/null | tail -5 || true
echo

echo "── 3) Files modified since $START ────────────────────────"
find "$REPO" -type f \
  -not -path '*/.git/*' \
  -not -path '*/node_modules/*' \
  -not -path '*/target/*' \
  -not -path '*/dist/*' \
  -newermt "$START" 2>/dev/null | sort | head -50 || true
echo

echo "── 4) Next step ──────────────────────────────────────────"
echo "In Claude Code, run the skill itself to cluster this evidence by"
echo "feature and write the report + spoken summary:"
echo "    weekly report from $REPO, last $DAYS days"
