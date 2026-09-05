# weekly-report

Reconstruct recent code work (default: last 7 days) from git + file-change evidence, cluster it **by feature**, and write an archiveable dated report **plus** a short spoken summary for your stand-up / weekly report.

**Use it when you'd say:** *"what did I do this week"* / *"周报"* / *"工作总结"* / *"帮我整理这段时间的成果"*.

## What you get

1. `工作总结/<YYYY-MM-DD>_周报.md` — the archiveable report (feature clusters + evidence + honest notes).
2. A **3–5 line spoken summary** in the reply, ready to copy.
3. **Optional presentation layer** (headless Edge/Chrome, zero deps, skipped with a hint when no browser): `render-pdf.mjs` → quick PDF; `render-report.mjs` → KPI strip + per-day commit chart + screenshot gallery, one self-contained `<report>-展示.html` + PDF. Report styles in `templates/` (one-pager 汇报版 / OKR 版 / 大厂格式调研).
4. **Optional demo script** — `<report>_讲解稿.md`: every module gets a speakable 🎤 讲解词 (natural-language, first-person) + 👀 演示步骤 (real UI walkthrough with expected effects), so anyone can demo the report module-by-module on the live system.

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
