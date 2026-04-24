import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Menu - Browse, Search & Cart', () => {
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

  const card = () => catering.locator('#main-content div.group.rounded-xl');
  const cardAddToCart = () => catering.locator('#main-content').getByRole('button', { name: 'Add to Cart' }).first();
  const modal = () => catering.locator('div.fixed.inset-0');
  const modalAddToCart = () => modal().getByRole('button', { name: 'Add to Cart' });
  const modalClose = () => modal().getByRole('button', { name: 'Close modal' });

  test('Menu - Page header, all controls and grid/list view toggle are visible', async () => {
    await expect(catering.getByRole('heading', { name: 'Menu', exact: true })).toBeVisible({ timeout: 15000 });
    await expect(catering.getByRole('textbox', { name: 'Search menu items' })).toBeVisible();
    await expect(catering.getByRole('button', { name: 'Select category filter' })).toBeVisible();
    await expect(catering.getByRole('button', { name: 'Select allergen filter' })).toBeVisible();
    await expect(catering.getByRole('button', { name: 'Show advanced filters' })).toBeVisible();
    await expect(catering.getByRole('button', { name: 'Switch to grid view' })).toHaveAttribute('aria-pressed', 'true');
    await catering.getByRole('button', { name: 'Switch to list view' }).click();
    await expect(catering.getByRole('button', { name: 'Switch to list view' })).toHaveAttribute('aria-pressed', 'true');
    await catering.getByRole('button', { name: 'Switch to grid view' }).click();
  });

  test('Menu - Item cards display name, price, Add to Cart, Edit and Delete buttons', async () => {
    const firstCard = card().first();
    await expect(firstCard).toBeVisible({ timeout: 15000 });
    await expect(firstCard.locator('h3')).toBeVisible();
    await expect(firstCard.locator('div.text-xl.font-bold.text-green-700')).toContainText(/\$[\d]+\.[\d]{2}/);
    await expect(firstCard.getByRole('button', { name: 'Add to Cart' })).toBeVisible();
    await expect(firstCard.getByRole('button', { name: /Edit .* menu item/ })).toBeVisible();
    await expect(firstCard.getByRole('button', { name: /Delete .* menu item/ })).toBeVisible();

    const count = await card().count();
    expect(count).toBeGreaterThan(1);
  });

  test('Menu - Search by name, clear, and category/allergen filters work', async () => {
    const searchInput = catering.getByRole('textbox', { name: 'Search menu items' });
    await searchInput.fill('coffee');
    await catering.waitForTimeout(500);
    expect((await catering.locator('main[aria-label="Main content"]').textContent())?.toLowerCase()).toContain('coffee');

    await searchInput.clear();
    await catering.waitForTimeout(500);
    await expect(catering.locator('h2, h3').filter({ hasText: /\d+ items?/ }).first()).toBeVisible({ timeout: 10000 });

    await catering.getByRole('button', { name: 'Select category filter' }).click();
    await catering.getByRole('option', { name: 'Drink' }).click();
    await catering.waitForTimeout(500);
    await expect(catering.getByRole('heading', { name: /Drink/i })).toBeVisible({ timeout: 10000 });

    await catering.getByRole('button', { name: 'Select allergen filter' }).click();
    await catering.getByRole('option').nth(1).click();
    await catering.waitForTimeout(500);
    await expect(catering.getByRole('heading', { name: 'Menu', exact: true })).toBeVisible({ timeout: 10000 });
  });

  test('Menu - Add to Cart modal opens with quantity stepper and confirms add to cart', async () => {
    await cardAddToCart().click();
    await expect(catering.getByRole('heading', { name: 'Add to Cart' })).toBeVisible({ timeout: 10000 });
    await expect(catering.locator('#quantity-input')).toHaveValue('1');
    await expect(catering.getByRole('button', { name: 'Decrease quantity' })).toBeDisabled();

    await catering.getByRole('button', { name: 'Increase quantity' }).click();
    await expect(catering.locator('#quantity-input')).toHaveValue('2');
    await expect(catering.getByRole('button', { name: 'Decrease quantity' })).toBeEnabled();

    await modalClose().click();
    await expect(modal()).not.toBeVisible({ timeout: 5000 });
  });

  test('Menu - Cancel closes modal without adding; confirm adds item to cart and shows Grand Total', async () => {
    const cartRegion = catering.getByRole('region', { name: 'Cart items' });
    const cartTextBefore = await cartRegion.textContent();

    await cardAddToCart().click();
    await expect(catering.getByRole('heading', { name: 'Add to Cart' })).toBeVisible({ timeout: 10000 });
    await modal().getByRole('button', { name: 'Cancel' }).click();
    await expect(modal()).not.toBeVisible({ timeout: 10000 });
    expect(await cartRegion.textContent()).toBe(cartTextBefore);

    await cardAddToCart().click();
    await expect(catering.getByRole('heading', { name: 'Add to Cart' })).toBeVisible({ timeout: 10000 });
    await modalAddToCart().click();
    await expect(modal()).not.toBeVisible({ timeout: 10000 });
    await expect(cartRegion).not.toContainText('Your cart is empty', { timeout: 10000 });
    await expect(catering.locator('div.w-80.p-5.rounded-xl.fixed')).toContainText(/Grand Total:/, { timeout: 10000 });
  });

  test('Menu - Proceed to Checkout navigates to /checkout', async () => {
    await cardAddToCart().click();
    await expect(catering.getByRole('heading', { name: 'Add to Cart' })).toBeVisible({ timeout: 10000 });
    await modalAddToCart().click();
    await expect(modal()).not.toBeVisible({ timeout: 10000 });
    await catering.getByRole('button', { name: 'Proceed to Checkout' }).click();
    await expect(catering).toHaveURL(/\/checkout/, { timeout: 15000 });
  });
});
