#!/usr/bin/env node
/**
 * render.test.mjs — golden + smoke test for the render layer (zero deps, CI-safe).
 *
 * The evidence layer has scripts/eval/run.mjs; this covers the OTHER half of the
 * pipeline that previously had no automated coverage: render-report.mjs's
 * hand-rolled md -> HTML parser, KPI strip, cover meta rows, section chips,
 * screenshot gallery, and the two PDF paths (render-report + render-pdf).
 *
 * It spawns the REAL scripts against a fixture report (test/fixtures/render/)
 * into a temp dir (so repo stays clean), then asserts on structure:
 *
 *   - HTML: cover title, KPI tiles (computed from evidence.json), cover meta
 *     rows lifted from the leading 数据来源/口径说明 blockquote (and no per-day
 *     chart), per-section chips, module cards, tables, fenced code, warn
 *     blockquotes, data-URI screenshot gallery, footer.
 *   - PDF: if a Chromium engine exists the PDF must exist and be non-empty;
 *     if not, the script must skip cleanly (never fake success, never crash).
 *
 * CI (ubuntu-latest) has no Chrome/Edge: HTML assertions are the gate; the PDF
 * skip path is asserted. Locally on Windows/macOS the PDF path is exercised.
 *
 * Usage: node test/render.test.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, statSync, readdirSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDir = join(root, "test", "fixtures", "render");
const renderReport = join(root, "skills", "weekly-report", "render-report.mjs");
const renderPdf = join(root, "skills", "weekly-report", "render-pdf.mjs");

let failed = 0;
function check(name, cond, ctx = "") {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failed++;
    console.error(`  ✗ ${name}${ctx ? `\n     ${ctx}` : ""}`);
  }
}

// 1x1 PNG (single byte payload) — enough to prove the data:URI embedding path.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

// ---------- build a temp working set (fixture files are read-only sources) ----------
const tmp = mkdtempSync(join(tmpdir(), "weekly-report-render-"));
const md = join(tmp, "report.md");
const ev = join(tmp, "evidence.json");
const shots = join(tmp, "shots");
cpSync(join(fixtureDir, "report.md"), md);
cpSync(join(fixtureDir, "evidence.json"), ev);
const shotsDir = join(tmp, "shots");
mkdirSync(shotsDir, { recursive: true });
writeFileSync(join(shotsDir, "shots-a.png"), TINY_PNG);
writeFileSync(join(shotsDir, "shots-b.png"), TINY_PNG);

console.log("== render-report.mjs (HTML golden + PDF smoke) ==");
const res = spawnSync(
  process.execPath,
  [renderReport, md, "--evidence", ev, "--shots-dir", shotsDir],
  { encoding: "utf8", timeout: 180_000 }
);
const stderr = res.stderr || "";
check("exit 0", res.status === 0, `status=${res.status} stderr=${stderr.trim().slice(0, 200)}`);

const htmlPath = join(tmp, "report-展示.html");
check("HTML written", existsSync(htmlPath));
if (existsSync(htmlPath)) {
  const html = readFileSync(htmlPath, "utf8");

  check("cover title", html.includes("<h1>2026-09-08 周报（09-01 ~ 09-08）</h1>"));
  check(
    "KPI tile 提交数=6",
    /<span class="tile-v">6<\/span><span class="tile-l">提交数<\/span>/.test(html)
  );
  check(
    "KPI tile feat/fix=4/2",
    /<span class="tile-v">4\/2<\/span><span class="tile-l">feat \/ fix<\/span>/.test(html)
  );
  check(
    "KPI tile 功能模块=2",
    /<span class="tile-v">2<\/span><span class="tile-l">功能模块<\/span>/.test(html)
  );
  check(
    "KPI tile 变更文件=7",
    /<span class="tile-v">7<\/span><span class="tile-l">变更文件<\/span>/.test(html)
  );

  check("no per-day commit chart", !html.includes("每日提交数") && !html.includes('class="baseline"'));
  check("cover meta rows from leading blockquote",
    html.includes('class="meta"') &&
    html.includes('<span class="meta-k">数据来源</span>') &&
    html.includes('<span class="meta-k">口径说明</span>') &&
    html.includes('<span class="meta-k">分段</span>'));
  check("leading blockquote not duplicated below cover", !/<blockquote[^>]*>数据来源/.test(html));

  check("section chip 指标", html.includes('class="chip chip-metrics"'));
  check("section chip 风险 / 遗留", html.includes('class="chip chip-risk"') && html.includes(">风险 / 遗留<"));
  check("section chip 下周计划", html.includes('class="chip chip-next"'));
  check("module card h3", html.includes('<h3 class="mod">模块 A：检索服务升级</h3>'));
  check("table rendered", html.includes("<table><thead><tr><th>模块</th>"));
  check("fenced code rendered", html.includes("<pre><code>") && html.includes("@PostMapping(\"/api/search\")"));
  check("warn blockquote", html.includes('<blockquote class="warn">'));
  check("screenshot gallery embedded as data:URI",
    html.includes('class="sec sec-shots"') &&
    html.includes('data:image/png;base64,') &&
    (html.match(/<figure class="shot">/g) || []).length === 2);

  check("footer provenance", html.includes("generated by weekly-report skill"));
  check("no NaN/undefined leaks", !html.includes("NaN") && !html.includes("undefined"));
}

const pdfPath = join(tmp, "report-展示.pdf");
if (existsSync(pdfPath)) {
  check("PDF exists and non-empty", statSync(pdfPath).size > 0, `size=${statSync(pdfPath).size}`);
} else {
  check("PDF clean skip (no engine)", /PDF skipped|PDF failed/.test(stderr), stderr.trim().slice(0, 200));
}

console.log("== render-pdf.mjs (quick-PDF smoke) ==");
const res2 = spawnSync(process.execPath, [renderPdf, md], { encoding: "utf8", timeout: 120_000 });
const stderr2 = res2.stderr || "";
const quickPdf = join(tmp, "report.pdf");
if (res2.status === 0) {
  check("quick PDF exists and non-empty", existsSync(quickPdf) && statSync(quickPdf).size > 0);
} else if (res2.status === 2) {
  check("quick PDF clean skip (exit 2)", /no Chromium browser found/.test(stderr2), stderr2.trim().slice(0, 200));
} else {
  check("quick PDF unexpected exit", false, `status=${res2.status} stderr=${stderr2.trim().slice(0, 200)}`);
}

if (failed) {
  console.error(`\nFAIL — ${failed} assertion(s)`);
  process.exit(1);
}
console.log("\nPASS — render layer golden + smoke ok.");
