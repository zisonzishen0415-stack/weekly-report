#!/usr/bin/env bash
# Fixture: one-commit-packs-many-features (puttyon 687e26d6 shape)
# A single feat() commit touching files across 3 unrelated features.
# Dates are computed relative to "now" so the fixture never rots.
set -euo pipefail
cd "$(dirname "$0")"

# --- helpers: UTC timestamp "N days ago" (matches evidence.mjs's Z comparisons) ---
ago() { node -e "console.log(new Date(Date.now()-$1*864e5).toISOString().slice(0,19))"; }
commit_at() { # $1=daysAgo  $2=message
  local d; d=$(ago "$1")
  GIT_AUTHOR_DATE="$d" GIT_COMMITTER_DATE="$d" \
    git -c user.name="Dev A" -c user.email="a@x.com" commit -qm "$2"
}

rm -rf .repo && mkdir -p .repo && cd .repo
git init -q -b main

# --- baseline ~3 weeks ago (outside a 7-day window) ---
mkdir -p backend
cat > backend/Controller.java <<'EOF'
package demo;
public class Controller { }
EOF
git add -A
commit_at 21 "chore: baseline"

# --- THE big commit (~3 days ago): 3 unrelated features in ONE commit ---
cat > backend/LeakDetector.java <<'EOF'
package demo;
public class LeakDetector {
  // compares 8 corner windows; leakCount>=2 => background leak
  public boolean hasLeak(byte[] a, byte[] b) { return true; }
}
EOF
cat > backend/Option.java <<'EOF'
package demo;
public class Option { public boolean keepTexture; }
EOF
mkdir -p frontend
cat > frontend/Carousel.tsx <<'EOF'
export const Carousel = () => null; // hoverOnly playback
EOF
cat > frontend/types.ts <<'EOF'
export interface Play { hoverOnly?: boolean; }
EOF
git add -A
commit_at 3 "feat(replace): quality loop + carousel hover — leak-detect retry(BG_STRICT), keep_texture keep original texture option, plus carousel hover-only playback & type defs"

# --- noise in window (~2 days ago): regenerated data snapshot ---
mkdir -p public
node -e "require('fs').writeFileSync('public/git-log.json', JSON.stringify(Array.from({length:4000},(_,i)=>({i})),null,0))"
git add -A
commit_at 2 "chore: regenerate git-log.json snapshot"

# --- a real separate feature (~1 day ago) ---
mkdir -p src
cat > src/vcol.ts <<'EOF'
export const registerVcol = () => {}; // idempotent virtual-color registration
EOF
git add -A
commit_at 1 "feat(vcol): register replace output as virtual color"

# --- rename noise (not a separate feature) ---
git mv backend/Option.java backend/TextureToggle.java
commit_at 0 "refactor: rename Option to TextureToggle"

cd ..
echo "fixture built"
