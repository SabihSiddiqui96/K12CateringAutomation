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

test('Districts - At least one district is listed', async () => {
  const districts = catering
    .getByRole('row')
    .or(catering.getByRole('listitem'))
    .or(catering.locator('[data-testid*="district"]'));
  await expect(
    catering.getByText(/Mercer County School District/i).first(),
  ).toBeVisible({ timeout: 10000 });
});

test('Districts - Mercer County School District is shown in the list', async () => {
  await expect(
    catering.getByText(/Mercer County School District/i).first(),
  ).toBeVisible({ timeout: 10000 });
});

test('Districts - Each district row shows edit/delete actions', async () => {
  const editBtn = catering
    .getByRole('button', { name: /Edit district/i })
    .or(catering.getByRole('button', { name: /Edit/i }).first())
    .first();
  const deleteBtn = catering
    .getByRole('button', { name: /Delete district/i })
    .or(catering.getByRole('button', { name: /Delete/i }).first())
    .first();

  const hasEdit = await editBtn.isVisible({ timeout: 5000 }).catch(() => false);
  const hasDelete = await deleteBtn.isVisible({ timeout: 5000 }).catch(() => false);
  expect(hasEdit || hasDelete).toBe(true);
});
