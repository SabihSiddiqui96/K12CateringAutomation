#!/usr/bin/env node
/** Daily unattended re-run of the latest nightly build's failed tests. */
const fs = require('fs');
const path = require('path');
const https = require('https');
const dns = require('dns');
const urlLib = require('url');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const LOG_FILE = path.join(ROOT, '.auto-rerun.log');
const LEDGER = path.join(ROOT, '.rerun-history.json');
const NOTIFIED = path.join(ROOT, '.auto-rerun-notified.json');
const ORG = 'https://dev.azure.com/Cybersoft-Technologies-Inc/K12-Catering';
const APP_HOST = 'qa.primeroedge.co';
const MAX_LOG_LINES = 1000;

function log(msg) {
  // Local time, not UTC.
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp =
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
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

function fallbackAlreadyPosted(buildId) {
  try {
    return !!JSON.parse(fs.readFileSync(NOTIFIED, 'utf8'))[String(buildId)];
  } catch { return false; }
}

function markFallbackPosted(buildId) {
  let seen = {};
  try { seen = JSON.parse(fs.readFileSync(NOTIFIED, 'utf8')); } catch { seen = {}; }
  seen[String(buildId)] = new Date().toISOString();
  // Keep the file from growing without bound - the last 30 builds is plenty.
  const keys = Object.keys(seen);
  if (keys.length > 30) for (const k of keys.slice(0, keys.length - 30)) delete seen[k];
  fs.writeFileSync(NOTIFIED, JSON.stringify(seen, null, 2));
}

function sendWebhook(text) {
  return new Promise((resolve) => {
    const webhookUrl = readEnvValue('RINGCENTRAL_WEBHOOK_URL');
    if (!webhookUrl) { log('no RINGCENTRAL_WEBHOOK_URL in .env - message not sent'); return resolve(); }
    const parsed = urlLib.parse(webhookUrl);
    const body = JSON.stringify({ text });
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => { log('fallback webhook sent, status: ' + res.statusCode); resolve(); },
    );
    req.on('error', (e) => { log('fallback webhook error: ' + e.message); resolve(); });
    req.write(body);
    req.end();
  });
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

  const pat = readEnvValue('AZURE_DEVOPS_PAT');
  if (!pat) { log('SKIP: AZURE_DEVOPS_PAT not found in .env.'); return; }

  // The run is fetched BEFORE the VPN check (dev.azure.com is reachable without the tunnel) so
  const run = await latestRun(pat);
  if (!run) { log('SKIP: no completed test run found in the last 3 days.'); return; }
  log(`Latest: build ${run.buildId} (${run.completed.slice(0, 16)}) - ${run.failed} failed of ${run.total}.`);

  // Guard 1: nothing to do. A clean build is announced by the pipeline itself.
  if (!run.failed) { log('SKIP: that build had no failures.'); return; }

  // Guard 2: don't re-run what's already been re-run (a scheduled double-fire
  if (alreadyInLedger(run.buildId)) {
    log(`SKIP: build ${run.buildId} is already in the re-run ledger.`);
    return;
  }

  // Guard 3: the tunnel.
  if (!(await hostResolves(APP_HOST))) {
    if (fallbackAlreadyPosted(run.buildId)) {
      log(`${APP_HOST} still does not resolve - VPN down. Already notified for build ` +
        `${run.buildId}; staying quiet. Will re-run automatically once the tunnel is up.`);
      return;
    }
    log(`${APP_HOST} does not resolve - VPN is down. Posting un-re-run build numbers.`);
    if (!dryRun) {
      const resultsUrl = `${ORG}/_build/results?buildId=${run.buildId}&view=ms.vss-test-web.build-test-results-tab`;
      const passed = run.total - run.failed;
      const pct = (n) => (run.total ? Math.round((n / run.total) * 100) : 0);
      await sendWebhook(
        `**K12Catering QA Testing - nightly build results**\n\n` +
        '```\n' +
        `\u2705 Passed:   ${passed} (${pct(passed)}%)\n` +
        `\u274c Failed:   ${run.failed} (${pct(run.failed)}%)\n` +
        `\u{1F4CA} Total:    ${run.total}\n` +
        '```\n\n' +
        `\u26a0\ufe0f VPN not connected - will re-run automatically once it's back.\n\n` +
        `Original run: ${resultsUrl}`,
      );
      markFallbackPosted(run.buildId);
    }
    return;
  }
  log(`${APP_HOST} resolves - VPN is up.`);

  if (dryRun) { log(`DRY RUN: would re-run ${run.failed} test(s) from build ${run.buildId}.`); return; }

  log(`Re-running ${run.failed} failed test(s) from build ${run.buildId}...`);
  // --no-start-webhook
  const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'rerun-failed.js'), run.buildId, '--no-start-webhook'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const relay = (buf) => String(buf).split(/\r?\n/).forEach((l) => { if (l.trim()) log('  ' + l.trim()); });
  child.stdout.on('data', relay);
  child.stderr.on('data', relay);
  child.on('close', (code) => log(`--- auto-rerun finished, rerun-failed.js exit ${code} ---`));
})();
