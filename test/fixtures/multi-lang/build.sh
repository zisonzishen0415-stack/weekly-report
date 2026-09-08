#!/usr/bin/env bash
# Fixture: code-atom extraction across language families (go / rust / cs / php / ruby / css / sql)
# One window commit adds the same "search" feature in each language; one commit adds
# regenerated noise (minified bundle + lockfile). Also exercises the single-git-pass
# numstat/diff paths (atom + line counts must still be right with ONE pass per repo/commit).
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

# --- baseline: outside the 7-day window ---
cat > README.md <<'EOF'
# search demo
EOF
git add -A
commit_at 21 "chore: baseline"

# --- the feature commit (~3 days ago): the same search feature, 7 languages ---
mkdir -p internal/search src Services app lib assets migrations
cat > internal/search/service.go <<'EOF'
package search

const MaxTopResults = 50

type Engine struct {
	MaxHits int
}

type Option func(*Engine)

func New(opts ...Option) *Engine {
	return &Engine{}
}

func (e *Engine) Search(q Query) []Hit {
	return nil
}
EOF
cat > src/lib.rs <<'EOF'
pub const MAX_SCORE: f32 = 1.0;

pub fn score(h: &Hit) -> f32 {
	0.0
}

pub struct Hit {
	pub id: u64,
}

pub enum Mode {
	Fast,
	Precise,
}

pub trait Scorer {
	fn score(&self) -> f32;
}
EOF
cat > Services/SearchController.cs <<'EOF'
using Microsoft.AspNetCore.Mvc;

namespace Demo.Services;

public class SearchController : ControllerBase
{
	[HttpPost("api/search")]
	public async Task<IActionResult> SearchAsync([FromBody] Query q)
	{
		return Ok(null);
	}
}
EOF
cat > app/SearchService.php <<'EOF'
<?php

class SearchService
{
	public function query(string $q): array
	{
		return [];
	}
}
EOF
cat > lib/search.rb <<'EOF'
class Search
  def query(q)
    q
  end
end
EOF
cat > assets/search.css <<'EOF'
.result-card {
  border: 1px solid #ccc;
}
#search-box {
  min-height: 40px;
}
EOF
cat > migrations/001_add_virtual.sql <<'EOF'
CREATE TABLE IF NOT EXISTS assets (
    id BIGINT
);

ALTER TABLE assets
ADD COLUMN is_virtual TINYINT;
EOF
git add -A
commit_at 3 "feat(search): 多语言检索实现（go/rust/c#/php/ruby/css/sql）"

# --- noise in window (~1 day ago): regenerated machine churn ---
mkdir -p dist
node -e "require('fs').writeFileSync('dist/bundle.min.js', 'var a=' + Array(2000).fill('x').join('+') + ';')"
node -e "require('fs').writeFileSync('package-lock.json', JSON.stringify({name:'x',version:'1'},null,2))"
git add -A
commit_at 1 "chore: regenerate dist + lockfile"

cd ..
echo "fixture built"
