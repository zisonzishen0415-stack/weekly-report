# Configuration

This skill is aimed at developers who report work weekly/bi-weekly and can't
rely on memory. It rebuilds "what I did" from code evidence.

## Defaults

| Setting | Default | How to change |
|---|---|---|
| Time window | last 7 days | Say `近 N 天` / `last N days` / `上周` |
| Scan directories | ask each run | Pass `from <dir>`; or add to **Directory list** below |
| Output dir | `…/dev/工作总结/<date>_周报.md` | Edit **Output dir** below |
| PDF export | off (optional, Step 4) | Say `加一份 PDF` / `print a PDF too`; needs Edge/Chrome (`$CHROME_BIN` override) |
| Presentation | off (optional, Step 4) | Say `做成展示版` / `presentation`; adds KPI strip + per-day chart + screenshot gallery (`--urls`/`--shots-dir`) |

## Directory list (editable)

Directories the skill scans when you don't name any. Per-run `from <dir>` always wins.

- (add your usual projects here, e.g. `C:/Users/you/Documents/dev/my-app`)

## Output dir (editable)

Where dated reports are archived.

- `C:/Users/29517/Documents/dev/工作总结`

## Evidence sources

- git commits in window
- uncommitted changes (`git status` / `git diff`)
- files modified in window
- artifacts & docs (images, PDFs, work-report docs)

## Known limits

- Code evidence can't see conversations / discarded directions that never
  touched a file — the report marks these as "no trace" rather than guessing.
- Remote-scoped reports cover only what's **pushed & authored by you**; local
  uncommitted work on another machine isn't visible.
- If a repo has neither commits nor changes in the window, the skill says so
  instead of padding with old work.
