# weekly-report

Reconstruct recent code work (default: last 7 days) from git + file-change evidence, cluster it **by feature**, and write an archiveable dated report **plus** a short spoken summary for your stand-up / weekly report.

**Use it when you'd say:** *"what did I do this week"* / *"周报"* / *"工作总结"* / *"帮我整理这段时间的成果"*.

## What you get

1. `工作总结/<YYYY-MM-DD>_周报.md` — the archiveable report (feature clusters + evidence + honest notes).
2. A **3–5 line spoken summary** in the reply, ready to copy.

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
