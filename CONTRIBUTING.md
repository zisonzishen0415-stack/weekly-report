# Contributing to weekly-report

Thanks for helping make this skill better! Here's how to contribute smoothly.

## Ground rules

- **One skill = one self-contained folder** under `skills/<name>/` with a `SKILL.md` at its root. Keep it portable: no hardcoded absolute paths, no dependency on this repo's location.
- **A skill must be able to trigger and run on its own.** If it needs companion files (scripts, references, config), keep them inside its folder.
- **English frontmatter, instructions in the language the skill's users will speak.** The `description` field should start with the trigger intent so discovery works.

## Local validation

Before pushing, make sure every skill still parses:

```bash
node scripts/validate-skill.mjs
node scripts/eval/run.mjs --setup && node scripts/eval/run.mjs
node test/render.test.mjs
```

This checks that each `SKILL.md` has valid YAML frontmatter with the required `name` and `description` fields, that the evidence collector still matches the golden fixtures, and that the report renderer still produces the expected HTML/PDF. The same checks run in CI on every push and PR — green check means you're good. (Exit on the render test is also green when there's no Edge/Chrome installed: both PDF paths are required to *skip cleanly*, never fake output.)

## Testing a skill locally

Skills are only loaded at session start, so after adding/changing one:

1. Install it locally (see README → *Installation, Option B*), restart Claude Code.
2. Trigger it with the phrasing you put in its `description`.
3. Confirm it produces its promised deliverable on a small, real input.

## Suggesting changes

- **Found a bug or have an idea?** Open an [issue](../../issues) — use the bug or feature template so we have the context to act.
- **Want to fix it?** Fork, branch off `main`, make your change, run `validate-skill.mjs`, and open a PR against `main`. Describe what the skill now does differently and why.

## Conventions for this repo's skills

- Written reports should be **archiveable** — one file per run, dated, human-readable.
- Reports should **cluster by feature**, not by commit.
- When evidence is thin, **say so** — a skill that fabricates output is worse than one that reports "nothing found this week."
