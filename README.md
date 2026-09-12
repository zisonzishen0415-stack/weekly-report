<div align="center">

# weekly-report

**Turn your git history + real file changes into a weekly report — no memory required.**

A portable `SKILL.md` skill that reconstructs what you actually did over the last week from code evidence (commits, uncommitted changes, code atoms, generated artifacts), clusters it by **feature** instead of by commit, and writes a readable, archiveable report plus its 展示版 HTML/PDF pair and a short spoken summary.

</div>

---

## Why

You report your work once or twice a week — but your memory of *exactly what you changed* fades fast. Commit messages are terse; real work spans multiple commits and files; and a big chunk of what you did never even got committed yet. This skill gathers the evidence from the code itself and organizes it for you:

- **Evidence over memory** — commits, `git status`, `git diff`, code atoms and output artifacts. Fresh mtimes are only supporting hints; Git and content evidence remain authoritative. If nothing happened this week, it says so honestly instead of inventing work.
- **Clustered by feature, not by commit** — one logical chunk of work ("added retry + leak detection to the replace flow") is reported as one item, even if it touched 10 files across 3 commits.
- **Three deliverables** — an archiveable dated report focused on delivered outcomes (code activity stays out of the report body by default), its **展示版 pair** (`-展示.html` + `-展示.pdf` with the cover identity), and a 3–5 line spoken summary you can copy straight into your weekly report or meeting.
- **Presentation layer is required, not optional** — KPI strip, cover identity (avatar + GitHub handle), section labels and a real-page screenshot gallery rendered into self-contained HTML/PDF. There is no per-day commit chart, and no separate demo-script deliverable. A plain `render-pdf.mjs` PDF is an extra archive copy — it never substitutes for the 展示版, and the renderer exits non-zero when the PDF was not written.
- **No emoji** — every artifact uses text labels + bold (已交付 / 指标 / 风险·遗留 / 下周计划 / 亮点); color is a companion cue only.

## Installation

The skill follows the portable `SKILL.md` format. Copy `skills/weekly-report/` into your agent's personal or project skills directory. Common examples:

```bash
# Claude Code, personal (all projects)
mkdir -p ~/.claude/skills && cp -r skills/weekly-report ~/.claude/skills/

# Claude Code, project-scoped
cp -r skills/weekly-report /path/to/your/project/.claude/skills/

# Codex, personal (all projects)
mkdir -p ~/.codex/skills && cp -r skills/weekly-report ~/.codex/skills/

# Other skill-capable agents: use that agent's personal or project skills directory
```

Restart the agent so it picks up the new skill, then invoke it naturally, for example:

```
Make me a weekly report from ./project-a and ./project-b, last 7 days.
```

## Usage

The skill triggers on phrasings like *"weekly report"*, *"what did I do this week"*, *"summarize my work"*, or *"工作总结"*. You can scope it:

| You say | It does |
|---|---|
| `帮我做周报` / `weekly report` | Last 7 days, asks which directories to scan |
| `from ./pattern and ./jch` | Restricts scanning to those directories |
| `last 30 days` / `上周` / `近 N 天` | Changes the time window (default 7 days) |

It will prompt for directory access on first use, gather evidence, and write:

1. **An archive file** — `<your-work-summary-dir>/<YYYY-MM-DD>_周报.md` (configurable, defaults to a `工作总结` folder next to your code), and
2. **The 展示版 pair** — `<report-base>-展示.html` + `<report-base>-展示.pdf`, rendered by `render-report.mjs` (required). `<report-base>.pdf` from `render-pdf.mjs` is an optional plain extra.
3. **A spoken summary** — 3–5 lines printed in the reply, ready to copy into your weekly report / meeting notes.

### Demo

Run the demo script against any git repo to preview the structured evidence it gathers:

```bash
bash scripts/demo.sh /path/to/your/repo --days 30
```

## What counts as evidence

| Source | Command | Catches |
|---|---|---|
| Commit history | `evidence.mjs <dir> --days <N>` | Merged, pushed work in the locked window |
| Uncommitted changes | `git status --short`, `git diff` | Work not yet committed — often the *bulk* of a week |
| Code atoms | `evidence.mjs` diff extraction | New functions, routes, schema fields, selectors and config keys |
| Output artifacts | images / docs / exports | Deliverables and experiments described by real files |
| Remote history | `gh api repos/<owner>/<repo>/...` | Work pushed to a repo that is not available locally |

> **Note:** recently modified files are not treated as ground truth because checkout or copy operations can change mtimes. Conversations, discarded directions, and research that never touched a file are **not** recoverable from code. The report marks these honestly as "no trace in the repo" rather than guessing.

## Project layout

```
.
├─ skills/
│  └─ weekly-report/          # the self-contained, portable skill
│     ├─ SKILL.md             # instructions the host agent follows
│     ├─ evidence.mjs         # deterministic evidence collector (git → changed-file JSON)
│                             # single source of truth for the collector logic
│     ├─ render-pdf.mjs       # quick Markdown → PDF
│     ├─ render-report.mjs    # presentation HTML + PDF
│     ├─ screenshot.mjs       # shared headless-browser render/capture helper
│     ├─ config.md            # editable defaults (window, output dir, directory list)
│     ├─ examples.md          # evidence commands + sample spoken summaries
│     └─ README.md            # skill-specific overview
├─ templates/                  # one-pager / OKR / format research
├─ scripts/
│  ├─ evidence.mjs            # shim → imports skills/weekly-report/evidence.mjs so the
│  │                          # eval suite runs the same file the living skill ships
│  ├─ demo.sh                 # preview structured evidence for a repo
│  ├─ validate-skill.mjs      # syntax-check every SKILL.md in the repo
│  └─ eval/
│     ├─ run.mjs              # deterministic evidence eval (--setup builds fixtures)
│     ├─ run-agent.mjs        # drive a real agent run against a fixture
│     └─ judge.mjs            # score a report's feature clustering vs ground truth
├─ test/
│  ├─ render.test.mjs         # golden test for render-report.mjs (HTML structure) + PDF smoke
│  └─ fixtures/
│     ├─ render/              # report.md + evidence.json consumed by render.test.mjs
│     └─ …                    # golden repos with expected.json labels
├─ .github/workflows/ci.yml   # runs the validator + evidence eval on every push / PR
├─ README.md
├─ AGENTS.md
└─ CONTRIBUTING.md
```

## How it's evaluated

The skill is scored on three layers — so improvements are measurable, not vibes:

1. **Evidence layer (deterministic, runs in CI).** `scripts/eval/run.mjs` builds golden fixture repos (one-commit-many-features, cross-commit features, noise/rename rejection, stale-local, empty-window, multi-language atoms) and checks that `evidence.mjs` surfaces the ground-truth changed files, rejects noise, detects staleness, and extracts the right code atoms (go/rust/c#/php/ruby/css/sql included). Precision/recall/noise-rejection are printed and asserted. No LLM, no network — CI-stable.
2. **Render layer (deterministic, runs in CI).** `test/render.test.mjs` renders the fixture report through the real `render-report.mjs` / `render-pdf.mjs` and asserts the HTML structure (KPI tiles, cover metadata, no per-day chart, section chips, tables, code fences, data-URI screenshot gallery), plus the PDF honesty contract: with no Chromium engine it must skip cleanly — never fake success. No LLM, no network.
3. **Clustering layer (optional, run with an agent).** `run-agent.mjs` prints instructions to drive a real agent through the SKILL.md against a fixture; `judge.mjs` scores the resulting report's feature-vs-label alignment.

The eval caught two real bugs during development: the original `find -newermt` path falsely flagged freshly checked-out files as work, and rename targets were dropped from the change set. The mtime path was retired; both regressions are now guarded by fixtures.

## Contributing

Bug, idea, or a feature you want? See [CONTRIBUTING.md](./CONTRIBUTING.md). PRs are welcome — the CI validator checks every `SKILL.md` on push.

## License

[MIT](./LICENSE) © 2026 zisonzishen0415-stack
