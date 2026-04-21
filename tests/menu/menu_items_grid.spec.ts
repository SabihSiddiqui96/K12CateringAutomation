import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.setTimeout(180000);
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Menu - Menu Items Grid', () => {
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

  // Cards are div.group.rounded-xl in both grid and list view
  const cardLocator = () =>
    catering.locator('#main-content div.group.rounded-xl');

  test('Each menu item card displays name, price, and Add to Cart button', async () => {
    const firstCard = cardLocator().first();
    await expect(firstCard).toBeVisible({ timeout: 15000 });

    // Name is an h3
    await expect(firstCard.locator('h3')).toBeVisible();

    // Price formatted as currency e.g. $2.00
    await expect(
      firstCard.locator('div.text-xl.font-bold.text-green-700'),
    ).toContainText(/\$[\d]+\.[\d]{2}/);

    // Add to Cart button
    await expect(
      firstCard.getByRole('button', { name: 'Add to Cart' }),
    ).toBeVisible();
  });

  test('Each menu item in List view displays name, price, and Add to Cart button', async () => {
    await catering.getByRole('button', { name: 'Switch to list view' }).click();
    await catering.waitForTimeout(500);

    const firstCard = cardLocator().first();
    await expect(firstCard).toBeVisible({ timeout: 15000 });

    await expect(firstCard.locator('h3')).toBeVisible();
    await expect(
      firstCard.locator('div.text-xl.font-bold.text-green-700'),
    ).toContainText(/\$[\d]+\.[\d]{2}/);
    await expect(
      firstCard.getByRole('button', { name: 'Add to Cart' }),
    ).toBeVisible();

    // Switch back to grid
    await catering.getByRole('button', { name: 'Switch to grid view' }).click();
  });

  test('Edit and Delete buttons are visible on each item card', async () => {
    const firstCard = cardLocator().first();
    await expect(firstCard).toBeVisible({ timeout: 15000 });

    // Edit button aria-label = "Edit [name] menu item"
    const editBtn = firstCard.getByRole('button', {
      name: /Edit .* menu item/,
    });
    await expect(editBtn).toBeVisible();

    // Delete button aria-label = "Delete [name] menu item"
    const deleteBtn = firstCard.getByRole('button', {
      name: /Delete .* menu item/,
    });
    await expect(deleteBtn).toBeVisible();
  });

  test('Multiple item cards are displayed on the page', async () => {
    await expect(cardLocator().first()).toBeVisible({ timeout: 15000 });
    const count = await cardLocator().count();
    expect(count).toBeGreaterThan(1);
  });
});
