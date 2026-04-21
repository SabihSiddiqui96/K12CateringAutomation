import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.setTimeout(180000);
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Guest Menu - Download PDF', () => {
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

  test('Guest Menu - Download PDF button is visible on the Guest Menu page', async () => {
    await expect(
      catering.getByRole('button', { name: 'Download menu as PDF' }),
    ).toBeVisible({ timeout: 10000 });
  });

  test('Guest Menu - Download PDF button triggers a file download', async () => {
    const [newPage] = await Promise.all([
      catering.context().waitForEvent('page', { timeout: 15000 }),
      catering.getByRole('button', { name: 'Download menu as PDF' }).click(),
    ]);
    await newPage.waitForLoadState();
    expect(newPage.url()).toMatch(/pdf|download|guest-menu/i);
    await newPage.close();
  });
});
