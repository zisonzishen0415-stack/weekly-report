<div align="center">

# weekly-report

**Turn your git history + real file changes into a weekly report — no memory required.**

A [Claude Code](https://claude.com/claude-code) skill that reconstructs what you actually did over the last week from code evidence (commits, uncommitted changes, recently touched files, generated artifacts), clusters it by **feature** instead of by commit, and writes a readable, archiveable report plus a one-page summary you can read aloud in a stand-up.

</div>

---

## Why

You report your work once or twice a week — but your memory of *exactly what you changed* fades fast. Commit messages are terse; real work spans multiple commits and files; and a big chunk of what you did never even got committed yet. This skill gathers the evidence from the code itself and organizes it for you:

- **Evidence over memory** — commits, `git status`, `git diff`, recently-modified files, output artifacts. If nothing happened this week, it says so honestly instead of inventing work.
- **Clustered by feature, not by commit** — one logical chunk of work ("added retry + leak detection to the replace flow") is reported as one item, even if it touched 10 files across 3 commits.
- **Two deliverables** — an archiveable dated report + a 3–5 line spoken summary you can copy straight into your weekly report / meeting.

## Installation

> Requires [Claude Code](https://claude.com/claude-code). Works with any repo that has git history — nothing to configure up front.

### Option A — install as a plugin (recommended)

In Claude Code, register this repo as a plugin marketplace, then install the skill:

```bash
/plugin marketplace add zisonzishen0415-stack/weekly-report
/plugin install weekly-report@weekly-report
```

Then just ask:

```
Make me a weekly report from ./project-a and ./project-b, last 7 days.
```

### Option B — copy the folder manually

Copy `skills/weekly-report/` into your personal skills directory (or your project's `.claude/skills/`):

```bash
# personal (all projects)
mkdir -p ~/.claude/skills && cp -r skills/weekly-report ~/.claude/skills/

# project-scoped
cp -r skills/weekly-report /path/to/your/project/.claude/skills/
```

Restart Claude Code so it picks up the new skill, then invoke it naturally (see below).

## Usage

The skill triggers on phrasings like *"weekly report"*, *"what did I do this week"*, *"summarize my work"*, or *"工作总结"*. You can scope it:

| You say | It does |
|---|---|
| `帮我做周报` / `weekly report` | Last 7 days, asks which directories to scan |
| `from ./pattern and ./jch` | Restricts scanning to those directories |
| `last 30 days` / `上周` / `近 N 天` | Changes the time window (default 7 days) |

It will prompt for directory access on first use, gather evidence, and write:

1. **An archive file** — `<your-work-summary-dir>/<YYYY-MM-DD>_周报.md` (configurable, defaults to a `工作总结` folder next to your code), and
2. **A spoken summary** — 3–5 lines printed in the reply, ready to copy into your weekly report / meeting notes.

### Demo

Run the demo script against any git repo to see the shape of what it produces:

```bash
bash scripts/demo.sh /path/to/your/repo --days 30
```

## What counts as evidence

| Source | Command | Catches |
|---|---|---|
| Commit history | `git log --since=<window>` | Merged, pushed work |
| Uncommitted changes | `git status --short`, `git diff --stat` | Work not yet committed — often the *bulk* of a week |
| Recently modified files | `find <dir> -newermt <start>` | Files touched this week (respects `.gitignore` patterns) |
| Output artifacts | images / docs / exports with recent mtimes | Actual deliverables and experiments |

> **Note:** conversations, discarded directions, and research that never touched a file are **not** recoverable from code. The report marks these honestly as "no trace in the repo" rather than guessing. Commit (or stash) at least once mid-week and the next report will be measurably more complete.

## Project layout

```
.
├─ skills/
│  └─ weekly-report/          # the skill (self-contained, loadable via Option A or B)
│     ├─ SKILL.md             # instructions Claude follows
│     ├─ evidence.mjs         # deterministic evidence collector (git → changed-file JSON)
│     ├─ config.md            # editable defaults (window, output dir, directory list)
│     ├─ examples.md          # evidence commands + sample spoken summaries
│     └─ references/          # optional topic references
├─ scripts/
│  ├─ evidence.mjs            # canonical collector (mirrored into the skill folder)
│  ├─ demo.sh                 # run the skill's evidence flow against a repo
│  ├─ validate-skill.mjs      # syntax-check every SKILL.md in the repo
│  └─ eval/
│     ├─ run.mjs              # deterministic evidence eval (--setup builds fixtures)
│     ├─ run-agent.mjs        # drive a real agent run against a fixture
│     └─ judge.mjs            # score a report's feature clustering vs ground truth
├─ test/fixtures/             # golden repos with expected.json labels
│  ├─ big-commit/ …           # (fixture .repo/ is gitignored; build.sh creates it)
├─ .claude-plugin/
│  └─ marketplace.json        # plugin marketplace manifest (used by Option A)
├─ .github/workflows/ci.yml   # runs the validator + evidence eval on every push / PR
├─ README.md
└─ CONTRIBUTING.md
```

## How it's evaluated

The skill is scored on two layers — so improvements are measurable, not vibes:

1. **Evidence layer (deterministic, runs in CI).** `scripts/eval/run.mjs` builds golden fixture repos (one-commit-many-features, cross-commit features, noise/rename rejection, stale-local, empty-window) and checks that `evidence.mjs` surfaces the ground-truth changed files, rejects noise, and detects staleness. Precision/recall/noise-rejection are printed and asserted. No LLM, no network — CI-stable.
2. **Clustering layer (optional, run in Claude Code).** `run-agent.mjs` prints instructions to drive a real agent through the SKILL.md against a fixture; `judge.mjs` scores the resulting report's feature-vs-label alignment.

The eval caught two real bugs during development: `find -newermt` falsely flagging freshly-checked-out files as work, and rename targets being dropped from the change set. Regressions are now caught before they ship.

## Contributing

Bug, idea, or a feature you want? See [CONTRIBUTING.md](./CONTRIBUTING.md). PRs are welcome — the CI validator checks every `SKILL.md` on push.

## License

[MIT](./LICENSE) © 2026 zisonzishen0415-stack
