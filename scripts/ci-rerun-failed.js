#!/usr/bin/env node
/**
 * In-pipeline "re-run failed tests" helper. Runs as a gated stage AFTER the
 * scheduled nightly build has run its tests and posted the completion webhook.
 *
 * Unlike scripts/rerun-failed.js (the local/manual flow that reads the failed
 * set from the Azure DevOps Test API and keeps a ledger), this one is fully
 * self-contained for CI:
 *   1. Reads the build's published results.json (downloaded as an artifact) to
 *      find the failed test titles + the original total — same results the
 *      webhook's "Results" link points at, so no PAT/token is needed.
 *   2. Re-runs ONLY those failed tests with `playwright test -g` (workers=1).
 *   3. Merges the local outcome back into the original counts (Total stays the
 *      same, Failed = whatever still fails, Passed = Total - Failed) and posts a
 *      RingCentral webhook in the same format as the local re-run.
 *
 * It never loops: it re-runs once and posts the result. If tests still fail,
 * the message just reflects that.
 *
 * Env (all from pipeline variables, NOT a .env file):
 *   RINGCENTRAL_WEBHOOK_URL  - where to post (if missing, prints instead)
 *   COLLECTION_URI, TEAM_PROJECT, BUILD_ID - to build the Results link
 *   plus all the app-under-test creds the tests need (same as the test step)
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const url = require('url');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const RESULTS = path.join(ROOT, 'test-results', 'results.json');
const PW_CLI = require.resolve('@playwright/test/cli');

function normTitle(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

// Walk the Playwright JSON report into one entry per test, keyed by the display
// name Azure DevOps uses: describe blocks joined to the test title by ' › '
// (the file-level suite is excluded). Also captures the spec file path.
function collectResults(resultsFile) {
  const out = []; // { title, status, file }
  if (!fs.existsSync(resultsFile)) return out;
  const data = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
  function walk(suite, ancestors, specFile) {
    for (const spec of (suite.specs || [])) {
      const fullTitle = [...ancestors, spec.title].filter(Boolean).join(' › ');
      for (const test of (spec.tests || [])) {
        const r = test.results || [];
        let status = 'unknown';
        if (r.some((x) => x.status === 'passed')) status = 'passed';
        else if (r.some((x) => ['failed', 'timedOut', 'interrupted'].includes(x.status))) status = 'failed';
        out.push({ title: normTitle(fullTitle), status, file: spec.file || specFile || '' });
      }
    }
    for (const child of (suite.suites || [])) {
      walk(child, [...ancestors, child.title].filter(Boolean), specFile);
    }
  }
  (data.suites || []).forEach((fileSuite) => walk(fileSuite, [], fileSuite.file || fileSuite.title || ''));
  return out;
}

// Short, readable label for a failed test: ticket tag from the file
// (t-113438.spec.ts -> T-113438) + the test title (one file can hold many).
function tagFor(file) {
  const base = (file || '').split(/[\\/]/).pop().replace(/\.spec\.(ts|js)$/i, '');
  const m = base.match(/t-?(\d+)/i);
  return m ? ('T-' + m[1]) : (base || 'test');
}

function failedTestsBlock(entries) {
  if (!entries.length) return '';
  return '\n\nFailed Tests:\n```\n' +
    entries.map((e) => '• ' + tagFor(e.file) + ': ' + e.title).join('\n') +
    '\n```';
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Azure joins describe blocks with ' › '; Playwright's -g matches the title
// joined by spaces. Rejoin the escaped segments with '.*' so either form matches.
function titleToGrep(name) {
  return name.split(/\s*›\s*/).map(escapeRegex).join('.*');
}

function sendWebhook(text) {
  return new Promise((resolve) => {
    const webhookUrl = process.env.RINGCENTRAL_WEBHOOK_URL;
    if (!webhookUrl) {
      console.log('\n[no RINGCENTRAL_WEBHOOK_URL — message not sent]\n' + text + '\n');
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
      (res) => {
        console.log('Webhook sent, status:', res.statusCode);
        resolve();
      },
    );
    req.on('error', (e) => {
      console.error('Webhook error:', e.message);
      resolve();
    });
    req.write(body);
    req.end();
  });
}

(async () => {
  // 1) Read the ORIGINAL results.json (the published build artifact). Capture
  //    the failed titles and the total BEFORE the re-run overwrites the file.
  const before = collectResults(RESULTS);
  if (!before.length) {
    console.log('No results.json found / no tests — nothing to re-run.');
    return;
  }
  const origTotal = before.length;
  const fileByTitle = new Map(before.map((t) => [t.title, t.file]));
  const failed = [...new Set(before.filter((t) => t.status === 'failed').map((t) => t.title))];
  if (!failed.length) {
    console.log('No failed tests in the published results — nothing to re-run.');
    return;
  }

  console.log('Failed tests to re-run (' + failed.length + '):');
  failed.forEach((n, i) => console.log('  ' + (i + 1) + '. ' + n));

  const resultsUrl = (process.env.COLLECTION_URI || '') + (process.env.TEAM_PROJECT || '') +
    '/_build/results?buildId=' + (process.env.BUILD_ID || '') +
    '&view=ms.vss-test-web.build-test-results-tab';

  await sendWebhook(
    'K12Catering Automation — auto re-running ' + failed.length +
    ' failed test(s) from the scheduled run.\n\nOriginal run: ' + resultsUrl + '\n\nUpdated results to follow.',
  );

  // 2) Re-run ONLY the failed tests, matched by title.
  const grep = failed.map(titleToGrep).join('|');
  console.log('\nRe-running failed tests...\n');
  spawnSync(process.execPath, [PW_CLI, 'test', '-g', grep, '--workers=1'], {
    cwd: ROOT,
    stdio: 'inherit',
  });

  // 3) Match the re-run set against the new results BY NAME: only credit a test
  //    we can see actually passed. Anything else stays failed (never over-report).
  const ran = collectResults(RESULTS);
  const statusByTitle = new Map(ran.map((r) => [r.title, r.status]));
  let nowPassing = 0;
  const stillFailedNames = [];
  for (const name of failed) {
    if (statusByTitle.get(normTitle(name)) === 'passed') nowPassing += 1;
    else stillFailedNames.push(name);
  }

  const origFailed = failed.length;
  const newFailed = stillFailedNames.length;
  const newPassed = origTotal - newFailed;
  const ranCount = ran.length;

  const fence = '```';
  const pctOf = (n, d) => (d ? Math.round((n / d) * 100) : 0);
  const text =
    '**K12Catering — Scheduled auto re-run complete**\n\n' +
    'Re-ran ' + ranCount + ' failed test(s):\n\n' +
    fence + '\n' +
    '✅ ' + 'Passed:'.padEnd(9) + nowPassing + '\n' +
    '❌ ' + 'Failed:'.padEnd(9) + newFailed + '\n' +
    fence + '\n\n' +
    'Updated totals:\n\n' +
    fence + '\n' +
    '✅ ' + 'Passed:'.padEnd(9) + newPassed + ' (' + pctOf(newPassed, origTotal) + '%)\n' +
    '❌ ' + 'Failed:'.padEnd(9) + newFailed + ' (' + pctOf(newFailed, origTotal) + '%)\n' +
    '📊 ' + 'Total:'.padEnd(9) + origTotal + '\n' +
    fence +
    failedTestsBlock(stillFailedNames.map((name) => ({ title: name, file: fileByTitle.get(name) })));

  console.log('\nRe-ran ' + origFailed + ' failed → ' + nowPassing + ' passed, ' + newFailed + ' still failing.');
  await sendWebhook(text);
})();
