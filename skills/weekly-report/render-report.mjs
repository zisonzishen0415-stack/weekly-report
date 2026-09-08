#!/usr/bin/env node
// render-report.mjs — presentation layer for a weekly report.
//
// report.md (+ evidence/stats + screenshots)  ->  styled HTML  ->  PDF
//
// The .md stays the source of truth; this adds what a *presentation* needs:
//   - KPI stat strip (commits / feat+fix / modules / files)
//   - per-day commit bar chart (single-series, validated palette, inline SVG)
//   - section styling: 已交付 shipped / 指标 metrics / 风险 risk / 下周计划 next / neutral
//   - auto screenshot gallery (--urls) or your own shots (--shots-dir)
// Out: <report-base>-展示.html + <report-base>-展示.pdf next to the .md.
//
// Usage:
//   node render-report.mjs <report.md> [--evidence <evidence.json>]
//                                      [--urls "https://a;https://b"]
//                                      [--shots-dir <dir>]
//                                      [--out <file.pdf>]

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findEngine, screenshotUrl } from './screenshot.mjs';

// ---------- CLI ----------
const args = process.argv.slice(2);
const mdFile = args.find((a) => !a.startsWith('--'));
const opt = (flag) => {
  const i = args.indexOf(flag);
  return i > -1 ? args[i + 1] : undefined;
};
const evidenceFile = opt('--evidence');
const urls = (opt('--urls') || '').split(';').map((s) => s.trim()).filter(Boolean);
const shotsDir = opt('--shots-dir');
const outPdf = opt('--out');

if (!mdFile || !existsSync(mdFile)) {
  console.error('usage: node render-report.mjs <report.md> [--evidence <evidence.json>] [--urls "..."] [--shots-dir <dir>] [--out <file.pdf>]');
  process.exit(1);
}

// ---------- stats (from evidence.json, additive: everything optional) ----------
let stats = { commits: 0, feat: 0, fix: 0, files: 0, perDay: new Map(), windowStart: null, windowEnd: null };
if (evidenceFile && existsSync(evidenceFile)) {
  const ev = JSON.parse(readFileSync(evidenceFile, 'utf8'));
  const cm = ev.commits || [];
  stats.commits = cm.length;
  stats.feat = cm.filter((c) => /^feat/i.test(c.subject)).length;
  stats.fix = cm.filter((c) => /^fix/i.test(c.subject)).length;
  stats.files = new Set(cm.flatMap((c) => c.files.map((f) => f.to || f.from || f.path))).size;
  for (const c of cm) {
    const d = String(c.date).slice(0, 10);
    stats.perDay.set(d, (stats.perDay.get(d) || 0) + 1);
  }
  stats.windowStart = ev.window?.start || null;
}
const today = new Date().toISOString().slice(0, 10);
stats.windowEnd = today;

// ---------- markdown -> presentation HTML ----------
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function renderInline(s) {
  let t = esc(s);
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  return t;
}

// section kind from heading text (text-label first; chip carries label, never color alone)
const SECTION_KIND = [
  [/已交付|交付|完成|shipped/, 'shipped', '已交付'],
  [/指标|数据|metrics/, 'metrics', '指标'],
  [/风险|阻塞|需支援|遗留|risk/, 'risk', '风险 / 遗留'],
  [/下周|计划|规划|下一步|next/, 'next', '下周计划'],
  [/亮点|复用|glow/, 'glow', '亮点'],
];
const kindOf = (txt) => SECTION_KIND.find(([re]) => re.test(txt)) || ['', 'neutral', ''];

function mdToHtml(md) {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  let listStack = [];
  let secOpen = false;
  const closeSec = () => { if (secOpen) { out.push('</section>'); secOpen = false; } };
  const closeLists = (depth) => { while (listStack.length && listStack[listStack.length - 1].depth >= depth) out.push(`</${listStack.pop().tag}>`); };

  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {
      closeLists(0);
      out.push('<pre><code>');
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) { out.push(esc(lines[i])); i++; }
      out.push('</code></pre>');
      i++;
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeLists(0);
      const level = Math.min(h[1].length, 4);
      const text = h[2];
      if (level === 1) { closeSec(); /* h1 is rendered by the cover header above */ }
      else if (level === 2) {
        closeSec();
        const [, kind, label] = kindOf(text);
        const title = renderInline(text);
        out.push(kind
          ? `<section class="sec sec-${kind}"><h2><span class="chip chip-${kind}">${label}</span> ${title}</h2>`
          : `<section class="sec"><h2>${title}</h2>`);
        secOpen = true;
      } else if (level === 3) out.push(`<h3 class="mod">${renderInline(text)}</h3>`);
      else out.push(`<h${level}>${renderInline(text)}</h${level}>`);
      i++;
      continue;
    }
    if (/^\s*(---|\*\*\*)\s*$/.test(line)) { closeLists(0); closeSec(); out.push('<hr>'); i++; continue; }
    if (/^>\s?/.test(line)) {
      closeLists(0);
      const q = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(renderInline(lines[i].replace(/^>\s?/, ''))); i++; }
      const body = q.join('<br>');
      out.push(/风险|缺失|未提交|需支援/.test(body) ? `<blockquote class="warn">${body}</blockquote>` : `<blockquote>${body}</blockquote>`);
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(lines[i]), i++;
      const cells = (r) => r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => renderInline(c.trim()));
      const isSep = (r) => /^\s*\|?[\s:|-]+\|?\s*$/.test(r) && !/[A-Za-z0-9一-鿿]/.test(r);
      let t = '<table><thead><tr>' + cells(rows[0]).map((c) => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
      for (let r = 1; r < rows.length; r++) { if (isSep(rows[r])) continue; t += '<tr>' + cells(rows[r]).map((c) => `<td>${c}</td>`).join('') + '</tr>'; }
      out.push(t + '</tbody></table>');
      continue;
    }
    const li = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
    if (li) {
      const depth = Math.floor(li[1].replace(/\t/g, '  ').length / 2);
      const tag = /^\d+\.$/.test(li[2]) ? 'ol' : 'ul';
      while (listStack.length && listStack[listStack.length - 1].depth > depth) out.push(`</${listStack.pop().tag}>`);
      if (!listStack.length || listStack[listStack.length - 1].depth < depth) { out.push(`<${tag}>`); listStack.push({ tag, depth }); }
      else if (listStack[listStack.length - 1].tag !== tag) { out.push(`</${listStack.pop().tag}><${tag}>`); listStack.push({ tag, depth }); }
      out.push(`<li>${renderInline(li[3])}</li>`);
      i++;
      continue;
    }
    closeLists(0);
    if (/^\s*$/.test(line)) { i++; continue; }
    const para = [line];
    i++;
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,6})\s/.test(lines[i]) && !/^```/.test(lines[i])) { para.push(lines[i]); i++; }
    out.push(`<p>${para.map(renderInline).join(' ')}</p>`);
  }
  closeLists(0);
  closeSec();
  return out.join('\n');
}

// ---------- KPI strip + per-day bar chart (single series; validated palette) ----------
function kpiStrip() {
  const tiles = [
    [stats.commits, '提交数'],
    [`${stats.feat}/${stats.fix}`, 'feat / fix'],
    [mdModules(), '功能模块'],
    [stats.files, '变更文件'],
  ];
  return `<div class="kpi">${tiles.map(([v, l]) => `<div class="tile"><span class="tile-v">${v}</span><span class="tile-l">${l}</span></div>`).join('')}</div>`;
}

function mdModules() {
  const s = readFileSync(mdFile, 'utf8');
  return (s.match(/^###\s+模块\s*[A-Z]?/gm) || []).length;
}

const localIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function barChart() {
  if (!stats.windowStart) return '';
  // window days: evidence start .. today (cap at 45)
  const days = [];
  const d0 = new Date(stats.windowStart + 'T00:00:00');
  const d1 = new Date((stats.commits ? stats.perDay.keys().next().value || today : today) + 'T00:00:00');
  const end = d1 > new Date(today + 'T00:00:00') ? d1 : new Date(today + 'T00:00:00');
  for (let d = new Date(d0); d <= end && days.length < 45; d.setDate(d.getDate() + 1)) {
    const iso = localIso(d);
    days.push({ iso, n: stats.perDay.get(iso) || 0 });
  }
  const max = Math.max(1, ...days.map((x) => x.n));
  const W = 720, H = 170, padL = 8, padB = 22, padT = 22;
  const bw = (W - padL * 2) / days.length;
  const bars = days
    .map((x) => {
      const h = max ? (x.n / max) * (H - padB - padT) : 0;
      const bx = padL + bw * days.indexOf(x) + 2.5;
      const by = H - padB - h;
      const label = x.n > 0 ? `<text x="${bx + bw / 2 - 2.5}" y="${by - 7}" class="bv">${x.n}</text>` : '';
      return `<rect x="${bx}" y="${by}" width="${bw - 5}" height="${Math.max(h, 3)}" rx="4" class="bar ${x.n ? '' : 'zero'}"><title>${x.iso} · ${x.n} 条提交</title></rect>${label}`;
    })
    .join('');
  const ticks = days
    .map((x) => `<text x="${padL + bw * days.indexOf(x) + bw / 2 - 2.5}" y="${H - 6}" class="bax">${x.iso.slice(5).replace('-', '/')}</text>`)
    .join('');
  return `
  <figure class="chart">
    <figcaption>每日提交数（${days[0]?.iso} ~ ${today}）</figcaption>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="每日提交数柱状图">
      <line x1="${padL}" y1="${H - padB}" x2="${W - padL}" y2="${H - padB}" class="baseline"/>
      ${bars}${ticks}
    </svg>
  </figure>`;
}

// ---------- screenshot gallery (images embedded as data: URIs — self-contained deliverable) ----------
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
const dataUri = (f) => {
  const ext = f.split('.').pop().toLowerCase();
  return `data:${MIME[ext] || 'image/png'};base64,${readFileSync(f).toString('base64')}`;
};

function galleryHtml() {
  const items = [];
  const tmp = mkdtempSync(join(tmpdir(), 'weekly-shot-'));
  if (shotsDir && existsSync(shotsDir)) {
    for (const f of readdirSync(shotsDir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort()) {
      items.push({ src: dataUri(join(shotsDir, f)), label: f });
    }
  } else if (shotsDir) {
    console.error(`[render-report] shotsDir not found (${shotsDir}) — gallery empty; give a Windows/absolute path or repo-relative path.`);
    rmSync(tmp, { recursive: true, force: true });
    return '';
  }
  for (const u of urls) {
    const f = join(tmp, u.replace(/^https?:\/\//, '').replace(/[^\w.-]/g, '_').slice(0, 120) + '.png');
    const r = screenshotUrl(u, f);
    if (r.ok) items.push({ src: dataUri(f), label: u });
    else console.error(`[render-report] screenshot failed: ${u} (${r.error}) — skipped`);
  }
  rmSync(tmp, { recursive: true, force: true });
  if (!items.length) return '';
  const grid = items.map((it) => `<figure class="shot"><img src="${it.src}" alt="${esc(it.label)}"><figcaption>${esc(it.label)}</figcaption></figure>`).join('');
  return `<section class="sec sec-shots"><h2><span class="chip chip-neutral">实景截图</span> product at a glance</h2><div class="grid">${grid}</div></section>`;
}

// ---------- assemble ----------
const md = readFileSync(mdFile, 'utf8');
const title = (md.match(/^#\s+(.+)$/m) || [,''])[1];
const body = mdToHtml(md);
const shots = galleryHtml();

const CSS = `
:root { --ink:#1f2328; --ink2:#57606a; --line:#d8dee4; --bg:#ffffff; --soft:#f6f8fa; --accent:#2a78d6;
        --good:#0ca30c; --warn:#fab219; --serious:#ec835a; --crit:#d03b3b; }
* { box-sizing: border-box; }
@page { size: A4; margin: 16mm 15mm; }
html { font-size: 14px; }
body { font-family:"Microsoft YaHei","Noto Sans CJK SC","PingFang SC","Segoe UI",sans-serif; color:var(--ink);
       line-height:1.66; margin:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
h1 { font-size:2em; margin:0 0 .2em; }
.cover { background:var(--soft); border:1px solid var(--line); border-radius:10px; padding:.9em 1.1em; margin:0 0 1em; }
.cover h1 { border:0; padding:0; font-size:1.7em; }
h2 { font-size:1.25em; margin:1.5em 0 .7em; break-after:avoid; }
h3 { font-size:1.1em; margin:1.2em 0 .4em; break-after:avoid; }
h4 { font-size:1em; margin:1em 0 .3em; }
p { margin:.5em 0; }
code { font-family:Consolas,"Courier New",monospace; background:var(--soft); padding:.1em .35em; border-radius:3px; font-size:.92em; }
pre { background:var(--soft); border:1px solid var(--line); border-radius:6px; padding:.7em .9em; overflow-x:auto; }
pre code { background:none; padding:0; font-size:.88em; }
blockquote { border-left:4px solid var(--line); margin:.8em 0; padding:.1em 1em; color:var(--ink2); background:var(--soft); }
blockquote.warn { border-left-color:var(--warn); }
table { border-collapse:collapse; width:100%; margin:.8em 0; font-size:.93em; }
th,td { border:1px solid var(--line); padding:.35em .6em; text-align:left; vertical-align:top; }
th { background:var(--soft); }
ul,ol { margin:.5em 0; padding-left:1.6em; }
li { margin:.18em 0; }
hr { border:0; border-top:1px solid var(--line); margin:1.4em 0; }
a { color:var(--accent); text-decoration:none; word-break:break-all; }
.sec > h2 { border-left:5px solid var(--line); padding-left:.6em; }
.sec-shipped > h2 { border-left-color:var(--good); }
.sec-risk > h2 { border-left-color:var(--warn); }
.sec-next > h2 { border-left-color:var(--accent); }
.sec-metrics > h2 { border-left-color:var(--serious); }
.sec-glow > h2 { border-left-color:var(--good); }
.chip { font-size:.78em; font-weight:600; letter-spacing:.02em; color:#fff; background:var(--line);
        border-radius:999px; padding:.15em .7em; margin-right:.5em; vertical-align:.12em; }
.chip-shipped { background:var(--good); } .chip-risk { background:#c77700; } .chip-next { background:var(--accent); }
.chip-metrics { background:var(--serious); } .chip-glow { background:var(--good); } .chip-neutral { background:var(--ink2); }
.mod { background:var(--soft); border:1px solid var(--line); border-radius:8px; padding:.55em .8em; }
.kpi { display:flex; gap:10px; margin:0 0 1em; }
.tile { flex:1; border:1px solid var(--line); border-radius:10px; padding:.6em .8em; text-align:center; background:var(--bg); }
.tile-v { display:block; font-size:1.65em; font-weight:700; color:var(--ink); line-height:1.2; }
.tile-l { display:block; font-size:.78em; color:var(--ink2); margin-top:.2em; }
.chart { margin:.8em 0 1.2em; }
.chart figcaption { font-size:.85em; color:var(--ink2); font-weight:600; margin-bottom:.3em; }
.chart svg { width:100%; height:auto; }
.bar { fill:var(--accent); } .bar.zero { fill:var(--line); }
.baseline { stroke:var(--line); stroke-width:1.5; }
.bv { font-size:12px; fill:var(--ink2); font-family:inherit; }
.bax { font-size:10px; fill:var(--ink2); font-family:inherit; text-anchor:middle; }
.grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.shot { margin:0; border:1px solid var(--line); border-radius:8px; overflow:hidden; break-inside:avoid; }
.shot img { width:100%; display:block; }
.shot figcaption { font-size:.78em; color:var(--ink2); padding:.4em .6em; background:var(--soft); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
`;

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>${esc(title || basename(mdFile, '.md'))}</title>
<style>${CSS}</style></head>
<body>
<section class="cover">
  <h1>${esc(title)}</h1>
  ${stats.commits ? kpiStrip() + barChart() : ''}
</section>
${body}
${shots}
<footer style="margin-top:1.2em;font-size:.75em;color:var(--ink2);">generated by weekly-report skill · render-report.mjs（数据速览与截图自动生成，正文以报告 .md 为准）</footer>
</body></html>`;

// ---------- emit html + pdf ----------
const base = basename(mdFile, '.md');
const htmlPath = join(dirname(mdFile), `${base}-展示.html`);
writeFileSync(htmlPath, html, 'utf8');
console.log(`[render-report] HTML → ${htmlPath}`);

const engine = findEngine();
if (!engine) {
  console.error('[render-report] no Chromium engine found — PDF skipped (HTML delivered).');
  process.exit(0);
}
const pdfPath = outPdf ? resolve(outPdf) : join(dirname(mdFile), `${base}-展示.pdf`);
try { rmSync(pdfPath, { force: true }); } catch { /* 文件被占用（如正被预览）——继续尝试覆盖 */ } // 防旧文件误判“已生成”
const mtimeBefore = existsSync(pdfPath) ? statSync(pdfPath).mtimeMs : 0;
const res = spawnSync(
  engine,
  ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${pdfPath}`, pathToFileURL(htmlPath).href],
  { stdio: 'ignore', timeout: 120_000 }
);
const mtimeAfter = existsSync(pdfPath) ? statSync(pdfPath).mtimeMs : 0;
if (res.error || res.status !== 0 || !existsSync(pdfPath) || statSync(pdfPath).size === 0) {
  console.error(`[render-report] PDF failed: ${res.error?.message || `exit ${res.status ?? res.signal}`} — HTML delivered`);
  process.exit(0);
}
if (mtimeAfter === mtimeBefore) {
  console.error(`[render-report] PDF 未更新：${pdfPath}（可能正被预览程序占用）—— HTML 已更新，关闭旧预览后重跑即可`);
  process.exit(0);
}
console.log(`[render-report] PDF → ${pdfPath} (${(statSync(pdfPath).size / 1024).toFixed(1)} KB)`);
