import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('My Profile', () => {
  let catering: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    catering = await loginToK12Catering(page);
  });

  test.beforeEach(async () => {
    await navigateK12CateringMenu(catering, 'My Profile');
    await catering.waitForLoadState('domcontentloaded');
  });

  test('My Profile - Page heading and all main sections are visible', async () => {
    await expect(catering.locator('h1')).toContainText('My Profile', { timeout: 10000 });
    await expect(catering.getByRole('region', { name: /Personal information section/i })).toBeVisible();
    await expect(catering.getByRole('region', { name: /Account status information/i })).toBeVisible();
    await expect(catering.getByRole('region', { name: /Quick actions and settings/i })).toBeVisible();
    await expect(catering.getByRole('region', { name: /User preferences/i })).toBeVisible();
    await expect(catering.getByText(/Error Code: 404|something went wrong/i)).not.toBeVisible();
  });

  test('My Profile - Account status shows Active, Administrator role and Member Since date', async () => {
    const statusRegion = catering.locator('section[aria-label="Account status information"]');
    await expect(statusRegion).toBeVisible();
    await expect(statusRegion.getByText('Status', { exact: true })).toBeVisible();
    await expect(statusRegion.getByText('Active', { exact: true })).toBeVisible();
    await expect(statusRegion.getByText('Role', { exact: true })).toBeVisible();
    await expect(statusRegion.getByText('Cybersoft Admin', { exact: true })).toBeVisible();
    await expect(statusRegion.getByText('Member Since', { exact: true })).toBeVisible();
    await expect(
      statusRegion.getByText(/January|February|March|April|May|June|July|August|September|October|November|December/i)
    ).toBeVisible();
  });

  test('My Profile - Quick Actions shows Add New Contact button', async () => {
    const quickActions = catering.getByRole('region', {
      name: /Quick actions and settings/i,
    });
    const addNewContactAction = quickActions
      .getByRole('button', { name: /Add New Contact/i })
      .or(quickActions.getByRole('link', { name: /Add New Contact/i }))
      .or(quickActions.getByText(/Add New Contact/i).first());

    await expect(quickActions).toBeVisible();
    await expect(addNewContactAction).toBeVisible();
  });

  test('My Profile - Preferences section shows Theme and Default Dashboard options', async () => {
    const prefs = catering.getByRole('region', { name: /User preferences/i });
    const themeSelect = prefs.getByLabel(/Theme/i);

    await expect(prefs.getByRole('heading', { name: /Theme/i })).toBeVisible({ timeout: 10000 });
    await expect(themeSelect).toBeVisible();
    await expect(themeSelect.locator('option[value="light"]')).toHaveText(/Light/i);
    await expect(themeSelect.locator('option[value="dark"]')).toHaveText(/Dark/i);
    await expect(themeSelect.locator('option[value="auto"]')).toHaveText(/Auto/i);
    await expect(prefs.getByRole('heading', { name: /Default Dashboard/i })).toBeVisible();
    await expect(prefs.getByText(/Dashboard view after sign in/i)).toBeVisible();
  });

  test('My Profile - Edit Profile form opens with name fields, Save button, and Cancel discards', async () => {
    const personalInfo = catering.getByRole('region', { name: /Personal information section/i });
    await personalInfo.getByRole('button', { name: /Edit Profile/i }).click();
    await catering.waitForTimeout(500);

    await expect(
      catering.getByRole('textbox', { name: /First Name/i }).or(catering.getByLabel(/First Name/i)).first(),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      catering.getByRole('textbox', { name: /Last Name/i }).or(catering.getByLabel(/Last Name/i)).first(),
    ).toBeVisible();
    await expect(catering.getByRole('button', { name: /Save|Update/i }).first()).toBeVisible();

    const cancelBtn = catering.getByRole('button', { name: /Cancel/i });
    if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cancelBtn.click();
    } else {
      await catering.keyboard.press('Escape');
    }
    await expect(catering.getByRole('button', { name: /Edit Profile/i }).first()).toBeVisible({ timeout: 10000 });
  });
});
