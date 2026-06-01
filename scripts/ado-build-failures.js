#!/usr/bin/env node
/**
 * Read-only Azure DevOps build test-failure fetcher used by the `fixtests`
 * workflow. Lists the failed test display names for a given build.
 *
 * Usage:
 *   node scripts/ado-build-failures.js <buildId | full build results URL>
 *
 * Reads AZURE_DEVOPS_PAT from the repo .env (never the shell env).
 * GET only — safe to allowlist for prompt-free execution.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const DEFAULT_ORG = 'Cybersoft-Technologies-Inc';
const DEFAULT_PROJECT = 'K12-Catering';
const API_VERSION = '7.0';

function readPatFromEnv() {
  const envPath = path.resolve(__dirname, '..', '.env');
  let text = '';
  try {
    text = fs.readFileSync(envPath, 'utf8');
  } catch {
    fail('Could not read .env at ' + envPath);
  }
  const line = text.split(/\r?\n/).find((l) => /^AZURE_DEVOPS_PAT=/.test(l));
  if (!line) fail('AZURE_DEVOPS_PAT not found in .env — add AZURE_DEVOPS_PAT=<token>.');
  return line.replace(/^AZURE_DEVOPS_PAT=/, '').trim().replace(/^["']|["']$/g, '');
}

function parseArg(arg) {
  if (!arg) fail('Provide a build ID or build results URL.');
  const urlOrg = arg.match(/dev\.azure\.com\/([^/]+)\/([^/]+)\/_build/i);
  const org = urlOrg ? decodeURIComponent(urlOrg[1]) : DEFAULT_ORG;
  const project = urlOrg ? decodeURIComponent(urlOrg[2]) : DEFAULT_PROJECT;
  const idMatch = arg.match(/buildId=(\d+)/i) || arg.match(/(\d+)/);
  if (!idMatch) fail('Could not extract a build ID from: ' + arg);
  return { org, project, id: idMatch[1] };
}

function fail(msg) {
  console.error('ERROR: ' + msg);
  process.exit(1);
}

function get(url, pat) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(':' + pat).toString('base64');
    https
      .get(url, { headers: { Authorization: 'Basic ' + auth } }, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      })
      .on('error', reject);
  });
}

(async () => {
  const pat = readPatFromEnv();
  const { org, project, id } = parseArg(process.argv[2]);
  const base = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}`;
  const buildUri = `vstfs:///Build/Build/${id}`;
  const runsUrl = `${base}/_apis/test/runs?buildUri=${encodeURIComponent(buildUri)}&api-version=${API_VERSION}`;

  const runsRes = await get(runsUrl, pat);
  if (runsRes.status !== 200) {
    fail(`HTTP ${runsRes.status} fetching runs. Body: ${runsRes.body.slice(0, 300)}`);
  }
  const runs = (JSON.parse(runsRes.body).value) || [];
  if (!runs.length) {
    console.log('No test runs found for build ' + id);
    return;
  }

  const failures = [];
  for (const run of runs) {
    const resUrl = `${base}/_apis/test/Runs/${run.id}/results?outcomes=Failed&api-version=${API_VERSION}`;
    const res = await get(resUrl, pat);
    if (res.status !== 200) continue;
    const results = (JSON.parse(res.body).value) || [];
    for (const r of results) {
      failures.push({ run: run.id, name: r.testCaseTitle, outcome: r.outcome });
    }
  }

  console.log('BUILD:', id);
  console.log('FAILED COUNT:', failures.length);
  console.log('');
  failures.forEach((f, i) => {
    console.log(`${i + 1}. ${f.name}`);
  });
})();
