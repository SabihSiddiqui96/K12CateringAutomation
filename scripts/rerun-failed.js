#!/usr/bin/env node
/**
 * Local "re-run failed tests" helper used by the `rerun` workflow (CLAUDE.md).
 *
 * Usage:
 *   node scripts/rerun-failed.js <buildId | full build results URL>
 *
 * What it does, all locally (no pipeline run):
 *   1. Reads the Azure DevOps build you pass in — pulls its FAILED test names
 *      and its TOTAL test count straight from the build's test results
 *      (same source the `fixtests` flow uses).
 *   2. Posts a RingCentral webhook: "re-running N failed test(s)...".
 *   3. Re-runs ONLY those failed tests locally (Playwright -g by title).
 *   4. Merges the local outcome back into the build's original counts:
 *      Total stays the same, Failed = whatever still fails locally, and
 *      Passed = Total - Failed. Posts an updated RingCentral webhook.
 *
 * Secrets are read from the repo .env (never the shell env):
 *   - AZURE_DEVOPS_PAT          → to read the build's test results
 *   - RINGCENTRAL_WEBHOOK_URL   → to post the messages (if missing, the script
 *                                 still re-runs and just prints the messages)
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const url = require('url');
const readline = require('readline');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const RESULTS = path.join(ROOT, 'test-results', 'results.json');
const HISTORY = path.join(ROOT, '.rerun-history.json');
const PW_CLI = require.resolve('@playwright/test/cli');

const DEFAULT_ORG = 'Cybersoft-Technologies-Inc';
const DEFAULT_PROJECT = 'K12-Catering';
const API_VERSION = '7.0';

function fail(msg) {
  console.error('ERROR: ' + msg);
  process.exit(1);
}

function readEnvValue(key) {
  const envPath = path.join(ROOT, '.env');
  let text = '';
  try {
    text = fs.readFileSync(envPath, 'utf8');
  } catch {
    return '';
  }
  const line = text.split(/\r?\n/).find((l) => new RegExp('^' + key + '=').test(l));
  if (!line) return '';
  return line.replace(new RegExp('^' + key + '='), '').trim().replace(/^["']|["']$/g, '');
}

// Local ledger of builds we've already re-run, keyed by org/project/buildId, so
// re-pasting the same build link doesn't repeat work we already did. Stored at
// .rerun-history.json (gitignored — purely local state).
function readHistory() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY, 'utf8'));
  } catch {
    return {};
  }
}

function writeHistory(h) {
  try {
    fs.writeFileSync(HISTORY, JSON.stringify(h, null, 2));
  } catch (e) {
    console.error('Could not write rerun history:', e.message);
  }
}

function parseBuildArg(arg) {
  if (!arg) fail('Provide a build ID or build results URL.');
  const urlOrg = arg.match(/dev\.azure\.com\/([^/]+)\/([^/]+)\/_build/i);
  const org = urlOrg ? decodeURIComponent(urlOrg[1]) : DEFAULT_ORG;
  const project = urlOrg ? decodeURIComponent(urlOrg[2]) : DEFAULT_PROJECT;
  const idMatch = arg.match(/buildId=(\d+)/i) || arg.match(/(\d+)/);
  if (!idMatch) fail('Could not extract a build ID from: ' + arg);
  return { org, project, id: idMatch[1] };
}

function get(getUrl, pat) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(':' + pat).toString('base64');
    https
      .get(getUrl, { headers: { Authorization: 'Basic ' + auth } }, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      })
      .on('error', reject);
  });
}

async function fetchBuild(org, project, id, pat) {
  const base = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}`;
  const buildUri = `vstfs:///Build/Build/${id}`;
  const runsUrl = `${base}/_apis/test/runs?buildUri=${encodeURIComponent(buildUri)}&api-version=${API_VERSION}`;
  const runsRes = await get(runsUrl, pat);
  if (runsRes.status !== 200) {
    fail(`HTTP ${runsRes.status} fetching test runs. Body: ${runsRes.body.slice(0, 300)}`);
  }
  const runs = (JSON.parse(runsRes.body).value) || [];
  if (!runs.length) fail('No test runs found for build ' + id + '.');

  let total = 0;
  const failedNames = [];
  for (const run of runs) {
    if (typeof run.totalTests === 'number') total += run.totalTests;
    const resUrl = `${base}/_apis/test/Runs/${run.id}/results?outcomes=Failed&api-version=${API_VERSION}`;
    const res = await get(resUrl, pat);
    if (res.status !== 200) continue;
    const results = (JSON.parse(res.body).value) || [];
    for (const r of results) if (r.testCaseTitle) failedNames.push(r.testCaseTitle);
  }
  // de-dupe (retries can report the same title twice)
  const failed = [...new Set(failedNames)];
  const resultsUrl = `${base}/_build/results?buildId=${id}&view=ms.vss-test-web.build-test-results-tab`;
  return { total, failed, resultsUrl };
}

function normTitle(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

// Parse the local Playwright results.json into one entry per test, keyed by the
// display name Azure DevOps uses: describe blocks joined to the test title by
// ' › ' (the file-level suite is excluded). Lets us tell, by name, which of the
// re-run tests now pass vs still fail.
function collectLocalResults(file) {
  const out = []; // { title, status, file }
  if (!fs.existsSync(file)) return out;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
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
  // Top-level suites are file-level; their title is the file path — drop it.
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

// Azure stores a test's display name with describe blocks joined by ' › ', but
// Playwright's -g matches against the title joined by spaces. Split on the ' › '
// separator and rejoin the escaped segments with '.*' so either form matches.
function titleToGrep(name) {
  return name
    .split(/\s*›\s*/)
    .map(escapeRegex)
    .join('.*');
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

// Which env the local Playwright run will use, mirroring playwright.config.ts:
// ENV_FILE in the shell wins, else .vscode/settings.json playwright.env.ENV_FILE,
// else the default (.env = QA). '.env.release' => release/UAT, anything else => qa.
function currentEnv() {
  let envFile = process.env.ENV_FILE && process.env.ENV_FILE.trim();
  if (!envFile) {
    try {
      const s = JSON.parse(fs.readFileSync(path.join(ROOT, '.vscode', 'settings.json'), 'utf8'));
      envFile = s && s['playwright.env'] && s['playwright.env'].ENV_FILE
        ? String(s['playwright.env'].ENV_FILE).trim()
        : '';
    } catch {
      envFile = '';
    }
  }
  return envFile === '.env.release' ? 'release' : 'qa';
}

// Point VS Code's Playwright env back at QA (same effect as the "Switch to QA"
// task / `node scripts/switch-env.js qa`): drop ENV_FILE from settings.json.
function switchToQa() {
  const settingsPath = path.join(ROOT, '.vscode', 'settings.json');
  let s = {};
  try {
    s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch {
    s = {};
  }
  if (s['playwright.env']) {
    delete s['playwright.env'].ENV_FILE;
    if (Object.keys(s['playwright.env']).length === 0) delete s['playwright.env'];
  }
  fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2));
}

// Ask a yes/no question. Returns true/false when run interactively (a TTY), or
// null when non-interactive (e.g. spawned by Claude) so the caller can fall
// back to a marker line + flag instead of hanging on input.
function promptYesNo(question) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) return resolve(null);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question + ' (y/n) ', (a) => {
      rl.close();
      resolve(/^\s*y(es)?\s*$/i.test(a));
    });
  });
}

(async () => {
  const pat = readEnvValue('AZURE_DEVOPS_PAT');
  if (!pat) fail('AZURE_DEVOPS_PAT not found in .env — add AZURE_DEVOPS_PAT=<token>.');

  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const wantQa = args.includes('--qa');
  const buildArg = args.find((a) => !a.startsWith('--'));

  const history = readHistory();

  // Resolve which build to re-run. With no URL given, fall back to the last
  // build we re-ran (stored in the ledger) so a repeat is just running again
  // with no args — no need to re-paste the long build URL.
  let org;
  let project;
  let id;
  if (buildArg) {
    ({ org, project, id } = parseBuildArg(buildArg));
  } else {
    const lastKey = history.__lastBuild;
    if (!lastKey || !history[lastKey]) {
      fail('No build URL given and no previous re-run on record. Pass the build URL the first time.');
    }
    const parts = lastKey.split('/');
    id = parts.pop();
    project = parts.pop();
    org = parts.join('/');
    console.log('No build URL given — reusing the last re-run build: ' + lastKey);
  }

  const histKey = org + '/' + project + '/' + id;
  const prior = history[histKey];

  // Already re-ran this exact build before?
  //  - if everything passed last time, hard-stop (nothing to do).
  //  - if some tests still failed, ASK whether to re-run the still-failing set
  //    again. Interactive (a TTY) -> y/n prompt; non-interactive (spawned by
  //    Claude) -> print NEEDS_CONFIRM so the caller can ask and re-invoke.
  //    --force always skips the question.
  if (prior && !force) {
    if (prior.allPassed) {
      console.log('\nBuild ' + id + ' was already re-run on ' + prior.lastRunAt +
        ' and all ' + prior.origFailed + ' previously-failed test(s) passed. Skipping — nothing to do.');
      console.log('  Original run: ' + prior.resultsUrl);
      return;
    }
    console.log('\nBuild ' + id + ' was already re-run on ' + prior.lastRunAt +
      ', and ' + prior.stillFailed + ' of ' + prior.origFailed + ' test(s) STILL failed.');
    console.log('  Recovered (now passing): ' + prior.nowPassing);
    console.log('  Still failing: ' + prior.stillFailed);
    console.log('  Original run: ' + prior.resultsUrl);
    const ans = await promptYesNo('Re-run the ' + prior.stillFailed + ' still-failing test(s) again?');
    if (ans === null) {
      console.log('\nNEEDS_CONFIRM: already re-ran this build; ' + prior.stillFailed +
        ' still failing. Re-run with --force to run them again.');
      return;
    }
    if (!ans) {
      console.log('OK — not re-running.');
      return;
    }
  }

  // Pick the set to re-run. If we've re-run this build before AND recorded which
  // tests were STILL failing, re-run that latest set — not the build's original
  // failures (otherwise a repeat re-run keeps re-running tests that already pass).
  let origTotal;
  let failed;
  let resultsUrl;
  if (prior && Array.isArray(prior.failedNames) && typeof prior.origTotal === 'number') {
    failed = prior.failedNames;
    origTotal = prior.origTotal;
    resultsUrl = prior.resultsUrl;
    console.log(
      'Re-running the ' + failed.length +
      ' test(s) still failing from the last re-run of build ' + id + '...',
    );
  } else {
    console.log('Reading failed tests from build ' + id + '...');
    const b = await fetchBuild(org, project, id, pat);
    failed = b.failed;
    origTotal = b.total;
    resultsUrl = b.resultsUrl;
  }

  if (!failed.length) {
    console.log('Build ' + id + ' has no failed tests — nothing to re-run.');
    history[histKey] = {
      buildId: id, lastRunAt: new Date().toISOString(),
      origTotal: typeof origTotal === 'number' ? origTotal : 0,
      origFailed: 0, nowPassing: 0, stillFailed: 0, allPassed: true,
      failedNames: [], resultsUrl,
    };
    history.__lastBuild = histKey;
    writeHistory(history);
    await sendWebhook(
      'K12Catering Automation — re-run requested for build ' + id +
      ', but it has no failed tests. Nothing to re-run.\n\nOriginal run: ' + resultsUrl,
    );
    return;
  }

  // Always re-run against QA. If VS Code is currently pointed at another env
  // (e.g. Release/UAT via .vscode/settings.json), offer to switch to QA first.
  const env = currentEnv();
  if (env !== 'qa') {
    if (wantQa) {
      switchToQa();
      console.log('Switched to QA before re-running.');
    } else {
      const ans = await promptYesNo(
        'Tests are currently set to run against ' + env.toUpperCase() +
        ' (UAT), not QA. Switch to QA before re-running?',
      );
      if (ans === null) {
        console.log('NEEDS_ENV_SWITCH: current env is ' + env.toUpperCase() +
          ', not QA. Re-run with --qa to switch to QA and continue.');
        return;
      }
      if (!ans) {
        console.log('Re-runs should be on QA — aborting. Switch the env and try again.');
        return;
      }
      switchToQa();
      console.log('Switched to QA before re-running.');
    }
  }

  console.log('Failed tests to re-run (' + failed.length + '):');
  failed.forEach((n, i) => console.log('  ' + (i + 1) + '. ' + n));

  await sendWebhook(
    'K12Catering Automation — re-running ' + failed.length +
    ' previously failed test(s) with the latest changes.\n\n' +
    'Original run: ' + resultsUrl + '\n\nUpdated results to follow.',
  );

  // Re-run ONLY the failed tests, matched by title. Invoke the Playwright CLI
  // through node directly so test names with spaces/symbols pass as one arg.
  const grep = failed.map(titleToGrep).join('|');
  console.log('\nRe-running failed tests locally...\n');
  spawnSync(process.execPath, [PW_CLI, 'test', '-g', grep, '--workers=1'], {
    cwd: ROOT,
    stdio: 'inherit',
  });

  // Match the re-run set against the local results BY NAME: only credit a test
  // that we can see actually passed. A test that failed locally — or that we
  // couldn't match at all (renamed?) — stays failed, so we never over-report.
  const ran = collectLocalResults(RESULTS);
  const statusByTitle = new Map(ran.map((r) => [r.title, r.status]));
  const fileByTitle = new Map(ran.map((r) => [r.title, r.file]));
  const stillFailedNames = [];
  let nowPassing = 0;
  let unmatched = 0;
  for (const name of failed) {
    const status = statusByTitle.get(normTitle(name));
    if (status === 'passed') {
      nowPassing += 1;
    } else {
      stillFailedNames.push(name);
      if (status === undefined) unmatched += 1;
    }
  }

  const origFailed = failed.length;
  const newFailed = stillFailedNames.length;
  const newPassed = origTotal - newFailed;
  const ranCount = ran.length;

  let note = '(Re-ran ' + ranCount + ' of ' + origFailed + ' failed test(s): ' +
    nowPassing + ' now pass, ' + newFailed + ' still failing.)';
  if (unmatched) {
    note += '\nNote: ' + unmatched +
      ' failed test(s) could not be matched locally (renamed since this build?) — kept as failed.';
  }

  const fence = '```';
  const pctOf = (n, d) => (d ? Math.round((n / d) * 100) : 0);
  const text =
    '**K12Catering — Failed-test re-run complete**\n\n' +
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
    failedTestsBlock(stillFailedNames.map((name) => ({ title: name, file: fileByTitle.get(normTitle(name)) })));

  history[histKey] = {
    buildId: id,
    lastRunAt: new Date().toISOString(),
    origTotal,
    origFailed,
    nowPassing,
    stillFailed: newFailed,
    allPassed: newFailed === 0,
    failedNames: stillFailedNames,
    resultsUrl,
  };
  history.__lastBuild = histKey;
  writeHistory(history);

  await sendWebhook(text);
})();
