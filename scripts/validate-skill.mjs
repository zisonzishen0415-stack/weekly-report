#!/usr/bin/env node
/**
 * Validate every SKILL.md in the repo.
 * Checks: file exists under skills/, has YAML frontmatter that parses,
 * and declares the required `name` + `description` fields.
 * Used by CI (.github/workflows/ci.yml) and by contributors locally.
 *
 * No third-party dependencies.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function findSkillFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".")) continue;
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) findSkillFiles(p, out);
    else if (entry === "SKILL.md") out.push(p);
  }
  return out;
}

/** Minimal YAML-frontmatter parser: extract between the leading --- fences. */
function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return null;
  const fields = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv) fields[kv[1]] = kv[2].trim();
  }
  return fields;
}

const skillRoot = join(root, "skills");
const files = findSkillFiles(skillRoot);
let failed = false;

if (files.length === 0) {
  console.error(`✗ No SKILL.md found under ${skillRoot}`);
  process.exit(1);
}

for (const file of files) {
  const rel = file.slice(root.length + 1).replace(/\\/g, "/");
  const text = readFileSync(file, "utf8");
  const fm = parseFrontmatter(text);
  if (!fm) {
    console.error(`✗ ${rel}: missing or malformed YAML frontmatter (needs leading --- fences)`);
    failed = true;
    continue;
  }
  if (!fm.name || !fm.name.length) {
    console.error(`✗ ${rel}: frontmatter missing required "name" field`);
    failed = true;
  }
  if (!fm.description || !fm.description.length) {
    console.error(`✗ ${rel}: frontmatter missing required "description" field`);
    failed = true;
  }
  console.log(`✓ ${rel}: name="${fm.name ?? ""}"`);
}

if (failed) {
  console.error("\nValidation failed.");
  process.exit(1);
}
console.log(`\nAll ${files.length} skill file(s) valid.`);
