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
 *   commits:   [{hash,date,author,subject,additions,deletions,
 *                files:[{path,status,additions,deletions}]}],  // add/del via numstat; null=binary
 *   uncommitted:{changed:[path], deleted:[path], unstagedDiffStat: {...},
 *                churn:{additions,deletions}} ,
 *   recentFiles:[{path,mtime,size}],        // files whose mtime is in window
 *   renames:[{from,to,score}],              // detected pure renames (noise)
 *   regenerated:[path],                     // large machine-generated churn (noise)
 *   atoms:     { path: [{name, kind}] },    // v3: NEW semantic units per changed file
 *                                            //     (lang-agnostic, net-new, from diff)
 *   sidecar:   { file, date, features[] } | null,  // last .weekly-report/ sidecar
 *   summary: { commitCount, changedFileSet:[...], noiseFileSet:[...],
 *              churn: { additions, deletions } }   // window line totals (uncommitted excluded)
 * }
 *
 * Run:  node scripts/evidence.mjs <dir> --days N [--since YYYY-MM-DD] [--author name|email]
 * Outputs JSON to stdout. `--author` restricts commit attribution (multi-dev repos).
 */
import { execFileSync } from "node:child_process";
import { statSync, existsSync, readdirSync, readFileSync } from "node:fs";
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
// NOTE: *.sql is deliberately NOT blanket-noise — hand-written migrations are real
// work (schema changes). Only large dumps (>300KB) or known dump names are noise.
function looksRegenerated(path, deletions, additions) {
  const base = path.split("/").pop() || path;
  const sizeHuge = (additions || 0) > 50_000; // a single commit adding >50k lines is machine churn
  const regen =
    /(^|[/\\])(dist|build|out|target|node_modules|__pycache__|\.next|\.nuxt)([/\\]|$)/.test(path) ||
    /(^|[/\\])\.weekly-report([/\\]|$)/.test(path) || // the tool's own sidecar dir
    /\.(lock|lockb|min\.js|min\.css|map)$/.test(base) ||
    /^(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|git-log\.json|.*\.dump|.*\.bak)$/.test(base) ||
    /^\.(pyc|class|o|exe|dll)$/.test(extname(base)) ||
    (sizeHuge && /\.(sql|json)$/.test(extname(base)));
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

// per-file add/del line counts (numstat) + per-commit totals — powers the report's 行数统计
for (const c of out.commits) {
  let nums = "";
  try { nums = run("git", ["-C", dir, "show", "--numstat", "--format=", c.hash], { allowFail: true }); } catch { /* merge/complex diffs: leave null */ }
  const byPath = new Map(); // final path -> {additions, deletions}
  for (const line of nums.split("\n")) {
    const m = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
    if (!m) continue;
    const path = m[3].split(" => ").pop(); // rename "old => new" → final path
    byPath.set(path, {
      additions: m[1] === "-" ? null : Number(m[1]), // "-" = binary file
      deletions: m[2] === "-" ? null : Number(m[2]),
    });
  }
  let additions = 0, deletions = 0;
  for (const f of c.files) {
    const stat = byPath.get(f.to ?? f.from);
    f.additions = stat?.additions ?? null;
    f.deletions = stat?.deletions ?? null;
    if (f.additions) additions += f.additions;
    if (f.deletions) deletions += f.deletions;
  }
  c.additions = additions;
  c.deletions = deletions;
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
// uncommitted add/del totals (working tree vs HEAD, unstaged)
out.uncommitted.churn = { additions: 0, deletions: 0 };
for (const line of run("git", ["-C", dir, "diff", "--numstat"], { allowFail: true }).split("\n")) {
  const m = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
  if (!m) continue;
  if (m[1] !== "-") out.uncommitted.churn.additions += Number(m[1]);
  if (m[2] !== "-") out.uncommitted.churn.deletions += Number(m[2]);
}

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
    if (looksRegenerated(f.to ?? f.from, f.additions ?? 0, f.deletions ?? 0)) out.regenerated.push(f.to ?? f.from);
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

// === v3: code-atom extraction ===
// Language-agnostic, diff-based: for each real changed file, surface NEW semantic
// units (definitions, routes, config keys, columns) that were ADDED in the window.
// net-new filter: a name that also appears in a `-` (deletion) line is a rename/move,
// not new work. Commit messages are NOT consulted — this is the code-first spine.

// Patterns are keyed by language family but stay regex-based & tolerant; a file that
// matches no pattern yields { changed: true } with no atoms (still real work).
const ATOM_PATTERNS = {
  "js,ts,tsx,jsx,mjs,cjs,vue": [
    // definitions: function/class/const+arrow/type/interface/export
    [/^export\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/, "function"],
    [/^export\s+(?:default\s+)?class\s+([A-Za-z_$][\w$]*)/, "class"],
    [/^export\s+(?:default\s+)?const\s+([A-Za-z_$][\w$]*)\s*=/, "const"],
    [/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/, "function"],
    [/^(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/, "class"],
    [/^export\s+interface\s+([A-Za-z_$][\w$]*)/, "interface"],
    [/^export\s+type\s+([A-Za-z_$][\w$]*)/, "type"],
    [/^const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/, "function"],
    [/^interface\s+([A-Za-z_$][\w$]*)/, "interface"],
    [/^type\s+([A-Za-z_$][\w$]*)\s*=/, "type"]
  ],
  "java,kt": [
    [/^(?:public|private|protected|static|\s)*(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/, "type"],
    [/@(?:Get|Post|Put|Delete|Patch|Request)Mapping\(\s*"?([^"]*)/, "route"],
    [/public\s+(?:static\s+)?[\w<>,[\] ]+\s+([a-z]\w*)\s*\(/, "method"]
  ],
  "py": [
    [/^class\s+([A-Za-z_]\w*)/, "class"],
    [/^(?:async\s+)?def\s+([a-z_]\w*)/, "function"],
    [/@(?:app|bp|router)\.(?:get|post|put|delete|patch)\(\s*["']([^"']+)/, "route"]
  ],
  "sql": [
    [/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"[\w]+)/i, "table"],
    [/^ALTER\s+TABLE\s+([`"[\w.]+)/i, "table"],
    [/^\s*(?:ADD\s+)?(?:COLUMN\s+)?([`"[\w]+)\s+(?:INT|BIGINT|VARCHAR|TEXT|BOOLEAN|DATETIME|DECIMAL|JSON|FLOAT|DOUBLE|DATE|TIMESTAMP|TINYINT)/i, "column"],
    [/^\s*[`"[\w]+\s+(?:INT|BIGINT|VARCHAR|TEXT|BOOLEAN|DATETIME|DECIMAL|JSON|FLOAT|DOUBLE|DATE|TIMESTAMP|TINYINT)/i, "column"]
  ]
};
function patternFor(file) {
  const ext = extname(file).replace(/^\./, "").toLowerCase();
  const fam = Object.entries({
    "js,ts,tsx,jsx,mjs,cjs,vue": ["js", "ts", "tsx", "jsx", "mjs", "cjs", "vue"],
    "java,kt": ["java", "kt", "kts"],
    "py": ["py"],
    "sql": ["sql"]
  }).find(([, exts]) => exts.includes(ext));
  return fam ? fam[0] : null;
}

// Collect per-file added/deleted source text over the whole window.
const addedLinesByFile = {};   // path -> [line,...]
const deletedLinesByFile = {}; // path -> [line,...]
for (const c of out.commits) {
  const hash = c.hash;
  for (const f of c.files) {
    if (f.status === "R" || out.regenerated.includes(f.to ?? f.from)) continue;
    const path = f.to ?? f.from;
    // cap: don't pull huge machine diffs; a file touched is still evidence via changedFileSet
    let diff = "";
    try {
      diff = execFileSync("git", ["-C", dir, "show", "--format=", "--no-color", hash, "--", path],
        { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
    } catch { continue; }
    const added = [], deleted = [];
    for (const line of diff.split("\n")) {
      if (line.startsWith("+") && !line.startsWith("+++")) added.push(line.slice(1));
      else if (line.startsWith("-") && !line.startsWith("---")) deleted.push(line.slice(1));
    }
    (addedLinesByFile[path] = addedLinesByFile[path] || []).push(...added);
    (deletedLinesByFile[path] = deletedLinesByFile[path] || []).push(...deleted);
  }
}
// uncommitted diff adds (working tree vs HEAD) for changed files
const unDiffRaw = run("git", ["-C", dir, "diff", "--no-color"], { allowFail: true });
{
  let cur = null;
  for (const line of unDiffRaw.split("\n")) {
    const h = line.match(/^\+\+\+\s+b\/(.+)$/);
    if (h) { cur = h[1]; (addedLinesByFile[cur] = addedLinesByFile[cur] || []); (deletedLinesByFile[cur] = deletedLinesByFile[cur] || []); continue; }
    if (!cur) continue;
    if (line.startsWith("+") && !line.startsWith("+++")) addedLinesByFile[cur].push(line.slice(1));
    else if (line.startsWith("-") && !line.startsWith("---")) deletedLinesByFile[cur].push(line.slice(1));
  }
}

out.atoms = {}; // path -> [{name, kind}]
const delSetByFile = {};
for (const [p, lines] of Object.entries(deletedLinesByFile)) delSetByFile[p] = new Set(lines);
for (const p of realSet) {
  const fam = patternFor(p);
  const added = (addedLinesByFile[p] || []).join("\n");
  if (!added) { out.atoms[p] = []; continue; }
  const delSet = delSetByFile[p] || new Set();
  const atoms = [];
  if (!fam) {
    // no language family: still note it changed; try a generic "config key" heuristic
    for (const line of added.split("\n")) {
      const m = line.match(/^\s*["']?([A-Za-z_][A-Za-z0-9_.-]{2,})["']?\s*:/);
      if (m && !delSet.has(line.trim())) atoms.push({ name: m[1], kind: "key" });
    }
  } else {
    for (const [re, kind] of ATOM_PATTERNS[fam]) {
      for (const line of added.split("\n")) {
        const m = line.match(re);
        if (m && m[1] && !delSet.has(line.trim())) atoms.push({ name: m[1], kind });
      }
    }
  }
  // dedupe keep-first
  const seen = new Set();
  out.atoms[p] = atoms.filter(a => { const k = a.kind + ":" + a.name; if (seen.has(k)) return false; seen.add(k); return true; });
}

// v3: sidecar — look for a previously written .weekly-report/ sidecar (the project
// repo owns its own history) so a caller can diff "since last report".
out.sidecar = null;
try {
  const scDir = join(dir, ".weekly-report");
  const files = existsSync(scDir) ? readdirSync(scDir).filter(f => f.endsWith(".json")).sort() : [];
  if (files.length) {
    const last = JSON.parse(readFileSync(join(scDir, files[files.length - 1]), "utf8"));
    out.sidecar = { file: files[files.length - 1], date: last.date || null, features: (last.features || []).map(f => ({ id: f.id, summary: f.summary })) };
  }
} catch { /* sidecar is best-effort */ }

out.summary = {
  commitCount: out.commits.length,
  stale: out.stale,
  changedFileSet: [...realSet].sort(),
  noiseFileSet: [...noiseSet].sort(),
  churn: { // window line totals over all commit files (regenerated/noise still counts;
           // subtract per-file if you want "real work only" — noiseFileSet tells you which)
    additions: out.commits.reduce((s, c) => s + (c.additions ?? 0), 0),
    deletions: out.commits.reduce((s, c) => s + (c.deletions ?? 0), 0),
  },
};

console.log(JSON.stringify(out, null, 2));
