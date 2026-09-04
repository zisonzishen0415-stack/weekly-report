# Golden fixtures for the weekly-report eval.

Each subdirectory here is a **self-contained git repo** (its own `.git`), constructed
to exercise one hard case of the skill. The skill is pointed at the repo with a
given window; its output is scored against the labels in `expected.json`.

`expected.json` shape:
```jsonc
{
  // Files that genuinely represent work inside the window.
  "groundTruthFiles": ["src/a.ts", "src/b.ts"],
  // What the report SHOULD NOT claim as work (renames, data regen, build output).
  "noiseFiles": ["dist/bundle.js", "frontend/public/git-log.json"],
  // One entry per true feature. files = the file set that feature legitimately spans.
  "features": [
    { "id": "leak-detect", "files": ["src/detect.java"], "summaryContains": ["leak", "background"] },
    { "id": "carousel",     "files": ["ui/Carousel.tsx", "ui/types.ts"], "summaryContains": ["carousel"] }
  ]
}
```

Rules the scorer applies (see `scripts/eval/run.mjs`):
- **Recall** = groundTruthFiles that appear in the report ÷ groundTruthFiles
- **Precision / hallucination** = report-claimed file paths that are NOT in groundTruthFiles or noiseFiles
- **Noise rejection** = noiseFiles correctly NOT claimed ÷ noiseFiles
- **Attribution** (multi-author) = only the target author's files count as ground truth
- **Feature clustering** = requires the optional LLM judge: the model's features must map onto
  the label features such that feature→files sets align (merge/split tolerance). Skipped in
  deterministic CI mode.

## Build notes
- Each fixture ships a `build.sh` that creates a throwaway `.repo/` git repo with
  commits dated **relative to "now"** (so fixtures never rot). `.repo/` is gitignored
  and not committed. Run `node scripts/eval/run.mjs --setup` to build all fixtures.
- Committers: fixtures that test attribution create commits under two authors.
- Windows note: build.sh must not rely on GNU `date -d` (we use a `node -e` helper
  for relative dates).
