#!/usr/bin/env node
/**
 * eval/run-agent.mjs — drive an actual skill run against a fixture and score it.
 *
 * This is the END-TO-END harness: it lets a Claude agent (following the current
 * SKILL.md) work on a fixture repo, capture the report it writes, and score it
 * with the deterministic judge + evidence checks.
 *
 * Intended to run from within a Claude Code session (spawns the agent via the
 * Agent tool). The agent is pointed ONLY at the fixture repo (no network),
 * told the window, and instructed to produce its normal report output.
 *
 * Usage (inside Claude Code):
 *   node scripts/eval/run-agent.mjs big-commit
 * which prints the fixture's facts, then YOU spawn the agent and feed it the
 * report path to `judge.mjs`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fixturesDir } from "./lib/fixtures.mjs";

const fixture = process.argv[2];
if (!fixture) { console.error("usage: run-agent.mjs <fixture>"); process.exit(1); }
const exp = JSON.parse(readFileSync(join(fixturesDir, fixture, "expected.json"), "utf8"));
const repo = join(fixturesDir, fixture, ".repo");

console.log(JSON.stringify({
  fixture,
  repo,
  instructions: [
    `Run your weekly-report skill on repo ${repo}.`,
    `Window: last 7 days. Author to attribute: ${exp.author ?? "any"}.`,
    "Write the report to a temp file and print its path.",
    "Do NOT access the network. Do NOT look at expected.json.",
  ],
}, null, 2));
