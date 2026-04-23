// Dashboard - Trending Chart regression tests
// Tests the What's Trending section: day filters, chart view toggles,
// search functionality, and empty state

import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';


test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Dashboard - Trending Chart', () => {
  let catering: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    catering = await loginToK12Catering(page, { navigateTo: 'Dashboard' });
  });

  test.beforeEach(async () => {
    await navigateK12CateringMenu(catering, 'Dashboard');
    await catering.waitForLoadState('domcontentloaded');

    // Always reset to Advanced view — view mode persists across navigation
    const advancedButton = catering.getByRole('button', {
      name: 'Advanced view',
    });
    if ((await advancedButton.getAttribute('aria-pressed')) !== 'true') {
      await advancedButton.click();
      await expect(advancedButton).toHaveAttribute('aria-pressed', 'true');
    }

    // Scroll to trending section
    await catering
      .getByRole('button', { name: 'Scroll to trending chart' })
      .click();

    // Reset trending to known state: Last 7 Days + Bar Chart + clear search
    // Trending filter and chart view persist in component state between tests
    await catering
      .getByRole('button', { name: 'Filter by Last 7 Days' })
      .click();
    await expect(
      catering.getByRole('button', { name: 'Filter by Last 7 Days' }),
    ).toHaveAttribute('aria-pressed', 'true');

    await catering
      .getByRole('button', { name: 'Switch to Bar Chart view' })
      .click();
    await expect(
      catering.getByRole('button', { name: 'Switch to Bar Chart view' }),
    ).toHaveAttribute('aria-pressed', 'true');

    // Clear the search input
    const searchInput = catering.getByRole('textbox', {
      name: 'Search trending items',
    });
    await searchInput.clear();
  });

  // Helper scoped to the trending section
  const trendingSection = () =>
    catering
      .getByRole('region', { name: 'Trending data visualization' })
      .first();

  test('Trending section loads with heading and key controls visible', async () => {
    await expect(trendingSection()).toBeVisible({ timeout: 15000 });
    await expect(
      trendingSection().getByRole('heading', { name: "What's Trending?" }),
    ).toBeVisible();
    await expect(
      trendingSection().getByRole('button', { name: 'Filter by Last 7 Days' }),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      trendingSection().getByRole('button', { name: 'Filter by 14 Days' }),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      trendingSection().getByRole('button', { name: 'Filter by 30 Days' }),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      trendingSection().getByRole('button', {
        name: 'Switch to Bar Chart view',
      }),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      trendingSection().getByRole('button', {
        name: 'Switch to Bar Chart view',
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      trendingSection().getByRole('button', {
        name: 'Switch to Pie Chart view',
      }),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      trendingSection().getByRole('button', { name: 'Switch to Details view' }),
    ).toBeVisible({ timeout: 15000 });
    const searchInput = catering.getByRole('textbox', {
      name: 'Search trending items',
    });
    await expect(searchInput).toBeVisible({ timeout: 15000 });
    await expect(searchInput).toHaveAttribute('placeholder', 'Search items...');
  });

  test('Day filter buttons switch active state correctly', async () => {
    await trendingSection()
      .getByRole('button', { name: 'Filter by 14 Days' })
      .click();
    await expect(
      trendingSection().getByRole('button', { name: 'Filter by 14 Days' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      trendingSection().getByRole('button', { name: 'Filter by Last 7 Days' }),
    ).toHaveAttribute('aria-pressed', 'false');
    await expect(
      trendingSection().getByRole('button', { name: 'Filter by 30 Days' }),
    ).toHaveAttribute('aria-pressed', 'false');
    await trendingSection()
      .getByRole('button', { name: 'Filter by 30 Days' })
      .click();
    await expect(
      trendingSection().getByRole('button', { name: 'Filter by 30 Days' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      trendingSection().getByRole('button', { name: 'Filter by Last 7 Days' }),
    ).toHaveAttribute('aria-pressed', 'false');
    await expect(
      trendingSection().getByRole('button', { name: 'Filter by 14 Days' }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  test('Chart view toggles switch to Pie and Details with table rendered', async () => {
    await trendingSection()
      .getByRole('button', { name: 'Switch to Pie Chart view' })
      .click();
    await expect(
      trendingSection().getByRole('button', {
        name: 'Switch to Pie Chart view',
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      trendingSection().getByRole('button', {
        name: 'Switch to Bar Chart view',
      }),
    ).toHaveAttribute('aria-pressed', 'false');
    await trendingSection()
      .getByRole('button', { name: 'Switch to Details view' })
      .click();
    await expect(
      trendingSection().getByRole('button', { name: 'Switch to Details view' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(trendingSection().getByRole('table')).toBeVisible({
      timeout: 10000,
    });
    await expect(
      trendingSection().getByRole('columnheader', { name: 'Menu Item' }),
    ).toBeVisible();
    await expect(
      trendingSection().getByRole('columnheader', { name: 'Quantity' }),
    ).toBeVisible();
  });

  test('Typing in search filters trending items in Details view', async () => {
    await trendingSection()
      .getByRole('button', { name: 'Switch to Details view' })
      .click();
    await expect(trendingSection().getByRole('table')).toBeVisible({
      timeout: 10000,
    });
    const searchInput = catering.getByRole('textbox', {
      name: 'Search trending items',
    });
    await searchInput.fill('apple');
    const rows = trendingSection().getByRole('row');
    await expect(rows).not.toHaveCount(0);
    await expect(trendingSection()).toContainText('apple', { timeout: 10000 });
  });

  test('Searching with no matching term shows empty state message', async () => {
    const searchInput = catering.getByRole('textbox', {
      name: 'Search trending items',
    });
    await searchInput.fill('zzznomatch');

    await expect(trendingSection()).toContainText('No Items Found', {
      timeout: 10000,
    });
  });
});
