const fs = require('fs');
const path = require('path');

const runId =
  process.env.RUN_ID || new Date().toISOString().replace(/[:.]/g, '-');
const branch = process.env.GIT_BRANCH || '';
const commit = process.env.GIT_SHA || '';

const repoRoot = process.cwd();
const siteDir = path.join(repoRoot, 'site');
const reportsDir = path.join(siteDir, 'reports');
const runDir = path.join(reportsDir, runId);

const htmlReportDir = path.join(repoRoot, 'playwright-report');
const jsonReportFile = path.join(repoRoot, 'test-results', 'results.json');
const historyFile = path.join(siteDir, 'runs.json');

fs.mkdirSync(runDir, { recursive: true });

if (!fs.existsSync(htmlReportDir)) {
  throw new Error('playwright-report folder not found');
}

fs.cpSync(htmlReportDir, runDir, { recursive: true });

if (fs.existsSync(jsonReportFile)) {
  fs.copyFileSync(jsonReportFile, path.join(runDir, 'results.json'));
}

function summarizeResults(data) {
  const summary = {
    runId,
    date: new Date().toISOString(),
    branch,
    commit,
    total: 0,
    passed: 0,
    failed: 0,
    flaky: 0,
    skipped: 0,
  };

  function walkSuite(suite) {
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        const results = test.results || [];
        const finalStatus = results.length
          ? results[results.length - 1]?.status
          : 'skipped';

        summary.total += 1;

        if (finalStatus === 'passed') summary.passed += 1;
        else if (finalStatus === 'failed') summary.failed += 1;
        else if (finalStatus === 'flaky') summary.flaky += 1;
        else if (finalStatus === 'skipped') summary.skipped += 1;
      }
    }

    for (const child of suite.suites || []) {
      walkSuite(child);
    }
  }

  for (const suite of data.suites || []) {
    walkSuite(suite);
  }

  return summary;
}

let currentRun = {
  runId,
  date: new Date().toISOString(),
  branch,
  commit,
  total: 0,
  passed: 0,
  failed: 0,
  flaky: 0,
  skipped: 0,
};

if (fs.existsSync(jsonReportFile)) {
  const raw = fs.readFileSync(jsonReportFile, 'utf8');
  const parsed = JSON.parse(raw);
  currentRun = summarizeResults(parsed);
}

let runs = [];
if (fs.existsSync(historyFile)) {
  runs = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
}

runs = [currentRun, ...runs].slice(0, 200);

fs.mkdirSync(siteDir, { recursive: true });
fs.writeFileSync(historyFile, JSON.stringify(runs, null, 2));

const rows = runs
  .map(
    (r) => `
      <tr>
        <td>${r.runId}</td>
        <td>${r.date}</td>
        <td>${r.branch || ''}</td>
        <td>${r.commit ? r.commit.slice(0, 7) : ''}</td>
        <td>${r.total}</td>
        <td>${r.passed}</td>
        <td>${r.failed}</td>
        <td>${r.flaky}</td>
        <td>${r.skipped}</td>
        <td><a href="./reports/${r.runId}/index.html">Open report</a></td>
      </tr>
    `
  )
  .join('');

const html = `
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Playwright Reports</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 32px; background: #0f172a; color: #e2e8f0; }
    h1 { margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; background: #111827; }
    th, td { padding: 12px; border: 1px solid #334155; text-align: left; }
    th { background: #1e293b; }
    a { color: #60a5fa; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <h1>Playwright Report Dashboard</h1>
  <table>
    <thead>
      <tr>
        <th>Run ID</th>
        <th>Date</th>
        <th>Branch</th>
        <th>Commit</th>
        <th>Total</th>
        <th>Passed</th>
        <th>Failed</th>
        <th>Flaky</th>
        <th>Skipped</th>
        <th>Report</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>
`;

fs.writeFileSync(path.join(siteDir, 'index.html'), html);

console.log(`Built static site for run: ${runId}`);