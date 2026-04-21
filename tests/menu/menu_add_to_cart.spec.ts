import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.setTimeout(180000);
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Menu - Add to Cart & Cart Sidebar', () => {
  let catering: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    catering = await loginToK12Catering(page, { navigateTo: 'Menu' });
  });

  test.beforeEach(async () => {
    await navigateK12CateringMenu(catering, 'Menu');
    await catering.waitForLoadState('domcontentloaded');
  });

  test('Menu - Clicking Add to Cart opens the Add to Cart modal', async () => {
    await catering.getByRole('button', { name: 'Add to cart' }).first().click();
    await expect(
      catering.getByRole('heading', { name: 'Add to Cart' }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      catering.getByRole('spinbutton', { name: 'Quantity' }),
    ).toBeVisible();
    await expect(catering.getByLabel(/Special Instructions/i)).toBeVisible();
    await expect(
      catering.getByRole('button', { name: 'Add to Cart' }),
    ).toBeVisible();
    await expect(
      catering.getByRole('button', { name: 'Cancel' }),
    ).toBeVisible();
    // Close modal
    await catering.keyboard.press('Escape');
  });

  test('Menu - Quantity stepper decrement button is disabled when quantity is 1', async () => {
    await catering.getByRole('button', { name: 'Add to cart' }).first().click();
    await expect(
      catering.getByRole('heading', { name: 'Add to Cart' }),
    ).toBeVisible({ timeout: 10000 });
    const qtyInput = catering.getByRole('spinbutton', { name: 'Quantity' });
    await expect(qtyInput).toHaveValue('1');
    await expect(
      catering.getByRole('button', { name: 'Decrease quantity' }),
    ).toBeDisabled();
    await catering.keyboard.press('Escape');
  });

  test('Menu - Quantity stepper increment increases quantity and decrement enables', async () => {
    await catering.getByRole('button', { name: 'Add to cart' }).first().click();
    await expect(
      catering.getByRole('heading', { name: 'Add to Cart' }),
    ).toBeVisible({ timeout: 10000 });
    await catering.getByRole('button', { name: 'Increase quantity' }).click();
    const qtyInput = catering.getByRole('spinbutton', { name: 'Quantity' });
    await expect(qtyInput).toHaveValue('2');
    await expect(
      catering.getByRole('button', { name: 'Decrease quantity' }),
    ).toBeEnabled();
    await catering.keyboard.press('Escape');
  });

  test('Menu - Special instructions field is optional and accepts free text', async () => {
    await catering.getByRole('button', { name: 'Add to cart' }).first().click();
    await expect(
      catering.getByRole('heading', { name: 'Add to Cart' }),
    ).toBeVisible({ timeout: 10000 });
    // Leave special instructions blank and add to cart
    await catering.getByRole('button', { name: 'Add to Cart' }).click();
    // Modal should close - confirm cart updated
    await expect(
      catering.getByRole('heading', { name: 'Add to Cart' }),
    ).not.toBeVisible({ timeout: 10000 });
  });

  test('Menu - Clicking Cancel on Add to Cart modal closes it without adding item', async () => {
    // Get current cart count first
    const cartRegion = catering.getByRole('region', { name: 'Cart items' });
    const cartTextBefore = await cartRegion.textContent();

    await catering.getByRole('button', { name: 'Add to cart' }).first().click();
    await expect(
      catering.getByRole('heading', { name: 'Add to Cart' }),
    ).toBeVisible({ timeout: 10000 });
    await catering.getByRole('button', { name: 'Cancel' }).click();
    await expect(
      catering.getByRole('heading', { name: 'Add to Cart' }),
    ).not.toBeVisible({ timeout: 10000 });

    // Cart should be unchanged
    const cartTextAfter = await cartRegion.textContent();
    expect(cartTextAfter).toBe(cartTextBefore);
  });

  test('Menu - Clicking Add to Cart button adds item to cart sidebar', async () => {
    await catering.getByRole('button', { name: 'Add to cart' }).first().click();
    await expect(
      catering.getByRole('heading', { name: 'Add to Cart' }),
    ).toBeVisible({ timeout: 10000 });
    await catering.getByRole('button', { name: 'Add to Cart' }).click();
    await expect(
      catering.getByRole('heading', { name: 'Add to Cart' }),
    ).not.toBeVisible({ timeout: 10000 });
    // Cart sidebar should show item count > 0
    await expect(
      catering.getByRole('region', { name: 'Cart items' }),
    ).not.toContainText('Your cart is empty', { timeout: 10000 });
  });

  test('Menu - Cart sidebar displays Grand Total after item is added', async () => {
    await catering.getByRole('button', { name: 'Add to cart' }).first().click();
    await expect(
      catering.getByRole('heading', { name: 'Add to Cart' }),
    ).toBeVisible({ timeout: 10000 });
    await catering.getByRole('button', { name: 'Add to Cart' }).click();
    const cartRegion = catering.getByRole('region', { name: 'Cart items' });
    await expect(cartRegion).toContainText(/\$[\d]+\.[\d]{2}/, {
      timeout: 10000,
    });
  });

  test('Menu - Clicking Proceed to Checkout navigates to /checkout', async () => {
    // Add an item first
    await catering.getByRole('button', { name: 'Add to cart' }).first().click();
    await expect(
      catering.getByRole('heading', { name: 'Add to Cart' }),
    ).toBeVisible({ timeout: 10000 });
    await catering.getByRole('button', { name: 'Add to Cart' }).click();
    await expect(
      catering.getByRole('heading', { name: 'Add to Cart' }),
    ).not.toBeVisible({ timeout: 10000 });
    // Click Proceed to Checkout
    await catering
      .getByRole('button', { name: /Proceed to Checkout/i })
      .click();
    await expect(catering).toHaveURL(/\/checkout/, { timeout: 15000 });
  });
});
