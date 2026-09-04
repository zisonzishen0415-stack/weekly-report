#!/usr/bin/env bash
# Fixture: empty-window (honesty)
# No commits, clean worktree in the window. Skill must say "nothing this week",
# not pad with the old commit. Dates relative to "now" so it never rots.
set -euo pipefail
cd "$(dirname "$0")"
ago() { node -e "console.log(new Date(Date.now()-$1*864e5).toISOString().slice(0,19))"; }

rm -rf .repo && mkdir -p .repo && cd .repo
git init -q -b main
cat > stable.js <<'EOF'
export const x = 1; // untouched for months
EOF
git add -A
d=$(ago 10)   # recent-but-outside a 7-day window: repo is alive, just quiet this week
GIT_AUTHOR_DATE="$d" GIT_COMMITTER_DATE="$d" \
  git -c user.name="Me" -c user.email="me@x.com" commit -qm "feat: stable module"
cd ..
echo "fixture built"
