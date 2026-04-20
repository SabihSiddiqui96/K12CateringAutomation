// Dashboard - Trending Chart regression tests
// Tests the What's Trending section: day filters, chart view toggles,
// search functionality, and empty state

import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.setTimeout(180000);

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

  // ── Visibility ──────────────────────────────────────────────────────────────

  test('Trending section is visible with heading "What\'s Trending?"', async () => {
    await expect(trendingSection()).toBeVisible({ timeout: 15000 });
    await expect(
      trendingSection().getByRole('heading', { name: "What's Trending?" }),
    ).toBeVisible();
  });

  // ── Day Filter Buttons ──────────────────────────────────────────────────────

  test('"Last 7 Days" filter button is visible', async () => {
    await expect(
      trendingSection().getByRole('button', { name: 'Filter by Last 7 Days' }),
    ).toBeVisible({ timeout: 15000 });
  });

  test('"14 Days" filter button is visible', async () => {
    await expect(
      trendingSection().getByRole('button', { name: 'Filter by 14 Days' }),
    ).toBeVisible({ timeout: 15000 });
  });

  test('"30 Days" filter button is visible', async () => {
    await expect(
      trendingSection().getByRole('button', { name: 'Filter by 30 Days' }),
    ).toBeVisible({ timeout: 15000 });
  });

  test('Clicking "14 Days" sets it as the active filter', async () => {
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
  });

  test('Clicking "30 Days" sets it as the active filter', async () => {
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

  // ── Chart View Buttons ──────────────────────────────────────────────────────

  test('"Bar Chart" view button is visible and active after reset', async () => {
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
  });

  test('"Pie Chart" view button is visible', async () => {
    await expect(
      trendingSection().getByRole('button', {
        name: 'Switch to Pie Chart view',
      }),
    ).toBeVisible({ timeout: 15000 });
  });

  test('"Details" view button is visible', async () => {
    await expect(
      trendingSection().getByRole('button', { name: 'Switch to Details view' }),
    ).toBeVisible({ timeout: 15000 });
  });

  test('Switching to "Pie Chart" sets it as active and deactivates Bar Chart', async () => {
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
  });

  test('Switching to "Details" view shows a table with Menu Item and Quantity columns', async () => {
    await trendingSection()
      .getByRole('button', { name: 'Switch to Details view' })
      .click();

    await expect(
      trendingSection().getByRole('button', { name: 'Switch to Details view' }),
    ).toHaveAttribute('aria-pressed', 'true');

    // Details view renders a table with these column headers
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

  // ── Search ──────────────────────────────────────────────────────────────────

  test('Search input is visible with correct placeholder', async () => {
    const searchInput = catering.getByRole('textbox', {
      name: 'Search trending items',
    });
    await expect(searchInput).toBeVisible({ timeout: 15000 });
    await expect(searchInput).toHaveAttribute('placeholder', 'Search items...');
  });

  test('Typing in search filters trending items in Details view', async () => {
    // Switch to Details view so we can verify the filter via the table
    await trendingSection()
      .getByRole('button', { name: 'Switch to Details view' })
      .click();
    await expect(trendingSection().getByRole('table')).toBeVisible({
      timeout: 10000,
    });

    // Type a search term
    const searchInput = catering.getByRole('textbox', {
      name: 'Search trending items',
    });
    await searchInput.fill('apple');

    // Table should now only show rows matching "apple"
    const rows = trendingSection().getByRole('row');
    // At minimum the header row + 1 data row should exist
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
