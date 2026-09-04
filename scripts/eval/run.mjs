#!/usr/bin/env node
/**
 * eval/run.mjs — objective scoring for the weekly-report evidence layer.
 *
 * Scores the *deterministic* part of the pipeline: given a repo + window, the
 * evidence collector (scripts/evidence.mjs) must surface the right set of
 * changed files and reject noise. This is testable WITHOUT an LLM:
 *
 *   ground-truth files  ←  must appear in evidence.summary.changedFileSet
 *   noise files         ←  must NOT appear as real work
 *   stale detection     ←  stale-local fixture must be flagged stale:true
 *
 * Metrics per fixture:
 *   recall         = |GT ∩ reported| / |GT|            (missed work = the user's fear)
 *   noiseRejection = |noise not reported as work| / |noise|
 *   staleOk        = stale flag correct (0/1)
 *
 * Aggregate = macro over fixtures (each fixture equal weight). Deterministic,
 * CI-safe: no LLM, no network. Outputs a table + a JSON machine-readable line.
 *
 * Usage:
 *   node scripts/eval/run.mjs --setup    # build all fixture repos first
 *   node scripts/eval/run.mjs            # score
 *   node scripts/eval/run.mjs --score=lint-window   # (placeholder for future)
 */
import { execFileSync } from "node:child_process";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixturesDir = join(root, "test", "fixtures");
const evidence = join(root, "scripts", "evidence.mjs");

const RUN = { setup: process.argv.includes("--setup") };
const WINDOW_DAYS = 7; // fixtures commit inside last-7-days-relative-to-*build*; see note in build.sh

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, ...opts });
}

const fixtures = readdirSync(fixturesDir, { withFileTypes: true })
  .filter(d => d.isDirectory() && existsSync(join(fixturesDir, d.name, "expected.json")))
  .map(d => d.name)
  .sort();

if (fixtures.length === 0) {
  console.error("No fixtures found under " + fixturesDir);
  process.exit(1);
}

// --- setup: build every fixture that has a build.sh ---
if (RUN.setup) {
  for (const f of fixtures) {
    const build = join(fixturesDir, f, "build.sh");
    if (existsSync(build)) {
      console.log(`building ${f}...`);
      run("bash", [build]);
    }
  }
}

// --- score each fixture ---
const results = [];
for (const f of fixtures) {
  const repo = join(fixturesDir, f, ".repo");
  if (!existsSync(repo)) {
    console.log(`SKIP ${f} (not built; run --setup first)`);
    continue;
  }
  const expected = JSON.parse(readFileSync(join(fixturesDir, f, "expected.json"), "utf8"));
  const gt = new Set(expected.groundTruthFiles || []);
  const noise = new Set(expected.noiseFiles || []);

  // Author filter: fixtures may designate one author as "the user".
  const author = expected.author ?? null;

  let evidenceOut;
  try {
    const args = [evidence, repo, "--days", String(WINDOW_DAYS)];
    if (author) args.push("--author", author);
    evidenceOut = JSON.parse(run("node", args));
  } catch (e) {
    results.push({ f, error: String(e.message) });
    continue;
  }

  const reported = new Set(evidenceOut.summary?.changedFileSet || []);
  const noiseReported = new Set(evidenceOut.summary?.noiseFileSet || []);

  const tp = [...gt].filter(x => reported.has(x)).length;
  const fn = gt.size - tp;
  const recall = gt.size === 0 ? 1 : tp / gt.size;                    // empty GT => trivially satisfied at evidence layer
  const noiseOk = [...noise].filter(x => !reported.has(x)).length;
  const noiseRejection = noise.size === 0 ? 1 : noiseOk / noise.size;
  const staleOk = !("expectStale" in expected) || evidenceOut.stale === expected.expectStale ? 1 : 0;

  // atom layer: expected atoms present; no spurious atoms on files that should be bare
  let atomOk = 1;
  let atomDetail = "";
  if (expected.expectedAtoms) {
    const atoms = evidenceOut.atoms || {};
    for (const [path, want] of Object.entries(expected.expectedAtoms)) {
      const got = (atoms[path] || []).map(a => `${a.kind}:${a.name}`);
      for (const w of want) {
        if (!got.includes(`${w.kind}:${w.name}`)) {
          atomOk = 0;
          atomDetail += ` missing ${path} ${w.kind}:${w.name}`;
        }
      }
    }
  }

  // hallucination guard: evidence reports files outside GT∪noise that don't exist as real window work.
  const ghosts = [...reported].filter(x => !gt.has(x) && !noise.has(x));
  const precision = reported.size === 0 ? (gt.size === 0 ? 1 : 0) : tp / (tp + ghosts.length);

  results.push({
    f, tp, fn, ghost: ghosts, recall, precision, noiseRejection, staleOk, atomOk,
    reportedCount: reported.size, gtCount: gt.size,
  });
}

// --- report ---
const rows = results.filter(r => !r.error);
const macro = k => rows.length === 0 ? 0 : rows.reduce((a, r) => a + r[k], 0) / rows.length;
console.log("\n=== weekly-report evidence eval ===");
console.log("fixture            recall  prec   noise%  stale  atoms  files(GT/rep)");
for (const r of rows) {
  const name = r.f.padEnd(18);
  const recall = (r.recall * 100).toFixed(0).padStart(5);
  const prec = (r.precision * 100).toFixed(0).padStart(5);
  const noise = (r.noiseRejection * 100).toFixed(0).padStart(5);
  const stale = String(r.staleOk).padStart(5);
  const atoms = String(r.atomOk ?? 1).padStart(5);
  const files = `${r.gtCount}/${r.reportedCount}`.padStart(12);
  const ghost = r.ghost.length ? `  GHOST:${r.ghost.join(",")}` : "";
  console.log(`${name} ${recall}  ${prec}   ${noise}   ${stale}  ${atoms}  ${files}${ghost}`);
}
console.log("\nmacro-averages:");
console.log(`  evidenceRecall         = ${(macro("recall") * 100).toFixed(1)}%`);
console.log(`  evidencePrecision      = ${(macro("precision") * 100).toFixed(1)}%`);
console.log(`  noiseRejection         = ${(macro("noiseRejection") * 100).toFixed(1)}%`);
console.log(`  staleDetection         = ${(macro("staleOk") * 100).toFixed(1)}%`);
console.log(`  atomExtraction         = ${(macro("atomOk") * 100).toFixed(1)}%`);

const failed = results.filter(r => r.error).length + rows.filter(r => r.recall < 1 || r.noiseRejection < 1 || r.staleOk < 1 || (r.atomOk ?? 1) < 1).length;
console.log(`\n${failed === 0 ? "PASS" : "FAIL"} — ${rows.filter(r => r.recall >= 1 && r.noiseRejection >= 1 && r.staleOk >= 1 && (r.atomOk ?? 1) >= 1).length}/${rows.length} fixtures fully correct`);
process.exit(failed === 0 ? 0 : 1);
