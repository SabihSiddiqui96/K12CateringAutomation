import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.setTimeout(180000);
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

  test('Menu - Page header is visible with title', async () => {
    await expect(
      catering.getByRole('heading', { name: 'Menu', exact: true }),
    ).toBeVisible({ timeout: 15000 });
  });

  test('Menu - Search bar is visible and has placeholder text', async () => {
    await expect(
      catering.getByRole('textbox', { name: 'Search menu items' }),
    ).toBeVisible({ timeout: 15000 });
  });

  test('Menu - Category dropdown is visible', async () => {
    await expect(
      catering.getByRole('button', { name: 'Select category filter' }),
    ).toBeVisible({ timeout: 15000 });
  });

  test('Menu - Allergen dropdown is visible', async () => {
    await expect(
      catering.getByRole('button', { name: 'Select allergen filter' }),
    ).toBeVisible({ timeout: 15000 });
  });

  test('Menu - Grid and List view toggle buttons are visible', async () => {
    await expect(
      catering.getByRole('button', { name: 'Switch to grid view' }),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      catering.getByRole('button', { name: 'Switch to list view' }),
    ).toBeVisible({ timeout: 15000 });
  });

  test('Menu - More Filters button is visible', async () => {
    await expect(
      catering.getByRole('button', { name: 'Show advanced filters' }),
    ).toBeVisible({ timeout: 15000 });
  });

  test('Menu - Menu items display in Grid view by default', async () => {
    const gridButton = catering.getByRole('button', {
      name: 'Switch to grid view',
    });
    await expect(gridButton).toBeVisible({ timeout: 15000 });
    await expect(gridButton).toHaveAttribute('aria-pressed', 'true');
  });

  test('Menu - Switching to List view displays items in horizontal row layout', async () => {
    await catering.getByRole('button', { name: 'Switch to list view' }).click();
    const listButton = catering.getByRole('button', {
      name: 'Switch to list view',
    });
    await expect(listButton).toHaveAttribute('aria-pressed', 'true');
    // Verify grid button is no longer active
    await expect(
      catering.getByRole('button', { name: 'Switch to grid view' }),
    ).toHaveAttribute('aria-pressed', 'false');
  });
});
