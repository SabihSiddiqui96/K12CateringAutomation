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

    const clearFiltersButton = catering.getByRole('button', {
      name: /Clear All/i,
    });
    if (await clearFiltersButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await clearFiltersButton.click();
      await catering.waitForTimeout(300);
    }

    const searchInput = catering.getByRole('textbox', {
      name: 'Search menu items',
    });
    if (await searchInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await searchInput.clear();
    }
  });

  const card = () => catering.locator('#main-content div.group.rounded-xl');
  const cardAddToCart = () =>
    catering.locator('#main-content').getByRole('button', { name: 'Add to Cart' }).first();
  const modal = () => catering.locator('div.fixed.inset-0');
  const modalAddToCart = () => modal().getByRole('button', { name: 'Add to Cart' });
  const modalClose = () => modal().getByRole('button', { name: 'Close modal' });

  async function openFirstAddToCartModal() {
    const addToCartButton = cardAddToCart();
    await addToCartButton.scrollIntoViewIfNeeded();
    await expect(addToCartButton).toBeVisible({ timeout: 10000 });
    await addToCartButton.click();
  }

  test('Menu - Page header, all controls and grid/list view toggle are visible', async () => {
    await expect(catering.getByRole('heading', { name: 'Menu', exact: true })).toBeVisible({ timeout: 15000 });
    await expect(catering.getByRole('textbox', { name: 'Search menu items' })).toBeVisible();
    // Filter triggers are now #category-select / #allergen-select (they show the
    // current value as text, e.g. "All"; were "Select category/allergen filter").
    await expect(catering.locator('#category-select')).toBeVisible();
    await expect(catering.locator('#allergen-select')).toBeVisible();
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
    // Search for a term that actually exists in this catalog (derived from the
    // first card) — a hardcoded word like "coffee" goes stale as the menu changes.
    const firstItemName = ((await card().first().locator('h3').first().textContent()) ?? '').trim();
    expect(firstItemName.length, 'a menu item card should be present to search').toBeGreaterThan(0);
    const term = firstItemName.split(/\s+/).find((w) => w.length >= 4) ?? firstItemName;
    await searchInput.fill(term);
    await catering.waitForTimeout(800);
    expect((await catering.locator('#main-content').textContent())?.toLowerCase()).toContain(term.toLowerCase());

    await searchInput.clear();
    await catering.waitForTimeout(500);
    await expect(catering.locator('h2, h3').filter({ hasText: /\d+ items?/ }).first()).toBeVisible({ timeout: 10000 });

    await catering.locator('#category-select').click();
    const categoryOptions = catering.getByRole('option');
    await expect(categoryOptions.first()).toBeVisible({ timeout: 5000 });
    const allOptionTexts = await categoryOptions.allTextContents();
    const realCategory = allOptionTexts.map(t => t.trim()).find(t => t && !/^all$/i.test(t)) ?? '';
    await catering.getByRole('option', { name: new RegExp(`^${realCategory}$`, 'i') }).first().click();
    await catering.waitForTimeout(500);
    await expect(catering.getByRole('heading', { name: new RegExp(realCategory, 'i') })).toBeVisible({ timeout: 10000 });

    await catering.locator('#allergen-select').click();
    await catering.getByRole('option').nth(1).click();
    await catering.waitForTimeout(500);
    await expect(catering.getByRole('heading', { name: 'Menu', exact: true })).toBeVisible({ timeout: 10000 });
  });

  test('Menu - Add to Cart modal opens with quantity stepper and confirms add to cart', async () => {
    await openFirstAddToCartModal();
    await expect(catering.getByRole('heading', { name: 'Add to Cart' })).toBeVisible({ timeout: 10000 });

    const qty = catering.locator('#quantity-input');
    const decrease = catering.getByRole('button', { name: 'Decrease quantity' });
    const increase = catering.getByRole('button', { name: 'Increase quantity' });

    // The item may already be in the cart from prior runs (the modal pre-fills the
    // existing quantity), so drive the stepper down to the minimum first — that's
    // where Decrease must be disabled — instead of assuming it opens at 1.
    for (let i = 0; i < 60 && (await decrease.isEnabled().catch(() => false)); i++) {
      await decrease.click();
    }
    await expect(qty).toHaveValue('1');
    await expect(decrease).toBeDisabled();

    await increase.click();
    await expect(qty).toHaveValue('2');
    await expect(decrease).toBeEnabled();

    await modalClose().click();
    await expect(modal()).not.toBeVisible({ timeout: 5000 });
  });

  test('Menu - Cancel closes modal without adding; confirm adds item to cart and shows Grand Total', async () => {
    const cartRegion = catering.getByRole('region', { name: 'Cart items' });
    const cartTextBefore = await cartRegion.textContent();

    await openFirstAddToCartModal();
    await expect(catering.getByRole('heading', { name: 'Add to Cart' })).toBeVisible({ timeout: 10000 });
    await modal().getByRole('button', { name: 'Cancel' }).click();
    await expect(modal()).not.toBeVisible({ timeout: 10000 });
    expect(await cartRegion.textContent()).toBe(cartTextBefore);

    await openFirstAddToCartModal();
    await expect(catering.getByRole('heading', { name: 'Add to Cart' })).toBeVisible({ timeout: 10000 });
    await modalAddToCart().click();
    await expect(modal()).not.toBeVisible({ timeout: 10000 });
    await expect(cartRegion).not.toContainText('Your cart is empty', { timeout: 10000 });
    await expect(catering.locator('div.w-80.p-5.rounded-xl.fixed')).toContainText(/Grand Total:/, { timeout: 10000 });
  });

  test('Menu - Proceed to Checkout navigates to /checkout', async () => {
    await openFirstAddToCartModal();
    await expect(catering.getByRole('heading', { name: 'Add to Cart' })).toBeVisible({ timeout: 10000 });
    await modalAddToCart().click();
    await expect(modal()).not.toBeVisible({ timeout: 10000 });
    await catering.getByRole('button', { name: 'Proceed to Checkout' }).click();
    await expect(catering).toHaveURL(/\/checkout/, { timeout: 15000 });
  });
});
