#!/usr/bin/env node
/**
 * Daily unattended re-run of the latest nightly build's failed tests.
 *
 * Finds the most recent test run, and if it had failures, hands the build id to
 * rerun-failed.js. Written for Task Scheduler (9 AM daily), so it must never block on
 * input and never post anything misleading when the machine isn't in a fit state to run.
 *
 * Three guards, in order, each of which exits quietly rather than running:
 *   1. VPN/DNS — the app host must resolve. A run without the tunnel up fails every test
 *      on getaddrinfo and posts a false "N failed" to RingCentral, which is worse than
 *      not running at all. This happened on 2026-08-26 and is the reason the guard exists.
 *   2. Nothing to do — the latest build had no failures.
 *   3. Already handled — that build is in the re-run ledger, so a scheduled double-fire
 *      or a manual run earlier in the day can't re-run it a second time.
 *
 * The build id comes from the Test API, not the Build API: the PAT in .env has Test read
 * but not Build read, and /test/runs carries the build id anyway.
 *
 * Usage:
 *   node scripts/auto-rerun-latest.js            # what Task Scheduler runs
 *   node scripts/auto-rerun-latest.js --dry-run  # decide and report, don't re-run
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const dns = require('dns');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const LOG_FILE = path.join(ROOT, '.auto-rerun.log');
const LEDGER = path.join(ROOT, '.rerun-history.json');
const ORG = 'https://dev.azure.com/Cybersoft-Technologies-Inc/K12-Catering';
const APP_HOST = 'qa.primeroedge.co';
const MAX_LOG_LINES = 1000;

function log(msg) {
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const line = `${stamp} ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

function trimLog() {
  try {
    const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n');
    if (lines.length > MAX_LOG_LINES) fs.writeFileSync(LOG_FILE, lines.slice(-MAX_LOG_LINES).join('\n'));
  } catch {}
}

function readEnvValue(key) {
  let text = '';
  try { text = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); } catch { return ''; }
  const line = text.split(/\r?\n/).find((l) => l.startsWith(key + '='));
  if (!line) return '';
  return line.slice(key.length + 1).replace(/#.*$/, '').trim().replace(/^["']|["']$/g, '');
}

/** Resolves through the OS resolver, which is what Playwright/node will use too. */
function hostResolves(host) {
  return new Promise((resolve) => dns.lookup(host, (err) => resolve(!err)));
}

function apiGet(url, pat) {
  return new Promise((resolve, reject) => {
    const auth = 'Basic ' + Buffer.from(':' + pat).toString('base64');
    https.get(url, { headers: { Authorization: auth } }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    }).on('error', reject);
  });
}

/** The most recently completed test run, with its build id and failure count. */
async function latestRun(pat) {
  const from = new Date(Date.now() - 3 * 864e5).toISOString();
  const to = new Date().toISOString();
  const url = `${ORG}/_apis/test/runs?api-version=7.0&minLastUpdatedDate=${from}&maxLastUpdatedDate=${to}&$top=20`;
  const res = await apiGet(url, pat);
  if (res.status !== 200) {
    log(`ERROR: test runs API returned HTTP ${res.status}`);
    return null;
  }
  const runs = (JSON.parse(res.body).value || [])
    .filter((r) => r.completedDate)
    .sort((a, b) => new Date(b.completedDate) - new Date(a.completedDate));
  if (!runs.length) return null;
  const r = runs[0];
  const buildId = (r.buildConfiguration && r.buildConfiguration.id) || (r.build && r.build.id);
  return { runId: r.id, buildId: String(buildId), completed: r.completedDate, total: r.totalTests, failed: r.unanalyzedTests };
}

function alreadyInLedger(buildId) {
  try {
    const h = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
    return Object.keys(h).some((k) => k.endsWith('/' + buildId));
  } catch {
    return false;
  }
}

(async () => {
  trimLog();
  const dryRun = process.argv.includes('--dry-run');
  log('--- auto-rerun starting ---');

  // Guard 1: the tunnel. Without it every test dies on DNS and the webhook lies.
  if (!(await hostResolves(APP_HOST))) {
    log(`SKIP: ${APP_HOST} does not resolve - VPN is down. Not running, nothing posted.`);
    return;
  }
  log(`${APP_HOST} resolves - VPN is up.`);

  const pat = readEnvValue('AZURE_DEVOPS_PAT');
  if (!pat) { log('SKIP: AZURE_DEVOPS_PAT not found in .env.'); return; }

  const run = await latestRun(pat);
  if (!run) { log('SKIP: no completed test run found in the last 3 days.'); return; }
  log(`Latest: build ${run.buildId} (${run.completed.slice(0, 16)}) - ${run.failed} failed of ${run.total}.`);

  // Guard 2: nothing to do.
  if (!run.failed) { log('SKIP: that build had no failures.'); return; }

  // Guard 3: don't re-run what's already been re-run.
  if (alreadyInLedger(run.buildId)) {
    log(`SKIP: build ${run.buildId} is already in the re-run ledger.`);
    return;
  }

  if (dryRun) { log(`DRY RUN: would re-run ${run.failed} test(s) from build ${run.buildId}.`); return; }

  log(`Re-running ${run.failed} failed test(s) from build ${run.buildId}...`);
  // --no-webhook: the morning run is a private "what is broken today" pass. The channel
  // gets a message once the failures have been looked at and fixed, not a daily wall of
  // red that nobody can act on yet.
  const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'rerun-failed.js'), run.buildId, '--no-webhook'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const relay = (buf) => String(buf).split(/\r?\n/).forEach((l) => { if (l.trim()) log('  ' + l.trim()); });
  child.stdout.on('data', relay);
  child.stderr.on('data', relay);
  child.on('close', (code) => log(`--- auto-rerun finished, rerun-failed.js exit ${code} ---`));
})();
