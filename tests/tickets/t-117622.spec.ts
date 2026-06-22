// Test Link: https://dev.azure.com/Cybersoft-Technologies-Inc/PrimeroEdge%20Classic/_workitems/edit/117622

import { test, expect, Page } from '@playwright/test';
import { loginToK12Catering } from '../../utils/helpers';
import { ensureInK12CateringApp, clickSidebarItem } from '../../utils/dataSync';

test.use({ storageState: { cookies: [], origins: [] } });

async function openDashboard(page: Page): Promise<void> {
  await ensureInK12CateringApp(page);
  await clickSidebarItem(page, 'User Feedback');
  await ensureInK12CateringApp(page);
  await expect(page).toHaveURL(/\/admin\/feedback/, { timeout: 20000 });
  await expect(page.getByRole('heading', { name: 'User Feedback' })).toBeVisible({ timeout: 20000 });
  await page.getByText(/Loading/i).first().waitFor({ state: 'hidden', timeout: 15000 }).catch(() => { });
}

test('Catering - User Feedback - the "Send Digest Now" manual-trigger button is present on the dashboard', async ({
  page,
}) => {
  test.setTimeout(4 * 60 * 1000);

  const c = await loginToK12Catering(page);
  await openDashboard(c);

  // The manual digest trigger is on the (Cybersoft-Admin-only) User Feedback
  // dashboard. We only assert its presence — clicking it sends a real email.
  await expect(c.getByRole('button', { name: /Send Digest Now/i })).toBeVisible({ timeout: 10000 });
});
