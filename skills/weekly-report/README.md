# weekly-report

Reconstruct recent code work (default: last 7 days) from git + file-change evidence, cluster it **by feature**, and write an archiveable dated report **plus** a short spoken summary for your stand-up / weekly report.

**Use it when you'd say:** *"what did I do this week"* / *"周报"* / *"工作总结"* / *"帮我整理这段时间的成果"*.

## What you get

1. `<YYYY-MM-DD>_周报.md` — the archiveable report (feature clusters + evidence + honest notes), including a 数据快照 section with code churn (commits / files / +N −M line counts from `summary.churn`).
2. A **PDF export** — rendered every run by default (`render-pdf.mjs`; `render-report.mjs` adds the KPI strip + chart + screenshot gallery). Verify the output exists and is non-empty before reporting success.
3. A **3–5 line spoken summary** in the reply, ready to copy.
4. **Optional demo script** — `<report>_讲解稿.md`: every module gets a speakable 讲解词 (natural-language, first-person) + 演示步骤 (real UI walkthrough with expected effects).

Report styles in `templates/` (one-pager 汇报版 / OKR 版 / 大厂格式调研 BIGTECH-FORMAT.md). **No emoji**: all artifacts use text labels + bold; color is a companion cue only.

## Works where your work actually is

- **Local git repo** — reads commits, uncommitted changes, recently modified files, artifacts.
- **Repo hosted elsewhere** (teammate's GitHub repo, work PC, stale local clone) — automatically falls back to read-only **remote evidence** via `gh api`, filtered to your own commits. No local fetch/clone needed.

## Try it

```bash
bash scripts/demo.sh /path/to/repo --days 30     # preview the evidence it gathers
```

Then in Claude Code: `weekly report from ./my-projects, last 7 days`.

## Configuration

See [config.md](./config.md) for editable defaults (time window, output directory, a default scan list).
