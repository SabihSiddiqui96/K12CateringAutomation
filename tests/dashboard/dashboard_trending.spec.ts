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

    const advancedButton = catering.getByRole('button', { name: 'Advanced view' });
    if ((await advancedButton.getAttribute('aria-pressed')) !== 'true') {
      await advancedButton.click();
      await expect(advancedButton).toHaveAttribute('aria-pressed', 'true');
    }

    await catering.getByRole('button', { name: 'Scroll to trending chart' }).click();
    await catering.getByRole('button', { name: 'Filter by Last 7 Days' }).click();
    await expect(catering.getByRole('button', { name: 'Filter by Last 7 Days' })).toHaveAttribute('aria-pressed', 'true');
    await catering.getByRole('button', { name: 'Switch to Bar Chart view' }).click();
    await catering.getByRole('textbox', { name: 'Search trending items' }).clear();
  });

  const trendingSection = () => catering.getByRole('region', { name: 'Trending data visualization' }).first();

  test('Trending - Section loads with heading, day filters, chart toggles and search input', async () => {
    await expect(trendingSection()).toBeVisible({ timeout: 15000 });
    await expect(trendingSection().getByRole('heading', { name: "What's Trending?" })).toBeVisible();
    await expect(trendingSection().getByRole('button', { name: 'Filter by Last 7 Days' })).toBeVisible();
    await expect(trendingSection().getByRole('button', { name: 'Filter by 14 Days' })).toBeVisible();
    await expect(trendingSection().getByRole('button', { name: 'Filter by 30 Days' })).toBeVisible();
    await expect(trendingSection().getByRole('button', { name: 'Switch to Bar Chart view' })).toHaveAttribute('aria-pressed', 'true');
    await expect(trendingSection().getByRole('button', { name: 'Switch to Pie Chart view' })).toBeVisible();
    await expect(trendingSection().getByRole('button', { name: 'Switch to Details view' })).toBeVisible();
    const searchInput = catering.getByRole('textbox', { name: 'Search trending items' });
    await expect(searchInput).toBeVisible();
    await expect(searchInput).toHaveAttribute('placeholder', 'Search items...');
  });

  test('Trending - Day filter buttons switch active state and chart views toggle with Details table', async () => {
    await trendingSection().getByRole('button', { name: 'Filter by 14 Days' }).click();
    await expect(trendingSection().getByRole('button', { name: 'Filter by 14 Days' })).toHaveAttribute('aria-pressed', 'true');
    await expect(trendingSection().getByRole('button', { name: 'Filter by Last 7 Days' })).toHaveAttribute('aria-pressed', 'false');

    await trendingSection().getByRole('button', { name: 'Switch to Pie Chart view' }).click();
    await expect(trendingSection().getByRole('button', { name: 'Switch to Pie Chart view' })).toHaveAttribute('aria-pressed', 'true');

    await trendingSection().getByRole('button', { name: 'Switch to Details view' }).click();
    await expect(trendingSection().getByRole('table')).toBeVisible({ timeout: 10000 });
    await expect(trendingSection().getByRole('columnheader', { name: 'Menu Item' })).toBeVisible();
    await expect(trendingSection().getByRole('columnheader', { name: 'Quantity' })).toBeVisible();
  });

  test('Trending - Search filters items in Details view; no-match shows empty state', async () => {
    await trendingSection().getByRole('button', { name: 'Switch to Details view' }).click();
    await expect(trendingSection().getByRole('table')).toBeVisible({ timeout: 10000 });

    const searchInput = catering.getByRole('textbox', { name: 'Search trending items' });
    await searchInput.fill('apple');
    await expect(trendingSection()).toContainText('apple', { timeout: 10000 });

    await searchInput.clear();
    await searchInput.fill('zzznomatch');
    await expect(trendingSection()).toContainText('No Items Found', { timeout: 10000 });
  });
});
