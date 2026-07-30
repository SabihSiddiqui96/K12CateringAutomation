#!/usr/bin/env node
/**
 * Freshdesk -> RingCentral new-ticket notifier.
 *
 * Polls Freshdesk for tickets created since the last check and posts one message
 * per new ticket to a RingCentral channel. Freshdesk's own webhook automation would
 * be instant, but it lives under Admin -> Workflows, which this account can't reach,
 * so we poll instead.
 *
 * Usage:
 *   node scripts/freshdesk-notify.js              # normal run (post anything new)
 *   node scripts/freshdesk-notify.js --dry-run    # print, don't post
 *   node scripts/freshdesk-notify.js --ticket 324921 [--dry-run]
 *                                                 # render one specific ticket (demo)
 *   node scripts/freshdesk-notify.js --reset      # re-baseline to "now", post nothing
 *   node scripts/freshdesk-notify.js --min-priority 1 --dry-run
 *                                                 # preview including Low tickets
 *
 * What gets posted:
 *   1-5 new tickets  -> one message each, then a divided summary of the whole batch
 *   6+ new tickets   -> a single "N new tickets came in" notice with a link to the queue
 *                       (this is the catch-up case, e.g. first run after a weekend)
 *
 * Secrets are read from the repo .env (never the shell env):
 *   - FRESHDESK_API_KEY           the agent API key (Profile Settings -> Your API Key)
 *   - FRESHDESK_RC_WEBHOOK_URL    RingCentral incoming webhook to post into
 *   - FRESHDESK_DOMAIN            optional, defaults to primeroedge.freshdesk.com
 *   - FRESHDESK_MIN_PRIORITY      optional, defaults to 3 (High). The desk takes ~150
 *                                 tickets/day, almost all Low, so alerting on every one
 *                                 would be noise. Set to 1 to announce everything.
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

const PAGE_SIZE = 50;

// Safety stop for the catch-up paging, so a corrupt/absent watermark can't walk the
// entire ticket history. 20 pages = 1000 tickets, far beyond any realistic gap.
const MAX_PAGES = 20;

// Above this many new tickets in one run, post just a count + link instead of one message
// each. Stops a Monday morning after a weekend offline from flooding the channel.
const DIGEST_THRESHOLD = 5;

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
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { lastCreatedAt: null, announced: [] };
  }
}

function writeState(state) {
  // Keep the announced list bounded — it only exists to dedupe against the page of
  // recent tickets we actually look at.
  state.announced = state.announced.slice(-500);
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

/**
 * Build the RingCentral message for a ticket: heading, four detail lines, ticket link.
 *
 * Deliberately four fields only — the point is a glanceable "there's a new ticket"
 * ping, and everything else is one click away on the ticket itself.
 *
 * No ``` code fence: RingCentral renders the backticks literally rather than as a
 * block (bold does work). A fenced version collapses into one unreadable line.
 *
 * Empty fields are dropped rather than printed as blanks, since a ticket logged
 * without a district or module still deserves a usable notification.
 */
function buildMessage(ticket, domain) {
  const cf = ticket.custom_fields || {};
  const link = `https://${domain}/a/tickets/${ticket.id}`;

  // "Point of Service > Daily Reports > Activity" from whichever parts are filled in.
  const modulePath = [cf.cf_module_selection, cf.module_subsection, cf.module_subsection_item]
    .filter(Boolean)
    .join(' > ');

  const rows = [
    ['Subject', ticket.subject],
    ['District', cf.districtcounty || cf.sodexo_district],
    ['Product', cf.cf_primerotype],
    ['Module', modulePath],
  ].filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '');

  // Labels bold, values plain — bold is the one bit of markdown RingCentral honours,
  // so it's what gives the block any visual structure at all.
  const body = rows.map(([label, v]) => `**${label}:** ${v}`).join('\n');

  return `**New Support Ticket - #${ticket.id}**\n\n${body}\n\n${link}`;
}

/**
 * Every ticket created after `sinceIso`, walking pages until we reach older ones.
 *
 * Paged rather than a single fixed window: after a weekend (or any stretch with the
 * machine off) the backlog can exceed one page, and a fixed window would drop the
 * oldest tickets silently — the one failure mode nobody would ever notice.
 *
 * With no baseline yet, one page is enough: the caller only wants the newest ticket
 * to mark a starting point.
 */
async function fetchTicketsSince(domain, apiKey, sinceIso) {
  const since = sinceIso ? new Date(sinceIso).getTime() : null;
  const collected = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await apiGet(
      domain,
      apiKey,
      `/tickets?order_by=created_at&order_type=desc&per_page=${PAGE_SIZE}&page=${page}`,
    );
    if (res.status !== 200) {
      fail(`HTTP ${res.status} listing tickets: ${res.body.slice(0, 300)}`);
    }
    const batch = JSON.parse(res.body);
    if (!Array.isArray(batch)) fail('Unexpected ticket list response.');
    collected.push(...batch);

    if (since === null) break;                 // baseline run — newest page is enough
    if (batch.length < PAGE_SIZE) break;       // no more tickets to read
    // Once a page ends older than the watermark, everything beyond it is older too.
    const oldest = batch[batch.length - 1];
    if (oldest && new Date(oldest.created_at).getTime() <= since) break;

    if (page === MAX_PAGES) {
      console.warn(
        `WARNING: stopped after ${MAX_PAGES} pages (${collected.length} tickets). ` +
        'Older tickets in this backlog were not checked.',
      );
    }
  }

  // Dedupe by id: tickets created while we're paging shift the window, so the same
  // ticket can appear on two consecutive pages and would otherwise be announced twice.
  const seen = new Set();
  return collected.filter((t) => !seen.has(t.id) && seen.add(t.id));
}

const DIVIDER = '────────────────────────────';

/**
 * Big catch-up (e.g. first run after a weekend): just say how many arrived and link to
 * the queue. Listing them would be an unreadable wall — and at this desk's volume could
 * be hundreds of entries in a single message.
 */
function buildCountOnly(tickets, domain) {
  return (
    `**${tickets.length} New Support Tickets**\n\n` +
    `${tickets.length} new tickets came in since the last check. ` +
    `Please click the link to view them.\n\n` +
    `https://${domain}/a/tickets`
  );
}

/** Recap posted after a small batch, so the whole set is visible in one place. */
function buildSummary(tickets, domain) {
  const entries = tickets.map((t) => {
    const cf = t.custom_fields || {};
    const modulePath = [cf.cf_module_selection, cf.module_subsection, cf.module_subsection_item]
      .filter(Boolean)
      .join(' > ');
    return [
      `**#${t.id}** ${t.subject}`,
      cf.districtcounty ? `**District:** ${cf.districtcounty}` : null,
      modulePath ? `**Module:** ${modulePath}` : null,
      `https://${domain}/a/tickets/${t.id}`,
    ].filter(Boolean).join('\n');
  });

  return (
    `**All ${tickets.length} Tickets**\n\n` +
    `${DIVIDER}\n` +
    entries.join(`\n${DIVIDER}\n`) +
    `\n${DIVIDER}`
  );
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

  // --- demo mode: render one known ticket -------------------------------------
  if (singleTicket) {
    const res = await apiGet(domain, apiKey, `/tickets/${singleTicket}`);
    if (res.status !== 200) fail(`HTTP ${res.status} fetching ticket ${singleTicket}: ${res.body.slice(0, 200)}`);
    const text = buildMessage(JSON.parse(res.body), domain);
    if (dryRun) {
      console.log('\n--- preview (not sent) ---\n' + text + '\n');
    } else {
      console.log(`Posting ticket #${singleTicket}...`);
      await postWebhook(webhookUrl, text);
    }
    return;
  }

  const state = readState();

  if (reset) {
    state.lastCreatedAt = new Date().toISOString();
    state.announced = [];
    writeState(state);
    console.log('Baseline reset to now — only tickets created after this will be announced.');
    return;
  }

  const tickets = await fetchTicketsSince(domain, apiKey, state.lastCreatedAt);

  // First ever run: record where we are and stay quiet. Announcing the existing backlog
  // would dump 50 messages into the channel the moment this is switched on.
  if (!state.lastCreatedAt) {
    state.lastCreatedAt = tickets.length ? tickets[0].created_at : new Date().toISOString();
    state.announced = tickets.map((t) => t.id);
    writeState(state);
    console.log(`First run — baseline set at ${state.lastCreatedAt}. Nothing posted.`);
    console.log('Run with --ticket <id> --dry-run to preview the message format.');
    return;
  }

  // This desk takes ~150 tickets a day, the overwhelming majority of them Low. Alerting
  // on all of them would be noise the team mutes, so only tickets at or above
  // FRESHDESK_MIN_PRIORITY are announced (default High, i.e. High + Urgent, ~6/day).
  // Set FRESHDESK_MIN_PRIORITY=1 to get everything.
  const minPriorityArg = args.indexOf('--min-priority');
  const minPriority = Number(
    minPriorityArg >= 0 ? args[minPriorityArg + 1] : readEnvValue('FRESHDESK_MIN_PRIORITY') || 3,
  );

  const since = new Date(state.lastCreatedAt).getTime();
  const created = tickets
    .filter((t) => new Date(t.created_at).getTime() > since)
    .filter((t) => !state.announced.includes(t.id));
  const fresh = created
    .filter((t) => Number(t.priority) >= minPriority)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)); // oldest first

  // Below-threshold tickets are still marked seen, so raising the threshold later
  // doesn't suddenly replay everything that was skipped.
  const skipped = created.filter((t) => Number(t.priority) < minPriority);
  if (skipped.length) console.log(`${skipped.length} ticket(s) below priority ${minPriority} — not announced.`);

  if (!fresh.length) {
    console.log('No new tickets.');
    return;
  }

  console.log(`${fresh.length} new ticket(s).`);

  const markSeen = (list) => {
    if (dryRun) return;
    for (const t of list) state.announced.push(t.id);
    state.lastCreatedAt = list[list.length - 1].created_at;
    writeState(state);
  };
  // Below-threshold tickets count as handled either way, so they never replay later.
  if (skipped.length) markSeen(skipped.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)));

  // A large batch means we're catching up after downtime, not reacting live: post the
  // count and a link rather than flooding the channel.
  if (fresh.length > DIGEST_THRESHOLD) {
    const text = buildCountOnly(fresh, domain);
    if (dryRun) {
      console.log('\n--- preview (not sent) ---\n' + text + '\n');
      return;
    }
    console.log(`Posting a count-only notice for ${fresh.length} tickets...`);
    await postWebhook(webhookUrl, text);
    markSeen(fresh);
    return;
  }

  for (const ticket of fresh) {
    const text = buildMessage(ticket, domain);
    if (dryRun) {
      console.log('\n--- preview (not sent) ---\n' + text + '\n');
    } else {
      console.log(`#${ticket.id} ${String(ticket.subject).slice(0, 60)}`);
      await postWebhook(webhookUrl, text);
    }
    // Record as we go: a crash midway through must not re-announce what already posted.
    if (!dryRun) {
      state.announced.push(ticket.id);
      state.lastCreatedAt = ticket.created_at;
      writeState(state);
    }
  }

  // Recap at the end so the batch is readable in one place. Pointless for a single
  // ticket, which the message above already showed in full.
  if (fresh.length > 1) {
    const text = buildSummary(fresh, domain);
    if (dryRun) {
      console.log('\n--- summary preview (not sent) ---\n' + text + '\n');
    } else {
      console.log(`Posting summary of ${fresh.length} tickets...`);
      await postWebhook(webhookUrl, text);
    }
  }
})();
