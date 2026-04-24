import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Settings', () => {
  let catering: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    catering = await loginToK12Catering(page);
  });

  test.beforeEach(async () => {
    await navigateK12CateringMenu(catering, 'Settings');
    await catering.waitForLoadState('domcontentloaded');
  });

  async function openModal(btnName: RegExp) {
    await catering.getByRole('button', { name: btnName }).click();
    await catering.waitForTimeout(500);
  }

  async function closeModal() {
    const cancelBtn = catering.getByRole('button', { name: /Cancel/i });
    if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cancelBtn.click();
    } else {
      await catering.keyboard.press('Escape');
    }
    await catering.waitForTimeout(300);
  }

  test('Settings - Page heading and all major sections are visible', async () => {
    await expect(catering.locator('h1')).toContainText('Settings', { timeout: 10000 });
    await expect(catering.getByRole('region', { name: /Business settings/i })).toBeVisible();
    await expect(catering.getByRole('region', { name: /Operation schedule settings/i })).toBeVisible();
    await expect(catering.getByRole('heading', { name: /Hours of Operation/i })).toBeVisible();
    await expect(catering.getByRole('heading', { name: /Order Lead Time/i })).toBeVisible();
    await expect(catering.getByRole('heading', { name: /Max Event Date/i })).toBeVisible();
    await expect(catering.getByRole('heading', { name: /Order Settings/i })).toBeVisible();
    await expect(catering.getByRole('heading', { name: /Sales Tax Rate/i })).toBeVisible();
    await expect(catering.getByRole('heading', { name: /Delivery Fee/i })).toBeVisible();
    await expect(catering.getByRole('heading', { name: /Minimum Order Amount/i })).toBeVisible();
    await expect(catering.getByRole('region', { name: /Short URL settings/i })).toBeVisible();
    await expect(catering.getByRole('region', { name: /Holiday schedule settings/i })).toBeVisible();
  });

  test('Settings - Order Lead Time shows current value and modal with Save/Cancel', async () => {
    await expect(catering.getByText(/\d+ Days?/i).first()).toBeVisible({ timeout: 10000 });
    await openModal(/Edit order lead time/i);
    const input = catering.getByRole('spinbutton').or(catering.getByRole('textbox', { name: /lead time/i })).first();
    await expect(input).toBeVisible({ timeout: 10000 });
    await expect(catering.getByRole('button', { name: /Save/i })).toBeVisible();
    await input.clear();
    await input.fill('99');
    await closeModal();
    await expect(catering.getByText(/99 Days?/i)).not.toBeVisible({ timeout: 3000 });
  });

  test('Settings - Minimum Order Amount modal shows helper text and Save button', async () => {
    await openModal(/Edit minimum order amount/i);
    await expect(catering.getByText(/Set to \$0 to disable/i)).toBeVisible({ timeout: 10000 });
    await expect(catering.getByRole('button', { name: /Save/i })).toBeVisible();
    await closeModal();
  });

  test('Settings - Short URL section shows URL value and action buttons', async () => {
    await expect(catering.getByRole('heading', { name: /Short URL/i })).toBeVisible({ timeout: 10000 });
    await expect(catering.getByText(/https:\/\/.*\/GUEST\//i)).toBeVisible();
    await expect(catering.getByRole('button', { name: /Open Short URL in new tab/i })).toBeVisible();
    await expect(catering.getByRole('button', { name: /Copy Short URL to clipboard/i })).toBeVisible();
    await expect(catering.getByRole('button', { name: /Edit Short URL/i })).toBeVisible();
  });

  test('Settings - Holiday Schedule section shows heading, year filter and Add Holiday button', async () => {
    await expect(catering.getByRole('region', { name: /Holiday schedule settings/i })).toBeVisible({ timeout: 10000 });
    await expect(catering.getByRole('heading', { name: /Holiday Schedule/i })).toBeVisible();
    await expect(catering.getByRole('button', { name: /Add new holiday/i })).toBeVisible();
    await expect(catering.getByText(/Filter holidays by year/i)).toBeVisible();
    const year = new Date().getFullYear();
    await expect(catering.getByRole('heading', { name: new RegExp(`Holiday list for ${year}`, 'i') })).toBeVisible();
  });

  test('Settings - District Contacts section shows existing contacts with edit/delete buttons', async () => {
    await expect(catering.getByRole('heading', { name: /District Contacts/i })).toBeVisible({ timeout: 10000 });
    await expect(catering.getByRole('button', { name: /Add new contact/i })).toBeVisible();
    await expect(catering.getByRole('button', { name: /^Edit .+$/i }).first()).toBeVisible();
    await expect(catering.getByRole('button', { name: /^Delete .+$/i }).first()).toBeVisible();
  });
});
