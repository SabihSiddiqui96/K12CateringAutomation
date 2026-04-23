import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Menu - Page Header & Layout', () => {
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

  test('Page header and all controls are visible', async () => {
    await expect(
      catering.getByRole('heading', { name: 'Menu', exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      catering.getByRole('textbox', { name: 'Search menu items' }),
    ).toBeVisible();
    await expect(
      catering.getByRole('button', { name: 'Select category filter' }),
    ).toBeVisible();
    await expect(
      catering.getByRole('button', { name: 'Select allergen filter' }),
    ).toBeVisible();
    await expect(
      catering.getByRole('button', { name: 'Show advanced filters' }),
    ).toBeVisible();
    await expect(
      catering.getByRole('button', { name: 'Switch to grid view' }),
    ).toBeVisible();
    await expect(
      catering.getByRole('button', { name: 'Switch to list view' }),
    ).toBeVisible();
  });

  test('Grid view is active by default, switching to List view toggles the layout', async () => {
    // Grid is active by default
    await expect(
      catering.getByRole('button', { name: 'Switch to grid view' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      catering.getByRole('button', { name: 'Switch to list view' }),
    ).toHaveAttribute('aria-pressed', 'false');

    // Switch to list view
    await catering.getByRole('button', { name: 'Switch to list view' }).click();
    await expect(
      catering.getByRole('button', { name: 'Switch to list view' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      catering.getByRole('button', { name: 'Switch to grid view' }),
    ).toHaveAttribute('aria-pressed', 'false');
  });
});
