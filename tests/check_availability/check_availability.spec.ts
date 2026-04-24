import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.use({ storageState: { cookies: [], origins: [] } });

async function resetToStep1(page: Page): Promise<void> {
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

async function proceedToResultStep(page: Page): Promise<void> {
  await proceedToTimeStep(page);
  const timeBtn = page.getByRole('button', { name: /Select .+ for event setup/i }).first();
  await expect(timeBtn).toBeVisible({ timeout: 10000 });
  await timeBtn.click();
  await page.waitForTimeout(1000);
}

test.describe('Check Availability', () => {
  let catering: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    catering = await loginToK12Catering(page);
  });

  test.beforeEach(async () => {
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

  test('Check Availability - Result step shows Browse Menu and Proceed to Checkout buttons', async () => {
    await proceedToResultStep(catering);

    await expect(
      catering.getByRole('button', { name: /Browse available menu items/i }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      catering.getByRole('button', { name: /Proceed to checkout with selected date and time/i }),
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

  test('Check Availability - Proceed to Checkout without cart navigates to menu page', async () => {
    await proceedToResultStep(catering);
    await catering.getByRole('button', { name: /Proceed to checkout with selected date and time/i }).click();
    await expect(catering).toHaveURL(/\/menu/i, { timeout: 10000 });
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
    await catering.getByRole('button', { name: /Proceed to checkout with selected date and time/i }).click();
    await expect(catering).toHaveURL(/\/checkout/, { timeout: 15000 });
  });
});
