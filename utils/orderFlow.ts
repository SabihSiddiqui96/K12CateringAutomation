import { expect, Page } from '@playwright/test';
import { navigateK12CateringMenu } from './helpers';

const checkoutProgramNameInput = '#checkout-program-name-input';
const checkoutAccountingStringInput = '#checkout-accounting-string-input';
const eventStartTimeInput = '#start-time-input';
const eventEndTimeInput = '#end-time-input';
const setupTimeInput = '#setup-time-input';

function addToCartModal(page: Page) {
  return page.locator('div.fixed.inset-0').filter({
    has: page.getByRole('heading', { name: /^Add to Cart$/i }),
  }).first();
}

async function clickNext(page: Page): Promise<void> {
  const nextButton = page.getByRole('button', { name: /^Next$/i });
  await nextButton.scrollIntoViewIfNeeded();
  await expect(nextButton).toBeVisible({ timeout: 10000 });
  await expect(nextButton).toBeEnabled({ timeout: 10000 });
  await nextButton.click();
}

async function pickTimeAndConfirm(page: Page, selector: string): Promise<void> {
  const input = page.locator(selector);
  if (!(await input.isVisible({ timeout: 5000 }).catch(() => false))) {
    return;
  }

  await input.scrollIntoViewIfNeeded();
  await input.click();

  const okButton = page.getByRole('button', { name: /^OK$/i });
  if (await okButton.isVisible({ timeout: 5000 }).catch(() => false)) {
    await okButton.click();
  }
}

async function selectFirstContactCardInSection(
  page: Page,
  sectionHeading: RegExp | string,
): Promise<void> {
  const heading = page.getByRole('heading', { name: sectionHeading }).first();
  await expect(heading).toBeVisible({ timeout: 10000 });

  const section = heading.locator(
    'xpath=ancestor::div[contains(@class,"space-y-3")][1]',
  );
  const contactCard = section.locator('article').first();

  await contactCard.scrollIntoViewIfNeeded();
  await expect(contactCard).toBeVisible({ timeout: 10000 });
  await contactCard.click();
}

async function selectAvailableEventDate(page: Page): Promise<void> {
  const dateButton = page.getByRole('button', { name: /Select Event Date/i });
  await dateButton.scrollIntoViewIfNeeded();
  await expect(dateButton).toBeVisible({ timeout: 20000 });
  await dateButton.click();

  await expect(
    page.getByRole('button', { name: /Previous month/i }),
  ).toBeVisible({ timeout: 10000 });

  const nextMonthButton = page.getByRole('button', { name: /Next month/i });

  for (let monthAttempt = 0; monthAttempt < 4; monthAttempt++) {
    const dateButtons = await page
      .locator('button[aria-label*=","]:not([disabled])')
      .all();

    for (const button of dateButtons) {
      const label = (await button.getAttribute('aria-label')) ?? '';
      if (!/\w+\s+\d{1,2},\s+\d{4}/.test(label)) continue;
      if (/month|year|cancel|confirm|close/i.test(label)) continue;

      const dateMatch = label.match(/(\w+\s+\d{1,2},\s+\d{4})/);
      if (dateMatch) {
        const day = new Date(dateMatch[1]).getDay();
        if (day === 0 || day === 6) continue;
      }

      await button.click({ force: true });
      await page.waitForTimeout(300);

      const confirmButton = page.getByRole('button', {
        name: /Confirm date selection/i,
      });
      if (await confirmButton.isVisible({ timeout: 1000 }).catch(() => false)) {
        await confirmButton.click();
      }

      const unavailable = await page
        .getByText(/not available for events/i)
        .isVisible({ timeout: 1000 })
        .catch(() => false);

      if (!unavailable) return;
    }

    if (await nextMonthButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await nextMonthButton.click();
      await page.waitForTimeout(500);
    }
  }

  throw new Error('Could not find an available checkout event date.');
}

export async function addFirstMenuItemToCart(page: Page): Promise<void> {
  await navigateK12CateringMenu(page, 'Menu');
  await page.waitForLoadState('domcontentloaded');
  await page
    .getByText(/Loading Menu/i)
    .waitFor({ state: 'hidden', timeout: 30000 })
    .catch(() => {});

  const addToCartButton = page
    .locator('#main-content')
    .getByRole('button', { name: /^Add to Cart$/i })
    .first();

  await addToCartButton.scrollIntoViewIfNeeded();
  await expect(addToCartButton).toBeVisible({ timeout: 15000 });
  await addToCartButton.click();

  const modal = addToCartModal(page);
  await expect(modal).toBeVisible({ timeout: 10000 });

  const modalAddToCart = modal.getByRole('button', {
    name: /^Add to Cart$/i,
  });
  await expect(modalAddToCart).toBeEnabled({ timeout: 10000 });
  await modalAddToCart.click();
  await expect(modal).toBeHidden({ timeout: 10000 });

  await expect(page.getByRole('region', { name: /Cart items/i })).not.toContainText(
    'Your cart is empty',
    { timeout: 10000 },
  );
}

export async function proceedToCheckout(page: Page): Promise<void> {
  const proceedButton = page.getByRole('button', {
    name: /Proceed to Checkout/i,
  });

  await expect(proceedButton).toBeVisible({ timeout: 10000 });
  await expect(proceedButton).toBeEnabled({ timeout: 10000 });
  await proceedButton.click();
  await expect(page).toHaveURL(/\/checkout/i, { timeout: 15000 });
}

export async function placeBasicCheckoutOrder(page: Page): Promise<void> {
  await addFirstMenuItemToCart(page);
  await proceedToCheckout(page);

  await selectAvailableEventDate(page);
  await clickNext(page);

  await pickTimeAndConfirm(page, eventStartTimeInput);
  await pickTimeAndConfirm(page, eventEndTimeInput);
  await clickNext(page);

  await pickTimeAndConfirm(page, setupTimeInput);
  await clickNext(page);

  if (
    await page
      .getByRole('button', { name: /Select from Address Book/i })
      .isVisible({ timeout: 5000 })
      .catch(() => false)
  ) {
    await page.getByRole('button', { name: /Select from Address Book/i }).click();
  }

  if (
    await page
      .getByRole('heading', { name: /Select Contact/i })
      .isVisible({ timeout: 5000 })
      .catch(() => false)
  ) {
    await selectFirstContactCardInSection(page, /Select Contact/i);
  }

  await clickNext(page);

  const guestsInput = page.locator('#num-guests-input');
  if (await guestsInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await guestsInput.fill('2');
  }
  await clickNext(page);

  const programNameInput = page.locator(checkoutProgramNameInput);
  if (await programNameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await programNameInput.scrollIntoViewIfNeeded();
    await programNameInput.fill('Automation Program');
  }

  const accountingStringInput = page.locator(checkoutAccountingStringInput);
  if (await accountingStringInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await accountingStringInput.scrollIntoViewIfNeeded();
    await accountingStringInput.fill('AUTO-123');
  }

  if (
    await page
      .getByRole('heading', { name: /Select Payment Contact/i })
      .isVisible({ timeout: 5000 })
      .catch(() => false)
  ) {
    await selectFirstContactCardInSection(page, /Select Payment Contact/i);
  }

  await clickNext(page);

  const agreement = page
    .getByText(/I acknowledge and agree to the terms/i)
    .first();
  await agreement.scrollIntoViewIfNeeded();
  await expect(agreement).toBeVisible({ timeout: 10000 });
  await agreement.click();

  const placeOrderButton = page.getByRole('button', { name: /Place Order/i });
  await placeOrderButton.scrollIntoViewIfNeeded();
  await expect(placeOrderButton).toBeEnabled({ timeout: 10000 });
  await placeOrderButton.click();

  await Promise.race([
    page
      .getByText(/Order Placed Successfully/i)
      .waitFor({ state: 'visible', timeout: 20000 })
      .catch(() => null),
    page
      .getByRole('heading', { name: /Order Management/i })
      .waitFor({ state: 'visible', timeout: 20000 }),
  ]);
}
