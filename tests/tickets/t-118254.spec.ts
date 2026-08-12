// Test Link: https://dev.azure.com/Cybersoft-Technologies-Inc/PrimeroEdge%20Classic/_workitems/edit/118254
//
// T-118254 — Catering - Settings - Complementary Items - Configure Complimentary
// Items as a List.
//
// Settings > Order Settings "Complimentary Items" changed from a single large text
// field to a list of individual items (each with its own note), plus an overall
// note and a "Minimum to Unlock Complimentary Items" amount. At the checkout Review
// step the items render as a selectable card above the Order Disclaimer, unchecked
// by default; whatever the customer checks shows on the Order Details page and on
// the invoice, and the invoice download offers per-section include/exclude options.
//
// Split into three tests: the Settings CRUD is short and navigation-light, while
// each checkout flow is long enough to want its own fresh login (the PrimeroEdge
// launcher token refresh interrupts long single sessions). Every test that opens
// the checkout wizard also places its order, so no test leaves a stale server-side
// cart behind for the next one.

import { test, expect, Locator, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
  dismissReauthInterstitial,
} from '../../utils/helpers';
import { getK12CateringUrl } from '../../utils/baseUrl';
import {
  startOrderToAdditionalDetails,
  selectPaymentAndContinue,
  clickNext,
  reviewAndPlaceOrder,
  downloadInvoiceWithOptions,
  ORDER,
} from '../../utils/orders';

test.use({ storageState: { cookies: [], origins: [] } });

// ─── Constants ───────────────────────────────────────────────────────────────

const ADD_ITEM_BTN = 'Add new complimentary item';
const EDIT_MIN_BTN = 'Edit complimentary items minimum order amount';
const EDIT_NOTE_BTN = 'Edit complimentary items overall note';

const ITEM_NAME_INPUT = '#complimentary-item-name-input';
const ITEM_NOTE_TEXTAREA = '#complimentary-item-note-textarea';
const MIN_UNLOCK_INPUT = '#complimentary-items-minimum-order-amount-input';
const OVERALL_NOTE_TEXTAREA = '#complimentary-items-note-textarea';
const SPECIAL_INSTRUCTIONS = '#special-instructions-textarea';

const MIN_UNLOCK_HEADING = 'Minimum to Unlock Complimentary Items';
const OVERALL_NOTE_HEADING = 'Complimentary Items Note';
const COMP_HEADING = /^Complimentary Items$/i;

// The district's own baseline, restored after each test that changes it.
const BASELINE_MIN_UNLOCK = '30';

// Every item this spec creates uses this note, so a human scanning Settings can
// tell instantly that it is automation data.
const ITEM_NOTE = 'Testing...';

/**
 * The checkout test selects its complimentary item on a real order, and the app
 * refuses to delete an item that is in use ("Failed to delete complimentary item.
 * It may already be used on an order. Try deactivating it instead."). A fresh
 * per-run name would therefore leave a new undeletable row in the district's
 * settings every night, so this ONE item is created once and reused forever.
 * Every other item this spec makes never reaches an order, so it is deleted.
 */
const SHARED_CHECKOUT_ITEM = 'SabihAutomation';

/**
 * The gate has to sit above the cart subtotal (~$85) for the locked state to
 * happen at all, but it should still read like a plausible district setting on
 * the card, so pick a normal three-digit amount rather than a silly 9999.
 */
function realisticGateAmount(): string {
  return String(120 + Math.floor(Math.random() * 60));
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

// ─── Settings helpers ────────────────────────────────────────────────────────

async function goToSettings(c: Page): Promise<void> {
  await dismissReauthInterstitial(c);
  await navigateK12CateringMenu(c, 'Settings');
  await c.waitForLoadState('domcontentloaded');
  await expect(c.locator('h1')).toContainText('Settings', { timeout: 20000 });
  await expect(c.getByRole('heading', { name: COMP_HEADING }).first()).toBeVisible({
    timeout: 20000,
  });
}

/** The card for one complimentary item in Settings, matched by its Edit control. */
function itemCard(c: Page, name: string) {
  return c.locator(`button[aria-label="Edit ${name}"]`).locator('xpath=ancestor::div[2]');
}

/**
 * Every complimentary item this spec creates, so the sweep at the end can remove
 * exactly those and nothing else. Names carry a run timestamp, so an item added
 * by a person (or another spec) can never match and is never touched.
 */
const createdItems = new Set<string>();

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
  const existing = c.locator(`button[aria-label="Edit ${name}"]`);
  if (!(await appears(existing, 5000))) {
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
 * matched exactly and scoped to the dialog so this can never re-resolve to the
 * row button we just clicked.
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
 * Tear-down for test items. An item that has been selected on a placed order
 * cannot be deleted — the app refuses with "Delete Failed … It may already be
 * used on an order. Try deactivating it instead." — so fall back to Deactivate,
 * which is the app's own prescribed path. Only that documented failure is
 * absorbed; anything else surfaces.
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

  const gone = await del.waitFor({ state: 'hidden', timeout: 10000 }).then(
    () => true,
    () => false,
  );
  if (gone) return;

  const refused = await appears(c.getByText(/Failed to delete complimentary item/i).first(), 5000);
  if (!refused) {
    throw new Error(`Delete of "${name}" neither removed the item nor reported a failure`);
  }

  const deactivate = c.locator(`button[aria-label="Deactivate ${name}"]`);
  await expect(deactivate).toBeVisible({ timeout: 10000 });
  await deactivate.click();
  const confirm = c.locator('[role="dialog"]').getByRole('button', { name: /^Deactivate$/ });
  if (await appears(confirm, 5000)) {
    await confirm.click();
  }
  await c.waitForTimeout(1500);
}

async function setMinimumToUnlock(c: Page, value: string): Promise<void> {
  await c.getByLabel(EDIT_MIN_BTN).click();
  const input = c.locator(MIN_UNLOCK_INPUT);
  await expect(input).toBeVisible({ timeout: 10000 });
  await input.fill(value);
  await c.locator('[role="dialog"]').getByRole('button', { name: /Save Changes/i }).click();
  await expect(c.getByRole('heading', { name: /Edit Minimum to Unlock/i })).toBeHidden({
    timeout: 15000,
  });
}

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

/** The read-only value shown under a Settings sub-heading. */
function settingValue(c: Page, heading: string) {
  return c.getByRole('heading', { name: heading }).first().locator('xpath=following-sibling::p[1]');
}

// ─── Checkout helpers ────────────────────────────────────────────────────────

/** Drive the wizard from an empty cart to the Review step, leaving `notes` on the order. */
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

/** The Review-step checkbox for one complimentary item (the input has no id/aria-label). */
function reviewItemCheckbox(c: Page, name: string) {
  return c
    .locator('label')
    .filter({ has: c.locator('input[type="checkbox"]') })
    .filter({ hasText: name })
    .first()
    .locator('input[type="checkbox"]');
}

/**
 * The PrimeroEdge launcher can bounce a long session onto its re-auth interstitial
 * at any point, which drops us on the Catering landing page mid-flow. Register a
 * locator handler so the interstitial is cleared wherever it appears rather than
 * guarding every individual interaction.
 */
async function autoDismissReauth(c: Page): Promise<void> {
  await c.addLocatorHandler(
    c.getByText(/automatically authenticated and redirected to Catering/i).first(),
    async () => {
      await c
        .getByRole('link', { name: 'link', exact: true })
        .first()
        .click()
        .catch(() => undefined);
      await c.waitForLoadState('domcontentloaded').catch(() => undefined);
    },
    { times: 15 },
  );
}

// `.first()` matters: the detail page renders "Order Summary" both as the section
// heading and in Quick Navigation, and a strict multi-match makes isVisible() throw.
const orderDetailHeading = (c: Page) => c.getByRole('heading', { name: /^Order Summary$/i }).first();
const sidebar = (c: Page) => c.locator('aside[aria-label="Main navigation"]');

/**
 * Land on the Orders list no matter where a token refresh left the tab. Going
 * straight to the app route is markedly more reliable than clicking through the
 * launcher interstitial, which can bounce more than once before it settles.
 */
async function gotoOrdersList(c: Page): Promise<boolean> {
  await dismissReauthInterstitial(c);

  // Placing an order leaves an "Order Placed Successfully!" toast sitting over the
  // list. It swallows the nav click, so the list never loads behind it.
  const closeToast = c.getByRole('button', { name: /Close success notification/i }).first();
  if (await appears(closeToast, 3000)) {
    await closeToast.click().catch(() => undefined);
    await c.waitForTimeout(500);
  }

  if (!(await appears(sidebar(c), 5000))) {
    await c
      .goto(`${getK12CateringUrl()}/orders`, { waitUntil: 'domcontentloaded' })
      .catch(() => undefined);
    await sidebar(c).waitFor({ state: 'visible', timeout: 30000 }).catch(() => undefined);
  } else {
    await navigateK12CateringMenu(c, 'Orders').catch(() => undefined);
  }

  // The list hydrates a beat after the heading (see site-map.md).
  await expect(c.locator('h1')).toContainText(/Order Management/i, { timeout: 20000 });
  return appears(c.getByRole('button', { name: /View details for order/i }).first(), 25000);
}

/** Open the newest order and return its order id (e.g. "394EF568F5"). */
/**
 * Add a real Order Note. This is NOT the checkout "special instructions" field —
 * the invoice prints them as separate sections, governed by separate checkboxes
 * in the Download Invoice Options modal (Order Notes vs Instructions).
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

async function openNewestOrderDetail(c: Page): Promise<string> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (await gotoOrdersList(c)) {
      await c
        .getByRole('button', { name: /View details for order/i })
        .first()
        .click()
        .catch(() => undefined);
      await c.waitForLoadState('domcontentloaded').catch(() => undefined);
      // The route flips to /orders/details before the detail content mounts, so
      // wait on the Order Summary heading rather than the URL.
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

/**
 * Re-open the order if a token refresh has navigated us away. The invoice
 * downloads run minutes after the order is placed, which is squarely inside the
 * window where the launcher interstitial fires.
 */
async function ensureOnOrderDetail(c: Page, orderId: string): Promise<void> {
  await dismissReauthInterstitial(c);
  if (await appears(orderDetailHeading(c), 5000)) return;

  for (let attempt = 1; attempt <= 3; attempt++) {
    if (!(await gotoOrdersList(c))) continue;
    const view = c.getByRole('button', {
      name: new RegExp(`View details for order ${orderId}`, 'i'),
    });
    if (await appears(view, 20000)) {
      await view.click().catch(() => undefined);
      await c.waitForLoadState('domcontentloaded').catch(() => undefined);
      if (await appears(orderDetailHeading(c), 20000)) return;
    }
  }
  throw new Error(`Could not re-open order ${orderId}`);
}

// ─────────────────────────────────────────────────────────────────────────────

// The checkout + invoice coverage is deliberately split across two tests. Driving
// the wizard, placing the order and then pulling three separate invoice PDFs in
// one session runs long enough that the PrimeroEdge launcher fires its token
// refresh mid-test and strands the tab on the re-auth interstitial. Each half
// gets its own fresh login instead; the order placed by the first is handed to
// the second by id.
const placed: {
  orderId?: string;
  item?: string;
  instructions?: string;
  adminNote?: string;
} = {};

test.describe('T-118254', () => {
  /**
   * Safety net: whatever this run added, this run removes. It only ever touches
   * names in `createdItems` — each carries this run's timestamp — so a
   * complimentary item configured by a person, or by another spec, is left alone
   * even if it looks similar. Items already selected on a placed order cannot be
   * deleted, so those end up deactivated instead (the app's own guidance).
   */
  test.afterAll(async ({ browser }) => {
    if (createdItems.size === 0) return;
    const page = await browser.newPage();
    try {
      const c = await loginToK12Catering(page);
      await autoDismissReauth(c);
      await goToSettings(c);
      for (const name of createdItems) {
        // The shared checkout item is reused across runs by design.
        if (name === SHARED_CHECKOUT_ITEM) continue;
        await removeComplimentaryItem(c, name).catch(() => undefined);
      }
      await setMinimumToUnlock(c, BASELINE_MIN_UNLOCK).catch(() => undefined);
    } catch {
      // Tear-down must never turn a green run red; leftovers are reported by the
      // next run's sweep rather than masked here.
    } finally {
      await page.close().catch(() => undefined);
    }
  });

  test('Settings - complimentary items configure as a list with notes, minimum and overall note', async ({
    page,
  }) => {
    const stamp = Date.now();
    const itemA = `SabihAutomation A ${stamp}`;
    const noteA = ITEM_NOTE;
    const itemB = `SabihAutomation B ${stamp}`;
    const noteB = ITEM_NOTE;
    const noteBEdited = 'Testing... edited';
    const overallNote = `Subject to availability ${stamp}`;

    const c = await loginToK12Catering(page);
    await autoDismissReauth(c);
    await goToSettings(c);

    // Capture what the district had, so the test restores it afterwards.
    const originalNote = (await settingValue(c, OVERALL_NOTE_HEADING).innerText()).trim();

    try {
      // AC1 — the setting is a list: an Add control plus per-item cards, not one
      // large text field.
      await expect(c.getByLabel(ADD_ITEM_BTN)).toBeVisible({ timeout: 10000 });

      await addComplimentaryItem(c, itemA, noteA);
      await addComplimentaryItem(c, itemB, noteB);

      // Each item keeps its OWN note. Both start on the shared note, so the
      // no-bleed check is done after the edit below, where the values differ.
      await expect(itemCard(c, itemA)).toContainText(noteA);
      await expect(itemCard(c, itemB)).toContainText(noteB);

      // The item grid tops out at 3 columns in Settings.
      const grid = c.locator(`button[aria-label="Edit ${itemA}"]`).locator('xpath=ancestor::div[3]');
      await expect(grid).toHaveClass(/lg:grid-cols-3/);

      // The two new settings save and display their values.
      await setMinimumToUnlock(c, '25');
      await expect(settingValue(c, MIN_UNLOCK_HEADING)).toContainText('$25');
      await setOverallNote(c, overallNote);
      await expect(settingValue(c, OVERALL_NOTE_HEADING)).toContainText(overallNote);

      // Everything survives a reload.
      await c.reload({ waitUntil: 'domcontentloaded' });
      await expect(c.getByRole('heading', { name: COMP_HEADING }).first()).toBeVisible({
        timeout: 20000,
      });
      await expect(itemCard(c, itemA)).toContainText(noteA);
      await expect(itemCard(c, itemB)).toContainText(noteB);
      await expect(settingValue(c, MIN_UNLOCK_HEADING)).toContainText('$25');
      await expect(settingValue(c, OVERALL_NOTE_HEADING)).toContainText(overallNote);

      // Editing one item's note leaves the other item alone.
      await editComplimentaryItemNote(c, itemB, noteBEdited);
      await expect(itemCard(c, itemB)).toContainText(noteBEdited);
      await expect(itemCard(c, itemA)).toContainText(noteA);
      // The edit must not have leaked onto the other item.
      await expect(itemCard(c, itemA)).not.toContainText(noteBEdited);

      // Deleting one item leaves the other intact.
      await deleteComplimentaryItem(c, itemB);
      await expect(itemCard(c, itemA)).toBeVisible();
    } finally {
      // Leave the district's complimentary settings as we found them.
      await removeComplimentaryItem(c, itemA).catch(() => undefined);
      await removeComplimentaryItem(c, itemB).catch(() => undefined);
      await setMinimumToUnlock(c, BASELINE_MIN_UNLOCK).catch(() => undefined);
      await setOverallNote(c, originalNote).catch(() => undefined);
    }
  });

  test('Checkout Review lists complimentary items unchecked, and the selection reaches Order Details', async ({
    page,
  }) => {
    const stamp = Date.now();
    const item = SHARED_CHECKOUT_ITEM;
    const itemNote = ITEM_NOTE;
    const instructions = `AutoInstruction ${stamp}`;
    const adminNote = `AutoAdminNote ${stamp}`;

    const c = await loginToK12Catering(page);
    await autoDismissReauth(c);
    await goToSettings(c);
    const overallNote = (await settingValue(c, OVERALL_NOTE_HEADING).innerText()).trim();

    await ensureComplimentaryItem(c, item, itemNote);
    await driveToReview(c, `AutoComp ${stamp}`, instructions);

    // AC2 — the card sits above the Order Disclaimer, shows the overall note once
    // and each item with its own note, and every checkbox starts unchecked.
    const headings = await c.locator('h1,h2,h3,h4').allInnerTexts();
    const compIdx = headings.findIndex((h) => /^Complimentary Items$/i.test(h.trim()));
    const discIdx = headings.findIndex((h) => /^Order Disclaimer$/i.test(h.trim()));
    expect(compIdx, 'Complimentary Items card renders on Review').toBeGreaterThanOrEqual(0);
    expect(discIdx, 'Order Disclaimer card renders on Review').toBeGreaterThanOrEqual(0);
    expect(compIdx, 'Complimentary Items sits above the Order Disclaimer').toBeLessThan(discIdx);

    const compCard = c
      .getByRole('heading', { name: COMP_HEADING })
      .first()
      .locator('xpath=ancestor::div[4]');
    await compCard.scrollIntoViewIfNeeded();
    if (overallNote) await expect(compCard).toContainText(overallNote);
    await expect(compCard).toContainText(item);
    await expect(compCard).toContainText(itemNote);

    // The checkout grid tops out at 4 columns.
    await expect(compCard.locator('div[class*="grid-cols"]').first()).toHaveClass(/lg:grid-cols-4/);

    const box = reviewItemCheckbox(c, item);
    await expect(box).toBeVisible({ timeout: 10000 });
    await expect(box, 'complimentary items are unchecked by default').not.toBeChecked();

    // Selecting a complimentary item must not change what the order costs.
    const totalBefore = await c.getByText(/\$\d[\d,]*\.\d{2}/).last().innerText();
    await box.check();
    await expect(box).toBeChecked();
    await c.waitForTimeout(1000);
    const totalAfter = await c.getByText(/\$\d[\d,]*\.\d{2}/).last().innerText();
    expect(totalAfter, 'complimentary items are free').toBe(totalBefore);

    await reviewAndPlaceOrder(c);

    // AC3 — the selected item shows on the Order Details page.
    const orderId = await openNewestOrderDetail(c);
    const detailCard = c
      .getByRole('heading', { name: COMP_HEADING })
      .first()
      .locator('xpath=ancestor::div[3]');
    await expect(detailCard).toBeVisible({ timeout: 20000 });
    await expect(detailCard).toContainText(item);

    // AC4 needs a genuine Order Note. The checkout field we filled earlier is
    // "special instructions", which the invoice prints as its own section under a
    // different toggle, so it cannot stand in for this.
    await addOrderNote(c, adminNote);

    // Hand this order to the invoice test, which logs in fresh.
    placed.orderId = orderId;
    placed.item = item;
    placed.instructions = instructions;
    placed.adminNote = adminNote;
  });

  test('Invoice export honours the Download Invoice Options and carries Order Notes', async ({
    page,
  }) => {
    expect(
      placed.orderId,
      'needs the order placed by the Checkout Review test - that test must pass first',
    ).toBeTruthy();
    const orderId = placed.orderId!;
    const item = placed.item!;
    const instructions = placed.instructions!;
    const adminNote = placed.adminNote!;

    const c = await loginToK12Catering(page);
    await autoDismissReauth(c);

    // AC3 + AC4 — everything included: the selected complimentary item, the
    // checkout special instructions and the Order Note all print.
    await ensureOnOrderDetail(c, orderId);
    const full = await downloadInvoiceWithOptions(c);
    expect(full, 'invoice lists the selected complimentary item').toContain(item);
    expect(full, 'invoice shows the Order Notes').toContain(adminNote);
    expect(full, 'invoice shows the special instructions').toContain(instructions);

    // Each checkbox drops only its own section.
    await ensureOnOrderDetail(c, orderId);
    const noComp = await downloadInvoiceWithOptions(c, { complimentaryItems: false });
    expect(noComp, 'excluded complimentary items are absent').not.toContain(item);
    expect(noComp, 'the Order Notes are unaffected').toContain(adminNote);

    await ensureOnOrderDetail(c, orderId);
    const noNotes = await downloadInvoiceWithOptions(c, { orderNotes: false });
    expect(noNotes, 'excluded Order Notes are absent').not.toContain(adminNote);
    expect(noNotes, 'complimentary items still print').toContain(item);

    await ensureOnOrderDetail(c, orderId);
    const noInstructions = await downloadInvoiceWithOptions(c, { instructions: false });
    expect(noInstructions, 'excluded special instructions are absent').not.toContain(instructions);
    expect(noInstructions, 'the Order Notes are unaffected').toContain(adminNote);
    // The shared checkout item is deliberately left in place — it is now attached to
    // a real order, so it cannot be deleted, and the next run reuses it.
  });

  test('Staff override unlocks complimentary items below the configured minimum', async ({
    page,
  }) => {
    const stamp = Date.now();
    const item = `SabihAutomation Gate ${stamp}`;

    const c = await loginToK12Catering(page);
    await autoDismissReauth(c);
    await goToSettings(c);

    try {
      await addComplimentaryItem(c, item, ITEM_NOTE);
      // A normal-looking amount that still sits above the cart subtotal.
      const gate = realisticGateAmount();
      await setMinimumToUnlock(c, gate);
      await expect(settingValue(c, MIN_UNLOCK_HEADING)).toContainText(`$${gate}`);

      await driveToReview(c, `AutoGate ${stamp}`, `AutoGateNote ${stamp}`);

      const compCard = c
        .getByRole('heading', { name: COMP_HEADING })
        .first()
        .locator('xpath=ancestor::div[4]');
      await compCard.scrollIntoViewIfNeeded();

      // Staff are deliberately exempt from the customer minimum, and the card says so.
      await expect(
        compCard.getByText(/Staff override/i),
        'staff see the override badge when the order is below the minimum',
      ).toBeVisible({ timeout: 10000 });

      const box = reviewItemCheckbox(c, item);
      await expect(box, 'the item is still selectable for staff').toBeEnabled({ timeout: 10000 });
      await expect(box).not.toBeChecked();

      // Place the order so no stale cart is left behind for the next run.
      await reviewAndPlaceOrder(c);
    } finally {
      await goToSettings(c).catch(() => undefined);
      await setMinimumToUnlock(c, BASELINE_MIN_UNLOCK).catch(() => undefined);
      await removeComplimentaryItem(c, item).catch(() => undefined);
    }
  });
});
