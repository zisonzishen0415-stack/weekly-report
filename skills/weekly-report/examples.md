# Examples

## Evidence commands (local)

```bash
START=2026-09-02   # today minus window
git -C <dir> log --since="$START" --pretty='%h|%ad|%an|%s' --date=short
git -C <dir> status --short && git -C <dir> diff --stat
find <dir> -type f -not -path '*/.git/*' -not -path '*/node_modules/*' -newermt "$START"
```

## Evidence commands (remote GitHub, read-only)

```bash
gh repo view owner/repo --json pushedAt,defaultBranchRef      # is it current?
gh api "repos/owner/repo/commits?since=2026-09-02T00:00:00Z&per_page=100" \
  --jq '.[] | "\(.sha[0:8])  \(.commit.author.name)  \(.commit.message | split("\n")[0])"'
gh api "repos/owner/repo/commits/<sha>" -H 'Accept: application/vnd.github.diff'   # full patch
```

## Spoken summary (what a good "一页汇报" reads like)

> - Finished the fabric-replace quality loop — background-leak auto-detection retries with a strict prompt, plus a "keep original texture" toggle.
> - Generated results now auto-register as virtual colors (vcolN) alongside real COLs — idempotent, excluded from primary-photo logic.
> - Catalog editor iteration — per-card resource-kind import, hover-to-playback controls, frame-level cropping.
> - Shipped a competitive research doc on digital lookbook viewers, mapped against our gaps.
> - (Note: covers only pushed, authored-by-me commits on repo X; local uncommitted work on my work machine isn't in this window's evidence.)

## Wrap-up nudge

> Commit or stash once mid-week — next report will be measurably fuller. Pure discussions / discarded directions never leave a trace git can see.
