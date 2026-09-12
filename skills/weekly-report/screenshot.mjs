#!/usr/bin/env node
// screenshot.mjs — capture real pages with headless Edge/Chrome (zero deps).
//
// CLI:
//   node screenshot.mjs <outdir> <url> [<url> ...]
//   -> <outdir>/<host><path>.png (path slashes -> _)
//
// Also exports helpers used by render-report.mjs and render-pdf.mjs.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const POLL_MS = 250;
const EXIT_GRACE_MS = 5_000;

export function findEngine() {
  const candidates = [
    process.env.CHROME_BIN,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe') : null,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (found) return found;
  for (const name of ['msedge', 'google-chrome', 'chromium', 'microsoft-edge']) {
    const probe = spawnSync(name, ['--version'], { stdio: 'ignore' });
    if (!probe.error) return name;
  }
  return null;
}

function fileSize(file) {
  try {
    return statSync(file).size;
  } catch {
    return 0;
  }
}

function killTree(child) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try { child.kill('SIGKILL'); } catch { /* already exited */ }
  }
}

async function renderToFile({ engine, args, outFile, minBytes = 1, timeoutMs = 60_000 }) {
  if (!engine) return { ok: false, error: 'no Chromium engine found' };

  const profileDir = mkdtempSync(join(tmpdir(), 'weekly-report-browser-'));
  try { rmSync(outFile, { force: true }); } catch (error) {
    rmSync(profileDir, { recursive: true, force: true });
    return { ok: false, error: `cannot replace existing output: ${error.message}` };
  }

  let child;
  try {
    child = spawn(
      engine,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${profileDir}`,
        ...args,
      ],
      { stdio: 'ignore', windowsHide: true }
    );
  } catch (error) {
    rmSync(profileDir, { recursive: true, force: true });
    return { ok: false, error: error.message };
  }

  let spawnError;
  let exitState;
  child.once('error', (error) => {
    spawnError = error;
    exitState ||= { at: Date.now(), code: null, signal: null };
  });
  child.once('close', (code, signal) => {
    exitState = { at: Date.now(), code, signal };
  });

  const deadline = Date.now() + timeoutMs;
  let previousSize = 0;
  let ready = false;
  while (Date.now() < deadline) {
    const size = fileSize(outFile);
    if (size >= minBytes && size === previousSize) {
      ready = true;
      break;
    }
    previousSize = size;
    if (exitState && Date.now() - exitState.at >= EXIT_GRACE_MS) break;
    await delay(POLL_MS);
  }
  if (fileSize(outFile) >= minBytes && fileSize(outFile) === previousSize) ready = true;

  if (ready && child.exitCode === null && child.signalCode === null) {
    killTree(child);
    await delay(100);
  }
  if (!ready) killTree(child);
  try { rmSync(profileDir, { recursive: true, force: true }); } catch { /* browser may still hold profile files */ }

  if (!ready) {
    const detail = spawnError?.message || (exitState ? `exit ${exitState.code ?? exitState.signal}` : `timed out after ${timeoutMs}ms`);
    return { ok: false, error: detail };
  }
  return { ok: true, file: outFile, size: fileSize(outFile) };
}

export async function screenshotUrl(url, outFile, engine = findEngine()) {
  const result = await renderToFile({
    engine,
    outFile,
    minBytes: 1024,
    timeoutMs: 90_000,
    args: [
      '--hide-scrollbars',
      '--window-size=1440,900',
      '--virtual-time-budget=15000',
      `--screenshot=${outFile}`,
      url,
    ],
  });
  return result.ok ? { ...result, kb: Math.round(result.size / 1024) } : { ...result, url };
}

export async function printToPdf({ engine = findEngine(), htmlPath, pdfPath, timeoutMs = 60_000 }) {
  return renderToFile({
    engine,
    outFile: pdfPath,
    minBytes: 1,
    timeoutMs,
    args: ['--no-pdf-header-footer', `--print-to-pdf=${pdfPath}`, pathToFileURL(htmlPath).href],
  });
}

export async function captureUrls(urls, outDir) {
  const engine = findEngine();
  const results = [];
  for (const url of urls) {
    const name = url.replace(/^https?:\/\//, '').replace(/[^\w.-]/g, '_').slice(0, 120) + '.png';
    const out = join(outDir, name);
    results.push({ url, ...(await screenshotUrl(url, out, engine)) });
  }
  return results;
}

// CLI mode
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('screenshot.mjs')) {
  const [outdir, ...urls] = process.argv.slice(2);
  if (!outdir || !urls.length) {
    console.error('usage: node screenshot.mjs <outdir> <url> [<url> ...]');
    process.exit(1);
  }
  const results = await captureUrls(urls, outdir);
  let failed = 0;
  for (const r of results) {
    if (r.ok) console.log(`[shot] OK ${r.kb}KB  ${r.url} -> ${r.file}`);
    else { failed++; console.error(`[shot] FAIL ${r.url}: ${r.error}`); }
  }
  process.exit(failed ? 1 : 0);
}
