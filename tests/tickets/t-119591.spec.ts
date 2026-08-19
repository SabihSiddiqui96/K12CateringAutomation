// Test Link: https://dev.azure.com/Cybersoft-Technologies-Inc/PrimeroEdge%20Classic/_workitems/edit/119591
//
// T-119591 — Catering - User Feedback - Allow basic file attachments, allow admins
// to mark feedback as 'Resolved', update options.
//
// Three changes: feedback can carry one attachment (jpg/jpeg/png/pdf/doc/docx/
// xls/xlsx, max 5 MB) which is openable from the Feedback Inbox; admins can move
// an item through New / In Progress / Resolved with matching filters and the
// resolver's username recorded; and the options were relabelled — "Something's
// Off / Confusing" to "I have questions", "Report a bug" to "Report an issue".
//
// Attachments are supplied as in-memory buffers rather than fixture files.
// setInputFiles talks to the input directly, so the native file dialog (and its
// "Custom files" filter) never opens, nothing is written to disk, and the 5 MB
// case needs no large file checked into the repo.

import { test, expect, Locator, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
  dismissReauthInterstitial,
} from '../../utils/helpers';

test.use({ storageState: { cookies: [], origins: [] } });

// ─── Constants ───────────────────────────────────────────────────────────────

const OPEN_FEEDBACK = /Open feedback menu/i;
const CLOSE_FEEDBACK = /Close feedback menu/i;

const OPT_QUESTIONS = /I have questions/i;
const OPT_ISSUE = /Report an issue/i;
const OPT_IDEA = /Share an idea/i;

// Retired by this ticket — these must not appear anywhere in the feedback UI.
// Both spellings: the option said "Report a bug", the submit button said "Report bug".
const OLD_LABELS = [/Something's Off/i, /Report a bug/i, /Report bug/i];

const FB_COMMENT = '#fb-comment';
const FB_ATTACHMENT = '#fb-attachment';

const INBOX_HEADING = /Feedback Inbox/i;
const STATUSES = ['New', 'In Progress', 'Resolved', 'All'] as const;
const UNSUPPORTED_TYPE_ERROR = /Only JPEG, PNG, PDF, Word, or Excel files are supported/i;

const MAX_ATTACHMENT_MB = 5;

// ─── Attachment fixtures, built in memory ────────────────────────────────────

/** Smallest valid 1x1 PNG, in case the server sniffs content rather than extension. */
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const validPng = () => ({ name: 'qa-attachment.png', mimeType: 'image/png', buffer: PNG_1x1 });
const unsupportedTxt = () => ({
  name: 'qa-attachment.txt',
  mimeType: 'text/plain',
  buffer: Buffer.from('T-119591 unsupported type check'),
});
/** Comfortably over the limit so a boundary rounding difference can't rescue it. */
const oversizePng = () => ({
  name: 'qa-oversize.png',
  mimeType: 'image/png',
  buffer: Buffer.concat([PNG_1x1, Buffer.alloc((MAX_ATTACHMENT_MB + 1) * 1024 * 1024, 0)]),
});

// ─── Waiting ─────────────────────────────────────────────────────────────────

/** isVisible() never retries, so use an explicit wait when we mean "wait for it". */
async function appears(locator: Locator, timeout = 15000): Promise<boolean> {
  return locator.waitFor({ state: 'visible', timeout }).then(
    () => true,
    () => false,
  );
}

// ─── Feedback widget ─────────────────────────────────────────────────────────

async function openFeedbackMenu(c: Page): Promise<void> {
  await c.getByRole('button', { name: OPEN_FEEDBACK }).first().click();
  await expect(c.getByRole('button', { name: OPT_ISSUE }).first()).toBeVisible({ timeout: 10000 });
}

/**
 * Escape does not dismiss the feedback panel, and while it is open it covers the
 * left navigation — so close it explicitly before navigating anywhere.
 */
async function closeFeedbackWidget(c: Page): Promise<void> {
  // Dismiss the form with its own X first. While it is open the page behind still
  // scrolls but is not interactable, so anything that follows silently misses.
  const formClose = c
    .locator('div.fixed, [role="dialog"]')
    .getByRole('button', { name: /^(x|close)$/i })
    .last();
  if (await appears(formClose, 3000)) {
    await formClose.click().catch(() => undefined);
    await c.waitForTimeout(600);
  }
  // Then collapse the menu itself.
  const close = c.getByRole('button', { name: CLOSE_FEEDBACK }).first();
  if (await appears(close, 3000)) {
    await close.click().catch(() => undefined);
  }
  await expect(c.locator(FB_COMMENT)).toBeHidden({ timeout: 10000 });
  await expect(c.getByRole('button', { name: OPT_ISSUE }).first()).toBeHidden({ timeout: 10000 });
}

/** Open the feedback menu and pick one option, leaving the form on screen. */
async function openFeedbackForm(c: Page, option: RegExp): Promise<void> {
  await openFeedbackMenu(c);
  await c.getByRole('button', { name: option }).first().click();
  await expect(c.locator(FB_COMMENT)).toBeVisible({ timeout: 10000 });
}

/** Submit one piece of feedback through the widget and close it. */
async function submitFeedback(c: Page, text: string): Promise<void> {
  await openFeedbackForm(c, OPT_ISSUE);
  await c.locator(FB_COMMENT).fill(text);
  await submitButton(c).click();
  await expect(c.locator(FB_COMMENT)).toBeHidden({ timeout: 20000 });
  await closeFeedbackWidget(c);
}

// The form's button is worded slightly shorter than the menu option: the option
// is "Report an issue", the button "Report issue". Both are accepted — what this
// ticket actually requires is that neither says "bug" any more.
const submitButton = (c: Page) =>
  c.getByRole('button', { name: /^(Report (an )?issue|Send|Submit)$/i }).last();

// ─── Feedback Inbox ──────────────────────────────────────────────────────────

const inbox = (c: Page) =>
  c.getByRole('heading', { name: INBOX_HEADING }).first().locator('xpath=ancestor::div[3]');

/**
 * The status segmented control. Scoped to the pill row rather than the page,
 * because every feedback card also carries a "New" badge button — those are
 * distinguishable only by their aria-label ("Change status, currently New").
 */
const statusPill = (c: Page, name: string) =>
  c.locator('button').filter({ hasText: new RegExp('^' + name + '$') });

const statusFilterRow = (c: Page) => statusPill(c, 'In Progress').first().locator('xpath=..');

const statusFilter = (c: Page, name: string) =>
  statusFilterRow(c)
    .locator('button')
    .filter({ hasText: new RegExp('^' + name + '$') })
    .first();

async function goToUserFeedback(c: Page): Promise<void> {
  // A token refresh can bounce the tab onto the PrimeroEdge re-auth interstitial
  // mid-test, which replaces the page and loses the nav; clear it and retry.
  for (let attempt = 1; attempt <= 3; attempt++) {
    await dismissReauthInterstitial(c);
    await navigateK12CateringMenu(c, 'User Feedback').catch(() => undefined);
    await c.waitForLoadState('domcontentloaded').catch(() => undefined);
    if (await appears(c.getByRole('heading', { name: INBOX_HEADING }).first(), 20000)) {
      await expect(c.locator('h1')).toContainText('User Feedback', { timeout: 15000 });
      // The inbox renders its controls a beat after the heading; "In Progress" is
      // the only status pill whose text cannot collide with a per-item badge.
      await expect(statusPill(c, 'In Progress').first()).toBeVisible({ timeout: 25000 });
      return;
    }
  }
  throw new Error('User Feedback page never rendered after 3 attempts');
}

/** The inbox card carrying a given piece of feedback text. */
const feedbackCard = (c: Page, text: string) =>
  inbox(c)
    .locator('div')
    .filter({ hasText: text })
    .filter({ has: c.locator('button[aria-label^="Change status"]') })
    .last();

// ─────────────────────────────────────────────────────────────────────────────

test.describe('T-119591', () => {
  test('Feedback options carry the new labels and an optional attachment field', async ({
    page,
  }) => {
    const c = await loginToK12Catering(page);
    await openFeedbackMenu(c);

    // The three options, with the retired wording gone.
    for (const option of [OPT_QUESTIONS, OPT_ISSUE, OPT_IDEA]) {
      await expect(c.getByRole('button', { name: option }).first()).toBeVisible({ timeout: 10000 });
    }
    for (const old of OLD_LABELS) {
      await expect(c.getByText(old)).toHaveCount(0);
    }

    // "I have questions" replaced "Something's Off / Confusing".
    await c.getByRole('button', { name: OPT_QUESTIONS }).first().click();
    await expect(c.locator(FB_COMMENT)).toBeVisible({ timeout: 10000 });
    for (const old of OLD_LABELS) {
      await expect(c.getByText(old)).toHaveCount(0);
    }
    await closeFeedbackWidget(c);

    // "Report an issue" replaced "Report a bug", and the form takes an attachment.
    await openFeedbackForm(c, OPT_ISSUE);
    await expect(c.locator(FB_COMMENT)).toHaveAttribute(
      'placeholder',
      /What happened\? What did you expect to happen\?/i,
    );
    await expect(c.locator(FB_ATTACHMENT)).toHaveCount(1);
    await expect(c.getByText(/Attach a file \(optional\)/i).first()).toBeVisible({ timeout: 10000 });

    // Only the extensions the ticket allows.
    const accept = await c.locator(FB_ATTACHMENT).getAttribute('accept');
    for (const ext of ['.jpg', '.jpeg', '.png', '.pdf', '.doc', '.docx', '.xls', '.xlsx']) {
      expect(accept, `attachment accepts ${ext}`).toContain(ext);
    }

    // The submit button carried the old "Report bug" wording when this was first
    // tested; fixed 08/18, so it is asserted rather than logged now.
    await expect(
      submitButton(c),
      'the submit button dropped the old "bug" wording',
    ).toHaveText(/^Report (an )?issue$/i);

    await closeFeedbackWidget(c);
  });

  test('Feedback accepts a supported attachment and rejects bad type and oversize', async ({
    page,
  }) => {
    const stamp = Date.now();
    const c = await loginToK12Catering(page);

    // ── unsupported type ──────────────────────────────────────────────────────
    await openFeedbackForm(c, OPT_ISSUE);
    await c.locator(FB_COMMENT).fill(`T-119591 unsupported ${stamp}`);
    await c.locator(FB_ATTACHMENT).setInputFiles(unsupportedTxt());
    await expect(
      c.getByText(UNSUPPORTED_TYPE_ERROR).first(),
      'a .txt is rejected by type',
    ).toBeVisible({ timeout: 10000 });
    await closeFeedbackWidget(c);

    // ── over the size limit ───────────────────────────────────────────────────
    await openFeedbackForm(c, OPT_ISSUE);
    await c.locator(FB_COMMENT).fill(`T-119591 oversize ${stamp}`);
    await c.locator(FB_ATTACHMENT).setInputFiles(oversizePng());
    await expect(
      c.getByText(/5\s*MB|too large|exceeds/i).first(),
      `a file over ${MAX_ATTACHMENT_MB} MB is rejected`,
    ).toBeVisible({ timeout: 15000 });
    await closeFeedbackWidget(c);

    // ── a supported file goes through ─────────────────────────────────────────
    const feedbackText = `T-119591 attachment check ${stamp}`;
    await openFeedbackForm(c, OPT_ISSUE);
    await c.locator(FB_COMMENT).fill(feedbackText);
    await c.locator(FB_ATTACHMENT).setInputFiles(validPng());
    await expect(c.getByText(UNSUPPORTED_TYPE_ERROR)).toHaveCount(0);
    await submitButton(c).click();
    await expect(c.locator(FB_COMMENT)).toBeHidden({ timeout: 20000 });
    await closeFeedbackWidget(c);

    // ── it lands in the inbox, attachment and all ─────────────────────────────
    await goToUserFeedback(c);
    await statusFilter(c, 'New').click();
    await c.waitForTimeout(1500);
    const card = feedbackCard(c, feedbackText);
    await expect(card, 'the submitted feedback reaches the inbox').toBeVisible({ timeout: 25000 });
    await expect(
      card.getByText(/\.png$/i).first(),
      'the attachment is listed by file name',
    ).toBeVisible({ timeout: 15000 });
  });

  test('Feedback Inbox defaults to New and resolving records who resolved it', async ({ page }) => {
    const marker = `T-119591 resolve check ${Date.now()}`;
    const c = await loginToK12Catering(page);
    await submitFeedback(c, marker);
    await goToUserFeedback(c);

    // All four status filters, with New selected on load.
    for (const name of STATUSES) {
      await expect(statusFilter(c, name), `${name} filter is present`).toBeVisible({
        timeout: 15000,
      });
    }
    // The selected pill is styled differently from the unselected ones, so on a
    // fresh load "New" must not look like the others.
    const newClass = (await statusFilter(c, 'New').getAttribute('class')) ?? '';
    const allClass = (await statusFilter(c, 'All').getAttribute('class')) ?? '';
    const progressClass = (await statusFilter(c, 'In Progress').getAttribute('class')) ?? '';
    expect(newClass, 'New is the default filter on load').not.toBe(allClass);
    expect(allClass, 'the unselected pills share a style').toBe(progressClass);

    // Resolve a piece of feedback this test submitted, so the assertion has a
    // unique string to follow and no real user's item is touched.
    await statusFilter(c, 'New').click();
    await c.waitForTimeout(1500);
    const card = feedbackCard(c, marker);
    await expect(card, 'the submitted feedback is in New').toBeVisible({ timeout: 25000 });

    // The status menu renders inside the control's own relative wrapper, so scope
    // the option to that — a page-wide "Resolved" would also hit the filter pill.
    const statusControl = card.locator('button[aria-label^="Change status"]').first();
    await statusControl.click();
    await statusControl
      .locator('xpath=..')
      .locator('button')
      .filter({ hasText: /^Resolved$/ })
      .first()
      .click({ timeout: 15000 });
    await c.waitForTimeout(2500);

    // It leaves New...
    await statusFilter(c, 'New').click();
    await c.waitForTimeout(2000);
    await expect(
      inbox(c).getByText(marker, { exact: false }),
      'the resolved item drops out of New',
    ).toHaveCount(0);

    // ...and appears under Resolved, naming who resolved it.
    await statusFilter(c, 'Resolved').click();
    await c.waitForTimeout(2500);
    await expect(
      inbox(c).getByText(marker, { exact: false }).first(),
      'the item is listed under Resolved',
    ).toBeVisible({ timeout: 25000 });
    await expect(
      inbox(c).getByText(/Resolved by/i).first(),
      'the resolver username is recorded',
    ).toBeVisible({ timeout: 15000 });
  });
});
