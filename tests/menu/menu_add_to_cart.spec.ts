import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

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

  // Helpers scoped to avoid ambiguity
  const cardAddToCart = () =>
    catering
      .locator('#main-content')
      .getByRole('button', { name: 'Add to Cart' })
      .first();
  const modal = () => catering.locator('div.fixed.inset-0');
  const modalAddToCart = () =>
    modal().getByRole('button', { name: 'Add to Cart' });
  const modalCancel = () => modal().getByRole('button', { name: 'Cancel' });
  const modalClose = () => modal().getByRole('button', { name: 'Close modal' });

  test('Menu - Clicking Add to Cart opens the Add to Cart modal', async () => {
    await cardAddToCart().click();
    await expect(
      catering.getByRole('heading', { name: 'Add to Cart' }),
    ).toBeVisible({ timeout: 10000 });
    await expect(catering.locator('#quantity-input')).toBeVisible();
    await expect(catering.locator('#special-instructions-input')).toBeVisible();
    await expect(modalAddToCart()).toBeVisible();
    await expect(modalCancel()).toBeVisible();
    await modalClose().click();
    await expect(modal()).not.toBeVisible({ timeout: 5000 });
  });

  test('Menu - Quantity stepper decrement button is disabled when quantity is 1', async () => {
    await cardAddToCart().click();
    await expect(
      catering.getByRole('heading', { name: 'Add to Cart' }),
    ).toBeVisible({ timeout: 10000 });
    await expect(catering.locator('#quantity-input')).toHaveValue('1');
    await expect(
      catering.getByRole('button', { name: 'Decrease quantity' }),
    ).toBeDisabled();
    await modalClose().click();
  });

  test('Menu - Quantity stepper increment increases quantity and enables decrement', async () => {
    await cardAddToCart().click();
    await expect(
      catering.getByRole('heading', { name: 'Add to Cart' }),
    ).toBeVisible({ timeout: 10000 });
    await catering.getByRole('button', { name: 'Increase quantity' }).click();
    await expect(catering.locator('#quantity-input')).toHaveValue('2');
    await expect(
      catering.getByRole('button', { name: 'Decrease quantity' }),
    ).toBeEnabled();
    await modalClose().click();
  });

  test('Menu - Special instructions field is optional and accepts free text', async () => {
    await cardAddToCart().click();
    await expect(
      catering.getByRole('heading', { name: 'Add to Cart' }),
    ).toBeVisible({ timeout: 10000 });
    // Leave special instructions blank and submit
    await modalAddToCart().click();
    await expect(modal()).not.toBeVisible({ timeout: 10000 });
  });

  test('Menu - Clicking Cancel closes the modal without adding item', async () => {
    const cartRegion = catering.getByRole('region', { name: 'Cart items' });
    const cartTextBefore = await cartRegion.textContent();

    await cardAddToCart().click();
    await expect(
      catering.getByRole('heading', { name: 'Add to Cart' }),
    ).toBeVisible({ timeout: 10000 });
    await modalCancel().click();
    await expect(modal()).not.toBeVisible({ timeout: 10000 });

    const cartTextAfter = await cartRegion.textContent();
    expect(cartTextAfter).toBe(cartTextBefore);
  });

  test('Menu - Clicking Add to Cart button adds item to cart sidebar', async () => {
    await cardAddToCart().click();
    await expect(
      catering.getByRole('heading', { name: 'Add to Cart' }),
    ).toBeVisible({ timeout: 10000 });
    await modalAddToCart().click();
    await expect(modal()).not.toBeVisible({ timeout: 10000 });
    await expect(
      catering.getByRole('region', { name: 'Cart items' }),
    ).not.toContainText('Your cart is empty', { timeout: 10000 });
  });

  test('Menu - Cart sidebar displays Grand Total after item is added', async () => {
    await cardAddToCart().click();
    await expect(
      catering.getByRole('heading', { name: 'Add to Cart' }),
    ).toBeVisible({ timeout: 10000 });
    await modalAddToCart().click();
    await expect(modal()).not.toBeVisible({ timeout: 10000 });
    // Grand Total is in the sidebar but outside the cart items region — scope to full sidebar
    await expect(
      catering.locator('div.w-80.p-5.rounded-xl.fixed'),
    ).toContainText(/Grand Total:/, { timeout: 10000 });
  });

  test('Menu - Clicking Proceed to Checkout navigates to /checkout', async () => {
    await cardAddToCart().click();
    await expect(
      catering.getByRole('heading', { name: 'Add to Cart' }),
    ).toBeVisible({ timeout: 10000 });
    await modalAddToCart().click();
    await expect(modal()).not.toBeVisible({ timeout: 10000 });
    await catering.getByRole('button', { name: 'Proceed to Checkout' }).click();
    await expect(catering).toHaveURL(/\/checkout/, { timeout: 15000 });
  });
});
