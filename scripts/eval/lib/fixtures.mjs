#!/usr/bin/env node
/**
 * lib/fixtures.mjs — shared helpers for the eval.
 */
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const fixturesDir = join(root, "test", "fixtures");

export function listFixtures() {
  return readdirSync(fixturesDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && existsSync(join(fixturesDir, d.name, "expected.json")))
    .map(d => d.name)
    .sort();
}

export function repoFor(name) {
  return join(fixturesDir, name, ".repo");
}

export function expectedFor(name) {
  return JSON.parse(readFileSync(join(fixturesDir, name, "expected.json"), "utf8"));
}

/** Extract file paths and their one-line summaries from a generated weekly report.
 *  A report is a markdown doc whose feature sections cite files like `backend/LeakDetector.java`
 *  (backticked paths) and/or have bullet lines. We scan for backticked path-like tokens,
 *  which is what the skill's output format mandates for evidence citations.
 */
export function extractCitedFiles(markdown) {
  const tokens = new Set();
  const re = /`([^`\s][^`]*)`/g;
  let m;
  while ((m = re.exec(markdown))) {
    const t = m[1].trim();
    if (/^[\w@./-]+$/.test(t) && /[./\\]/.test(t) && !t.endsWith(".")) tokens.add(t);
  }
  return [...tokens];
}

export function basename(p) {
  return p.replace(/\\/g, "/").split("/").pop();
}
