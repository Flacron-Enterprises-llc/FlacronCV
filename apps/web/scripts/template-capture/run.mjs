#!/usr/bin/env node
/**
 * Local-only CV template stills.
 *
 * Copies the capture page into a gitignored App Router folder, starts
 * `next dev` on 3010, screenshots the ten CV templates, then deletes the
 * copy so Amplify never sees the route.
 *
 * Does not upload, does not touch Firestore, does not call the API.
 *
 *   pnpm --filter web capture-templates
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '../..');
const SRC_DIR = path.join(__dirname);
const DEST_DIR = path.join(WEB_ROOT, 'src', 'app', '[locale]', '(dev)', 'template-capture');
const OUT_DIR = path.join(WEB_ROOT, 'template-capture-output');
const PORT = process.env.TEMPLATE_CAPTURE_PORT || '3010';
const ORIGIN = `http://127.0.0.1:${PORT}`;

const IDS = [
  'classic',
  'modern',
  'minimal',
  'compact',
  'academic',
  'professional',
  'creative',
  'executive',
  'two-column',
  'bold',
];

function copyRoute() {
  fs.mkdirSync(DEST_DIR, { recursive: true });
  fs.copyFileSync(path.join(SRC_DIR, 'page.tsx'), path.join(DEST_DIR, 'page.tsx'));
  fs.copyFileSync(
    path.join(SRC_DIR, 'CaptureClient.tsx'),
    path.join(DEST_DIR, 'CaptureClient.tsx'),
  );
}

function removeRoute() {
  fs.rmSync(DEST_DIR, { recursive: true, force: true });
  const devGroup = path.dirname(DEST_DIR);
  try {
    if (fs.existsSync(devGroup) && fs.readdirSync(devGroup).length === 0) {
      fs.rmdirSync(devGroup);
    }
  } catch {
    /* parent still has other files — leave it */
  }
}

function pngSize(buf) {
  if (buf.length < 24 || buf.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error('not a PNG');
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function waitForHttp(url, timeoutMs) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
          resolve();
          return;
        }
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Timed out waiting for ${url} (last ${res.statusCode})`));
          return;
        }
        setTimeout(attempt, 750);
      });
      req.setTimeout(120000, () => {
        req.destroy();
      });
      req.on('error', () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }
        setTimeout(attempt, 750);
      });
    };
    attempt();
  });
}

function startNext() {
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const child = spawn(pnpm, ['dev', '-p', PORT], {
    cwd: WEB_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    env: { ...process.env, BROWSER: 'none' },
  });
  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    if (text.includes('Ready') || text.includes('started')) {
      process.stdout.write('next: ready\n');
    }
  });
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    if (/error|Error|failed/i.test(text)) {
      process.stderr.write(text);
    }
  });
  return child;
}

function writeIndex(ids) {
  const cards = ids
    .map((id) => {
      return `<section>
  <h2>${id}</h2>
  <p>thumb 800×480</p>
  <img src="${id}-thumb.png" width="800" height="480" alt=""/>
  <p>page 794×1122</p>
  <img src="${id}-page.png" width="397" height="561" alt=""/>
</section>`;
    })
    .join('\n');
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>CV template stills (local review)</title>
  <style>
    body { font-family: sans-serif; background: #e7e5e4; color: #1c1917; margin: 24px; }
    section { margin-bottom: 48px; padding: 16px; background: #fff; }
    img { display: block; border: 1px solid #a8a29e; margin: 8px 0 24px; }
    h2 { margin: 0 0 8px; }
  </style>
</head>
<body>
  <h1>CV template stills</h1>
  <p>Local review only. Nothing here is uploaded.</p>
  ${cards}
</body>
</html>
`;
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), html);
}

async function launchBrowser() {
  const attempts = [{ channel: 'msedge' }, { channel: 'chrome' }, {}];
  let lastError;
  for (const opts of attempts) {
    try {
      return await chromium.launch({ headless: true, ...opts });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

async function captureAll() {
  const browser = await launchBrowser();
  const page = await browser.newPage({
    viewport: { width: 1800, height: 1300 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
  });

  await page.addInitScript(() => {
    localStorage.setItem('theme', 'light');
    localStorage.setItem(
      'cookie_consent',
      JSON.stringify({ v: 2, preferences: false, analytics: false, ts: Date.now() }),
    );
  });

  await page.route('**/*', (route) => {
    let hostname = '';
    try {
      hostname = new URL(route.request().url()).hostname;
    } catch {
      return route.continue();
    }
    if (hostname === '127.0.0.1' || hostname === 'localhost') {
      return route.continue();
    }
    return route.abort();
  });

  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });

  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const id of IDS) {
    const url = `${ORIGIN}/en/template-capture?id=${encodeURIComponent(id)}`;
    process.stdout.write(`capture ${id}\n`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.locator('#capture-page').waitFor({ state: 'visible', timeout: 120000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(900);

    const pagePath = path.join(OUT_DIR, `${id}-page.png`);
    const thumbPath = path.join(OUT_DIR, `${id}-thumb.png`);
    await page.locator('#capture-page').screenshot({
      path: pagePath,
      type: 'png',
      animations: 'disabled',
      caret: 'hide',
    });
    await page.locator('#capture-thumb').screenshot({
      path: thumbPath,
      type: 'png',
      animations: 'disabled',
      caret: 'hide',
    });

    const pageSize = pngSize(fs.readFileSync(pagePath));
    const thumbSize = pngSize(fs.readFileSync(thumbPath));
    if (pageSize.width !== 794 || pageSize.height !== 1122) {
      throw new Error(`${id}-page.png is ${pageSize.width}x${pageSize.height}, expected 794x1122`);
    }
    if (thumbSize.width !== 800 || thumbSize.height !== 480) {
      throw new Error(`${id}-thumb.png is ${thumbSize.width}x${thumbSize.height}, expected 800x480`);
    }
  }

  await browser.close();
  writeIndex(IDS);
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run template capture with NODE_ENV=production');
  }

  copyRoute();
  const child = startNext();
  let failed = false;
  try {
    await waitForHttp(`${ORIGIN}/en/template-capture?id=classic`, 120000);
    await captureAll();
    process.stdout.write(`Wrote 20 PNGs + index.html to ${OUT_DIR}\n`);
  } catch (err) {
    failed = true;
    throw err;
  } finally {
    if (child.pid) {
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
            stdio: 'ignore',
            shell: true,
          });
        } else {
          child.kill('SIGTERM');
        }
      } catch {
        /* already gone */
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    removeRoute();
  }
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  try {
    removeRoute();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
