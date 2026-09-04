---
name: weekly-report
description: >-
  Reconstruct what you did over a recent period (default: last 7 days) from
  CODE EVIDENCE — git history, uncommitted changes, recently touched files,
  and generated artifacts — cluster it by FEATURE (not by commit), and write
  an archiveable dated report plus a short spoken summary you can read aloud
  in a stand-up. Handles repos hosted anywhere (local, or another owner's
  GitHub repo you can read via `gh`). Trigger when the user says things like
  "周报", "工作总结", "weekly report", "what did I do this week", "帮我整理这段时间的成果".
---

# weekly-report — code-work weekly report

Rebuild a truthful, human-readable summary of recent work **from the code**, not from memory. Produce **two** deliverables:

1. An **archiveable dated report** (Markdown) — written to disk.
2. A **short spoken summary** (3–5 lines, user-voice) — printed in your final reply.

If the evidence shows nothing happened in the window, **say so honestly**. Never invent work, never pad with old commits.

---

## Step 0 — Establish the facts before gathering

Ask / confirm, then record:

- **Directories** to scan. If the user gives none, ask which projects are in scope (keep it to the ones they actually worked in).
- **Time window** — default **last 7 days** (from today, backwards). Accept `近 N 天` / `last N days` / `上周` / explicit dates.
- **Where the code actually lives.** Critical: do NOT assume the local folder is current.
  - This skill ships a deterministic collector `evidence.mjs` next to this file — use it for the local case (Step 1a).
  - If the local clone is stale (its last commit predates the window significantly), **the real work may live on a remote** — a teammate's repo, CI, a work PC. Route to remote evidence (Step 1b) instead of reporting a stale clone as "this week". If the user says "my real work is on my other machine / pushed to a teammate's repo", trust that over the local folder.

---

## Step 1 — Gather evidence (believe the code, not the memory)

### 1a. Local evidence — run the collector (deterministic)

If `scripts/evidence.mjs` is available next to this skill, use it — it returns JSON with the window's commits, changed files, renames and regenerated noise, computed the same way every run:

```bash
node <skill-dir>/evidence.mjs <dir> --days <N> [--author "<name or email>"]
```

`<skill-dir>` is the folder containing this `SKILL.md` (this skill ships `evidence.mjs` next to it). If the collector is absent, fall back to:

```bash
git -C <dir> log --since='<YYYY-MM-DD>' --pretty='%h|%ad|%an|%s' --date=short
git -C <dir> log -1 --pretty='%h|%ad|%s' --date=short          # last commit date (staleness)
git -C <dir> status --short && git -C <dir> diff --stat         # uncommitted work
```

The collector's `summary.changedFileSet` is your **ground truth file list** — cluster those. Respect its `noiseFileSet` / `renames` (data-regeneration snapshots, build output, pure renames are NOT features). mtime of files is NOT reliable work evidence (checkout/copy touches it) — trust git, not `find -newermt`, for what changed.

### 1b. Remote GitHub evidence (use when the local clone is stale / repo is elsewhere)

Read-only, uses the user's authenticated `gh`. No local repo state is modified.

```bash
gh repo view <owner>/<repo> --json name,owner,visibility,pushedAt,defaultBranchRef   # is it current?
gh api "repos/<owner>/<repo>/commits?since=<ISO>&per_page=100" \
  --jq '.[] | "\(.sha[0:8])  \(.commit.author.name)  \(.commit.message | split("\n")[0])"'
# per-commit detail (files + full message):
gh api "repos/<owner>/<repo>/commits/<sha>" --jq '.commit.message'
gh api "repos/<owner>/<repo>/commits/<sha>" --jq '[.files[] | {f:.filename, a:.additions, d:.deletions}]'
# full patch, when you need the actual change:
gh api "repos/<owner>/<repo>/commits/<sha>" -H 'Accept: application/vnd.github.diff'
```

**Attribution matters.** Filter the remote history to the **user's own commits** (match `commit.author` login/name, or use `--author=` locally) so you summarize *their* work — a shared repo is full of other people's commits. Report the date range you actually saw.

### 1c. Provenance — tag each claim

When a summary statement is NOT directly verifiable in the code (you inferred intent from a commit message, a teammate's release note, or a doc that may itself be AI-written), tag it: **`[self-reported]`**. Statements you traced to the actual diff need no tag (they are `[code-verifiable]` by default). If a doc/commit claims a capability but the window's code shows no trace of it, say so (`claimed, not found in code`) — don't launder an unverifiable claim into a factual one. This matters because AI-written summaries get recursively summarized; provenance is the only thing that stops the drift.

### 1d. Artifacts & docs

Also check for recently-generated outputs that indicate *what was being attempted/delivered*: images, PDFs, exports, and — especially — **work-report docs the user wrote** (`docs/`, work-summary folders). Those are first-hand and often describe intent the commits don't.

---

## Step 2 — Analyze by FEATURE (not by commit)

Cluster across commits/files; a "feature" is one coherent goal spanning many changes.

- **Map code structure to function** — from file paths and diffs, say what each cluster actually *does* (`FabricServiceImpl` temp-upload → "let users try a fabric on an unregistered photo"). Prefer real paths over vague labels.
- **Give each cluster a user-voice one-liner** ("built X so that Y"), not engineering-speak.
- **Split large commits by semantic capability, don't flatten them.** A single `feat(...)` commit frequently bundles several unrelated capabilities (new endpoint + new flag + new component + new prompt template). Read the diff; group by *capability*, not by the commit's subject line. Watch for capability markers: new endpoints/routes, new DB columns/entities, new toggles/options, new components, new prompt templates.
- **Merge one capability spread over many commits** into one module (initial impl + follow-up fixes + review polish of the same feature = one module).
- **Noise is NOT a feature** — regenerated data snapshots (`git-log.json`, dumps, bundles), pure renames (0-content-delta), build output. Mention them once in 备注 as excluded; cite only the file's *current* name if it's real work.
- **Cross-cutting fixes** (a review pass fixing many small things) → their own cluster ("code-review fixes: NPE, viewer polish, …").
- Merge/release commits by teammates are context (what got shipped), not your work — note them as context.

## Step 3 — Write the report

### Archive file (required)

Write to the work-summary directory the user actually uses — ask if unclear; common default is `<Documents>/dev/工作总结` next to the projects, or the cwd. Filename: **`<YYYY-MM-DD>_周报.md`** (today's date); suffix `_2`, `_3`, … if a file with that date already exists.

Structure:

```
# <YYYY-MM-DD> 周报（<window>）

## 一页汇报（可直接照念）
- ≤1 line each, user-voice, copy-pasteable for stand-up / report system.

## 本周工作明细
### 模块 A：<feature name>
- user-voice goal / what changed
- evidence: commit hashes, changed file paths, diff highlights
### 模块 B：…

## 备注 / 遗留
- unfinished / blocked / tried-and-discarded, marked honestly when not visible in git
- excluded noise (data snapshots, renames) — one line so a reader knows they were seen and rejected
- scope notes: which dirs/repos were scanned, and that uncommitted/remote-only work outside the scan is not included
```

### Spoken summary (required)

Repeat the **3–5 lines** from the archive header **in your final reply** so the user can copy them without opening the file. Give the archive file path too.

### Honesty rules

- No commits in window, clean worktree → **state it** ("last commit was X; nothing in the window"), don't stretch old work.
- Remote-scoped runs: say clearly the report covers **only what's pushed & authored by you**; local uncommitted work on the work machine isn't visible.
- **Evidence over vibes**: never cite a file you did not verify changed in the window. Cite a file's current name (post-rename).

---

## Wrap-up

- Confirm the archive path in your reply.
- Gently note: mid-week commits/stashes make the next report measurably fuller — code evidence can't recover discussions or discarded directions that never touched a file.
