import { test, expect } from '@playwright/test';
import { login } from '../utils/login';

// This spec performs a real login; do not reuse saved session from globalSetup.
test.use({ storageState: { cookies: [], origins: [] } });

test('Login Test', async ({ page }) => {
  await login(page);
  await expect(page).not.toHaveURL(/login\.aspx/);
});
