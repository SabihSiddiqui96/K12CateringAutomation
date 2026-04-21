import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.setTimeout(180000);
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Guest Menu - Items Grid', () => {
  let catering: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    catering = await loginToK12Catering(page);
  });

  test.beforeEach(async () => {
    await catering.getByRole('button', { name: 'Go to home page' }).click();
    await catering.waitForLoadState('domcontentloaded');
    await navigateK12CateringMenu(catering, 'Guest Menu');
    await catering.waitForLoadState('domcontentloaded');
  });

  test('Guest Menu - Item cards display name, description, and district chip', async () => {
    await expect(
      catering.getByRole('article', { name: 'Menu item: apple juice' }),
    ).toBeVisible({ timeout: 10000 });
    await expect(catering.getByText('Mercer').first()).toBeVisible();
  });

  test('Guest Menu - Item cards display allergen information', async () => {
    const allergenLabels = catering.getByText('Allergens:');
    await expect(allergenLabels.first()).toBeVisible({ timeout: 10000 });
    const count = await allergenLabels.count();
    expect(count).toBeGreaterThan(0);
  });

  test('Guest Menu - Item cards show serves and minimum order quantities', async () => {
    await expect(catering.getByText('Serves:').first()).toBeVisible({
      timeout: 10000,
    });
    await expect(catering.getByText('Min Order:').first()).toBeVisible();
  });

  test('Guest Menu - Item cards display price and Guest viewing badge', async () => {
    await expect(catering.getByText('Guest viewing').first()).toBeVisible({
      timeout: 10000,
    });
    await expect(
      catering
        .locator('article')
        .filter({ hasText: /\$\d+\.\d{2}/ })
        .first(),
    ).toBeVisible();
  });

  test('Guest Menu - Items with multiple varieties display a Varieties chip', async () => {
    await expect(catering.getByText('Varieties').first()).toBeVisible({
      timeout: 10000,
    });
  });
});
