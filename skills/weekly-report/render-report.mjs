#!/usr/bin/env node
// render-report.mjs — presentation layer for a weekly report.
//
// report.md (+ evidence/stats + screenshots)  ->  styled HTML  ->  PDF
//
// The .md stays the source of truth; this adds what a *presentation* needs:
//   - KPI stat strip (commits / feat+fix / modules / files)
//   - cover meta block: the report's leading 数据来源/口径说明, split into labeled rows
//     (no per-day commit chart — completion timing stays deliberately coarse)
//   - section styling: 已交付 shipped / 指标 metrics / 风险 risk / 下周计划 next / neutral
//   - auto screenshot gallery (--urls) or your own shots (--shots-dir)
// Out: <report-base>-展示.html + <report-base>-展示.pdf next to the .md.
//
// Usage:
//   node render-report.mjs <report.md> [--evidence <evidence.json>]
//                                      [--urls "https://a;https://b"]
//                                      [--shots-dir <dir>]
//                                      [--brand <logo.svg>]
//                                      [--author <name>] [--github <login>] [--avatar <file>]
//                                      [--out <file.pdf>]

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { findEngine, printToPdf, screenshotUrl } from './screenshot.mjs';

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
const brandSvg = opt('--brand');      // 半透明水印（公司 logo SVG；不随技能分发）
// 封面身份：逗号分隔可列多人，按位置配对（本人放第一位）。报告里有几个作者就写几个。
const splitList = (s) => (s || '').split(',').map((x) => x.trim()).filter(Boolean);
const authorArgs = splitList(opt('--author'));   // 姓名
const githubArgs = splitList(opt('--github'));   // GitHub 账号（用于取头像）
const avatarArgs = splitList(opt('--avatar'));   // 本地头像文件（优先于按账号拉取）
const noKpi = args.includes('--no-kpi');  // 一页纸这类"不报活动量"的文档：只保留身份条/水印/封面说明

if (!mdFile || !existsSync(mdFile)) {
  console.error('usage: node render-report.mjs <report.md> [--evidence <evidence.json>] [--urls "..."] [--shots-dir <dir>] [--out <file.pdf>]');
  process.exit(1);
}

// ---------- stats (from evidence.json, additive: everything optional) ----------
let stats = { commits: 0, feat: 0, fix: 0, files: 0 };
if (evidenceFile && existsSync(evidenceFile)) {
  const ev = JSON.parse(readFileSync(evidenceFile, 'utf8'));
  const cm = ev.commits || [];
  stats.commits = cm.length;
  stats.feat = cm.filter((c) => /^feat/i.test(c.subject)).length;
  stats.fix = cm.filter((c) => /^fix/i.test(c.subject)).length;
  stats.files = new Set(cm.flatMap((c) => c.files.map((f) => f.to || f.from || f.path))).size;
}

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
  const meta = [];   // 报告开头的 数据来源/口径说明 → 提到封面，按行分段
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
    if (/^\s*(---|\*\*\*)\s*$/.test(line)) {
      closeLists(0);
      // 封面元信息（数据来源/口径说明）后紧跟的分隔线：不再单独渲染成一条横线
      if (out.length === 0 && meta.length) { i++; continue; }
      closeSec(); out.push('<hr>'); i++; continue;
    }
    if (/^>\s?/.test(line)) {
      closeLists(0);
      const q = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(renderInline(lines[i].replace(/^>\s?/, ''))); i++; }
      // 正文开始前的引用块 = 报告的 数据来源/口径说明，收进封面分段展示
      if (out.length === 0) { meta.push(...q); continue; }
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
  return { meta, html: out.join('\n') };
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
  // 模块标题可能是 ### 模块 A（归档版）或 ## 模块 A（分人版），两种都算
  return (s.match(/^#{2,3}\s*模块\s*[A-Z]?/gm) || []).length;
}

// 封面元信息：报告开头的 数据来源 / 口径说明，按行拆成带标签的分段（不用每日提交图）
function metaBlock(meta) {
  if (!meta.length) return '';
  const rows = meta
    .map((line) => {
      const m = line.match(/^([^：:]{2,8})[：:]\s*(.*)$/);
      return m
        ? `<div class="meta-row"><span class="meta-k">${m[1]}</span><span class="meta-v">${m[2]}</span></div>`
        : `<div class="meta-row"><span class="meta-v">${line}</span></div>`;
    })
    .join('');
  return `<div class="meta">${rows}</div>`;
}

// ---------- screenshot gallery (images embedded as data: URIs — self-contained deliverable) ----------
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
const dataUri = (f) => {
  const ext = f.split('.').pop().toLowerCase();
  return `data:${MIME[ext] || 'image/png'};base64,${readFileSync(f).toString('base64')}`;
};

async function galleryHtml() {
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
    const r = await screenshotUrl(u, f);
    if (r.ok) items.push({ src: dataUri(f), label: u });
    else console.error(`[render-report] screenshot failed: ${u} (${r.error}) — skipped`);
  }
  rmSync(tmp, { recursive: true, force: true });
  if (!items.length) return '';
  const grid = items.map((it) => `<figure class="shot"><img src="${it.src}" alt="${esc(it.label)}"><figcaption>${esc(it.label)}</figcaption></figure>`).join('');
  return `<section class="sec sec-shots"><h2><span class="chip chip-neutral">实景截图</span> product at a glance</h2><div class="grid">${grid}</div></section>`;
}

// ---------- brand watermark + author identity (both optional, both self-contained) ----------
// 水印：--brand <logo.svg> → 整页半透明背景（data URI 内嵌，HTML/PDF 都是单文件）。
// 身份：--author / --github / --avatar，缺省回退 git config user.name + gh 登录名。
function dataUriOfFile(f, mime) {
  try {
    return `data:${mime};base64,${readFileSync(f).toString('base64')}`;
  } catch {
    return null;
  }
}

function watermarkCss() {
  if (!brandSvg || !existsSync(brandSvg)) return '';
  const uri = dataUriOfFile(brandSvg, 'image/svg+xml');
  if (!uri) return '';
  return `
body::before { content:""; position:fixed; inset:0; z-index:-1; pointer-events:none; opacity:.07;
  background:url("${uri}") center 42%/44% no-repeat; }`;
}

function gitCfg(key) {
  const r = spawnSync('git', ['config', key], { encoding: 'utf8', timeout: 10_000 });
  return r.status === 0 ? (r.stdout || '').trim() : '';
}

function ghJq(args) {
  const r = spawnSync('gh', args, { encoding: 'utf8', timeout: 20_000 });
  return r.status === 0 ? (r.stdout || '').trim() : '';
}

async function avatarDataUri(login, file) {
  if (file && existsSync(file)) {
    const ext = file.split('.').pop().toLowerCase();
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
    return dataUriOfFile(file, mime);
  }
  if (!login) return null;
  const url = ghJq(['api', `users/${login}`, '--jq', '.avatar_url']);
  if (!url) return null;
  try {
    const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}s=160`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > 512 * 1024) return null;
    return `data:${res.headers.get('content-type') || 'image/png'};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

async function identityBlock() {
  // 报告里有几个作者就渲染几个：--author/--github/--avatar 逗号分隔、按位置配对
  const count = Math.max(authorArgs.length, githubArgs.length, avatarArgs.length);
  const people = [];
  if (count === 0) {
    // 单人兜底：当前 git 用户 + gh 登录名
    const name = gitCfg('user.name');
    const login = ghJq(['api', 'user', '--jq', '.login']);
    if (name || login) people.push({ name, login, file: null });
  } else {
    for (let i = 0; i < count; i++) {
      people.push({ name: authorArgs[i] || '', login: githubArgs[i] || '', file: avatarArgs[i] || null });
    }
  }
  if (!people.length) return '';

  const cards = [];
  for (let i = 0; i < people.length; i++) {
    const p = people[i];
    const avatar = await avatarDataUri(p.login, p.file);
    const initials = (p.name || p.login || '?').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() || '?';
    const face = avatar
      ? `<img class="avatar" src="${avatar}" alt="">`
      : `<span class="avatar avatar-initials">${esc(initials)}</span>`;
    // 邮箱只在单人时展示（多人的话邮箱属于谁分不清）
    const sub = [p.login ? `@${p.login}` : '', people.length === 1 ? gitCfg('user.email') : ''].filter(Boolean).join(' · ');
    cards.push(
      `<span class="person">${face}<span class="who"><b>${esc(p.name || p.login)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</span></span>`
    );
  }
  return `<div class="identity">${cards.join('')}</div>`;
}

// ---------- assemble ----------
const md = readFileSync(mdFile, 'utf8');
const title = (md.match(/^#\s+(.+)$/m) || [,''])[1];
const { meta, html: body } = mdToHtml(md);
const shots = await galleryHtml();
const identity = await identityBlock();
const watermark = watermarkCss();

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
.identity { display:flex; flex-wrap:wrap; align-items:center; gap:.5em 1.6em; margin:0 0 .75em; }
.person { display:inline-flex; align-items:center; gap:.7em; }
.avatar { width:44px; height:44px; border-radius:50%; border:1px solid var(--line); object-fit:cover; background:var(--bg); }
.avatar-initials { display:flex; align-items:center; justify-content:center; font-weight:700; color:var(--ink2); }
.identity .who { display:flex; flex-direction:column; line-height:1.32; }
.identity .who b { font-size:1.02em; color:var(--ink); }
.identity .who span { font-size:.82em; color:var(--ink2); }
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
.meta { display:flex; flex-direction:column; gap:.35em; margin:.75em 0 0; padding-top:.7em; border-top:1px solid var(--line); }
.meta-row { display:flex; gap:.6em; font-size:.86em; color:var(--ink2); line-height:1.5; }
.meta-k { flex:0 0 auto; height:fit-content; font-weight:600; color:var(--ink); background:var(--bg); border:1px solid var(--line); border-radius:6px; padding:.05em .5em; }
.meta-v { flex:1; min-width:0; }
.grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.shot { margin:0; border:1px solid var(--line); border-radius:8px; overflow:hidden; break-inside:avoid; }
.shot img { width:100%; display:block; }
.shot figcaption { font-size:.78em; color:var(--ink2); padding:.4em .6em; background:var(--soft); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
`;

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>${esc(title || basename(mdFile, '.md'))}</title>
<style>${CSS}${watermark}</style></head>
<body>
<section class="cover">
  ${identity}
  <h1>${esc(title)}</h1>
  ${stats.commits && !noKpi ? kpiStrip() : ''}
  ${metaBlock(meta)}
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
  console.error('[render-report] exit 2 = 展示版 PDF 未产出 — 不许当成完成，收尾第一行必须点明。');
  process.exit(2);
}
// 必须绝对路径：Chromium 的 --print-to-pdf 不认相对路径，会 exit 0 但不写文件（静默失败）
const pdfPath = resolve(outPdf || join(dirname(mdFile), `${base}-展示.pdf`));
const res = await printToPdf({ engine, htmlPath, pdfPath, timeoutMs: 120_000 });
if (!res.ok) {
  console.error(`[render-report] PDF failed: ${res.error} — HTML delivered`);
  console.error('[render-report] exit 2 = 展示版 PDF 未产出 — 不许当成完成，收尾第一行必须点明。');
  process.exit(2);
}
console.log(`[render-report] PDF → ${pdfPath} (${(res.size / 1024).toFixed(1)} KB)`);

// ---------- 自检（Step 4 gate 的机器版：收尾前不用靠肉眼猜封面有没有身份） ----------
const hasIdentity = /class="identity"/.test(html);
const hasAvatar = /class="avatar" src="data:image\//.test(html);
const hasWatermark = /data:image\/svg\+xml;base64,/.test(html);
console.log(`[render-report] 自检 identity=${hasIdentity ? 'ok' : 'MISSING'} ` +
  `avatar=${hasAvatar ? 'ok' : 'MISSING'} watermark=${hasWatermark ? 'ok' : 'none(未传 --brand)'}`);
if (!hasIdentity) {
  console.error('[render-report] WARN identity=MISSING — 封面没有身份条：补 --author/--github 重跑（Step 4 gate 不通过）。');
}
if (!hasAvatar) {
  console.error('[render-report] WARN avatar=MISSING — 只落了姓名缩写：能联网/gh 可用时补 --github（或 --avatar）重跑。');
}
