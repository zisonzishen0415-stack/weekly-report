#!/usr/bin/env node
/**
 * eval/judge.mjs — LLM-free scorer for the CLUSTERING layer.
 *
 * Determines how well a generated report groups the changed files into the
 * ground-truth features, using only string overlap on file basenames. This is
 * intentionally conservative (no LLM judge = deterministic, CI-safe):
 *
 * For each ground-truth feature F (with its file set), find the report section
 * whose cited-file set best overlaps F. A feature is "found" if ≥1 of its files
 * is cited by the report, and a section is "correct" if it doesn't mingle files
 * from two different ground-truth features (a section citing {detector, carousel}
 * is penalized for conflation).
 *
 * Outputs, per fixture:
 *   featureRecall   = features with ≥1 cited file ÷ features
 *   featurePrecision= report sections that cite only one GT feature's files ÷ sections
 *   (macro-averaged across fixtures)
 *
 * Usage: node scripts/eval/judge.mjs <report.md> <fixtureName>
 */
import { readFileSync } from "node:fs";
import { basename } from "./lib/fixtures.mjs";
import { expectedFor } from "./lib/fixtures.mjs";
import { extractCitedFiles } from "./lib/fixtures.mjs";

const [reportPath, fixture] = process.argv.slice(2);
if (!reportPath || !fixture) { console.error("usage: judge.mjs <report.md> <fixture>"); process.exit(1); }
const exp = expectedFor(fixture);
const features = exp.features || [];
const md = readFileSync(reportPath, "utf8");

// Rename-aware: a report may legitimately cite the pre-rename OR post-rename name of a file.
// Build an alias map oldName->canonical(GT file or final name) so we don't count two names
// of the same file as two different features.
const aliases = {};
for (const r of exp.renames || []) {
  aliases[basename(r.from)] = basename(r.to);
}
const canon = (b) => aliases[b] || b;

// Split report into sections by markdown headers.
const sections = md.split(/\n(?=#{1,3} )/).filter(s => /#+ /.test(s) && /`[^`]+`/.test(s));

// Map each GT feature -> set of basenames it legitimately covers (canonical).
const featFiles = features.map(f => ({ id: f.id, files: new Set((f.files || []).map(basename).map(canon)) }));
const allGT = new Set(featFiles.flatMap(f => [...f.files]));

let found = 0;
for (const f of featFiles) {
  // Feature is "found" if the report cites any of its files (pre- or post-rename name).
  if (sections.some(s => [...f.files].some(file => s.includes(file)))) found++;
}

// Section purity: of the sections that actually cite a GT file, how many cite files
// from only ONE feature? (Front matter / notes sections that cite no GT file are not
// scored — otherwise a richer report looks worse for no reason.)
let pure = 0;
let scoredSections = 0;
for (const s of sections) {
  const cited = extractCitedFiles(s).map(basename).map(canon).filter(b => allGT.has(b));
  if (cited.length === 0) continue; // no GT file cited — not scored
  scoredSections++;
  const owners = new Set();
  for (const f of featFiles) if (cited.some(c => f.files.has(c))) owners.add(f.id);
  if (owners.size === 1) pure++;
}

const featureRecall = features.length === 0 ? 1 : found / features.length;
const featurePrecision = scoredSections === 0 ? 0 : pure / scoredSections;

console.log(JSON.stringify({
  fixture,
  featureRecall: +(featureRecall * 100).toFixed(1),
  featurePrecision: +(featurePrecision * 100).toFixed(1),
  featuresFound: found,
  featuresTotal: features.length,
  sectionsTotal: scoredSections,
  sectionsPure: pure,
}, null, 2));
