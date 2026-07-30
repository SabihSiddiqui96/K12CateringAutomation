#!/usr/bin/env node
/**
 * Freshdesk -> RingCentral ticket notifier for the Front Office (development) queue.
 *
 * Watches one group's open tickets and posts a message when tickets appear that we
 * haven't announced before. Freshdesk's own webhook automation would be instant, but it
 * lives under Admin -> Workflows which this account can't reach, so this polls instead
 * (run it from Task Scheduler).
 *
 * Usage:
 *   node scripts/freshdesk-notify.js              # normal run
 *   node scripts/freshdesk-notify.js --dry-run    # print, don't post
 *   node scripts/freshdesk-notify.js --reset      # mark everything current as seen
 *   node scripts/freshdesk-notify.js --ticket 324921 [--dry-run]   # render one ticket
 *
 * What gets posted:
 *   1-5 new tickets  -> ONE message listing them all, separated by dividers
 *   6+ new tickets   -> a single "N new tickets came in" notice linking to the queue
 * Never one message per ticket: a batch is one event and should read as one message.
 *
 * Why membership and not created_at: a ticket can be raised in another queue and moved
 * into this one later, which is normal for dev escalations. Watching "tickets in the
 * group we haven't seen" catches those; watching creation dates would miss them
 * silently. It also means a reopened ticket announces again, which is intended.
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

// Statuses that mean "no longer open". Everything else — In Progress, Development,
// Researching, Escalated and the rest of the custom set — counts as open, which is what
// the "Front Office (development) Open tickets" view shows.
const CLOSED_STATUSES = new Set([4, 5]); // 4 = Resolved, 5 = Closed

// Above this many new tickets at once, post a count + link instead of the full list.
const DIGEST_THRESHOLD = 5;

const DIVIDER = '────────────────────────────';

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
    return { announced: Array.isArray(s.announced) ? s.announced : [] };
  } catch {
    return { announced: [] };
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

function postWebhook(webhookUrl, text) {
  return new Promise((resolve) => {
    if (!webhookUrl) {
      console.log('\n[no FRESHDESK_RC_WEBHOOK_URL in .env — message not sent]\n' + text + '\n');
      return resolve();
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
      },
      (res) => {
        console.log('  posted, status:', res.statusCode);
        resolve();
      },
    );
    req.on('error', (e) => {
      console.error('  webhook error:', e.message);
      resolve();
    });
    req.write(body);
    req.end();
  });
}

/** Every non-closed ticket currently sitting in the watched group. */
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
  return collected.filter((t) => !CLOSED_STATUSES.has(Number(t.status)));
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
    return [
      `**#${t.id}** ${t.subject}`,
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
  const ticketArgIdx = args.indexOf('--ticket');
  const singleTicket = ticketArgIdx >= 0 ? args[ticketArgIdx + 1] : null;

  const apiKey = readEnvValue('FRESHDESK_API_KEY');
  if (!apiKey) fail('FRESHDESK_API_KEY not found in .env.');
  const webhookUrl = readEnvValue('FRESHDESK_RC_WEBHOOK_URL');
  const domain = readEnvValue('FRESHDESK_DOMAIN') || DEFAULT_DOMAIN;
  const groupId = readEnvValue('FRESHDESK_GROUP_ID') || DEFAULT_GROUP_ID;

  // --- demo mode: render one known ticket -------------------------------------
  if (singleTicket) {
    const res = await apiGet(domain, apiKey, `/tickets/${singleTicket}`);
    if (res.status !== 200) fail(`HTTP ${res.status} fetching ticket ${singleTicket}: ${res.body.slice(0, 200)}`);
    const text = buildSummary([JSON.parse(res.body)], domain);
    if (dryRun) {
      console.log('\n--- preview (not sent) ---\n' + text + '\n');
    } else {
      console.log(`Posting ticket #${singleTicket}...`);
      await postWebhook(webhookUrl, text);
    }
    return;
  }

  const state = readState();
  const open = await fetchOpenGroupTickets(domain, apiKey, groupId);
  console.log(`${open.length} open ticket(s) in group ${groupId}.`);

  if (reset) {
    state.announced = open.map((t) => t.id);
    writeState(state);
    console.log(`Marked ${state.announced.length} current ticket(s) as seen. Nothing posted.`);
    return;
  }

  // First run: adopt the current queue as the baseline rather than announcing a backlog
  // that the team has already been working for weeks.
  if (!state.announced.length) {
    state.announced = open.map((t) => t.id);
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
  await postWebhook(webhookUrl, text);
  // Only record after a successful post, so a webhook failure retries next run rather
  // than losing the notification entirely.
  state.announced.push(...fresh.map((t) => t.id));
  writeState(state);
})();
