import { expect, Locator, Page } from '@playwright/test';
import { navigateK12CateringMenu, dismissReauthInterstitial } from './helpers';
import { switchToCustomerDistrict } from './dataSync';

function changePasswordDialog(page: Page) {
  return page.getByRole('dialog', { name: /Change Password/i });
}

async function closeChangePasswordDialog(page: Page): Promise<void> {
  const dialog = changePasswordDialog(page);
  if (!(await dialog.isVisible({ timeout: 1000 }).catch(() => false))) {
    return;
  }

  const cancelButton = dialog.getByRole('button', { name: /Cancel/i });
  if (await cancelButton.isVisible({ timeout: 1000 }).catch(() => false)) {
    await cancelButton.click();
  } else {
    await page.keyboard.press('Escape');
  }

  await expect(dialog).toBeHidden({ timeout: 10000 });
}

async function openChangePasswordDialog(
  page: Page,
  customerEmail: string,
): Promise<Locator> {
  await closeChangePasswordDialog(page);
  // The demo customer lives under a specific district (Alief ISD on UAT); make
  // sure we're on it before searching Accounts, or the account won't be found.
  await switchToCustomerDistrict(page);
  await navigateK12CateringMenu(page, 'Accounts');
  await page.waitForLoadState('domcontentloaded');
  // A mid-session PrimeroEdge token refresh can bounce us onto the SSO relaunch
  // interstitial; wait it out before interacting with Accounts.
  await dismissReauthInterstitial(page);

  const searchBox = page.getByRole('textbox', {
    name: /Search accounts by name, username, or email/i,
  });
  await expect(searchBox).toBeVisible({ timeout: 10000 });
  await searchBox.fill(customerEmail);
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(600);

  const accountCard = page.getByRole('listitem').filter({
    hasText: customerEmail,
  }).first();
  await expect(accountCard).toBeVisible({ timeout: 10000 });

  const actionsButton = accountCard.getByRole('button', { name: /Actions for/i });
  const changePasswordMenuItem = page.getByRole('menuitem', {
    name: /Change Password/i,
  });
  const dialog = changePasswordDialog(page);
  // Retry the whole open→click→dialog. Clicking "Change Password" can itself trigger
  // a PrimeroEdge SSO relaunch (the interstitial pops instead of the dialog), and the
  // account row/menu can re-render mid-click (detached element). Only stop once the
  // dialog is actually open — dismissing any interstitial between attempts.
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await dismissReauthInterstitial(page);
    if (!(await actionsButton.isVisible({ timeout: 10000 }).catch(() => false))) {
      // A relaunch may have navigated us away from Accounts; go back and retry.
      await navigateK12CateringMenu(page, 'Accounts').catch(() => undefined);
      await dismissReauthInterstitial(page);
      continue;
    }
    await actionsButton.click().catch(() => undefined);
    const menuShown = await changePasswordMenuItem
      .isVisible({ timeout: 3000 })
      .catch(() => false);
    if (menuShown) {
      await changePasswordMenuItem.click({ timeout: 5000 }).catch(() => undefined);
    }
    // The click may have bounced us to the SSO interstitial instead of the dialog.
    await dismissReauthInterstitial(page);
    if (await dialog.isVisible({ timeout: 5000 }).catch(() => false)) {
      break;
    }
    await page.waitForTimeout(600);
  }

  await expect(dialog).toBeVisible({ timeout: 10000 });
  return dialog;
}

export async function resetCustomerPasswordFromAccounts(
  page: Page,
  customerEmail: string,
  newPassword: string,
): Promise<void> {
  const dialog = await openChangePasswordDialog(page, customerEmail);

  await dialog.getByLabel(/New Password/i).fill(newPassword);
  await dialog.getByLabel(/Confirm Password/i).fill(newPassword);
  await dialog.getByRole('button', { name: /Save|Submit|Change Password/i }).click();

  const successMessage = page
    .getByText(/password.*changed|updated successfully|success/i)
    .first();
  const alreadyCurrentPasswordMessage = dialog
    .getByText(/same as|current password|recently used|different password/i)
    .first();

  const passwordUpdated = await successMessage
    .isVisible({ timeout: 10000 })
    .catch(() => false);

  if (passwordUpdated) {
    await expect(changePasswordDialog(page)).toBeHidden({ timeout: 10000 });
    return;
  }

  if (
    await alreadyCurrentPasswordMessage
      .isVisible({ timeout: 1000 })
      .catch(() => false)
  ) {
    await closeChangePasswordDialog(page);
    return;
  }

  await expect(successMessage).toBeVisible({ timeout: 1000 });
}
