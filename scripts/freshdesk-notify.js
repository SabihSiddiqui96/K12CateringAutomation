#!/usr/bin/env node
/** Freshdesk -> RingCentral ticket notifier for the Front Office (development) queue. */
const fs = require('fs');
const path = require('path');
const https = require('https');
const url = require('url');

const ROOT = path.resolve(__dirname, '..');
const STATE_FILE = path.join(ROOT, '.freshdesk-notify.json');
const DEFAULT_DOMAIN = 'primeroedge.freshdesk.com';

// Front Office (development). This is the group the API key's own agent belongs to.
const DEFAULT_GROUP_ID = '22000158621';

// Freshdesk's search endpoint pages at 30 and caps at 10 pages.
const SEARCH_PAGE_SIZE = 30;
const MAX_PAGES = 10;

// The exact "Status Include" list of Freshdesk filter 201806
const FILTER_STATUSES = new Set([
  2,  // Open
  3,  // Pending
  4,  // Resolved
  8,  // In Progress
  9,  // Researching
  12, // Escalated
  14, // Request
  18, // Tracker Linked
]);

// Freshdesk's built-in priority ids.
const PRIORITY_LABELS = { 1: 'Low', 2: 'Medium', 3: 'High', 4: 'Urgent' };

// RingCentral renders markdown but has no way to colour text
const PRIORITY_DOTS = { 1: '🟢', 2: '🔵', 3: '🟠', 4: '🔴' };

// Above this many new tickets at once, post a count + link instead of the full list.
const DIGEST_THRESHOLD = 5;

const DIVIDER = '────────────────────────────';

// Task Scheduler throws away stdout/stderr
const LOG_FILE = path.join(ROOT, '.freshdesk-notify.log');
// Presence of this file pauses the notifier entirely — see the kill switch below.
const PAUSE_FILE = path.join(ROOT, '.freshdesk-notify.paused');
const MAX_LOG_LINES = 2000;

function logLine(level, msg) {
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  try {
    fs.appendFileSync(LOG_FILE, `${stamp} ${level} ${msg}\n`);
  } catch {
    // Logging must never be the reason a run dies.
  }
}

function trimLog() {
  try {
    const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n');
    if (lines.length > MAX_LOG_LINES) {
      fs.writeFileSync(LOG_FILE, lines.slice(-MAX_LOG_LINES).join('\n'));
    }
  } catch {
    // No log yet, or it's unreadable — nothing to trim.
  }
}

// Route console output through the log as well, so existing call sites need no changes.
const rawLog = console.log.bind(console);
const rawErr = console.error.bind(console);
console.log = (...a) => { const m = a.join(' '); rawLog(m); logLine('INFO ', m); };
console.error = (...a) => { const m = a.join(' '); rawErr(m); logLine('ERROR', m); };

// An unhandled throw would otherwise vanish entirely under Task Scheduler.
process.on('uncaughtException', (e) => {
  console.error('uncaught exception: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
process.on('unhandledRejection', (e) => {
  console.error('unhandled rejection: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});

function fail(msg) {
  console.error('ERROR: ' + msg);
  process.exit(1);
}

function readEnvValue(key) {
  let text = '';
  try {
    text = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  } catch {
    return '';
  }
  const line = text.split(/\r?\n/).find((l) => l.startsWith(key + '='));
  if (!line) return '';
  return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '');
}

function readState() {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return {
      announced: Array.isArray(s.announced) ? s.announced : [],
      baselined: s.baselined === true,
    };
  } catch {
    return { announced: [], baselined: false };
  }
}

function writeState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function apiGet(domain, apiKey, urlPath) {
  return new Promise((resolve, reject) => {
    const auth = 'Basic ' + Buffer.from(apiKey + ':X').toString('base64');
    https
      .get(`https://${domain}/api/v2${urlPath}`, { headers: { Authorization: auth } }, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      })
      .on('error', reject);
  });
}

/** Returns true only if RingCentral actually accepted the message (2xx). */
function postWebhook(webhookUrl, text) {
  return new Promise((resolve) => {
    if (!webhookUrl) {
      console.log('\n[no FRESHDESK_RC_WEBHOOK_URL in .env — message not sent]\n' + text + '\n');
      return resolve(false);
    }
    const parsed = url.parse(webhookUrl);
    const body = JSON.stringify({ text });
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 30000,
      },
      (res) => {
        res.resume(); // drain, otherwise the socket can hang the process
        const ok = res.statusCode >= 200 && res.statusCode < 300;
        console.log(`  posted, status: ${res.statusCode}${ok ? '' : ' — NOT recorded, will retry'}`);
        resolve(ok);
      },
    );
    req.on('timeout', () => {
      console.error('  webhook timed out — will retry next run');
      req.destroy();
    });
    req.on('error', (e) => {
      console.error('  webhook error:', e.message, '— will retry next run');
      resolve(false);
    });
    req.write(body);
    req.end();
  });
}

/** Every ticket filter 201806 would show: in the group, and in one of its statuses. */
async function fetchOpenGroupTickets(domain, apiKey, groupId) {
  const collected = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const query = encodeURIComponent(`"group_id:${groupId}"`);
    const res = await apiGet(domain, apiKey, `/search/tickets?query=${query}&page=${page}`);
    if (res.status !== 200) {
      fail(`HTTP ${res.status} searching tickets: ${res.body.slice(0, 300)}`);
    }
    const results = JSON.parse(res.body).results || [];
    collected.push(...results);
    if (results.length < SEARCH_PAGE_SIZE) break;
  }
  return collected.filter((t) => FILTER_STATUSES.has(Number(t.status)));
}

/** Big catch-up: say how many arrived and link to the queue. */
function buildCountOnly(tickets, domain) {
  return (
    `**${tickets.length} New Support Tickets**\n\n` +
    `${tickets.length} new tickets came in since the last check. ` +
    `Please click the link to view them.\n\n` +
    `https://${domain}/a/tickets`
  );
}

/** The one message a normal run posts */
function buildSummary(tickets, domain) {
  const entries = tickets.map((t) => {
    const cf = t.custom_fields || {};
    const modulePath = [cf.cf_module_selection, cf.module_subsection, cf.module_subsection_item]
      .filter(Boolean)
      .join(' > ');
    // Priority sits directly under Subject
    const priority = PRIORITY_LABELS[Number(t.priority)];
    const dot = PRIORITY_DOTS[Number(t.priority)];

    // Labelled rows, one per line.
    const rows = [
      ['Subject', t.subject],
      ['Priority', priority ? `${dot ? `${dot} ` : ''}${priority}` : ''],
      ['District', cf.districtcounty || cf.sodexo_district],
      ['Product', cf.cf_primerotype],
      ['Module', modulePath],
    ].filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '');

    const body = rows.map(([label, v]) => `**${label}:** ${v}`).join('\n');
    return `**#${t.id}**\n\n${body}\n\n**Link:** https://${domain}/a/tickets/${t.id}`;
  });

  const heading = tickets.length === 1
    ? '**1 New Support Ticket**'
    : `**All ${tickets.length} Tickets**`;

  return `${heading}\n\n${DIVIDER}\n` + entries.join(`\n${DIVIDER}\n`) + `\n${DIVIDER}`;
}

(async () => {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const reset = args.includes('--reset');

  trimLog();

  // Kill switch.
  if (fs.existsSync(PAUSE_FILE) && !args.includes('--force')) {
    console.log('Paused (' + path.basename(PAUSE_FILE) + ' present) — no polling, no posting.');
    return;
  }

  const apiKey = readEnvValue('FRESHDESK_API_KEY');
  if (!apiKey) fail('FRESHDESK_API_KEY not found in .env.');
  const webhookUrl = readEnvValue('FRESHDESK_RC_WEBHOOK_URL');
  const domain = readEnvValue('FRESHDESK_DOMAIN') || DEFAULT_DOMAIN;
  const groupId = readEnvValue('FRESHDESK_GROUP_ID') || DEFAULT_GROUP_ID;

  const state = readState();
  const open = await fetchOpenGroupTickets(domain, apiKey, groupId);
  console.log(`${open.length} open ticket(s) in group ${groupId}.`);

  if (reset) {
    state.announced = open.map((t) => t.id);
    state.baselined = true;
    writeState(state);
    console.log(`Marked ${state.announced.length} current ticket(s) as seen. Nothing posted.`);
    return;
  }

  // First run: adopt the current queue as the baseline rather than announcing a backlog that the
  if (!state.baselined) {
    state.announced = open.map((t) => t.id);
    state.baselined = true;
    writeState(state);
    console.log(`First run — baselined ${state.announced.length} existing ticket(s). Nothing posted.`);
    return;
  }

  const seen = new Set(state.announced);
  const fresh = open
    .filter((t) => !seen.has(t.id))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  if (!fresh.length) {
    console.log('No new tickets.');
    return;
  }

  const text = fresh.length > DIGEST_THRESHOLD
    ? buildCountOnly(fresh, domain)
    : buildSummary(fresh, domain);

  if (dryRun) {
    console.log('\n--- preview (not sent) ---\n' + text + '\n');
    return;
  }

  console.log(`Posting ${fresh.length} ticket(s) in one message...`);
  const posted = await postWebhook(webhookUrl, text);
  // Only record after a genuinely successful post
  if (!posted) {
    console.error(`Post failed — ${fresh.length} ticket(s) left unannounced for the next run.`);
    process.exitCode = 1;
    return;
  }
  state.announced.push(...fresh.map((t) => t.id));
  writeState(state);
  console.log(`Recorded ${fresh.length} ticket(s) as announced.`);
})();
