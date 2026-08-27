#!/usr/bin/env node
/**
 * Posts the day's "what we fixed" note as a comment on the automation task,
 * ADO Task 114690 (K12Catering - Automation Testing, project "PrimeroEdge Classic").
 *
 * WHY A QUEUE INSTEAD OF POSTING DIRECTLY: the note is written when a fix actually
 * lands (see the `ticket comment` rule in CLAUDE.md), but it must not appear on the
 * ticket at that moment. Two reasons. It has to land AFTER the morning re-run webhook
 * so the numbers in the channel and on the ticket agree, and a comment that shows up
 * at the same minute every day reads as a bot. So the note is queued to
 * .ticket-comment-queue.json and this script — run by Task Scheduler at a randomised
 * early-afternoon time — posts it.
 *
 * ONLY FIXES GET POSTED. A re-run that went green on its own is not a comment; it is
 * at most a clause inside one ("the other 2 just needed a re-run"). If the queue is
 * empty, this exits quietly, which is the normal outcome on most days.
 *
 * At most one comment per day: .ticket-comment-posted.json records what went out.
 *
 * Usage:
 *   node scripts/post-ticket-comment.js              # what Task Scheduler runs
 *   node scripts/post-ticket-comment.js --dry-run    # print what would post
 *   node scripts/post-ticket-comment.js --force      # ignore the once-a-day guard
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

/**
 * ADO comments are HTML. The queued note is written as plain text with blank lines
 * between items, so convert rather than dumping raw text (which would collapse into
 * one paragraph and look nothing like the comments a person leaves).
 */
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
    // Keep the last 60 days; enough to answer "did we post that?" without growing.
    const keys = Object.keys(posted).sort();
    if (keys.length > 60) for (const k of keys.slice(0, keys.length - 60)) delete posted[k];
    fs.writeFileSync(POSTED, JSON.stringify(posted, null, 2));
    fs.rmSync(QUEUE, { force: true });
  } else {
    // Leave the queue in place so the next run retries rather than losing the note.
    log(`FAILED to post (HTTP ${res.status}). Queue kept for retry. Response: ${res.body.slice(0, 300)}`);
    if (res.status === 401 || res.status === 403) {
      log('The PAT likely lacks "Work Items (Read & write)" scope - widen it in Azure DevOps.');
    }
  }
})();
