import { test } from '@playwright/test';
import {
  loginToK12Catering,
  scrollUntilVisible,
} from '../utils/helpers';

test.use({ storageState: { cookies: [], origins: [] } });

test('Login Into K12', async ({ page }) => {
  const catering = await loginToK12Catering(page);

  await catering.getByRole('button', { name: 'Settings' }).click();

  await scrollUntilVisible(catering, {
    target: catering.getByText('District Contacts', { exact: true }),
  });
});