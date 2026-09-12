#!/usr/bin/env node
// render-pdf.mjs — render a Markdown report to PDF next to it (best-effort).
//
// Pipeline: Markdown -> HTML (embedded mini renderer) -> headless Edge/Chrome --print-to-pdf.
// Uses only Node stdlib + an installed Chromium-based browser. No npm deps.
//
// Usage:
//   node render-pdf.mjs <report.md> [--out <file.pdf>]
//
// Engine detection order: $CHROME_BIN -> Edge (Program Files x86/x64) -> Chrome (User/Program Files).
// If no engine is found, prints a hint and exits 2 (the caller may skip PDF gracefully).

import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { findEngine, printToPdf } from './screenshot.mjs';

// ---------- CLI ----------
const args = process.argv.slice(2);
const mdArgs = args.filter((a) => !a.startsWith('--'));
const mdFile = mdArgs[0];
const outFlag = args.indexOf('--out');
const outFile = outFlag > -1 ? args[outFlag + 1] : undefined;

if (!mdFile) {
  console.error('usage: node render-pdf.mjs <report.md> [--out <file.pdf>]');
  process.exit(1);
}
if (!existsSync(mdFile)) {
  console.error(`render-pdf: no such file: ${mdFile}`);
  process.exit(1);
}

// ---------- Markdown -> HTML (mini renderer, aimed at weekly-report docs) ----------
const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function renderInline(s) {
  let t = esc(s);
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  return t;
}

function mdToHtml(md) {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  let listStack = []; // [{tag, depth}]

  const closeLists = (depth) => {
    while (listStack.length && listStack[listStack.length - 1].depth >= depth) {
      out.push(`</${listStack.pop().tag}>`);
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // fenced code
    if (/^```/.test(line)) {
      closeLists(0);
      out.push('<pre><code>');
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        out.push(esc(lines[i]));
        i++;
      }
      out.push('</code></pre>');
      i++;
      continue;
    }

    // headings
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeLists(0);
      const level = Math.min(h[1].length, 4); // h5/h6 degrade to h4
      out.push(`<h${level}>${renderInline(h[2])}</h${level}>`);
      i++;
      continue;
    }

    // horizontal rule
    if (/^\s*(---|\*\*\*)\s*$/.test(line)) {
      closeLists(0);
      out.push('<hr>');
      i++;
      continue;
    }

    // blockquote run
    if (/^>\s?/.test(line)) {
      closeLists(0);
      const quote = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(renderInline(lines[i].replace(/^>\s?/, '')));
        i++;
      }
      out.push(`<blockquote><p>${quote.join('<br>')}</p></blockquote>`);
      continue;
    }

    // table: | col | col |  (separator row of dashes)
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        rows.push(lines[i]);
        i++;
      }
      const cells = (r) =>
        r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => renderInline(c.trim()));
      const isSep = (r) => /^\s*\|?[\s:|-]+\|?\s*$/.test(r) && !/[A-Za-z0-9\u4e00-\u9fff]/.test(r);
      let html = '<table><thead><tr>' + cells(rows[0]).map((c) => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
      for (let r = 1; r < rows.length; r++) {
        if (isSep(rows[r])) continue;
        html += '<tr>' + cells(rows[r]).map((c) => `<td>${c}</td>`).join('') + '</tr>';
      }
      html += '</tbody></table>';
      out.push(html);
      continue;
    }

    // lists
    const li = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
    if (li) {
      const depth = Math.floor(li[1].replace(/\t/g, '  ').length / 2);
      const isOrdered = /^\d+\.$/.test(li[2]);
      const tag = isOrdered ? 'ol' : 'ul';
      while (listStack.length && listStack[listStack.length - 1].depth > depth) {
        out.push(`</${listStack.pop().tag}>`);
      }
      if (!listStack.length || listStack[listStack.length - 1].depth < depth) {
        out.push(`<${tag}>`);
        listStack.push({ tag, depth });
      } else {
        // same level, type changed: close and reopen
        if (listStack[listStack.length - 1].tag !== tag) {
          out.push(`</${listStack.pop().tag}><${tag}>`);
          listStack.push({ tag, depth });
        }
      }
      out.push(`<li>${renderInline(li[3])}</li>`);
      i++;
      continue;
    }
    closeLists(0);

    // blank line
    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }

    // paragraph (join continuation lines until blank)
    const para = [line];
    i++;
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,6})\s/.test(lines[i]) && !/^```/.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    out.push(`<p>${para.map(renderInline).join(' ')}</p>`);
  }
  closeLists(0);
  return out.join('\n');
}

const HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${esc(basename(outFile || mdFile, '.md'))}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  html { font-size: 14px; }
  body {
    font-family: "Microsoft YaHei", "Noto Sans CJK SC", "PingFang SC", "Segoe UI", sans-serif;
    color: #1f2328; line-height: 1.65; margin: 0; -webkit-print-color-adjust: exact;
  }
  h1 { font-size: 1.6em; border-bottom: 2px solid #d0d7de; padding-bottom: .35em; margin: .6em 0 .8em; }
  h2 { font-size: 1.3em; border-bottom: 1px solid #d8dee4; padding-bottom: .25em; margin: 1.4em 0 .6em; break-after: avoid; }
  h3 { font-size: 1.15em; margin: 1.2em 0 .4em; break-after: avoid; }
  h4 { font-size: 1.05em; margin: 1em 0 .3em; break-after: avoid; }
  p { margin: .5em 0; }
  code { font-family: Consolas, "Courier New", monospace; background: #f2f3f5; padding: .1em .35em; border-radius: 3px; font-size: .92em; }
  pre { background: #f6f8fa; border: 1px solid #d8dee4; border-radius: 6px; padding: .7em .9em; overflow-x: auto; }
  pre code { background: none; padding: 0; font-size: .88em; }
  blockquote { border-left: 4px solid #d0d7de; margin: .8em 0; padding: .1em 1em; color: #57606a; background: #f6f8fa; }
  table { border-collapse: collapse; width: 100%; margin: .8em 0; font-size: .92em; }
  th, td { border: 1px solid #d8dee4; padding: .35em .6em; text-align: left; vertical-align: top; }
  th { background: #f0f3f5; }
  ul, ol { margin: .5em 0; padding-left: 1.6em; }
  li { margin: .15em 0; }
  hr { border: 0; border-top: 1px solid #d8dee4; margin: 1.2em 0; }
  a { color: #0969da; text-decoration: none; word-break: break-all; }
</style>
</head>
<body>
${mdToHtml(readFileSync(mdFile, 'utf8'))}
</body>
</html>`;

// ---------- engine detection ----------
const engine = findEngine();
if (!engine) {
  console.error(
    '[render-pdf] no Chromium browser found (Edge/Chrome) — skipped PDF.\n' +
    '  Install Edge/Chrome, or set CHROME_BIN to a chromium binary.'
  );
  process.exit(2);
}

// ---------- render ----------
const htmlPath = join(tmpdir(), `weekly-report-${Date.now()}.html`);
writeFileSync(htmlPath, HTML, 'utf8');
const pdfPath = resolve(outFile ? outFile : join(dirname(mdFile), basename(mdFile, '.md') + '.pdf'));

const res = await printToPdf({ engine, htmlPath, pdfPath, timeoutMs: 60_000 });
rmSync(htmlPath, { force: true });

if (!res.ok) {
  console.error(`[render-pdf] failed: ${res.error} (${pdfPath})`);
  process.exit(1);
}
console.log(`[render-pdf] OK → ${pdfPath} (${(res.size / 1024).toFixed(1)} KB)`);
