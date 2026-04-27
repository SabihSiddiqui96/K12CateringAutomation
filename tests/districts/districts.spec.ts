import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
  getDistrictName,
} from '../../utils/helpers';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Districts', () => {
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

  test('Districts - Page heading, search, Add and Switch buttons are visible', async () => {
    await expect(catering.getByRole('heading', { name: /Districts/i }).first()).toBeVisible({ timeout: 10000 });
    await expect(catering.getByRole('button', { name: /Add new district/i })).toBeVisible();
    await expect(catering.getByRole('button', { name: /Switch district/i })).toBeVisible();
    await expect(catering.getByRole('textbox', { name: /Search districts/i })).toBeVisible();
  });

  test('Districts - District is listed with edit/delete actions', async () => {
    await expect(catering.getByText(new RegExp(getDistrictName(), 'i')).first()).toBeVisible({ timeout: 10000 });

    const editBtn = catering.getByRole('button', { name: /Edit district/i }).or(catering.getByRole('button', { name: /Edit/i }).first()).first();
    const deleteBtn = catering.getByRole('button', { name: /Delete district/i }).or(catering.getByRole('button', { name: /Delete/i }).first()).first();
    const hasEdit = await editBtn.isVisible({ timeout: 5000 }).catch(() => false);
    const hasDelete = await deleteBtn.isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasEdit || hasDelete).toBe(true);
  });

  test('Districts - Search filters and clearing search restores list', async () => {
    const searchInput = catering.getByRole('textbox', { name: /Search districts/i });
    await searchInput.fill(getDistrictName().split(' ')[0]);
    await catering.waitForTimeout(600);
    await expect(catering.getByText(new RegExp(getDistrictName(), 'i')).first()).toBeVisible({ timeout: 10000 });

    await searchInput.fill('ZZZNoMatchXXX12345');
    await catering.waitForTimeout(600);
    const hasEmptyState = await catering.getByText(/no.*districts|no results|not found/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasDistrict = await catering.getByText(new RegExp(getDistrictName(), 'i')).first().isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasEmptyState || !hasDistrict).toBe(true);

    await searchInput.clear();
    await catering.waitForTimeout(600);
    await expect(catering.getByText(new RegExp(getDistrictName(), 'i')).first()).toBeVisible({ timeout: 10000 });
  });

  test('Districts - Switch District opens list showing current district', async () => {
    await catering.getByRole('button', { name: /Switch district/i }).click();
    await catering.waitForLoadState('domcontentloaded');
    await expect(catering.getByText(new RegExp(getDistrictName(), 'i')).first()).toBeVisible({ timeout: 10000 });

    const cancelBtn = catering.getByRole('button', { name: /Cancel|Back/i }).first();
    if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cancelBtn.click();
    } else {
      await catering.keyboard.press('Escape');
    }
  });

  test('Districts - Add New District form opens with required fields and validates empty submit', async () => {
    await catering.getByRole('button', { name: /Add new district/i }).click();
    await catering.waitForTimeout(500);

    await expect(catering.getByRole('textbox', { name: /District Name/i })).toBeVisible({ timeout: 10000 });
    const envDropdown = catering.locator('#add-environment-select, select[name*="environment"]').first();
    expect(await envDropdown.isVisible({ timeout: 5000 }).catch(() => false)).toBe(true);
    await expect(catering.getByRole('button', { name: /Add District/i }).last()).toBeVisible();

    await catering.getByRole('button', { name: /Add District/i }).last().click();
    await expect(catering.getByText(/required|must not be empty|please enter/i).first()).toBeVisible({ timeout: 5000 });

    const cancelBtn = catering.getByRole('button', { name: /Cancel/i });
    if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cancelBtn.click();
    } else {
      await catering.keyboard.press('Escape');
    }
  });
});
