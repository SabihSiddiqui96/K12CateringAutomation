import { expect, Locator, Page } from '@playwright/test';
import { navigateK12CateringMenu } from './helpers';

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
  await navigateK12CateringMenu(page, 'Accounts');
  await page.waitForLoadState('domcontentloaded');

  const searchBox = page.getByRole('textbox', {
    name: /Search accounts by name, username, or email/i,
  });
  await expect(searchBox).toBeVisible({ timeout: 10000 });
  await searchBox.fill(customerEmail);
  await page.waitForTimeout(600);

  const accountCard = page.getByRole('listitem').filter({
    hasText: customerEmail,
  }).first();
  await expect(accountCard).toBeVisible({ timeout: 10000 });

  const actionsButton = accountCard.getByRole('button', { name: /Actions for/i });
  await expect(actionsButton).toBeVisible({ timeout: 10000 });
  await actionsButton.click();

  const changePasswordMenuItem = page.getByRole('menuitem', {
    name: /Change Password/i,
  });
  await expect(changePasswordMenuItem).toBeVisible({ timeout: 5000 });
  await changePasswordMenuItem.click();

  const dialog = changePasswordDialog(page);
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
