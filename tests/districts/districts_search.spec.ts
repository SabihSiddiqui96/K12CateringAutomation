import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.use({ storageState: { cookies: [], origins: [] } });

let catering: Page;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  catering = await loginToK12Catering(page);
});

test.beforeEach(async () => {
  await navigateK12CateringMenu(catering, 'Districts');
  await catering.waitForLoadState('domcontentloaded');
});

test('Districts - Search by name filters results', async () => {
  const searchInput = catering.getByRole('textbox', { name: /Search districts/i });
  await expect(searchInput).toBeVisible({ timeout: 10000 });

  await searchInput.fill('Mercer');
  await catering.waitForTimeout(600);

  await expect(
    catering.getByText(/Mercer County School District/i).first(),
  ).toBeVisible({ timeout: 10000 });
});

test('Districts - Search with no match shows empty state or no results', async () => {
  const searchInput = catering.getByRole('textbox', { name: /Search districts/i });
  await expect(searchInput).toBeVisible({ timeout: 10000 });

  await searchInput.fill('ZZZNoMatchXXX12345');
  await catering.waitForTimeout(600);

  const hasEmptyState = await catering
    .getByText(/no.*districts|no results|not found/i)
    .first()
    .isVisible({ timeout: 5000 })
    .catch(() => false);
  const hasMercer = await catering
    .getByText(/Mercer County School District/i)
    .first()
    .isVisible({ timeout: 2000 })
    .catch(() => false);

  expect(hasEmptyState || !hasMercer).toBe(true);
});

test('Districts - Clearing search shows all districts again', async () => {
  const searchInput = catering.getByRole('textbox', { name: /Search districts/i });
  await expect(searchInput).toBeVisible({ timeout: 10000 });

  await searchInput.fill('ZZZNoMatchXXX12345');
  await catering.waitForTimeout(400);
  await searchInput.clear();
  await catering.waitForTimeout(600);

  await expect(
    catering.getByText(/Mercer County School District/i).first(),
  ).toBeVisible({ timeout: 10000 });
});
