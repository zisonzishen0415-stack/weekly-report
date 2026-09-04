#!/usr/bin/env node
/**
 * evidence.mjs — deterministic evidence collector for weekly-report.
 *
 * Turns "what changed in repo <dir> over the last <days>" into structured JSON
 * that a language model can then cluster into features. Keeping this in code
 * (instead of ad-hoc bash in the SKILL.md) makes it:
 *   - cross-platform (Node, no GNU findutils / BSD date differences)
 *   - *testable* — the eval suite scores this output against golden fixtures
 *   - honest about noise (renames, data-regeneration, build artifacts)
 *
 * Output shape:
 * {
 *   repo,           window: { start, days },
 *   stale: boolean, // last commit predates the window start by a lot
 *   lastCommit: {hash,date,subject,author} | null,
 *   commits:   [{hash,date,author,subject,files:[{path,status,additions,deletions}]}],
 *   uncommitted:{changed:[path], deleted:[path], unstagedDiffStat: {...}} ,
 *   recentFiles:[{path,mtime,size}],        // files whose mtime is in window
 *   renames:[{from,to,score}],              // detected pure renames (noise)
 *   regenerated:[path],                     // large machine-generated churn (noise)
 *   summary: { commitCount, changedFileSet:[...], noiseFileSet:[...] }
 * }
 *
 * Run:  node scripts/evidence.mjs <dir> --days N [--since YYYY-MM-DD] [--author name|email]
 * Outputs JSON to stdout. `--author` restricts commit attribution (multi-dev repos).
 */
import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { join, extname } from "node:path";

function run(cmd, args, opts = {}) {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts }).trim();
  } catch (e) {
    if (opts.allowFail) return "";
    throw new Error(`${cmd} ${args.join(" ")} failed: ${e.message}`);
  }
}

function isRepo(dir) {
  try { run("git", ["-C", dir, "rev-parse", "--git-dir"]); return true; }
  catch { return false; }
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daysAgoIso(n) {
  const d = new Date(Date.now() - n * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fileMtime(path) {
  try { const s = statSync(path); return new Date(s.mtimeMs).toISOString(); } catch { return null; }
}

// Heuristic: a "data regeneration" file — large, machine-authored churn that is not
// real work (bundles, DB dumps, lockfiles, generated JSON snapshots).
function looksRegenerated(path, deletions, additions) {
  const base = path.split("/").pop() || path;
  const regen =
    /(^|[/\\])(dist|build|out|target|node_modules|__pycache__|\.next|\.nuxt)([/\\]|$)/.test(path) ||
    /\.(lock|lockb|min\.js|min\.css|map)$/.test(base) ||
    /^(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|git-log\.json|.*\.sql)$/.test(base) || // sql snapshots are regenerated schema dumps
    /^\.(pyc|class|o|exe|dll)$/.test(extname(base));
  return regen;
}

// --- gather ---
const args = process.argv.slice(2);
const dir = args[0];
const days = args.includes("--days") ? Number(args[args.indexOf("--days") + 1]) : 7;
const author = args.includes("--author") ? args[args.indexOf("--author") + 1] : null;
if (!dir || !isRepo(dir)) {
  console.error("usage: node scripts/evidence.mjs <git-dir> [--days N] [--since YYYY-MM-DD] [--author name]");
  process.exit(1);
}

const since = args.includes("--since") ? args[args.indexOf("--since") + 1] : daysAgoIso(days);
const authorFlag = author ? ["--author", author] : [];

const out = { repo: dir, window: { days, start: since }, author: author ?? null };

// last commit (staleness signal)
const lastRaw = run("git", ["-C", dir, "log", "-1", "--pretty=%H|%aI|%an|%s"], { allowFail: true });
if (lastRaw) {
  const [hash, date, an, ...rest] = lastRaw.split("|");
  out.lastCommit = { hash, date, author: an, subject: rest.join("|") };
  out.stale = new Date(date) < new Date(`${since}T00:00:00`) - 7 * 86400000;
} else {
  out.lastCommit = null; out.stale = false;
}

// commits in window
const logRaw = run("git", ["-C", dir, "log", `--since=${since}`, ...authorFlag,
  "--pretty=%H|%aI|%an|%ae|%s", "--name-status"], { allowFail: true });
out.commits = [];
for (const block of logRaw.split(/\n(?=[0-9a-f]{40}\|)/).filter(Boolean)) {
  const lines = block.trim().split("\n");
  const [hash, date, an, ae, ...subjArr] = lines[0].split("|");
  const commit = { hash: hash.slice(0, 8), date, author: an, email: ae, subject: subjArr.join("|"), files: [] };
  for (let i = 1; i < lines.length; i++) {
    const m = lines[i].match(/^(A|M|D|R\d*|C\d*)\s+(.+?)(?:\t(.+))?$/);
    if (!m) continue;
    const [_, status, from, to] = m;
    commit.files.push({ status: status[0], from, to: to ?? from });
  }
  out.commits.push(commit);
}

// uncommitted
const stRaw = run("git", ["-C", dir, "status", "--short"], { allowFail: true });
out.uncommitted = { changed: [], deleted: [] };
for (const line of stRaw.split("\n").filter(Boolean)) {
  const st = line.slice(0, 2);
  const p = line.slice(3);
  if (st.includes("D")) out.uncommitted.deleted.push(p);
  else out.uncommitted.changed.push(p);
}
const diffStatRaw = run("git", ["-C", dir, "diff", "--stat"], { allowFail: true });
out.uncommitted.unstagedDiffStat = diffStatRaw.split("\n").filter(Boolean).slice(0, -1).reduce((acc, l) => {
  const m = l.match(/^\s*(.+?)\s*\|\s*(\d+)\s*[+-]*/);
  if (m) acc[m[1]] = Number(m[2]);
  return acc;
}, {});

// recent files (mtime in window) — excludes gitignored via git, avoids node_modules etc
const recRaw = run("git", ["-C", dir, "ls-files", "-co", "--exclude-standard"], { allowFail: true });
out.recentFiles = recRaw.split("\n").filter(Boolean)
  .map(p => ({ path: p, mtime: fileMtime(join(dir, p)) }))
  .filter(f => f.mtime && f.mtime >= `${since}T00:00:00Z`)
  .map(f => { const s = statSync(join(dir, f.path)); return { path: f.path, mtime: f.mtime, size: s.size }; });

// renames: pure renames inside window commits (R status). A rename is NOT a separate
// feature — the file is real work, but only its final path should be reported.
out.renames = [];
for (const c of out.commits) {
  for (const f of c.files) {
    if (f.status === "R") out.renames.push({ from: f.from, to: f.to });
  }
}

// regenerated noise = recent files that are huge & machine-authored, plus big deletions in commits
out.regenerated = out.recentFiles
  .filter(f => f.size > 300_000 || looksRegenerated(f.path, 0, 0))
  .map(f => f.path);
for (const c of out.commits) {
  for (const f of c.files) {
    if (looksRegenerated(f.to ?? f.from, 0, 0)) out.regenerated.push(f.to ?? f.from);
  }
}
out.regenerated = [...new Set(out.regenerated)];

// changed file set (real work = commits-in-window + uncommitted, minus regenerated noise).
// NOTE: recent-mtime files are deliberately NOT folded in — mtime is unreliable
// (checkout/copy touches it), so mtime alone is never "work evidence".
const realSet = new Set();
const noiseSet = new Set();
const addReal = (p) => { if (!p) return; if (!realSet.has(p) && !noiseSet.has(p)) realSet.add(p); };
for (const c of out.commits) for (const f of c.files) {
  const p = f.to ?? f.from;
  if (out.regenerated.includes(p)) noiseSet.add(p);
  else addReal(p);
}
// collapse rename chains: intermediate names are dropped in favor of the final path
for (const r of out.renames) {
  if (realSet.has(r.from)) { realSet.delete(r.from); realSet.add(r.to); }
}
out.uncommitted.changed.forEach(addReal);
out.uncommitted.deleted.forEach(p => realSet.add(p));
out.summary = {
  commitCount: out.commits.length,
  stale: out.stale,
  changedFileSet: [...realSet].sort(),
  noiseFileSet: [...noiseSet].sort(),
};

console.log(JSON.stringify(out, null, 2));
