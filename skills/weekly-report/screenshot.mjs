#!/usr/bin/env node
// screenshot.mjs — capture real pages with headless Edge/Chrome (zero deps).
//
// CLI:
//   node screenshot.mjs <outdir> <url> [<url> ...]
//   -> <outdir>/<host><path>.png (path slashes -> _)
//
// Also exports helpers used by render-report.mjs: findEngine(), screenshotUrl().

import { spawnSync } from 'node:child_process';
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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

export function screenshotUrl(url, outFile, engine = findEngine()) {
  if (!engine) return { ok: false, error: 'no Chromium engine found' };
  const res = spawnSync(
    engine,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--window-size=1440,900',
      '--virtual-time-budget=15000',
      `--screenshot=${outFile}`,
      url,
    ],
    { stdio: 'ignore', timeout: 90_000 }
  );
  const ok = !res.error && res.status === 0 && existsSync(outFile) && statSync(outFile).size > 1024;
  return ok
    ? { ok: true, file: outFile, kb: Math.round(statSync(outFile).size / 1024) }
    : { ok: false, error: res.error?.message || `exit ${res.status ?? res.signal}`, url };
}

export function captureUrls(urls, outDir) {
  const engine = findEngine();
  const results = [];
  for (const url of urls) {
    const name = url.replace(/^https?:\/\//, '').replace(/[^\w.-]/g, '_').slice(0, 120) + '.png';
    const out = join(outDir, name);
    results.push({ url, ...screenshotUrl(url, out, engine) });
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
  const results = captureUrls(urls, outdir);
  let failed = 0;
  for (const r of results) {
    if (r.ok) console.log(`[shot] OK ${r.kb}KB  ${r.url} -> ${r.file}`);
    else { failed++; console.error(`[shot] FAIL ${r.url}: ${r.error}`); }
  }
  process.exit(failed ? 1 : 0);
}
