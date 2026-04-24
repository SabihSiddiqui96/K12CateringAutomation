import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Contact Us - Content', () => {
  let catering: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    catering = await loginToK12Catering(page);
  });

  test.beforeEach(async () => {
    await navigateK12CateringMenu(catering, 'Contact Us');
    await catering.waitForLoadState('domcontentloaded');
  });

  test('Contact Us - Contact cards show at least one contact name', async () => {
    // At least one person/contact heading should be visible
    const contactCards = catering.getByRole('heading', { level: 3 });
    await expect(contactCards.first()).toBeVisible({ timeout: 10000 });
  });

  test('Contact Us - Contact email links are visible', async () => {
    const emailLinks = catering.getByRole('link').filter({ hasText: /@/i });
    await expect(emailLinks.first()).toBeVisible({ timeout: 10000 });
  });

  test('Contact Us - Availability region shows days', async () => {
    await expect(
      catering.getByText(/Mon.{1,3}Fri|Monday|Sunday/i).first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test('Contact Us - Hours of Operation shows at least one day', async () => {
    const hoursRegion = catering.locator('section, [role="region"]').filter({
      has: catering.getByText(/Hours of Operation/i),
    }).first();
    await expect(hoursRegion).toBeVisible({ timeout: 10000 });
    await expect(
      hoursRegion.getByText(/Monday|Tuesday|Wednesday|Sunday/i).first(),
    ).toBeVisible({ timeout: 10000 });
  });
});
