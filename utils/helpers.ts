import { expect, Locator, Page } from '@playwright/test';
import { LoginPage } from '../pages/Login';
import { decryptPassword } from './crypto';
import { getRequiredEnvVar } from './env';

export const mercerCountySelector = '[value="MERCER COUNTY SCHOOLS"], [value="Mercer County School District"]';

type ScrollUntilVisibleOptions = {
  target?: Locator | string;
  container?: Locator;
  maxScrolls?: number;
  stepPx?: number;
  pauseMs?: number;
};

type ScrollUntilVisibleAndClickOptions = {
  target: Locator | string;
  container?: Locator;
  maxScrolls?: number;
  stepPx?: number;
  pauseMs?: number;
};

function toLocator(page: Page, target: Locator | string): Locator {
  return typeof target === 'string' ? page.locator(target) : target;
}

async function getDocumentScrollState(page: Page) {
  return page.evaluate(() => {
    const el = document.scrollingElement || document.documentElement;
    return {
      scrollTop: el.scrollTop,
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
    };
  });
}

async function scrollDocumentDown(page: Page, stepPx: number) {
  await page.evaluate((step) => {
    const el = document.scrollingElement || document.documentElement;
    el.scrollTop += step;
  }, stepPx);
}

async function getContainerScrollState(container: Locator) {
  return container.evaluate((el) => {
    const node = el as HTMLElement;
    return {
      scrollTop: node.scrollTop,
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight,
    };
  });
}

async function scrollContainerDown(container: Locator, stepPx: number) {
  await container.evaluate((el, step) => {
    const node = el as HTMLElement;
    node.scrollTop += step;
  }, stepPx);
}

export async function loginToPrimeroEdge(page: Page): Promise<void> {
  const username = getRequiredEnvVar('PE_USERNAME');
  const encryptedPassword = getRequiredEnvVar('ENCRYPTED_PASSWORD');
  const password = decryptPassword(encryptedPassword);

  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.enterUsername(username);
  await loginPage.enterPassword(password);
  await loginPage.clickLogin();
  await page.waitForURL(/(?!.*login\.aspx).*/);
}

// Login with new user
export async function loginToK12CateringAsDistrictUser(page: Page): Promise<void> {
  const username = getRequiredEnvVar('PE_DISTRICT_EMAIL');
  const encryptedPassword = getRequiredEnvVar('PE_DISTRICT_ENCRYPTED_PASSWORD');
  const password = decryptPassword(encryptedPassword);

  const loginPage = new LoginPage(page);
  await loginPage.enterUsername(username);
  await loginPage.enterPassword(password);
  await loginPage.clickLogin();
}

export async function openK12CateringApp(page: Page): Promise<Page> {
  const newTabPromise = page
    .context()
    .waitForEvent('page', { timeout: 15_000 })
    .catch(() => undefined);

  await page.getByRole('link', { name: 'K12Catering' }).click();

  const openedPage = await newTabPromise;
  return openedPage ?? page;
}

type K12CateringNavItem =
  | 'Dashboard'
  | 'Menu'
  | 'Guest Menu'
  | 'Orders'
  | 'Accounts'
  | 'Reports'
  | 'Districts'
  | 'Address Book'
  | 'Check Availability'
  | 'Settings'
  | 'Notifications'
  | 'Manage Notifications'
  | 'My Profile'
  | 'Contact Us'
  | "What's New?";

type LoginToK12CateringOptions = {
  navigateTo?: K12CateringNavItem;
};

export async function loginToK12Catering(
  page: Page,
  options: LoginToK12CateringOptions = {}
): Promise<Page> {
  const { navigateTo } = options;

  await loginToPrimeroEdge(page);

  await expect(page.locator(mercerCountySelector)).toBeVisible();

  const cateringPage = await openK12CateringApp(page);
  await cateringPage.waitForLoadState('domcontentloaded');

  await expect(
    cateringPage.locator('aside[aria-label="Main navigation"]')
  ).toBeVisible();

  if (navigateTo) {
    await navigateK12CateringMenu(cateringPage, navigateTo);
  }

  return cateringPage;
}

export async function navigateK12CateringMenu(
  page: Page,
  menuItem: K12CateringNavItem
): Promise<void> {
  const sidebar = page.locator('aside[aria-label="Main navigation"]');

  await expect(sidebar).toBeVisible({ timeout: 10000 });

  const menuButton = sidebar.getByLabel(`Navigate to ${menuItem}`);

  await expect(menuButton).toBeVisible({ timeout: 10000 });
  await menuButton.click();
}

export async function scrollUntilVisible(
  page: Page,
  options: ScrollUntilVisibleOptions = {}
): Promise<void> {
  const {
    target,
    container,
    maxScrolls = 100,
    stepPx = 900,
    pauseMs = 500,
  } = options;

  const locator = target ? toLocator(page, target).first() : null;

  if (locator && await locator.isVisible().catch(() => false)) {
    await locator.scrollIntoViewIfNeeded();
    return;
  }

  let stagnantCount = 0;

  for (let i = 0; i < maxScrolls; i++) {
    const before = container
      ? await getContainerScrollState(container)
      : await getDocumentScrollState(page);

    if (container) {
      await scrollContainerDown(container, stepPx);
    } else {
      await scrollDocumentDown(page, stepPx);
    }

    await page.waitForTimeout(pauseMs);

    if (locator && await locator.isVisible().catch(() => false)) {
      await locator.scrollIntoViewIfNeeded();
      return;
    }

    const after = container
      ? await getContainerScrollState(container)
      : await getDocumentScrollState(page);

    const reachedBottom =
      after.scrollTop + after.clientHeight >= after.scrollHeight - 5;

    if (reachedBottom) {
      if (!locator) return;
      break;
    }

    const didNotMove =
      after.scrollTop === before.scrollTop &&
      after.scrollHeight === before.scrollHeight;

    if (didNotMove) {
      stagnantCount += 1;
    } else {
      stagnantCount = 0;
    }

    if (stagnantCount >= 3) {
      if (!locator) return;
      break;
    }
  }

  if (locator) {
    throw new Error(`Target was not found while scrolling: ${String(target)}`);
  }
}

export async function scrollUntilVisibleAndClick(
  page: Page,
  options: ScrollUntilVisibleAndClickOptions
): Promise<void> {
  const {
    target,
    container,
    maxScrolls = 100,
    stepPx = 900,
    pauseMs = 500,
  } = options;

  const locator = toLocator(page, target).first();

  await scrollUntilVisible(page, {
    target: locator,
    container,
    maxScrolls,
    stepPx,
    pauseMs,
  });

  await locator.click();
}

export async function getTextFromLocator(
  page: Page,
  target: Locator | string
): Promise<string> {
  const locator = toLocator(page, target).first();
  await expect(locator).toBeVisible();

  const text = await locator.textContent();

  if (text == null) {
    throw new Error(`No text content found for locator: ${String(target)}`);
  }

  return text.trim();
}

export async function getInputValueFromLocator(
  page: Page,
  target: Locator | string
): Promise<string> {
  const locator = toLocator(page, target).first();
  await expect(locator).toBeVisible();

  const value = await locator.inputValue();
  return value.trim();
}

export async function clickAndCaptureNewTab(
  page: Page,
  target: Locator | string,
  timeoutMs = 15000
): Promise<Page> {
  const locator = toLocator(page, target).first();

  const [newTab] = await Promise.all([
    page.context().waitForEvent('page', { timeout: timeoutMs }),
    locator.click(),
  ]);

  await newTab.waitForLoadState('domcontentloaded');
  return newTab;
}