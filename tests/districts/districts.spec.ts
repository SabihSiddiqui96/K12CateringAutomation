import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
  getDistrictName,
  getDistrictNameRegex,
} from '../../utils/helpers';
import { safeNavigate } from '../../utils/dataSync';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Districts', () => {
  let catering: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    catering = await loginToK12Catering(page);
  });

  // safeNavigate, not a bare navigate
  test.beforeEach(async () => {
    await safeNavigate(catering, 'Districts');
  });

  test('Districts - Page heading, search, Add and Switch buttons are visible', async () => {
    await expect(catering.getByRole('heading', { name: /Districts/i }).first()).toBeVisible();
    await expect(catering.getByRole('button', { name: /Add new district/i })).toBeVisible();
    await expect(catering.getByRole('button', { name: /Switch district/i })).toBeVisible();
    await expect(catering.getByRole('textbox', { name: /Search districts/i })).toBeVisible();
  });

  test('Districts - District is listed with edit/delete actions', async () => {
    await expect(catering.getByText(getDistrictNameRegex()).first()).toBeVisible();

    const editBtn = catering.getByRole('button', { name: /Edit district/i }).or(catering.getByRole('button', { name: /Edit/i }).first()).first();
    const deleteBtn = catering.getByRole('button', { name: /Delete district/i }).or(catering.getByRole('button', { name: /Delete/i }).first()).first();
    // A web-first assertion rather than isVisible() probes
    await expect(editBtn.or(deleteBtn).first()).toBeVisible();
  });

  test('Districts - Search filters and clearing search restores list', async () => {
    const searchInput = catering.getByRole('textbox', { name: /Search districts/i });
    // Search by the first apostrophe-free token (e.g.
    await searchInput.fill(getDistrictName().split(/[\s'‘’]/)[0]);
    await catering.waitForTimeout(600);
    await expect(catering.getByText(getDistrictNameRegex()).first()).toBeVisible();

    await searchInput.fill('ZZZNoMatchXXX12345');
    await catering.waitForTimeout(600);
    const hasEmptyState = await catering.getByText(/no.*districts|no results|not found/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasDistrict = await catering.getByText(getDistrictNameRegex()).first().isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasEmptyState || !hasDistrict).toBe(true);

    await searchInput.clear();
    await catering.waitForTimeout(600);
    await expect(catering.getByText(getDistrictNameRegex()).first()).toBeVisible();
  });

  test('Districts - Switch District opens list showing current district', async () => {
    await catering.getByRole('button', { name: /Switch district/i }).click();
    await catering.waitForLoadState('domcontentloaded');
    await expect(catering.getByText(getDistrictNameRegex()).first()).toBeVisible();

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

    await expect(catering.getByRole('textbox', { name: /District Name/i })).toBeVisible();
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

  test('Districts - Edit district uploads a logo preview and rejects other file types', async () => {
    // 1x1 transparent PNG
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    );
    // Search past any apostrophe; the app may store it curly (Lee’s Summit).
    await catering
      .getByRole('textbox', { name: /Search districts/i })
      .fill(getDistrictName().split(/['‘’]/).pop()!.trim());
    await catering
      .getByRole('button', { name: new RegExp(`^Edit district ${getDistrictNameRegex().source}$`, 'i') })
      .click();
    await expect(catering.getByRole('heading', { name: 'Edit District' })).toBeVisible();
    await expect(catering.getByRole('heading', { name: 'District Logo' })).toBeVisible();
    await expect(catering.getByRole('button', { name: 'Upload district logo' })).toBeVisible();
    await expect(catering.getByText('Supported formats: JPG, PNG, GIF')).toBeVisible();
    const fileInput = catering.locator('input[type="file"]').first();
    const preview = catering.getByRole('img', { name: 'District Logo Preview' });

    try {
      await fileInput.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') });
      const invalid = catering.getByRole('alert').filter({ hasText: 'Invalid File Type' });
      await expect(invalid).toBeVisible();
      await expect(invalid).toContainText('Only JPG, PNG, and GIF images are supported.');
      await expect(preview).not.toBeVisible();

      await fileInput.setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png });
      await expect(preview).toBeVisible();
      expect(await preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
      await expect(catering.getByRole('button', { name: 'Edit district logo' })).toBeVisible();
      await expect(catering.getByRole('button', { name: 'Remove district logo' })).toBeVisible();
    } finally {
      // Cancel so the shared district keeps its own logo.
      await catering.getByRole('button', { name: 'Cancel', exact: true }).click();
    }
    await expect(catering.getByRole('heading', { name: 'Edit District' })).not.toBeVisible();
  });
});
