// Playtest playthrough recorder for "The Unseen Hand".
//
// Launches the built game (vite preview) and plays from the opening state
// through Day 5 — the ground truth the player-agent team reviews. For each
// Proceed it captures the cycle's narrative spread, the raw event ledger, a
// roster snapshot, and a full-page screenshot; it also records the character
// detail drawer and every console / page error. Output is a structured
// transcript.json plus a shots/ folder.
//
// Prereqs: `pnpm --filter @ugs/game-client build` (a fresh dist to preview).
// Run:     node playtest/record-playthrough.mjs
// Env:
//   OUTDIR        where to write transcript.json + shots/ (default ./playtest/out)
//   PORT          preview port (default 4188)
//   CLIENT_DIR    path to apps/game-client (default resolved from this file)
//   CHROMIUM_PATH explicit Chromium binary; else auto-detected, else Playwright default
//   TARGET_DAY    stop once poised on this day (default 5)

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 4188);
const OUTDIR = process.env.OUTDIR ?? resolve(HERE, 'out');
const CLIENT_DIR = process.env.CLIENT_DIR ?? resolve(HERE, '../apps/game-client');

// `@playwright/test` is a devDependency of @ugs/game-client, so with pnpm it is only
// linked under apps/game-client/node_modules. Anchor resolution there so this harness
// runs from any cwd / location.
const clientRequire = createRequire(resolve(CLIENT_DIR, 'package.json'));
const pw = await import(pathToFileURL(clientRequire.resolve('@playwright/test')).href);
const chromium = pw.chromium ?? pw.default?.chromium;
const TARGET_DAY = Number(process.env.TARGET_DAY ?? 5);
const SHOTS = `${OUTDIR}/shots`;
const BASE = `http://localhost:${PORT}/`;
mkdirSync(SHOTS, { recursive: true });
const log = (...a) => console.log('[rec]', ...a);

// Resolve a Chromium binary: explicit env → a Playwright-managed install under
// /opt/pw-browsers (the cloud image) → Playwright's own default (executablePath undefined).
function resolveChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const root = '/opt/pw-browsers';
  if (existsSync(root)) {
    const dir = readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
    const bin = dir && `${root}/${dir}/chrome-linux/chrome`;
    if (bin && existsSync(bin)) return bin;
  }
  return undefined; // let Playwright use its default download
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: CLIENT_DIR, stdio: ['ignore', 'pipe', 'pipe'], env: process.env,
});
server.stderr.on('data', (d) => process.stderr.write(`[preview] ${d}`));

async function waitForServer(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try { if ((await fetch(url)).ok) return; } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('preview server never came up');
}

async function main() {
  await waitForServer(BASE);
  const browser = await chromium.launch({ executablePath: resolveChromium() });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push({ type: m.type(), text: m.text() });
  });
  page.on('pageerror', (e) => pageErrors.push({ message: e.message, stack: e.stack }));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.topbar');
  const readText = async (sel) =>
    (await page.locator(sel).count()) ? (await page.locator(sel).first().innerText()).trim() : null;

  async function rosterSnapshot() {
    return page.$$eval('.roster-dock .card', (cards) => cards.map((c) => ({
      name: c.querySelector('.name')?.textContent?.trim() ?? '',
      badge: c.querySelector('.card-body')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      moodWidth: c.querySelector('.mood-bar-fill')?.getAttribute('style') ?? '',
    })));
  }

  async function newestSpread() {
    const spread = page.locator('.cycle-spread').last();
    if (!(await spread.count())) return null;
    const header = (await spread.locator('.spread-header').innerText().catch(() => '')).trim();
    const overview = (await spread.locator('.cycle-overview').innerText().catch(() => '')).trim();
    const quiet = (await spread.locator('.spread-quiet').count())
      ? (await spread.locator('.spread-quiet').innerText()).trim() : null;
    const chapters = await spread.locator('.chapter-card').evaluateAll((cards) => cards.map((c) => ({
      name: c.querySelector('.chapter-name')?.textContent?.trim() ?? '',
      prose: c.querySelector('.chapter-prose')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      coParticipants: c.querySelector('.co-participants')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    })));
    const toggle = spread.locator('.raw-log-toggle');
    let rawRows = [];
    if (await toggle.count()) {
      await toggle.first().click().catch(() => {});
      await sleep(80);
      rawRows = await spread.locator('.event-row').evaluateAll((rows) => rows.map((r) => ({
        time: r.querySelector('.time-label')?.textContent?.trim() ?? '',
        tag: r.querySelector('.type-tag')?.textContent?.trim() ?? '',
        text: r.querySelector('.event-text')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      })));
    }
    return { header, overview, quiet, chapters, rawRows };
  }

  const transcript = { scenario: null, emptyState: null, cycles: [], characterDetail: null, errors: null };
  transcript.scenario = {
    worldName: await readText('.world-name'),
    openingWorldTime: await readText('.world-time'),
    scenarioStatus: await readText('.scenario-status, .right-default'),
    filterChips: await page.locator('.filter-bar .filter-btn').allInnerTexts().catch(() => []),
    diMeterPresent: (await page.locator('.di-meter').count()) > 0,
    proceedLabel: await readText('.proceed-btn'),
  };
  transcript.emptyState = await readText('.reader-empty, .empty-title');
  await page.screenshot({ path: `${SHOTS}/00-opening.png`, fullPage: true });
  log('opening:', transcript.scenario.openingWorldTime);

  const proceedBtn = page.locator('.proceed-btn');
  let step = 0;
  while (step < 30) {
    const before = await readText('.world-time');
    const nextLabel = await readText('.proceed-btn');
    await proceedBtn.click();
    await sleep(200);
    step++;
    const after = await readText('.world-time');
    const spread = await newestSpread();
    transcript.cycles.push({ step, proceededFrom: before, nowPoisedOn: after, proceedLabel: nextLabel, spread, roster: await rosterSnapshot() });
    await page.screenshot({ path: `${SHOTS}/${String(step).padStart(2, '0')}-${(spread?.header ?? after ?? 'cycle').replace(/[^a-z0-9]+/gi, '-')}.png`, fullPage: true });
    log(`step ${step}: read ${spread?.header ?? '?'} -> poised on ${after}`);
    if ((after ?? '').startsWith(`Day ${TARGET_DAY}`)) break;
  }

  const card = page.locator('.roster-dock .card').first();
  if (await card.count()) {
    await card.click();
    await sleep(200);
    if (await page.locator('.detail-drawer').count()) {
      transcript.characterDetail = {
        name: await readText('.detail-drawer .ident-name'),
        backstory: await readText('.detail-drawer .backstory'),
        innerVoice: await readText('.detail-drawer .inner-voice'),
        activity: await readText('.detail-drawer .activity-pill'),
        moodScore: await readText('.detail-drawer .mood-score'),
        axes: await page.locator('.detail-drawer .axis-row').evaluateAll((rs) => rs.map((r) => `${r.querySelector('.axis-name')?.textContent?.trim()}: ${r.querySelector('.axis-val')?.textContent?.trim()}`)),
        relationships: await page.locator('.detail-drawer .rel-row').evaluateAll((rs) => rs.map((r) => r.textContent?.replace(/\s+/g, ' ').trim())),
        history: await page.locator('.detail-drawer .history-row').evaluateAll((rs) => rs.map((r) => r.textContent?.replace(/\s+/g, ' ').trim())),
        goal: await readText('.detail-drawer .goal-desc'),
      };
      await page.screenshot({ path: `${SHOTS}/99-character-detail.png`, fullPage: true });
    }
  }

  transcript.finalWorldTime = await readText('.world-time');
  transcript.totalProceeds = step;
  transcript.errors = { console: consoleErrors, page: pageErrors };
  writeFileSync(`${OUTDIR}/transcript.json`, JSON.stringify(transcript, null, 2));
  log(`done: ${step} proceeds, final ${transcript.finalWorldTime}, console-issues ${consoleErrors.length}, page-errors ${pageErrors.length}`);
  await browser.close();
}

main()
  .then(() => { server.kill('SIGTERM'); process.exit(0); })
  .catch((e) => { console.error(e); server.kill('SIGTERM'); process.exit(1); });
