#!/usr/bin/env node
/**
 * Posts the day's "what we fixed" note on ADO Task 114690
 * (K12Catering - Automation Testing, PrimeroEdge Classic).
 *
 * The note is queued to .ticket-comment-queue.json when a fix lands rather than
 * posted there and then: it needs to come after the morning re-run webhook so the
 * ticket and the channel agree on the numbers, and a comment at the same minute
 * every day looks automated. Task Scheduler runs this at a random early-afternoon
 * time.
 *
 * Only fixes get a comment. An empty queue means there is nothing to say, which is
 * most days. One comment per day, tracked in .ticket-comment-posted.json.
 *
 * Usage:
 *   node scripts/post-ticket-comment.js              # the scheduled run
 *   node scripts/post-ticket-comment.js --dry-run    # print, do not post
 *   node scripts/post-ticket-comment.js --force      # ignore the daily guard
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const QUEUE = path.join(ROOT, '.ticket-comment-queue.json');
const POSTED = path.join(ROOT, '.ticket-comment-posted.json');
const LOG_FILE = path.join(ROOT, '.ticket-comment.log');

const ORG = 'Cybersoft-Technologies-Inc';
const PROJECT = 'PrimeroEdge Classic';
const WORK_ITEM = 114690;

function log(msg) {
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const line = `${stamp} ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

function readEnvValue(key) {
  let text = '';
  try { text = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); } catch { return ''; }
  const line = text.split(/\r?\n/).find((l) => l.startsWith(key + '='));
  if (!line) return '';
  return line.slice(key.length + 1).replace(/#.*$/, '').trim().replace(/^["']|["']$/g, '');
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

// ADO comments are HTML; the queued note is plain text, so keep its line breaks.
function toHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .trim()
    .split('\n')
    .join('<br>');
}

function postComment(text, pat) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ text: toHtml(text) });
    const req = https.request(
      {
        hostname: 'dev.azure.com',
        path: `/${ORG}/${encodeURIComponent(PROJECT)}/_apis/wit/workItems/${WORK_ITEM}/comments?api-version=7.1-preview.3`,
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(':' + pat).toString('base64'),
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => resolve({ status: res.statusCode, body: d }));
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  const dryRun = process.argv.includes('--dry-run');
  const force = process.argv.includes('--force');

  const queue = readJson(QUEUE, null);
  if (!queue || !queue.text || !String(queue.text).trim()) {
    log('nothing queued - no fixes to report. Exiting quietly.');
    return;
  }

  const posted = readJson(POSTED, {});
  if (!force && posted[today()]) {
    log(`already posted a comment today (${today()}). Exiting.`);
    return;
  }

  const text = String(queue.text).trim();

  if (dryRun) {
    log(`DRY RUN: would post to work item ${WORK_ITEM}:\n\n${text}\n`);
    return;
  }

  const pat = readEnvValue('AZURE_DEVOPS_PAT');
  if (!pat) { log('SKIP: AZURE_DEVOPS_PAT not found in .env.'); return; }

  const res = await postComment(text, pat);
  if (res.status >= 200 && res.status < 300) {
    log(`comment posted to work item ${WORK_ITEM} (HTTP ${res.status}).`);
    posted[today()] = { at: new Date().toISOString(), text };
    // Keep 60 days of history.
    const keys = Object.keys(posted).sort();
    if (keys.length > 60) for (const k of keys.slice(0, keys.length - 60)) delete posted[k];
    fs.writeFileSync(POSTED, JSON.stringify(posted, null, 2));
    fs.rmSync(QUEUE, { force: true });
  } else {
    // Keep the queue so the next run retries instead of losing the note.
    log(`FAILED to post (HTTP ${res.status}). Queue kept for retry. Response: ${res.body.slice(0, 300)}`);
    if (res.status === 401 || res.status === 403) {
      log('The PAT likely lacks "Work Items (Read & write)" scope - widen it in Azure DevOps.');
    }
  }
})();
