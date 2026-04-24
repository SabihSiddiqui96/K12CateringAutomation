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

test('Districts - Page heading is displayed', async () => {
  await expect(
    catering.getByRole('heading', { name: /Districts/i }).first(),
  ).toBeVisible({ timeout: 10000 });
});

test('Districts - Add New District button is visible', async () => {
  await expect(
    catering.getByRole('button', { name: /Add new district/i }),
  ).toBeVisible({ timeout: 10000 });
});

test('Districts - Switch District button is visible', async () => {
  await expect(
    catering.getByRole('button', { name: /Switch district/i }),
  ).toBeVisible({ timeout: 10000 });
});

test('Districts - Search input is visible', async () => {
  await expect(
    catering.getByRole('textbox', { name: /Search districts/i }),
  ).toBeVisible({ timeout: 10000 });
});
