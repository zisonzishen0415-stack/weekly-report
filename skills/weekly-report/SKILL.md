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

Rebuild a truthful, human-readable summary of recent work **from the code**, not from memory. Produce **two** deliverables (plus an **optional PDF export**, see Step 4):

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

If `evidence.mjs` is available next to this skill, use it — it returns JSON with the window's commits, changed files, **code atoms** (new definitions/routes/columns per file), renames, regenerated noise, and any prior `.weekly-report/` sidecar:

```bash
node <skill-dir>/evidence.mjs <dir> --days <N> [--author "<name or email>"]
```

`<skill-dir>` is the folder containing this `SKILL.md` (this skill ships `evidence.mjs` next to it). If the collector is absent, fall back to:

```bash
git -C <dir> log --since='<YYYY-MM-DD>' --pretty='%h|%ad|%an|%s' --date=short
git -C <dir> log -1 --pretty='%h|%ad|%s' --date=short          # last commit date (staleness)
git -C <dir> status --short && git -C <dir> diff --stat         # uncommitted work
```

The collector's `summary.changedFileSet` is your **ground truth file list** and its `atoms` are the **code's own vocabulary of what was built** — cluster those. Respect its `noiseFileSet` / `renames` (data snapshots, build output, pure renames are NOT features). mtime of files is NOT reliable work evidence (checkout/copy touches it) — trust git, not `find -newermt`, for what changed.

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

## Step 2 — Analyze by FEATURE, code-first

The collector's output is your working set:
- **`summary.changedFileSet`** — real changed files this window (ground truth list).
- **`atoms`** — the NEW semantic units extracted from each file's diff (`{path → [{name, kind}]}`, kind ∈ function/class/const/interface/type/method/route/column/table/key). **These are the code's own vocabulary** — trust them over commit wording.
- **`renames` / `noiseFileSet`** — NOT features (mention once in 备注).

Cluster **atoms + files** into features; use commit messages ONLY as auxiliary color, and when a commit message and the code disagree, **believe the code**:

- **Map atoms to behavior, not labels.** `hasBackgroundLeak`, `@PostMapping("/fabric/upload-temp")`, `is_virtual TINYINT` tell you what was built (`leak detection`, `temp upload`, `virtual-color column`) — describe that.
- **Split by atom-cluster, don't flatten.** A big commit is really N features if its atoms are N unrelated groups. Group atoms that share a purpose; keep unrelated atom groups as separate modules.
- **Merge one capability spread over commits** (initial + fix + polish of the same atoms = one module).
- **Give each module a user-voice one-liner** ("built X so that Y").
- **Cross-cutting fixes** (a review pass) → their own module.
- Teammate merge/release commits are context (what shipped), not your work.

### Write the sidecar (new, required when scanning a local repo)

The project repo owns its own report history. After writing the archive file, write a **machine-readable sidecar** into the scanned repo so next week can diff "since last report":

```json
<scanned-repo>/.weekly-report/<YYYY-MM-DD>.json
{
  "repo": "<abs or logical name>",
  "date": "<YYYY-MM-DD>",
  "window": {"start": "...", "end": "<YYYY-MM-DD>"},
  "features": [
    {"id": "<kebab>", "summary": "<one-line user-voice>",
     "files": ["<changed file paths>"], "atoms": ["kind:name", ...],
     "status": "shipped|wip|blocked"}
  ],
  "scope": {"dirs": [...], "remote": "<owner/repo if remote-scoped>", "authors": ["..."]}
}
```

Rules:
- `files` MUST be real repo-relative paths from `changedFileSet`; `atoms` MUST come from the collector's `atoms` (don't invent names).
- Do NOT commit the sidecar yourself; it's the repo owner's file (the `.weekly-report/` dir is auto-excluded from future scans).
- If the collector reported `sidecar` (a prior report exists), add a `sinceLastReport` note: which features are new vs continued — so weekly reports read as an *increment*, not a re-derivation.

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
- **🎤 讲解词（可照读）**：2–4 句自然语言白话（背景 → 做了什么 → 结果），口语化、少术语；
  这是把 evidences/atoms 翻译成"讲给人听的"版本，不是再罗列一次
- **👀 演示步骤**：3–6 步真实可操作序列（打开哪个页面 → 点什么 → 预期看到什么），
  让汇报者照着就能在真实系统里现场演示，每步给出「预期效果」标注
### 模块 B：…

## 备注 / 遗留
- unfinished / blocked / tried-and-discarded, marked honestly when not visible in git
- excluded noise (data snapshots, renames) — one line so a reader knows they were seen and rejected
- scope notes: which dirs/repos were scanned, and that uncommitted/remote-only work outside the scan is not included
```

### Presentation script (可选，默认产出)

If the report will be *demoed* to managers / customers (not just filed), also produce a
<report>_讲解稿.md next to the report: per module, `🎤 讲解词` + `👀 演示步骤` copied verbatim,
with a header "How to demo" — so the presenter can open the doc and walk through each module
on the live system without re-reading evidence blocks.

Write the 讲解词 in the presenter's voice (first person, casual, concrete), and make every
演示步骤 verifiable against the real UI (page + action + visible effect); if a step can't be
verified (feature not deployed), say so in that step instead of inventing a visual.

### Spoken summary (required)

Repeat the **3–5 lines** from the archive header **in your final reply** so the user can copy them without opening the file. Give the archive file path too.

### Honesty rules

- No commits in window, clean worktree → **state it** ("last commit was X; nothing in the window"), don't stretch old work.
- Remote-scoped runs: say clearly the report covers **only what's pushed & authored by you**; local uncommitted work on the work machine isn't visible.
- **Evidence over vibes**: never cite a file you did not verify changed in the window. Cite a file's current name (post-rename).

---

## Step 4 — Optional: presentation layer (PDF / HTML / numbers / screenshots)

The `.md` stays the archive source of truth. For *showing* the report to a manager or customer, two renderers ship next to this SKILL.md (zero npm deps, headless Edge/Chrome — engine order `$CHROME_BIN` → Edge → Chrome):

1. **Quick PDF** — `node <skill-dir>/render-pdf.mjs <report.md>` (plain md → PDF).
2. **Presentation** — `node <skill-dir>/render-report.mjs <report.md> [--evidence <evidence.json>] [--urls "https://a;https://b"] [--shots-dir <dir>]`:
   - **KPI strip + per-day commit bar chart** built from `evidence.mjs` output (commits / feat+fix / modules / files; single-series validated blue, zero-commit days shown grey — the truth, not a curated curve);
   - **section styling** by heading keywords: ✅ shipped (green) / 📊 metrics / ⚠️ risk·遗留 (amber) / 📅 next (blue) chips — icon + label always, never color alone;
   - **screenshot gallery**: pass `--urls` for pages it should capture itself (e.g. the product's public URLs — a real page beats a paragraph) or `--shots-dir` for files you have; images embed as `data:` URIs so the HTML is one self-contained file;
   - writes `<report-base>-展示.html` + `<report-base>-展示.pdf` next to the `.md`.

Report styles live in `templates/` — `one-pager-汇报版.md` (manager-facing: 重点突破 1–2 项 → ✅已交付 → 📊指标 with Δ → ⚠️风险/需支援 → 📅下周 Top 3 → 亮点), `okr-版.md` (O/KR with 目标 vs 实际), plus `BIGTECH-FORMAT.md`, the survey behind these. If presentation matters, the 一页汇报 section should focus 1–2 项重点突破, and the report should keep explicit ⚠️ / 📅 slots — code evidence can't fill 风险/需支援/下周计划, leave them as honest placeholders for the user.

Both are **best-effort**: no browser → deliver the `.md` (or HTML) and say the PDF was skipped. Verify the output exists and is non-empty before reporting success.

---

## Wrap-up

- Confirm the archive path in your reply.
- Gently note: mid-week commits/stashes make the next report measurably fuller — code evidence can't recover discussions or discarded directions that never touched a file.
