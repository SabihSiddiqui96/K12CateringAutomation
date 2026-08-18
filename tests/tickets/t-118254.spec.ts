// Test Link: https://dev.azure.com/Cybersoft-Technologies-Inc/PrimeroEdge%20Classic/_workitems/edit/118254
//
// T-118254 — Catering - Settings - Complementary Items - Configure Complimentary
// Items as a List.
//
// Settings > Order Settings "Complimentary Items" changed from a single large text
// field to a list of individual items (each with its own note), plus an overall
// note and a "Minimum Order Amount for Complimentary Items" amount. At the checkout Review
// step the items render as a selectable card above the Order Disclaimer, unchecked
// by default; whatever the customer checks shows on the Order Details page and on
// the invoice, and the invoice download offers per-section include/exclude options.
//
// Covered from BOTH sides. An admin is exempt from the customer minimum (the card
// shows a "Staff override" badge), so the admin tests alone cannot prove what a
// customer actually sees — the customer tests sign in as the real customer account
// and repeat the same journey.
//
// Two district settings are involved and they are easy to confuse:
//   * "Minimum Order Amount"                     — blocks checkout entirely
//   * "Minimum Order Amount for Complimentary Items" — only gates the free items
// The checkout tests drop the first to $1 so a single menu item is enough to check
// out, then drive the second to whichever side of the cart total they are testing.
// Both are put back at the end of the run.

import { test, expect, Browser, Locator, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
  dismissReauthInterstitial,
  getCustomerAccountEmail,
  registerReleaseNotificationHandler,
} from '../../utils/helpers';
import { getRequiredEnvVar } from '../../utils/env';
import { decryptPassword } from '../../utils/crypto';
import { getK12CateringUrl, getK12CateringLoginUrl } from '../../utils/baseUrl';
import {
  startOrderToAdditionalDetails,
  selectAvailableEventDate,
  selectFirstContactCardInSection,
  pickTimeAndConfirm,
  selectPaymentAndContinue,
  clickNext,
  reviewAndPlaceOrder,
  downloadInvoiceWithOptions,
  ORDER,
} from '../../utils/orders';

test.use({ storageState: { cookies: [], origins: [] } });

// ─── Constants ───────────────────────────────────────────────────────────────

const ADD_ITEM_BTN = 'Add new complimentary item';
const EDIT_UNLOCK_BTN = 'Edit complimentary items minimum order amount';
const EDIT_MIN_ORDER_BTN = 'Edit minimum order amount';
const EDIT_NOTE_BTN = 'Edit complimentary items overall note';

const ITEM_NAME_INPUT = '#complimentary-item-name-input';
const ITEM_NOTE_TEXTAREA = '#complimentary-item-note-textarea';
const UNLOCK_INPUT = '#complimentary-items-minimum-order-amount-input';
const OVERALL_NOTE_TEXTAREA = '#complimentary-items-note-textarea';
const SPECIAL_INSTRUCTIONS = '#special-instructions-textarea';
const ITEMS_SEARCH = '#complimentary-items-search';
const ITEMS_PAGE_SIZE = '#complimentary-items-pagination';

// Round 2 (Daimien, 08/17): the section blurb, the renamed item-note label, and
// the helper line that was removed as redundant.
const SECTION_BLURB =
  'List any items that customers can individually opt into receiving at no extra charge, such as plates or napkins, during checkout';
const SHORT_DESCRIPTION_LABEL = 'Short Description (optional)';
const REMOVED_HELPER_LINE = 'Shown to customers under this item at checkout';

const MIN_ORDER_HEADING = 'Minimum Order Amount';
const UNLOCK_HEADING = 'Minimum Order Amount for Complimentary Items';
const OVERALL_NOTE_HEADING = 'Complimentary Items Note';
const COMP_HEADING = /^Complimentary Items$/i;

// Restored at the end of the run.
const BASELINE_MIN_ORDER = '25';
const BASELINE_UNLOCK = '30';

// Dropped before any checkout so one menu item is enough to place an order —
// otherwise the cart has to be padded just to get past the door.
const CHECKOUT_MIN_ORDER = '1';
// Below any cart, so the complimentary items are unlocked.
const UNLOCK_OPEN = '1';

// Every item this spec creates uses this note, so anyone scanning Settings can
// tell instantly which rows are automation data.
const ITEM_NOTE = 'Testing...';

/**
 * The checkout tests select this item on a real order, and the app refuses to
 * delete an item that is in use ("Failed to delete complimentary item. It may
 * already be used on an order. Try deactivating it instead."). A fresh per-run
 * name would therefore leave a new undeletable row in the district's settings
 * every night, so this ONE item is created once and reused. Every other item this
 * spec makes never reaches an order, so it is deleted normally.
 */
const SHARED_CHECKOUT_ITEM = 'SabihAutomation';

/**
 * For the "locked" cases the unlock amount has to sit above the cart total (one
 * menu item comes to roughly $85), while still reading like a plausible district
 * setting on the card rather than a silly 9999.
 */
function lockedUnlockAmount(): string {
  return String(100 + Math.floor(Math.random() * 60));
}

// ─── Waiting ─────────────────────────────────────────────────────────────────

/**
 * `locator.isVisible()` does NOT retry — it samples the DOM once and returns, so
 * passing it a `timeout` reads like a wait but never actually waits. Anywhere we
 * mean "wait for this to appear", go through here instead.
 */
async function appears(locator: Locator, timeout = 15000): Promise<boolean> {
  return locator.waitFor({ state: 'visible', timeout }).then(
    () => true,
    () => false,
  );
}

// ─── Settings ────────────────────────────────────────────────────────────────

async function goToSettings(c: Page): Promise<void> {
  await dismissReauthInterstitial(c);
  await navigateK12CateringMenu(c, 'Settings');
  await c.waitForLoadState('domcontentloaded');
  await expect(c.locator('h1')).toContainText('Settings', { timeout: 20000 });
  await expect(c.getByRole('heading', { name: COMP_HEADING }).first()).toBeVisible({
    timeout: 20000,
  });
}

/** The read-only value shown under a Settings sub-heading. */
function settingValue(c: Page, heading: string) {
  return c.getByRole('heading', { name: heading, exact: true }).first().locator('xpath=following-sibling::p[1]');
}

/** The card for one complimentary item in Settings, matched by its Edit control. */
function itemCard(c: Page, name: string) {
  return c.locator(`button[aria-label="Edit ${name}"]`).locator('xpath=ancestor::div[2]');
}

/** The whole Complimentary Items block in Settings. */
const compBlock = (c: Page) =>
  c.getByRole('heading', { name: COMP_HEADING }).first().locator('xpath=ancestor::div[4]');

/** One of the Active / Inactive / All filter tabs, matched without its count. */
const itemsFilter = (c: Page, name: 'Active' | 'Inactive' | 'All') =>
  compBlock(c).locator('button').filter({ hasText: new RegExp('^' + name + ' \\(') }).first();

/**
 * Deactivate an item. Wait for the Deactivate control to go away rather than for
 * an Activate control to appear: under the "Active" filter the row leaves the
 * list entirely, so the flipped button is never rendered in place.
 */
async function deactivateComplimentaryItem(c: Page, name: string): Promise<void> {
  await c.locator(`button[aria-label="Deactivate ${name}"]`).click();
  const confirm = c.locator('[role="dialog"]').getByRole('button', { name: /^Deactivate$/ });
  if (await appears(confirm, 4000)) await confirm.click();
  await expect(c.locator(`button[aria-label="Deactivate ${name}"]`)).toBeHidden({ timeout: 15000 });
}

/** Reactivate an item; same reasoning in reverse under the "Inactive" filter. */
async function activateComplimentaryItem(c: Page, name: string): Promise<void> {
  await c.locator(`button[aria-label="Activate ${name}"]`).click();
  const confirm = c.locator('[role="dialog"]').getByRole('button', { name: /^Activate$/ });
  if (await appears(confirm, 4000)) await confirm.click();
  await expect(c.locator(`button[aria-label="Activate ${name}"]`)).toBeHidden({ timeout: 15000 });
}

/**
 * Every complimentary item this spec creates, so the sweep at the end removes
 * exactly those and nothing else. Names carry a run timestamp, so an item added by
 * a person (or another spec) can never match and is never touched.
 */
const createdItems = new Set<string>();

/**
 * Edit one of the amount dialogs and confirm the value actually landed.
 *
 * The dialog closes instantly for a person, but it animates in (opacity + scale)
 * and a click fired mid-transition can land on the overlay instead of the button,
 * leaving it open. So wait for the button to settle and, if the dialog is still
 * there, cancel and redo it once. The displayed value is re-read at the end, so a
 * genuine failure to save still fails the test.
 */
async function setAmountSetting(
  c: Page,
  opts: { editLabel: string; input: string; dialogTitle: RegExp; heading: string; value: string },
): Promise<void> {
  const title = c.getByRole('heading', { name: opts.dialogTitle });

  for (let attempt = 1; attempt <= 2; attempt++) {
    await c.getByLabel(opts.editLabel).click();
    await expect(title).toBeVisible({ timeout: 10000 });

    const field = c.locator(opts.input);
    await expect(field).toBeVisible({ timeout: 10000 });
    await field.fill(opts.value);
    await field.blur().catch(() => undefined);

    const save = c.locator('[role="dialog"]').getByRole('button', { name: /Save Changes/i });
    await expect(save).toBeEnabled({ timeout: 10000 });
    await save.click();

    if (await title.waitFor({ state: 'hidden', timeout: 10000 }).then(() => true, () => false)) {
      await expect(settingValue(c, opts.heading)).toContainText(`$${opts.value}`);
      return;
    }

    await c
      .locator('[role="dialog"]')
      .getByRole('button', { name: /^Cancel$/ })
      .click()
      .catch(() => undefined);
    await c.waitForTimeout(1000);
  }
  throw new Error(`Could not set "${opts.heading}" to ${opts.value}`);
}

/** Gates the free items only. */
const setUnlockAmount = (c: Page, value: string) =>
  setAmountSetting(c, {
    editLabel: EDIT_UNLOCK_BTN,
    input: UNLOCK_INPUT,
    dialogTitle: /^Edit Minimum Order Amount for Complimentary Items$/i,
    heading: UNLOCK_HEADING,
    value,
  });

/** Gates checkout itself — a customer below this cannot place an order at all. */
const setMinimumOrderAmount = (c: Page, value: string) =>
  setAmountSetting(c, {
    editLabel: EDIT_MIN_ORDER_BTN,
    input: '[role="dialog"] input[type="number"]',
    dialogTitle: /^Edit Minimum Order Amount$/i,
    heading: MIN_ORDER_HEADING,
    value,
  });

async function setOverallNote(c: Page, value: string): Promise<void> {
  await c.getByLabel(EDIT_NOTE_BTN).click();
  const box = c.locator(OVERALL_NOTE_TEXTAREA);
  await expect(box).toBeVisible({ timeout: 10000 });
  await box.fill(value);
  await c.locator('[role="dialog"]').getByRole('button', { name: /Save Changes/i }).click();
  await expect(c.getByRole('heading', { name: /Edit Complimentary Items Note/i })).toBeHidden({
    timeout: 15000,
  });
}

async function addComplimentaryItem(c: Page, name: string, note: string): Promise<void> {
  createdItems.add(name);
  await c.getByLabel(ADD_ITEM_BTN).click();
  await expect(c.getByRole('heading', { name: /Add Complimentary Item/i })).toBeVisible({
    timeout: 10000,
  });
  await c.locator(ITEM_NAME_INPUT).fill(name);
  await c.locator(ITEM_NOTE_TEXTAREA).fill(note);
  // The submit button stays disabled until the name is non-empty.
  const addBtn = c.locator('[role="dialog"]').getByRole('button', { name: /^Add Item$/ });
  await expect(addBtn).toBeEnabled({ timeout: 10000 });
  await addBtn.click();
  await expect(c.getByRole('heading', { name: /Add Complimentary Item/i })).toBeHidden({
    timeout: 15000,
  });
  await expect(itemCard(c, name)).toBeVisible({ timeout: 15000 });
}

/**
 * Create the item only if it is not already there, and make sure it is active —
 * a deactivated item does not appear at checkout. Never touches any other item.
 */
async function ensureComplimentaryItem(c: Page, name: string, note: string): Promise<void> {
  if (!(await appears(c.locator(`button[aria-label="Edit ${name}"]`), 5000))) {
    await addComplimentaryItem(c, name, note);
    return;
  }
  const activate = c.locator(`button[aria-label="Activate ${name}"]`);
  if (await appears(activate, 3000)) {
    await activate.click();
    const confirm = c.locator('[role="dialog"]').getByRole('button', { name: /^Activate$/ });
    if (await appears(confirm, 4000)) await confirm.click();
    await c.waitForTimeout(1500);
  }
}

async function editComplimentaryItemNote(c: Page, name: string, newNote: string): Promise<void> {
  await c.locator(`button[aria-label="Edit ${name}"]`).click();
  await expect(c.getByRole('heading', { name: /Edit Complimentary Item/i })).toBeVisible({
    timeout: 10000,
  });
  await c.locator(ITEM_NOTE_TEXTAREA).fill(newNote);
  await c.locator('[role="dialog"]').getByRole('button', { name: /^Update Item$/ }).click();
  await expect(c.getByRole('heading', { name: /Edit Complimentary Item/i })).toBeHidden({
    timeout: 15000,
  });
}

/**
 * Delete one complimentary item. The row's own control is aria-labelled
 * "Delete <item name>"; the confirmation dialog's is exactly "Delete Item" —
 * matched exactly and scoped to the dialog so this can never re-resolve to the row
 * button we just clicked.
 */
async function deleteComplimentaryItem(c: Page, name: string): Promise<void> {
  const del = c.locator(`button[aria-label="Delete ${name}"]`);
  await expect(del).toBeVisible({ timeout: 10000 });
  await del.click();
  const dialog = c.locator('[role="dialog"]');
  await expect(dialog.getByRole('heading', { name: /Delete Complimentary Item/i })).toBeVisible({
    timeout: 10000,
  });
  await dialog.getByRole('button', { name: 'Delete Item', exact: true }).click();
  await expect(del).toBeHidden({ timeout: 15000 });
}

/**
 * Tear-down for test items. An item already selected on a placed order cannot be
 * deleted, so fall back to Deactivate — the app's own prescribed path. Only that
 * documented refusal is absorbed; anything else surfaces.
 */
async function removeComplimentaryItem(c: Page, name: string): Promise<void> {
  const del = c.locator(`button[aria-label="Delete ${name}"]`);
  if (!(await appears(del, 5000))) return;
  await del.click();

  const dialog = c.locator('[role="dialog"]');
  await expect(dialog.getByRole('heading', { name: /Delete Complimentary Item/i })).toBeVisible({
    timeout: 10000,
  });
  await dialog.getByRole('button', { name: 'Delete Item', exact: true }).click();

  if (await del.waitFor({ state: 'hidden', timeout: 10000 }).then(() => true, () => false)) return;

  if (!(await appears(c.getByText(/Failed to delete complimentary item/i).first(), 5000))) {
    throw new Error(`Delete of "${name}" neither removed the item nor reported a failure`);
  }

  const deactivate = c.locator(`button[aria-label="Deactivate ${name}"]`);
  await expect(deactivate).toBeVisible({ timeout: 10000 });
  await deactivate.click();
  const confirm = c.locator('[role="dialog"]').getByRole('button', { name: /^Deactivate$/ });
  if (await appears(confirm, 5000)) await confirm.click();
  await c.waitForTimeout(1500);
}

// ─── Admin navigation ────────────────────────────────────────────────────────

/**
 * The PrimeroEdge launcher can bounce a long admin session onto its re-auth
 * interstitial. Clear it wherever it appears rather than guarding every step.
 */
async function autoDismissReauth(c: Page): Promise<void> {
  await c.addLocatorHandler(
    c.getByText(/automatically authenticated and redirected to Catering/i).first(),
    async () => {
      await c.getByRole('link', { name: 'link', exact: true }).first().click().catch(() => undefined);
      await c.waitForLoadState('domcontentloaded').catch(() => undefined);
    },
    { times: 15 },
  );
}

// `.first()` matters: the detail page renders "Order Summary" both as the section
// heading and in Quick Navigation, and a strict multi-match makes waits throw.
const orderDetailHeading = (c: Page) => c.getByRole('heading', { name: /^Order Summary$/i }).first();
const sidebar = (c: Page) => c.locator('aside[aria-label="Main navigation"]');

/**
 * Land on the Orders list wherever a token refresh left the tab. Going straight to
 * the app route is far more reliable than clicking through the launcher
 * interstitial, which can bounce more than once before it settles.
 */
async function gotoOrdersList(c: Page): Promise<boolean> {
  await dismissReauthInterstitial(c);

  // Placing an order leaves a success toast over the list that swallows the nav
  // click, so the list never loads behind it.
  const closeToast = c.getByRole('button', { name: /Close success notification/i }).first();
  if (await appears(closeToast, 3000)) {
    await closeToast.click().catch(() => undefined);
    await c.waitForTimeout(500);
  }

  if (!(await appears(sidebar(c), 5000))) {
    await c.goto(`${getK12CateringUrl()}/orders`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    await sidebar(c).waitFor({ state: 'visible', timeout: 30000 }).catch(() => undefined);
  } else {
    await navigateK12CateringMenu(c, 'Orders').catch(() => undefined);
  }

  await expect(c.locator('h1')).toContainText(/Order Management/i, { timeout: 20000 });
  return appears(c.getByRole('button', { name: /View details for order/i }).first(), 25000);
}

/** Open the newest order and return its id (e.g. "394EF568F5"). */
async function openNewestOrderDetail(c: Page): Promise<string> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (await gotoOrdersList(c)) {
      await c.getByRole('button', { name: /View details for order/i }).first().click().catch(() => undefined);
      await c.waitForLoadState('domcontentloaded').catch(() => undefined);
      // The route flips to /orders/details before the content mounts, so anchor on
      // the heading rather than the URL.
      if (await appears(orderDetailHeading(c), 20000)) {
        const title = await c.locator('h1').first().innerText();
        const id = title.match(/#\s*([A-Z0-9]+)/i)?.[1];
        if (!id) throw new Error(`Could not read an order id from "${title}"`);
        return id;
      }
    }
  }
  throw new Error('Order Detail page never rendered after 3 attempts');
}

/** Re-open the order if a token refresh navigated us away mid-test. */
async function ensureOnOrderDetail(c: Page, orderId: string): Promise<void> {
  await dismissReauthInterstitial(c);
  if (await appears(orderDetailHeading(c), 5000)) return;

  for (let attempt = 1; attempt <= 3; attempt++) {
    if (!(await gotoOrdersList(c))) continue;
    const view = c.getByRole('button', { name: new RegExp(`View details for order ${orderId}`, 'i') });
    if (await appears(view, 20000)) {
      await view.click().catch(() => undefined);
      await c.waitForLoadState('domcontentloaded').catch(() => undefined);
      if (await appears(orderDetailHeading(c), 20000)) return;
    }
  }
  throw new Error(`Could not re-open order ${orderId}`);
}

/**
 * Add a real Order Note. This is NOT the checkout "special instructions" field —
 * the invoice prints them as separate sections under separate checkboxes in the
 * Download Invoice Options modal (Order Notes vs Instructions).
 */
async function addOrderNote(c: Page, text: string): Promise<void> {
  await c.getByRole('button', { name: /^Add Note$/i }).first().click();
  const dialog = c.locator('[role="dialog"]');
  const box = dialog.locator('#note-textarea');
  await expect(box).toBeVisible({ timeout: 10000 });
  await box.fill(text);
  await dialog.getByRole('button', { name: /^Add Note$/i }).click();
  await expect(box).toBeHidden({ timeout: 15000 });
}

// ─── Checkout ────────────────────────────────────────────────────────────────

/** Drive the admin from an empty cart to the Review step. */
async function driveToReview(c: Page, eventName: string, notes: string): Promise<void> {
  await startOrderToAdditionalDetails(c);
  await c.locator(ORDER.numGuestsInput).fill('2');
  const evName = c.locator('#event-name-input');
  await evName.fill(eventName);
  await evName.blur().catch(() => undefined);
  await c.locator(SPECIAL_INSTRUCTIONS).fill(notes);
  await expect(c.getByRole('button', { name: ORDER.nextBtn })).toBeEnabled({ timeout: 10000 });
  await clickNext(c);
  await selectPaymentAndContinue(c);
  await expect(c.getByRole('heading', { name: /Review Your Order/i }).first()).toBeVisible({
    timeout: 20000,
  });
}

/** The Review-step checkbox for one item (the input has no id or aria-label). */
function reviewItemCheckbox(c: Page, name: string) {
  return c
    .locator('label')
    .filter({ has: c.locator('input[type="checkbox"]') })
    .filter({ hasText: name })
    .first()
    .locator('input[type="checkbox"]');
}

/** The whole complimentary card on the Review step. */
const reviewCompCard = (c: Page) =>
  c.getByRole('heading', { name: COMP_HEADING }).first().locator('xpath=ancestor::div[4]');

/** The complimentary card on the Order Detail page. */
const detailCompCard = (c: Page) =>
  c.getByRole('heading', { name: COMP_HEADING }).first().locator('xpath=ancestor::div[3]');

// ─── Customer ────────────────────────────────────────────────────────────────

/**
 * The customer signs in directly to the Catering UI rather than launching it from
 * PrimeroEdge, so this does not go through loginToK12Catering. Same account the
 * other specs use for the customer role.
 */
async function customerPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ acceptDownloads: true });
  const p = await ctx.newPage();
  await p.goto(getK12CateringLoginUrl());
  await p.waitForLoadState('domcontentloaded');
  await p.locator('#email-input').fill(getCustomerAccountEmail());
  await p.locator('#password-input').fill(decryptPassword(getRequiredEnvVar('K12_CUSTOMER_ENCRYPTED_PASSWORD')));
  await p.getByRole('button', { name: /Sign in/i }).click();
  await expect(p.locator('aside[aria-label="Main navigation"]')).toBeVisible({ timeout: 30000 });
  await registerReleaseNotificationHandler(p);
  await dismissCustomerNotifications(p);
  return p;
}

/**
 * The customer dashboard pops district notifications that sit over the page and
 * swallow clicks on the menu and cart. Clear them before interacting.
 */
async function dismissCustomerNotifications(p: Page): Promise<void> {
  for (let i = 0; i < 5; i++) {
    const close = p.locator('button[aria-label^="Dismiss notification"]').first();
    if (!(await appears(close, 2000))) return;
    await close.click().catch(() => undefined);
    await p.waitForTimeout(400);
  }
}

/** Drive the customer from the menu to the Review step. */
async function driveCustomerToReview(c: Page, eventName: string, instructions: string): Promise<void> {
  await c.getByLabel('Navigate to Menu').click();
  await c.waitForLoadState('domcontentloaded');
  await dismissCustomerNotifications(c);

  const add = c.getByRole('button', { name: ORDER.addToCartBtn }).first();
  await expect(add).toBeVisible({ timeout: 25000 });
  await add.click();
  const modal = c
    .getByText('Add to Cart', { exact: true })
    .locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
  const modalAdd = modal.getByRole('button', { name: ORDER.addToCartBtn }).first();
  if (await appears(modalAdd, 6000)) await modalAdd.click();
  await c.waitForTimeout(1500);
  await dismissCustomerNotifications(c);

  const proceed = c.getByRole('button', { name: /Proceed to Checkout/i }).filter({ visible: true }).first();
  await proceed.scrollIntoViewIfNeeded();
  await proceed.click();
  // If the district Minimum Order Amount is not met the page silently stays put,
  // so anchor on the first wizard control instead of assuming we advanced.
  await expect(
    c.getByRole('button', { name: ORDER.selectEventDate }),
    'customer reached the checkout wizard (district Minimum Order Amount cleared)',
  ).toBeVisible({ timeout: 20000 });

  await selectAvailableEventDate(c);
  await clickNext(c);
  await pickTimeAndConfirm(c, ORDER.eventStartTime);
  await pickTimeAndConfirm(c, ORDER.eventEndTime);
  await clickNext(c);
  await pickTimeAndConfirm(c, ORDER.setupTimeInput);
  await clickNext(c);
  await c.getByRole('button', { name: /Select from Address Book/i }).click();
  await selectFirstContactCardInSection(c, /Select Contact/i);
  await clickNext(c);

  await expect(c.locator(ORDER.numGuestsInput)).toBeVisible({ timeout: 20000 });
  await c.locator(ORDER.numGuestsInput).fill('2');
  const evName = c.locator('#event-name-input');
  await evName.fill(eventName);
  await evName.blur().catch(() => undefined);
  await c.locator(SPECIAL_INSTRUCTIONS).fill(instructions);
  await expect(c.getByRole('button', { name: ORDER.nextBtn })).toBeEnabled({ timeout: 10000 });
  await clickNext(c);
  await selectPaymentAndContinue(c);
  await expect(c.getByRole('heading', { name: /Review Your Order/i }).first()).toBeVisible({
    timeout: 25000,
  });
}

/** Open the customer's newest order. Their nav has no launcher, so no re-auth dance. */
async function openCustomerOrderDetail(c: Page): Promise<void> {
  await dismissCustomerNotifications(c);
  const closeToast = c.getByRole('button', { name: /Close success notification/i }).first();
  if (await appears(closeToast, 4000)) await closeToast.click().catch(() => undefined);

  await c.getByLabel('Navigate to Orders').click();
  await expect(c.locator('h1')).toContainText(/Order/i, { timeout: 25000 });
  const view = c.getByRole('button', { name: /View details for order/i }).first();
  await expect(view).toBeVisible({ timeout: 25000 });
  await view.click();
  await expect(orderDetailHeading(c)).toBeVisible({ timeout: 25000 });
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('T-118254', () => {
  /**
   * Whatever this run added, this run removes, and both district minimums go back
   * to their baseline. Only names in `createdItems` are touched — each carries this
   * run's timestamp — so an item configured by a person is left alone. The shared
   * checkout item is kept on purpose: it is attached to a real order and the app
   * will not delete it, so it is reused instead of re-created every night.
   */
  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      const c = await loginToK12Catering(page);
      await autoDismissReauth(c);
      await goToSettings(c);
      for (const name of createdItems) {
        if (name === SHARED_CHECKOUT_ITEM) continue;
        await removeComplimentaryItem(c, name).catch(() => undefined);
      }
      await setUnlockAmount(c, BASELINE_UNLOCK).catch(() => undefined);
      await setMinimumOrderAmount(c, BASELINE_MIN_ORDER).catch(() => undefined);
    } catch {
      // Tear-down must never turn a green run red; anything left over is reported
      // by the next run's sweep rather than masked here.
    } finally {
      await page.close().catch(() => undefined);
    }
  });

  test('Settings - complimentary items configure as a list with notes, minimum and overall note', async ({
    page,
  }) => {
    const stamp = Date.now();
    const itemA = `SabihAutomation A ${stamp}`;
    const itemB = `SabihAutomation B ${stamp}`;
    const noteBEdited = 'Testing... edited';
    const overallNote = `Testing... ${stamp}`;

    const c = await loginToK12Catering(page);
    await autoDismissReauth(c);
    await goToSettings(c);
    const originalNote = (await settingValue(c, OVERALL_NOTE_HEADING).innerText()).trim();

    try {
      // AC1 — the setting is a list: an Add control plus per-item cards, not one
      // large text field.
      await expect(c.getByLabel(ADD_ITEM_BTN)).toBeVisible({ timeout: 10000 });

      // ── Round 2 (Daimien, 08/17) ──────────────────────────────────────────
      // The reworded section blurb.
      await expect(compBlock(c)).toContainText(SECTION_BLURB);

      // "Item Note" became "Short Description", and the helper line underneath it
      // was dropped as redundant with the blurb above.
      await c.getByLabel(ADD_ITEM_BTN).click();
      const addDialog = c.locator('[role="dialog"]');
      await expect(addDialog.getByText(SHORT_DESCRIPTION_LABEL)).toBeVisible({ timeout: 10000 });
      await expect(addDialog).not.toContainText('Item Note');
      await expect(addDialog).not.toContainText(REMOVED_HELPER_LINE);
      await addDialog.getByRole('button', { name: /^Cancel$/ }).click();
      await expect(addDialog.getByText(SHORT_DESCRIPTION_LABEL)).toBeHidden({ timeout: 10000 });

      await addComplimentaryItem(c, itemA, ITEM_NOTE);
      await addComplimentaryItem(c, itemB, ITEM_NOTE);
      await expect(itemCard(c, itemA)).toContainText(ITEM_NOTE);
      await expect(itemCard(c, itemB)).toContainText(ITEM_NOTE);

      // The item grid tops out at 3 columns in Settings.
      const grid = c.locator(`button[aria-label="Edit ${itemA}"]`).locator('xpath=ancestor::div[3]');
      await expect(grid).toHaveClass(/lg:grid-cols-3/);

      // Search finds an item by name and by its short description.
      const search = c.locator(ITEMS_SEARCH);
      await expect(search).toBeVisible({ timeout: 10000 });
      await search.fill(itemA);
      await expect(itemCard(c, itemA)).toBeVisible({ timeout: 10000 });
      await expect(c.locator(`button[aria-label="Edit ${itemB}"]`)).toBeHidden({ timeout: 10000 });
      await search.fill(ITEM_NOTE);
      await expect(itemCard(c, itemA)).toBeVisible({ timeout: 10000 });
      await expect(itemCard(c, itemB)).toBeVisible({ timeout: 10000 });
      await search.fill('');

      // Deactivating moves an item out of Active and into Inactive, and the eye
      // icon flips to its Activate state. The counts move with it.
      await itemsFilter(c, 'Active').click();
      const activeBefore = await itemsFilter(c, 'Active').innerText();
      await deactivateComplimentaryItem(c, itemB);
      await expect(itemsFilter(c, 'Active')).not.toHaveText(activeBefore, { timeout: 10000 });
      await itemsFilter(c, 'Inactive').click();
      // The Inactive list is long enough to paginate, so a freshly deactivated item
      // is not necessarily on page 1 — search for it rather than assuming.
      await search.fill(itemB);
      await expect(c.locator(`button[aria-label="Activate ${itemB}"]`)).toBeVisible({ timeout: 10000 });
      await expect(itemCard(c, itemB)).toContainText(/Inactive/i);
      await activateComplimentaryItem(c, itemB);
      await search.fill('');

      // Pagination, which only renders once the selected filter holds more items
      // than the page size.
      await itemsFilter(c, 'All').click();
      const pageSize = c.locator(ITEMS_PAGE_SIZE);
      await expect(pageSize).toBeVisible({ timeout: 10000 });
      await expect(compBlock(c)).toContainText(/\d+-\d+ of \d+/);
      const total = Number((await itemsFilter(c, 'All').innerText()).match(/\((\d+)\)/)?.[1] ?? 0);
      const perPage = Number(await pageSize.inputValue());
      if (total > perPage) {
        for (const label of ['First page', 'Previous page', 'Next page', 'Last page']) {
          await expect(compBlock(c).getByRole('button', { name: label })).toBeVisible({ timeout: 10000 });
        }
        const firstPageItems = await compBlock(c).locator('button[aria-label^="Edit "]').count();
        await compBlock(c).getByRole('button', { name: 'Next page' }).click();
        await c.waitForTimeout(1200);
        await expect(compBlock(c)).toContainText(/\d+-\d+ of \d+/);
        expect(firstPageItems, 'page 1 filled to the page size').toBeGreaterThan(0);
        await compBlock(c).getByRole('button', { name: 'First page' }).click();
        await c.waitForTimeout(1000);
      } else {
        console.log(`[T-118254] pagination controls not asserted: All holds ${total} items, page size ${perPage}`);
      }
      await itemsFilter(c, 'Active').click();

      await setUnlockAmount(c, '25');
      await setOverallNote(c, overallNote);
      await expect(settingValue(c, OVERALL_NOTE_HEADING)).toContainText(overallNote);

      // Everything survives a reload.
      await c.reload({ waitUntil: 'domcontentloaded' });
      await expect(c.getByRole('heading', { name: COMP_HEADING }).first()).toBeVisible({ timeout: 20000 });
      await expect(itemCard(c, itemA)).toContainText(ITEM_NOTE);
      await expect(settingValue(c, UNLOCK_HEADING)).toContainText('$25');
      await expect(settingValue(c, OVERALL_NOTE_HEADING)).toContainText(overallNote);

      // Editing one item's note leaves the other alone.
      await editComplimentaryItemNote(c, itemB, noteBEdited);
      await expect(itemCard(c, itemB)).toContainText(noteBEdited);
      await expect(itemCard(c, itemA)).not.toContainText(noteBEdited);

      // Deleting one item leaves the other intact.
      await deleteComplimentaryItem(c, itemB);
      await expect(itemCard(c, itemA)).toBeVisible();
    } finally {
      await removeComplimentaryItem(c, itemA).catch(() => undefined);
      await removeComplimentaryItem(c, itemB).catch(() => undefined);
      await setOverallNote(c, originalNote).catch(() => undefined);
    }
  });

  test('Admin - complimentary items through checkout, Order Details and the invoice', async ({
    page,
  }) => {
    const stamp = Date.now();
    const instructions = `AdminInstr ${stamp}`;
    const adminNote = `AdminNote ${stamp}`;

    const c = await loginToK12Catering(page);
    await autoDismissReauth(c);
    await goToSettings(c);
    await ensureComplimentaryItem(c, SHARED_CHECKOUT_ITEM, ITEM_NOTE);
    // One menu item is enough to check out, and the free items are unlocked.
    await setMinimumOrderAmount(c, CHECKOUT_MIN_ORDER);
    await setUnlockAmount(c, UNLOCK_OPEN);
    const overallNote = (await settingValue(c, OVERALL_NOTE_HEADING).innerText()).trim();

    await driveToReview(c, `AdminOrder ${stamp}`, instructions);

    // AC2 — the card sits above the Order Disclaimer, shows the overall note once
    // and each item with its own note, and every checkbox starts unchecked.
    const headings = await c.locator('h1,h2,h3,h4').allInnerTexts();
    const compIdx = headings.findIndex((h) => /^Complimentary Items$/i.test(h.trim()));
    const discIdx = headings.findIndex((h) => /^Order Disclaimer$/i.test(h.trim()));
    expect(compIdx, 'Complimentary Items card renders on Review').toBeGreaterThanOrEqual(0);
    expect(discIdx, 'Order Disclaimer card renders on Review').toBeGreaterThanOrEqual(0);
    expect(compIdx, 'Complimentary Items sits above the Order Disclaimer').toBeLessThan(discIdx);

    const card = reviewCompCard(c);
    await card.scrollIntoViewIfNeeded();
    if (overallNote) await expect(card).toContainText(overallNote);
    await expect(card).toContainText(SHARED_CHECKOUT_ITEM);
    await expect(card).toContainText(ITEM_NOTE);
    await expect(card.locator('div[class*="grid-cols"]').first()).toHaveClass(/lg:grid-cols-4/);

    const box = reviewItemCheckbox(c, SHARED_CHECKOUT_ITEM);
    await expect(box).toBeVisible({ timeout: 10000 });
    await expect(box, 'complimentary items are unchecked by default').not.toBeChecked();

    // Selecting a complimentary item must not change what the order costs.
    const totalBefore = await c.getByText(/\$\d[\d,]*\.\d{2}/).last().innerText();
    await box.check();
    await expect(box).toBeChecked();
    await c.waitForTimeout(1000);
    expect(
      await c.getByText(/\$\d[\d,]*\.\d{2}/).last().innerText(),
      'complimentary items are free',
    ).toBe(totalBefore);

    await reviewAndPlaceOrder(c);

    // AC3 — the selected item shows on the Order Details page.
    const orderId = await openNewestOrderDetail(c);
    await expect(detailCompCard(c)).toBeVisible({ timeout: 20000 });
    await expect(detailCompCard(c)).toContainText(SHARED_CHECKOUT_ITEM);

    // AC4 needs a genuine Order Note. The checkout field filled earlier is "special
    // instructions", which the invoice prints under a different toggle.
    await addOrderNote(c, adminNote);

    // AC3 + AC4 — with everything included, all three sections print.
    await ensureOnOrderDetail(c, orderId);
    const full = await downloadInvoiceWithOptions(c);
    expect(full, 'invoice lists the selected complimentary item').toContain(SHARED_CHECKOUT_ITEM);
    expect(full, 'invoice shows the Order Notes').toContain(adminNote);
    expect(full, 'invoice shows the special instructions').toContain(instructions);

    // Each checkbox drops only its own section.
    await ensureOnOrderDetail(c, orderId);
    const noComp = await downloadInvoiceWithOptions(c, { complimentaryItems: false });
    expect(noComp, 'excluded complimentary items are absent').not.toContain(SHARED_CHECKOUT_ITEM);
    expect(noComp, 'the Order Notes are unaffected').toContain(adminNote);

    await ensureOnOrderDetail(c, orderId);
    const noNotes = await downloadInvoiceWithOptions(c, { orderNotes: false });
    expect(noNotes, 'excluded Order Notes are absent').not.toContain(adminNote);
    expect(noNotes, 'complimentary items still print').toContain(SHARED_CHECKOUT_ITEM);

    await ensureOnOrderDetail(c, orderId);
    const noInstructions = await downloadInvoiceWithOptions(c, { instructions: false });
    expect(noInstructions, 'excluded special instructions are absent').not.toContain(instructions);
    expect(noInstructions, 'the Order Notes are unaffected').toContain(adminNote);
  });

  test('Admin - staff override unlocks complimentary items below the minimum', async ({ page }) => {
    const stamp = Date.now();
    const unlock = lockedUnlockAmount();

    const c = await loginToK12Catering(page);
    await autoDismissReauth(c);
    await goToSettings(c);
    await ensureComplimentaryItem(c, SHARED_CHECKOUT_ITEM, ITEM_NOTE);
    await setMinimumOrderAmount(c, CHECKOUT_MIN_ORDER);
    await setUnlockAmount(c, unlock);

    await driveToReview(c, `AdminGate ${stamp}`, `Gate check ${stamp}`);

    const card = reviewCompCard(c);
    await card.scrollIntoViewIfNeeded();

    // Staff are deliberately exempt from the customer minimum, and the card says so.
    await expect(
      card.getByText(/Staff override/i),
      'staff see the override badge when the order is below the minimum',
    ).toBeVisible({ timeout: 10000 });

    const box = reviewItemCheckbox(c, SHARED_CHECKOUT_ITEM);
    await expect(box, 'the item is still selectable for staff').toBeEnabled({ timeout: 10000 });
    await expect(box).not.toBeChecked();

    // Place it so no stale cart is left behind for the next test.
    await reviewAndPlaceOrder(c);
  });

  test('Customer - sees, selects and exports the complimentary items an admin configured', async ({
    page,
    browser,
  }) => {
    const stamp = Date.now();
    const instructions = `CustInstr ${stamp}`;

    const admin = await loginToK12Catering(page);
    await autoDismissReauth(admin);
    await goToSettings(admin);
    await ensureComplimentaryItem(admin, SHARED_CHECKOUT_ITEM, ITEM_NOTE);
    await setMinimumOrderAmount(admin, CHECKOUT_MIN_ORDER);
    await setUnlockAmount(admin, UNLOCK_OPEN);
    const overallNote = (await settingValue(admin, OVERALL_NOTE_HEADING).innerText()).trim();

    const c = await customerPage(browser);
    try {
      // NB: keep the item name out of the event name — the invoice prints the event
      // name too, and the exclusion assertions would match that instead.
      await driveCustomerToReview(c, `CustOrder ${stamp}`, instructions);

      const card = reviewCompCard(c);
      await expect(card, 'the customer sees the complimentary card').toBeVisible({ timeout: 15000 });
      await card.scrollIntoViewIfNeeded();

      // The customer sees exactly what the admin configured.
      if (overallNote) await expect(card).toContainText(overallNote);
      await expect(card).toContainText(SHARED_CHECKOUT_ITEM);
      await expect(card).toContainText(ITEM_NOTE);
      await expect(card.locator('div[class*="grid-cols"]').first()).toHaveClass(/lg:grid-cols-4/);

      // A customer is not staff, so the override badge must not be there.
      await expect(
        c.getByText(/Staff override/i),
        'a customer never gets the staff override',
      ).toHaveCount(0);

      const box = reviewItemCheckbox(c, SHARED_CHECKOUT_ITEM);
      await expect(box).toBeVisible({ timeout: 10000 });
      await expect(box, 'unchecked by default for the customer too').not.toBeChecked();

      const totalBefore = await c.getByText(/\$\d[\d,]*\.\d{2}/).last().innerText();
      await box.check();
      await expect(box).toBeChecked();
      await c.waitForTimeout(1000);
      expect(
        await c.getByText(/\$\d[\d,]*\.\d{2}/).last().innerText(),
        'complimentary items stay free for the customer',
      ).toBe(totalBefore);

      await reviewAndPlaceOrder(c);

      // The customer's own Order Details shows what they picked.
      await openCustomerOrderDetail(c);
      await expect(detailCompCard(c)).toBeVisible({ timeout: 20000 });
      await expect(detailCompCard(c)).toContainText(SHARED_CHECKOUT_ITEM);

      // And the customer can export it, with the same per-section options.
      const full = await downloadInvoiceWithOptions(c);
      expect(full, "the customer's invoice lists the complimentary item").toContain(SHARED_CHECKOUT_ITEM);
      expect(full, "the customer's invoice shows their instructions").toContain(instructions);

      const noComp = await downloadInvoiceWithOptions(c, { complimentaryItems: false });
      expect(noComp, 'the customer can exclude complimentary items').not.toContain(SHARED_CHECKOUT_ITEM);
      expect(noComp, 'the rest of the invoice is unaffected').toContain(instructions);
    } finally {
      await c.context().close().catch(() => undefined);
    }
  });

  test('Customer - below the minimum cannot select complimentary items', async ({ page, browser }) => {
    const stamp = Date.now();
    const unlock = lockedUnlockAmount();

    const admin = await loginToK12Catering(page);
    await autoDismissReauth(admin);
    await goToSettings(admin);
    await ensureComplimentaryItem(admin, SHARED_CHECKOUT_ITEM, ITEM_NOTE);
    await setMinimumOrderAmount(admin, CHECKOUT_MIN_ORDER);
    // Above the cart total, so the free items stay locked for the customer.
    await setUnlockAmount(admin, unlock);

    const c = await customerPage(browser);
    try {
      await driveCustomerToReview(c, `CustGate ${stamp}`, `Gate check ${stamp}`);

      const card = reviewCompCard(c);
      await expect(card).toBeVisible({ timeout: 15000 });
      await card.scrollIntoViewIfNeeded();

      // A plain string, not a RegExp — "$" would be an end anchor and never match.
      await expect(card, 'the customer is told what the order must reach').toContainText(`$${unlock}`);

      await expect(c.getByText(/Staff override/i)).toHaveCount(0);
      const box = reviewItemCheckbox(c, SHARED_CHECKOUT_ITEM);
      if (await appears(box, 5000)) {
        await expect(box, 'the item is not selectable below the minimum').toBeDisabled();
      }
    } finally {
      await c.context().close().catch(() => undefined);
    }
  });
});
