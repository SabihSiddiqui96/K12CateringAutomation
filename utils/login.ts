import { Page } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { decryptPassword } from './crypto';
import { getRequiredEnvVar } from './env';

/**
 * Full UI login using credentials from the environment (.env / CI).
 * Use in specs that opt out of `storageState`, or when you need an explicit login step.
 */
export async function login(page: Page): Promise<void> {
  const username = getRequiredEnvVar('PE_USERNAME');
  const encryptedPassword = getRequiredEnvVar('ENCRYPTED_PASSWORD');

  const password = decryptPassword(encryptedPassword);

  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login(username, password);

  await page.waitForURL(/(?!.*login\.aspx).*/);
}
