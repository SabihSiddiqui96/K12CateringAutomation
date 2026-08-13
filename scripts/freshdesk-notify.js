#!/usr/bin/env node
/**
 * Freshdesk -> RingCentral ticket notifier for the Front Office (development) queue.
 *
 * Mirrors Freshdesk filter 201806 (Groups: Development Team - Front Office; Status
 * Include: the 8 statuses in FILTER_STATUSES below) and posts a message when tickets
 * appear in it that we haven't announced before. Freshdesk's own webhook automation would be instant, but it
 * lives under Admin -> Workflows which this account can't reach, so this polls instead
 * (run it from Task Scheduler).
 *
 * Usage:
 *   node scripts/freshdesk-notify.js              # normal run
 *   node scripts/freshdesk-notify.js --dry-run    # print, don't post
 *   node scripts/freshdesk-notify.js --reset      # mark everything current as seen
 *
 * What gets posted:
 *   1-5 new tickets  -> ONE message listing them all, separated by dividers
 *   6+ new tickets   -> a single "N new tickets came in" notice linking to the queue
 * Never one message per ticket: a batch is one event and should read as one message.
 *
 * Why membership and not created_at: a ticket can be raised in another queue and moved
 * into this one later, which is normal for dev escalations. Watching "tickets in the
 * group we haven't seen" catches those; watching creation dates would miss them
 * silently.
 *
 * A ticket is announced at most ONCE, ever. Announced ids are kept permanently and
 * never pruned, so a ticket that is closed and later reopened does not announce a
 * second time. At a handful of tickets a week the list stays tiny.
 *
 * Secrets / config are read from the repo .env (never the shell env):
 *   - FRESHDESK_API_KEY           agent API key (Profile Settings -> Your API Key)
 *   - FRESHDESK_RC_WEBHOOK_URL    RingCentral incoming webhook to post into
 *   - FRESHDESK_DOMAIN            optional, defaults to primeroedge.freshdesk.com
 *   - FRESHDESK_GROUP_ID          optional, defaults to Front Office (development)
 *
 * State lives in .freshdesk-notify.json (gitignored) so a ticket is never announced
 * twice, even if the schedule double-fires or a run is interrupted.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const url = require('url');

const ROOT = path.resolve(__dirname, '..');
const STATE_FILE = path.join(ROOT, '.freshdesk-notify.json');
const DEFAULT_DOMAIN = 'primeroedge.freshdesk.com';

// Front Office (development). This is the group the API key's own agent belongs to.
const DEFAULT_GROUP_ID = '22000158621';

// Freshdesk's search endpoint pages at 30 and caps at 10 pages. The queue holds ~145
// tickets in total, so this comfortably covers it.
const SEARCH_PAGE_SIZE = 30;
const MAX_PAGES = 10;

// The exact "Status Include" list of Freshdesk filter 201806, which is the queue the
// team actually watches. Copied from the filter's own sidebar — keep the two in sync;
// if someone edits the filter, edit this.
//
// This is an ALLOWLIST, not an exclusion list. It used to exclude {Resolved, Closed,
// Development} and admit everything else, which drifted from the filter in both
// directions: it dropped Resolved (the filter includes it, so those tickets would
// never have been announced) and admitted statuses the filter has no interest in
// (Pending Release, On Hold, the ExpressPoint/Sodexo workflow states, Assigned to AI
// Agent, ...). Matching the filter literally is the only version that can't silently
// diverge from what the team sees.
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

// Freshdesk's built-in priority ids. These four are fixed platform values, not a
// per-account custom field, so they don't drift the way FILTER_STATUSES can.
const PRIORITY_LABELS = { 1: 'Low', 2: 'Medium', 3: 'High', 4: 'Urgent' };

// RingCentral renders markdown but has no way to colour text, so the priority
// colour is carried by a dot emoji. These match the swatches Freshdesk shows in
// its own ticket list: Low green, Medium blue, High orange, Urgent red.
const PRIORITY_DOTS = { 1: '🟢', 2: '🔵', 3: '🟠', 4: '🔴' };

// Above this many new tickets at once, post a count + link instead of the full list.
const DIGEST_THRESHOLD = 5;

const DIVIDER = '────────────────────────────';

// Task Scheduler throws away stdout/stderr, so an unattended failure shows up as a bare
// exit code with no way to tell a network blip from a bad API key. Mirror every line to
// a log file, trimmed to the last MAX_LOG_LINES so it can't grow without bound.
const LOG_FILE = path.join(ROOT, '.freshdesk-notify.log');
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

/**
 * Returns true only if RingCentral actually accepted the message (2xx). Anything else
 * — no webhook configured, a non-2xx reply, a network error — returns false so the
 * caller leaves the tickets unannounced and retries them on the next run.
 *
 * This used to resolve unconditionally while the caller recorded the tickets anyway,
 * so a failed post marked them announced and they were never seen again. The common
 * trigger is the machine waking from sleep: the task fires before the network is up,
 * the request errors, and the ticket is silently lost.
 */
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

/**
 * Big catch-up: say how many arrived and link to the queue. Listing them would be an
 * unreadable wall of text in a single chat message.
 */
function buildCountOnly(tickets, domain) {
  return (
    `**${tickets.length} New Support Tickets**\n\n` +
    `${tickets.length} new tickets came in since the last check. ` +
    `Please click the link to view them.\n\n` +
    `https://${domain}/a/tickets`
  );
}

/**
 * The one message a normal run posts: every new ticket in a single message, separated
 * by dividers. One message per ticket was rejected as too noisy — a batch is one event.
 */
function buildSummary(tickets, domain) {
  const entries = tickets.map((t) => {
    const cf = t.custom_fields || {};
    const modulePath = [cf.cf_module_selection, cf.module_subsection, cf.module_subsection_item]
      .filter(Boolean)
      .join(' > ');
    // Priority leads the detail lines — it's the one field that decides whether
    // someone picks the ticket up now or after lunch.
    const priority = PRIORITY_LABELS[Number(t.priority)];
    const dot = PRIORITY_DOTS[Number(t.priority)];
    return [
      `**#${t.id}** ${t.subject}`,
      priority ? `**Priority:** ${dot ? `${dot} ` : ''}${priority}` : null,
      cf.districtcounty || cf.sodexo_district
        ? `**District:** ${cf.districtcounty || cf.sodexo_district}` : null,
      cf.cf_primerotype ? `**Product:** ${cf.cf_primerotype}` : null,
      modulePath ? `**Module:** ${modulePath}` : null,
      `https://${domain}/a/tickets/${t.id}`,
    ].filter(Boolean).join('\n');
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

  // First run: adopt the current queue as the baseline rather than announcing a backlog
  // that the team has already been working for weeks. Gated on an explicit `baselined`
  // flag, NOT on the list being empty — with an empty queue the baseline list is itself
  // empty, and keying off that would re-baseline on every run and silently swallow the
  // first real ticket instead of announcing it.
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
  // Only record after a genuinely successful post, so a webhook failure retries next
  // run rather than losing the notification entirely. Exit non-zero on failure so a
  // dead webhook shows up as a failed task in Task Scheduler instead of looking fine.
  if (!posted) {
    console.error(`Post failed — ${fresh.length} ticket(s) left unannounced for the next run.`);
    process.exitCode = 1;
    return;
  }
  state.announced.push(...fresh.map((t) => t.id));
  writeState(state);
  console.log(`Recorded ${fresh.length} ticket(s) as announced.`);
})();
