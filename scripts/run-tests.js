// Env-aware local test runner with RingCentral webhooks.
//
// Wraps `npx playwright test` with webhooks worded per environment so the
// channel can tell runs apart (nightly QA vs. a Release/UAT pass):
//   1. START       — "<env> Testing has started".
//   2. run         — the full suite against the chosen env.
//   3. COMPLETION  — pipeline-style result card (✅/❌/📊/⏱ + grouped Failed Tests).
//   4. CANCELED    — if the run is interrupted (Ctrl-C / killed), a clearly
//                    worded cancellation notice fires instead of a result card,
//                    so nobody mistakes a stopped run for a finished one.
//
// Usage:
//   node scripts/run-tests.js release        # full UAT/Release run + webhooks
//   node scripts/run-tests.js qa             # full QA run + webhooks
//   node scripts/run-tests.js release --cancel   # just post a CANCELED notice
//   node scripts/run-tests.js qa --cancel        # (no run; used for manual stops)
//
// The webhook URL is read from .env (RINGCENTRAL_WEBHOOK_URL). If it's missing
// the run still happens and the messages are printed instead of posted.

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const url = require('url');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const RESULTS = path.join(ROOT, 'test-results', 'results.json');

// --- Per-environment config ------------------------------------------------
const ENVS = {
  release: {
    key: 'release',
    envFile: '.env.release',
    label: 'Release Testing',
    defaultUrl: 'https://uatk12catering.perseusedge.com',
  },
  qa: {
    key: 'qa',
    envFile: '.env',
    label: 'QA Testing',
    defaultUrl: 'https://qa.primeroedge.co',
  },
};

function resolveEnv(arg) {
  const e = ENVS[(arg || '').toLowerCase()];
  if (!e) {
    console.error('Usage: node scripts/run-tests.js <qa|release> [--cancel]');
    process.exit(2);
  }
  return e;
}

// --- Webhook ---------------------------------------------------------------
function readEnvValue(key) {
  // Webhook URL lives in .env regardless of which env we test against.
  try {
    const text = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    const line = text.split(/\r?\n/).find((l) => new RegExp('^' + key + '=').test(l));
    if (!line) return '';
    return line.replace(new RegExp('^' + key + '='), '').trim().replace(/^["']|["']$/g, '');
  } catch {
    return '';
  }
}

function sendWebhook(text) {
  return new Promise((resolve) => {
    const webhookUrl = readEnvValue('RINGCENTRAL_WEBHOOK_URL');
    if (!webhookUrl) {
      console.log('\n[no RINGCENTRAL_WEBHOOK_URL in .env — message not sent]\n' + text + '\n');
      return resolve();
    }
    const parsed = url.parse(webhookUrl);
    const lib = parsed.protocol === 'http:' ? http : https;
    const body = JSON.stringify({ text });
    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => { console.log('Webhook sent, status:', res.statusCode); resolve(); },
    );
    req.on('error', (e) => { console.error('Webhook error:', e.message); resolve(); });
    req.write(body);
    req.end();
  });
}

// Synchronous webhook POST — for signal handlers, where the event loop won't
// reliably drain an async request before the process exits.
function sendWebhookSync(text) {
  const webhookUrl = readEnvValue('RINGCENTRAL_WEBHOOK_URL');
  if (!webhookUrl) {
    console.log('\n[no RINGCENTRAL_WEBHOOK_URL in .env — message not sent]\n' + text + '\n');
    return;
  }
  const body = JSON.stringify({ text });
  const res = spawnSync(
    'curl',
    ['-s', '-X', 'POST', webhookUrl, '-H', 'Content-Type: application/json', '-d', body],
    { stdio: 'ignore' },
  );
  if (res.status === 0) console.log('Cancellation webhook sent.');
  else console.log('Cancellation webhook could not be sent (curl status ' + res.status + ').');
}

// --- Messages --------------------------------------------------------------
function startedMessage(env) {
  return '🚀 K12Catering ' + env.label + ' has started.\n\n'
    + 'Running the full regression suite against ' + env.label + '.\n'
    + 'Environment: ' + (process.env.BASE_URL || env.defaultUrl);
}

function canceledMessage(env) {
  return '🛑 K12Catering ' + env.label + ' was canceled manually.';
}

// --- Result parsing --------------------------------------------------------
function tagFor(file) {
  const base = (file || '').split(/[\\/]/).pop().replace(/\.spec\.(ts|js)$/i, '');
  const m = base.match(/t-?(\d+)/i);
  return m ? 'T-' + m[1] : base || 'test';
}

function summarize() {
  let total = 0, passed = 0, failed = 0, durationMs = 0;
  const failedList = [];
  if (!fs.existsSync(RESULTS)) return { total, passed, failed, durationMs, failedList, missing: true };
  const data = JSON.parse(fs.readFileSync(RESULTS, 'utf8'));
  durationMs = (data.stats && data.stats.duration) || 0;
  function walk(suite, ancestors, file) {
    for (const spec of suite.specs || []) {
      const fullTitle = [...ancestors, spec.title].filter(Boolean).join(' › ');
      for (const test of spec.tests || []) {
        total++;
        const results = test.results || [];
        if (results.some((r) => r.status === 'passed')) passed++;
        else if (results.some((r) => ['failed', 'timedOut', 'interrupted'].includes(r.status))) {
          failed++;
          failedList.push({ file: spec.file || file || '', title: fullTitle });
        }
      }
    }
    for (const child of suite.suites || []) walk(child, [...ancestors, child.title].filter(Boolean), file);
  }
  (data.suites || []).forEach((s) => walk(s, [], s.file || s.title || ''));
  return { total, passed, failed, durationMs, failedList, missing: false };
}

function failedSection(failedList) {
  if (!failedList.length) return '';
  const order = [];
  const byTag = new Map();
  for (const f of failedList) {
    const tag = tagFor(f.file);
    if (!byTag.has(tag)) { byTag.set(tag, []); order.push(tag); }
    byTag.get(tag).push(f.title);
  }
  const lines = [];
  for (const tag of order) {
    const titles = byTag.get(tag);
    if (titles.length === 1) lines.push('• ' + tag);
    else { lines.push('• ' + tag + ':'); titles.forEach((t) => lines.push('    - ' + t)); }
  }
  return '\n\nFailed Tests:\n' + lines.join('\n');
}

function completionMessage(env, s) {
  const envLine = '\nEnvironment: ' + (process.env.BASE_URL || env.defaultUrl);
  if (s.missing || s.total === 0) {
    return 'K12Catering ' + env.label + ' ended before test results were published.' + envLine;
  }
  const pct = (n) => (s.total ? Math.round((n / s.total) * 100) : 0);
  const totalSecs = Math.round(s.durationMs / 1000);
  const mins = Math.floor(totalSecs / 60);
  const duration = mins >= 60
    ? Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm'
    : mins + 'm ' + (totalSecs % 60) + 's';
  return 'K12Catering ' + env.label + ' completed. See results below.\n\n'
    + '✅ ' + 'Passed:'.padEnd(10) + s.passed + ' (' + pct(s.passed) + '%)\n'
    + '❌ ' + 'Failed:'.padEnd(10) + s.failed + ' (' + pct(s.failed) + '%)\n'
    + '📊 ' + 'Total:'.padEnd(10) + s.total + '\n'
    + '⏱ ' + 'Duration:'.padEnd(10) + duration
    + failedSection(s.failedList)
    + '\n' + envLine;
}

// --- Main ------------------------------------------------------------------
(async () => {
  const args = process.argv.slice(2);
  const env = resolveEnv(args[0]);
  const cancelOnly = args.includes('--cancel');

  // Force the chosen env file (playwright.config.ts honors ENV_FILE first), and
  // load it so BASE_URL etc. are available to the messages.
  process.env.ENV_FILE = env.envFile;
  require('dotenv').config({ path: path.resolve(ROOT, env.envFile) });

  if (cancelOnly) {
    await sendWebhook(canceledMessage(env));
    process.exit(0);
  }

  // Post a CANCELED notice once if the run is interrupted.
  let canceled = false;
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
    process.on(sig, () => {
      if (canceled) return;
      canceled = true;
      console.log('\nRun interrupted (' + sig + ') — posting cancellation notice...');
      sendWebhookSync(canceledMessage(env));
      process.exit(130);
    });
  }

  await sendWebhook(startedMessage(env));

  const run = spawnSync('npx', ['playwright', 'test'], {
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  });

  if (canceled) return; // cancellation already reported by the signal handler

  await sendWebhook(completionMessage(env, summarize()));
  process.exit(run.status == null ? 1 : run.status);
})();
