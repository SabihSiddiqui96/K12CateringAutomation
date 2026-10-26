// Test Link… T-122654 — Menu item cards keep the normal pointer; the photo opens a larger view

import { test, expect, Browser, Locator, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
  getCustomerAccountEmail,
  registerReleaseNotificationHandler,
} from '../../utils/helpers';
import { getRequiredEnvVar } from '../../utils/env';
import { decryptPassword } from '../../utils/crypto';
import { getK12CateringLoginUrl } from '../../utils/baseUrl';

test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1600, height: 1000 } });

const NORMAL_CURSOR = /^(auto|default)$/;
const PHOTO_BTN = /^View larger photo of /;

const menuCards = (p: Page) => p.locator('#main-content div.group.rounded-xl');
const guestCards = (p: Page) => p.locator('article').filter({ has: p.locator('h3') });

const cursorOf = (loc: Locator) => loc.evaluate((e) => getComputedStyle(e).cursor);

/** The card, its name and its details keep the normal pointer; its buttons show a hand. */
async function expectNormalPointer(card: Locator, withButtons: boolean) {
  await expect(card).toBeVisible();
  expect(await cursorOf(card)).toMatch(NORMAL_CURSOR);
  expect(await cursorOf(card.locator('h3').first())).toMatch(NORMAL_CURSOR);
  const description = card.locator('p').filter({ hasText: /\S/ }).first();
  if (await description.count()) expect(await cursorOf(description)).toMatch(NORMAL_CURSOR);
  if (withButtons) {
    const buttons = card.locator('button:not([aria-label^="View larger photo"]), [role="button"]');
    expect(await buttons.count()).toBeGreaterThan(0);
    for (const b of await buttons.all()) expect(await cursorOf(b)).toBe('pointer');
  }
}

/** Clicking the photo opens the larger view; it closes with the X, Escape and an outside click. */
async function expectPhotoViewer(page: Page, card: Locator) {
  const name = (await card.locator('h3').first().innerText()).trim();
  const photo = card.getByRole('button', { name: PHOTO_BTN });
  const dialog = page.getByRole('dialog');

  await photo.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('img')).toBeVisible();
  await expect(dialog.getByText(name, { exact: true }).first()).toBeVisible();
  await dialog.getByRole('button', { name: 'Close photo' }).click();
  await expect(dialog).toBeHidden();

  await photo.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await photo.click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(10, 10);
  await expect(dialog).toBeHidden();
}

async function customerPage(browser: Browser): Promise<Page> {
  const p = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
  await p.goto(getK12CateringLoginUrl());
  await p.locator('#email-input').fill(getCustomerAccountEmail());
  await p.locator('#password-input').fill(decryptPassword(getRequiredEnvVar('K12_CUSTOMER_ENCRYPTED_PASSWORD')));
  await p.getByRole('button', { name: /Sign in/i }).click();
  await expect(p.locator('aside[aria-label="Main navigation"]')).toBeVisible({ timeout: 30000 });
  await registerReleaseNotificationHandler(p);
  return p;
}

test('Catering - Menu - item cards keep the normal pointer and the photo opens a larger view (admin, guest menu, customer)', async ({
  page,
  browser,
}) => {
  test.setTimeout(4 * 60 * 1000);

  const catering = await loginToK12Catering(page, { navigateTo: 'Menu' });
  await expect(menuCards(catering).first()).toBeVisible({ timeout: 30000 });

  await test.step('Menu grid view', async () => {
    const card = menuCards(catering).filter({ has: catering.getByRole('button', { name: PHOTO_BTN }) }).first();
    await expectNormalPointer(card, true);
    await expectPhotoViewer(catering, card);
  });

  await test.step('Menu list view', async () => {
    await catering.getByRole('button', { name: 'Switch to list view' }).click();
    const card = catering.locator('#main-content div.group').filter({ has: catering.getByRole('button', { name: PHOTO_BTN }) }).first();
    await expectNormalPointer(card, true);
    await expectPhotoViewer(catering, card);
    await catering.getByRole('button', { name: 'Switch to grid view' }).click();
  });

  await test.step('Guest Menu matches', async () => {
    await navigateK12CateringMenu(catering, 'Guest Menu');
    const card = guestCards(catering).filter({ has: catering.getByRole('button', { name: PHOTO_BTN }) }).first();
    await expect(card).toBeVisible({ timeout: 30000 });
    await expectNormalPointer(card, false);
    await expectPhotoViewer(catering, card);
  });

  await test.step('Customer view', async () => {
    const cust = await customerPage(browser);
    try {
      await cust.getByRole('listitem', { name: /Navigate to Menu/i }).click();
      const card = menuCards(cust).filter({ has: cust.getByRole('button', { name: PHOTO_BTN }) }).first();
      await expect(card).toBeVisible({ timeout: 30000 });
      await expectNormalPointer(card, true);
      await expectPhotoViewer(cust, card);
    } finally {
      await cust.context().close().catch(() => undefined);
    }
  });
});
