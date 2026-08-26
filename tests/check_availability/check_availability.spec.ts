import { test, expect, Browser, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
  dismissReauthInterstitial,
} from '../../utils/helpers';
import { getK12CateringUrl } from '../../utils/baseUrl';

test.use({ storageState: { cookies: [], origins: [] } });

/**
 * A mid-suite PrimeroEdge token refresh replaces the page with the "you will be
 * automatically authenticated and redirected to Catering" interstitial, at which
 * point every wizard locator vanishes and the failure reads as a missing button.
 * Clear it and get back to Check Availability before driving the wizard.
 */
async function ensureOnCheckAvailability(page: Page): Promise<void> {
  await dismissReauthInterstitial(page);
  const dateBtn = page.getByRole('button', { name: /Select Event Date/i });
  const backBtn = page.getByRole('button', { name: /Go back to previous step/i });
  const onWizard =
    (await dateBtn.waitFor({ state: 'visible', timeout: 4000 }).then(() => true, () => false)) ||
    (await backBtn.waitFor({ state: 'visible', timeout: 2000 }).then(() => true, () => false));
  if (onWizard) return;

  // Clicking through the interstitial is unreliable — it can bounce more than
  // once. Going straight to the app route recovers in one hop.
  const sidebar = page.locator('aside[aria-label="Main navigation"]');
  if (!(await sidebar.waitFor({ state: 'visible', timeout: 4000 }).then(() => true, () => false))) {
    await page
      .goto(`${getK12CateringUrl()}/check-availability`, { waitUntil: 'domcontentloaded' })
      .catch(() => undefined);
    await sidebar.waitFor({ state: 'visible', timeout: 30000 }).catch(() => undefined);
  }
  await navigateK12CateringMenu(page, 'Check Availability').catch(() => undefined);
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  await dateBtn.waitFor({ state: 'visible', timeout: 20000 }).catch(() => undefined);
}

async function resetToStep1(page: Page): Promise<void> {
  await ensureOnCheckAvailability(page);
  // The SPA preserves wizard state across sidebar navigation.
  // Click "Back" as many times as needed until the Step 1 date button is visible.
  for (let i = 0; i < 3; i++) {
    const dateVisible = await page
      .getByRole('button', { name: /Select Event Date/i })
      .isVisible({ timeout: 1500 })
      .catch(() => false);
    if (dateVisible) return;

    const backBtn = page.getByRole('button', { name: /Go back to previous step/i });
    if (await backBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await backBtn.click();
      await page.waitForTimeout(600);
    } else {
      break;
    }
  }
}

async function pickFirstAvailableDate(page: Page): Promise<void> {
  await resetToStep1(page);
  const datePickerBtn = page.getByRole('button', { name: /Select Event Date/i });
  await expect(datePickerBtn).toBeVisible({ timeout: 10000 });
  await datePickerBtn.click();
  await page.waitForTimeout(500);
  await expect(page.getByRole('button', { name: /Previous month/i })).toBeVisible({ timeout: 5000 });

  const nextBtn = page.getByRole('button', { name: /Next month/i });
  for (let attempt = 0; attempt < 4; attempt++) {
    const allBtns = await page.getByRole('button').all();
    for (const btn of allBtns) {
      const aria = (await btn.getAttribute('aria-label') ?? '');
      if (
        /\d{4}/.test(aria) &&
        !aria.includes('disabled') &&
        !aria.includes('month') &&
        !aria.includes('year') &&
        !aria.includes('Cancel') &&
        !aria.includes('Confirm') &&
        !aria.includes('Close')
      ) {
        await btn.click();
        await page.waitForTimeout(400);
        const confirmBtn = page.getByRole('button', { name: /Confirm date selection/i });
        if (await confirmBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await confirmBtn.click();
          await page.waitForTimeout(600);
        }
        return;
      }
    }
    await nextBtn.click();
    await page.waitForTimeout(400);
  }
}

async function proceedToTimeStep(page: Page): Promise<void> {
  await pickFirstAvailableDate(page);
  await page.getByRole('button', { name: /Continue to time selection/i }).click();
  await page.waitForTimeout(1000);
}

/**
 * Find a control on the result step, re-driving the wizard if it is missing.
 * The token refresh can fire *during* an assertion's own wait, after the helper
 * has already landed us correctly, so retrying inside the lookup is the only
 * thing that survives it.
 */
async function resultStepControl(page: Page, name: RegExp) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const control = page.getByRole('button', { name }).first();
    if (await control.waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false)) {
      return control;
    }
    await proceedToResultStep(page);
  }
  return page.getByRole('button', { name }).first();
}

async function proceedToResultStep(page: Page): Promise<void> {
  // The token refresh can fire part-way through the wizard, replacing the page
  // and leaving the result-step assertions reading as "button not found". Drive
  // the wizard, confirm we actually landed on the result step, and redo the whole
  // run once if we did not.
  for (let attempt = 1; attempt <= 2; attempt++) {
    await ensureOnCheckAvailability(page);
    await proceedToTimeStep(page);

    const timeBtn = page.getByRole('button', { name: /Select .+ for event setup/i }).first();
    if (await timeBtn.waitFor({ state: 'visible', timeout: 10000 }).then(() => true, () => false)) {
      await timeBtn.click().catch(() => undefined);
      await page.waitForTimeout(1000);
    }

    const landed = await page
      .getByRole('heading', { name: /It's Available/i })
      .waitFor({ state: 'visible', timeout: 10000 })
      .then(() => true, () => false);
    if (landed) return;
  }
  throw new Error('Check Availability never reached the result step after 2 attempts');
}

test.describe('Check Availability', () => {
  let catering: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    catering = await loginToK12Catering(page);
  });

  /**
   * Start a completely fresh session and land back on Check Availability.
   *
   * A bare goto to the catering app does NOT carry the PrimeroEdge launcher
   * token, so it just bounces to the interstitial again — the only thing that
   * actually recovers is logging in from scratch. Declared here so it can
   * reassign the shared `catering` page.
   */
  async function relogin(browser: Browser): Promise<void> {
    await catering.context().close().catch(() => undefined);
    const context = await browser.newContext();
    const page = await context.newPage();
    catering = await loginToK12Catering(page);
    await navigateK12CateringMenu(catering, 'Check Availability');
    await catering.waitForLoadState('domcontentloaded');
  }

  /** Reach the result step, re-logging in once if the token expired mid-flow. */
  async function resultStep(browser: Browser, name: RegExp) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      await proceedToResultStep(catering).catch(() => undefined);
      const control = catering.getByRole('button', { name }).first();
      if (await control.waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false)) {
        return control;
      }
      await relogin(browser);
    }
    return catering.getByRole('button', { name }).first();
  }

  test.beforeEach(async ({ browser }) => {
    // This suite shares one login across 19 tests, and the PrimeroEdge token
    // expires part-way through — parking the tab on the "you will be
    // automatically authenticated and redirected to Catering" interstitial,
    // where every app locator disappears and failures read as missing buttons.
    // Clicking through that page is unreliable, so start a fresh session
    // instead when the sidebar is gone.
    await dismissReauthInterstitial(catering).catch(() => undefined);
    const alive = await catering
      .locator('aside[aria-label="Main navigation"]')
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true, () => false);

    if (!alive) {
      await catering.context().close().catch(() => undefined);
      const context = await browser.newContext();
      const page = await context.newPage();
      catering = await loginToK12Catering(page);
    }

    await navigateK12CateringMenu(catering, 'Check Availability');
    await catering.waitForLoadState('domcontentloaded');
  });

  // ── Layout ──

  test('Check Availability - Page heading is displayed', async () => {
    await expect(catering.locator('h1')).toContainText('Check Availability', { timeout: 10000 });
  });

  test('Check Availability - Event Details section heading is visible', async () => {
    await expect(
      catering.getByRole('heading', { name: /Event Details/i }),
    ).toBeVisible({ timeout: 10000 });
  });

  test('Check Availability - Select Event Date button is visible', async () => {
    await expect(
      catering.getByRole('button', { name: /Select Event Date/i }),
    ).toBeVisible({ timeout: 10000 });
  });

  test('Check Availability - Check section heading is visible', async () => {
    await expect(
      catering.getByRole('heading', { name: /^Check$/i }),
    ).toBeVisible({ timeout: 10000 });
  });

  test('Check Availability - Select Event Date label heading is visible', async () => {
    await expect(
      catering.getByRole('heading', { name: /Select Event Date/i }),
    ).toBeVisible({ timeout: 10000 });
  });

  test('Check Availability - Page loads without errors', async () => {
    await expect(catering.getByText(/Error Code: 404|something went wrong/i)).not.toBeVisible();
  });

  // ── Date Picker ──

  test('Check Availability - Select Event Date button opens date picker', async () => {
    await catering.getByRole('button', { name: /Select Event Date/i }).click();
    await catering.waitForTimeout(500);

    await expect(
      catering.getByRole('button', { name: /Previous month/i }),
    ).toBeVisible({ timeout: 10000 });

    const cancelBtn = catering.getByRole('button', { name: /Cancel/i });
    if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cancelBtn.click();
    } else {
      await catering.keyboard.press('Escape');
    }
  });

  test('Check Availability - Date picker has previous and next month navigation', async () => {
    await catering.getByRole('button', { name: /Select Event Date/i }).click();
    await catering.waitForTimeout(500);

    await expect(catering.getByRole('button', { name: /Previous month/i })).toBeVisible({ timeout: 5000 });
    await expect(catering.getByRole('button', { name: /Next month/i })).toBeVisible({ timeout: 5000 });

    const cancelBtn = catering.getByRole('button', { name: /Cancel/i });
    if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cancelBtn.click();
    } else {
      await catering.keyboard.press('Escape');
    }
  });

  // ── Flow: Step 1 → Step 2 ──

  test('Check Availability - Picking a date shows Continue to Time Selection button', async () => {
    await pickFirstAvailableDate(catering);
    await expect(
      catering.getByRole('button', { name: /Continue to time selection/i }),
    ).toBeVisible({ timeout: 10000 });
  });

  test('Check Availability - Time step shows Select Event Setup Time heading', async () => {
    await proceedToTimeStep(catering);
    await expect(
      catering.getByRole('heading', { name: /Select Event Setup Time/i }),
    ).toBeVisible({ timeout: 10000 });
  });

  test('Check Availability - Time step shows time slot buttons', async () => {
    await proceedToTimeStep(catering);
    await expect(
      catering.getByRole('button', { name: /Select .+ for event setup/i }).first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test('Check Availability - Back button at time step returns to date step', async () => {
    await proceedToTimeStep(catering);
    await catering.getByRole('button', { name: /Go back to previous step/i }).click();
    await catering.waitForTimeout(800);

    await expect(
      catering
        .getByRole('button', { name: /Continue to time selection/i })
        .or(catering.getByRole('button', { name: /Select Event Date/i }))
        .first(),
    ).toBeVisible({ timeout: 10000 });
  });

  // ── Flow: Step 2 → Step 3 ──

  test("Check Availability - Clicking a time slot shows It's Available heading", async () => {
    await proceedToResultStep(catering);
    await expect(
      catering.getByRole('heading', { name: /It's Available/i }),
    ).toBeVisible({ timeout: 10000 });
  });

  test('Check Availability - Result step shows event date and time details', async () => {
    await proceedToResultStep(catering);
    const mainText = await catering.locator('#main-content, main').first().textContent();
    expect(mainText).toMatch(/Date:/i);
    expect(mainText).toMatch(/Time:/i);
  });

  test('Check Availability - Result step shows Browse Menu', async ({
    browser,
  }) => {
    // A mid-test token refresh forces a full re-login (~20s) before the wizard
    // can be re-driven, which does not fit the default budget.
    test.setTimeout(180_000);
    // Browse Menu is the only action offered here on an empty cart. "Proceed to
    // Checkout" used to be asserted alongside it, but the result step only renders
    // that button once the cart has items — covered by the "with cart" test below.
    await expect(
      await resultStep(browser, /Browse available menu items/i),
    ).toBeVisible({ timeout: 10000 });
  });

  test('Check Availability - Back button at result step returns to time step', async () => {
    await proceedToResultStep(catering);
    await catering.getByRole('button', { name: /Go back to previous step/i }).click();
    await catering.waitForTimeout(800);

    await expect(
      catering.getByRole('heading', { name: /Select Event Setup Time/i }),
    ).toBeVisible({ timeout: 10000 });
  });

  test('Check Availability - Browse Menu navigates to the menu page', async () => {
    await proceedToResultStep(catering);
    await catering.getByRole('button', { name: /Browse available menu items/i }).click();
    await expect(catering).toHaveURL(/\/menu/i, { timeout: 10000 });
  });

  test('Check Availability - Proceed to Checkout is not offered without a cart', async () => {
    // Inverted from "clicking it goes to /menu": the result step no longer renders a
    // Proceed to Checkout button on an empty cart, so the behaviour worth pinning is
    // that it stays absent. resultStep() is deliberately not used here — it retries on
    // the assumption the control exists, which is the opposite of what we assert.
    await proceedToResultStep(catering);
    await expect(
      catering.getByRole('button', {
        name: /Proceed to checkout with selected date and time/i,
      }),
    ).toBeHidden({ timeout: 10000 });
  });

  // ── Flow: Cart + Checkout ──

  test('Check Availability - Proceed to Checkout with cart navigates to checkout page', async () => {
    // Add an item to cart from the Menu page
    await navigateK12CateringMenu(catering, 'Menu');
    await catering.waitForLoadState('domcontentloaded');

    const cardAddToCart = catering
      .locator('#main-content')
      .getByRole('button', { name: 'Add to Cart' })
      .first();
    await expect(cardAddToCart).toBeVisible({ timeout: 10000 });
    await cardAddToCart.click();

    const modal = catering.locator('div.fixed.inset-0');
    await expect(catering.getByRole('heading', { name: 'Add to Cart' })).toBeVisible({ timeout: 10000 });
    await modal.getByRole('button', { name: 'Add to Cart' }).click();
    await expect(modal).not.toBeVisible({ timeout: 10000 });

    // Navigate to Check Availability and complete the date → time → result flow
    await navigateK12CateringMenu(catering, 'Check Availability');
    await catering.waitForLoadState('domcontentloaded');

    await proceedToResultStep(catering);

    // With cart, Proceed to Checkout goes to /checkout
    await (await resultStepControl(catering, /Proceed to checkout with selected date and time/i)).click();
    await expect(catering).toHaveURL(/\/checkout/, { timeout: 15000 });
  });
});
