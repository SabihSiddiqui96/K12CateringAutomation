// Test Link: https://dev.azure.com/Cybersoft-Technologies-Inc/PrimeroEdge%20Classic/_workitems/edit/117488
// T-116454 — "K12 Catering" has been renamed to "Catering" everywhere:
//   • PrimeroEdge Classic workspace tile is now "Catering"
//   • launching it opens the K12Catering.aspx interstitial (tab title
//     "PrimeroEdge - Catering") whose site title is "Catering" and which shows
//     "You will be automatically authenticated and redirected to Catering in 5 seconds."
//   • the Catering app tab title is "Catering"
//   • on SchoolCafé (Perseus) the module tooltip reads "Catering"

import { test, expect, BrowserContext, Page } from '@playwright/test';
import {
  loginToPrimeroEdge,
  loginToSchoolCafe,
  loginToK12Catering,
  isUatDirectLogin,
} from '../../utils/helpers';

test.use({ storageState: { cookies: [], origins: [] } });

// Launching Catering opens two tabs at once (the .aspx interstitial and the
// catering app); grab whichever matches the given URL.
async function waitForTab(
  context: BrowserContext,
  urlRe: RegExp,
  timeout = 20000,
): Promise<Page> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const pg = context.pages().find((p) => urlRe.test(p.url()));
    if (pg) return pg;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`No tab matched ${urlRe} within ${timeout}ms`);
}

test('Catering - Rename - "K12 Catering" shows as "Catering" in PrimeroEdge workspace, launch interstitial, and SchoolCafe module tooltip', async ({
  page,
  context,
}) => {
  test.setTimeout(3 * 60 * 1000);

  // On UAT (direct K12 login) the PrimeroEdge Classic workspace tile, the .aspx
  // interstitial, and SchoolCafé don't exist — but the rename is still verifiable
  // from the app itself: the browser tab title reads "Catering" and "K12
  // Catering" appears nowhere. Verify that and finish.
  if (isUatDirectLogin()) {
    const catering = await loginToK12Catering(page);
    await expect(
      catering.locator('aside[aria-label="Main navigation"]'),
    ).toBeVisible({ timeout: 30000 });
    await expect(catering).toHaveTitle(/^Catering$/i);
    await expect(catering.getByText(/K12\s*Catering/i)).toHaveCount(0);
    return;
  }

  // ── PrimeroEdge Classic: Workspace tile renamed "K12 Catering" → "Catering" ──
  await loginToPrimeroEdge(page);

  const cateringTile = page
    .locator('a[href*="K12Catering.aspx" i]:visible')
    .first();
  await expect(cateringTile).toBeVisible({ timeout: 30000 });
  await expect(cateringTile).toContainText(/Catering/i);
  await expect(cateringTile).not.toContainText(/K12\s*Catering/i);

  // ── Launch Catering → opens the .aspx interstitial + the app, in two tabs ──
  await cateringTile.click();

  // Interstitial tab (qa.primeroedge.co/.../K12Catering.aspx)
  const interstitial = await waitForTab(context, /K12Catering\.aspx/i);
  await expect(interstitial).toHaveTitle('PrimeroEdge - Catering');
  await expect(
    interstitial.getByRole('heading', { name: 'Catering' }).first(),
  ).toBeVisible();
  await expect(
    interstitial.getByText(
      /You will be automatically authenticated and redirected to Catering in \d+ seconds/i,
    ),
  ).toBeVisible();

  // Catering app tab (qak12cateringui.perseusedge.com) — title "Catering"
  const appTab = await waitForTab(context, /perseusedge\.com/i);
  await expect(appTab).toHaveTitle('Catering');
  await expect(
    appTab.locator('aside[aria-label="Main navigation"]'),
  ).toBeVisible({ timeout: 60000 });

  // ── SchoolCafé (Perseus): module tooltip now reads "Catering" ──
  const sc = await context.newPage();
  await loginToSchoolCafe(sc);

  const cateringModule = sc.locator('nav [title="Catering"]');
  await expect(cateringModule).toBeVisible({ timeout: 20000 });
  await cateringModule.hover();
  await expect(sc.getByRole('tooltip', { name: 'Catering' })).toBeVisible({
    timeout: 10000,
  });
});
