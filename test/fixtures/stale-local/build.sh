#!/usr/bin/env bash
# Fixture: remote-authoritative (puttyon reality)
# The LOCAL clone is stale — last commit months ago. Skill must detect staleness
# and route to remote evidence rather than report the stale local as "this week".
# Dates are relative to "now" so the fixture never rots.
set -euo pipefail
cd "$(dirname "$0")"
ago() { node -e "console.log(new Date(Date.now()-$1*864e5).toISOString().slice(0,19))"; }

rm -rf .repo && mkdir -p .repo && cd .repo
git init -q -b main

cat > app.py <<'EOF'
print("hello")
EOF
git add -A
# Stale local commit: 120 days ago
d=$(ago 120)
GIT_AUTHOR_DATE="$d" GIT_COMMITTER_DATE="$d" \
  git -c user.name="Me" -c user.email="me@x.com" commit -qm "feat: initial"
cd ..
echo "fixture built (local clone is stale by design)"
