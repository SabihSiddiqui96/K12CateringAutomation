import { expect, Locator, Page } from '@playwright/test';
import { LoginPage } from '../pages/Login';
import { decryptPassword } from './crypto';
import { getEnvVar, getRequiredEnvVar } from './env';
import { getK12CateringUrl } from './baseUrl';

export function getDistrictName(): string {
  return getEnvVar('DISTRICT_NAME', { required: false }) || 'Mercer County School District';
}

export const mercerCountySelector = '[value="MERCER COUNTY SCHOOLS"], [value="Mercer County School District"]';

function positiveIntFromEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

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
  const loginPath = getEnvVar('LOGIN_PATH', { required: false }) || '/login.aspx';
  await page.waitForURL(url => !url.href.includes(loginPath), {
    timeout: positiveIntFromEnv('LOGIN_SUBMIT_TIMEOUT_MS', process.env.CI ? 60000 : 30000),
  });
}

// Logs in to SchoolCafé (qa.perseusedge.com) — a separate platform from
// PrimeroEdge Classic, with its own credentials (qaSchoolCafeEmail /
// qaSchoolCafePassword, the password stored encrypted in .env like the others).
export async function loginToSchoolCafe(page: Page): Promise<void> {
  const email = getRequiredEnvVar('qaSchoolCafeEmail');
  const password = decryptPassword(getRequiredEnvVar('qaSchoolCafePassword'));
  const baseUrl =
    getEnvVar('SCHOOLCAFE_URL', { required: false }) || 'https://qa.perseusedge.com';

  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  // The submit button's accessible name is "button-child"; match its visible text.
  await page.locator('button:has-text("SIGN IN")').click();

  // The module nav renders the workspace modules (each is a <div title="…">).
  // Wait for the always-present Home module to confirm we're logged in.
  await expect(page.locator('nav [title="Home"]')).toBeVisible({
    timeout: positiveIntFromEnv('SCHOOLCAFE_LOGIN_TIMEOUT_MS', process.env.CI ? 60000 : 30000),
  });
}

// Login with new user
export async function loginToK12CateringAsDistrictUser(page: Page): Promise<void> {
  const isUAT = getEnvVar('DIRECT_K12_LOGIN', { required: false }) === 'true';
  const username = getRequiredEnvVar(isUAT ? 'PE_UAT_DISTRICT_EMAIL' : 'PE_DISTRICT_EMAIL');
  const encryptedPassword = getRequiredEnvVar(isUAT ? 'PE_UAT_DISTRICT_ENCRYPTED_PASSWORD' : 'PE_DISTRICT_ENCRYPTED_PASSWORD');
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

  // The page has TWO links to /K12Catering/K12Catering.aspx — one in the
  // hidden left-nav module list (off-screen) and the visible Workspace
  // tile. Use Playwright's `:visible` pseudo to pick the visible one.
  const cateringLink = page
    .locator('a[href*="K12Catering.aspx" i]:visible')
    .first();
  await cateringLink.scrollIntoViewIfNeeded().catch(() => undefined);
  await cateringLink.click();

  const openedPage = await newTabPromise;
  return openedPage ?? page;
}

async function finishK12CateringLaunch(page: Page): Promise<void> {
  const sidebar = page.locator('aside[aria-label="Main navigation"]');
  if (await sidebar.isVisible({ timeout: 5000 }).catch(() => false)) {
    return;
  }

  const launcherLink = page
    .locator(`a[href*="${getK12CateringUrl()}/login?token="]`)
    .first();

  if (await launcherLink.isVisible({ timeout: 3000 }).catch(() => false)) {
    await launcherLink.click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForLoadState('networkidle').catch(() => { });
  }

  if (await sidebar.isVisible({ timeout: 5000 }).catch(() => false)) {
    return;
  }

  const validationError = page.getByText(
    /Failed to validate user with catering system/i,
  );
  if (await validationError.isVisible({ timeout: 2000 }).catch(() => false)) {
    await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => { });

    if (await launcherLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await launcherLink.click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForLoadState('networkidle').catch(() => { });
    }
  }
}

type K12CateringNavItem =
  | 'Dashboard'
  | 'Menu'
  | 'Guest Menu'
  | 'Orders'
  | 'Data Sync'
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

export async function handle404Page(page: Page): Promise<boolean> {
  const errorCode = page.getByText(/Error Code: 404/i);
  if (await errorCode.isVisible({ timeout: 1000 }).catch(() => false)) {
    await page.getByRole('button', { name: /Back to previous page/i }).click();
    await page.waitForLoadState('domcontentloaded');
    return true;
  }
  return false;
}

export async function loginToK12Catering(
  page: Page,
  options: LoginToK12CateringOptions = {}
): Promise<Page> {
  const { navigateTo } = options;

  // Authenticate to PrimeroEdge once. LoginPage.goto() already retries the
  // login page itself, and the observed flakiness is downstream (the catering
  // launch), so this stays outside the launch-retry loop below.
  await loginToPrimeroEdge(page);

  const directLogin = getEnvVar('DIRECT_K12_LOGIN', { required: false }) === 'true';

  // Smart login-phase retry: opening the K12 Catering app and waiting for its
  // sidebar is intermittently flaky (the new tab / sidebar sometimes never
  // renders) even when the test itself is fine. Retry ONLY this login/launch
  // phase a few times. Once the sidebar is visible we hand control back to the
  // test — any failure AFTER this point is a genuine test failure and is NOT
  // retried here (a "fail is a fail" once we're actually inside the app).
  const maxAttempts = positiveIntFromEnv('K12_LOGIN_RETRIES', 3);
  let cateringPage: Page | undefined;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // On a retry, wait a (growing) moment first — the failure is usually a
      // transiently-slow backend (worst around the 3am scheduled run), so
      // spacing the attempts out rides over the slow window instead of hammering
      // back-to-back like a plain Playwright retry does. Then refresh the
      // workspace (PrimeroEdge stays authenticated) so the catering tile /
      // sidebar starts from a clean state before re-launch.
      if (attempt > 1) {
        const backoffMs = positiveIntFromEnv('K12_LOGIN_RETRY_BACKOFF_MS', 5000) * (attempt - 1);
        await page.waitForTimeout(backoffMs);
        await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => { });
      }

      if (directLogin) {
        cateringPage = page;
      } else {
        await expect(page.locator(mercerCountySelector)).toBeVisible({
          timeout: positiveIntFromEnv('DISTRICT_SELECTOR_TIMEOUT_MS', process.env.CI ? 60000 : 10000),
        });
        cateringPage = await openK12CateringApp(page);
        await cateringPage.waitForLoadState('domcontentloaded');
        await finishK12CateringLaunch(cateringPage);
      }

      await expect(
        cateringPage.locator('aside[aria-label="Main navigation"]')
      ).toBeVisible({ timeout: positiveIntFromEnv('K12_SIDEBAR_TIMEOUT_MS', process.env.CI ? 60000 : 30000) });

      break; // sidebar is up — login/launch succeeded, stop retrying
    } catch (err) {
      lastError = err;
      // Discard a half-opened catering tab so the next attempt starts clean
      // (the main `page` stays on the PrimeroEdge workspace to re-launch from).
      if (cateringPage && cateringPage !== page) {
        await cateringPage.close().catch(() => { });
      }
      cateringPage = undefined;
      if (attempt >= maxAttempts) throw lastError;
      const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
      console.log(`[login] launch attempt ${attempt}/${maxAttempts} failed (${msg}); retrying login...`);
    }
  }

  const catering = cateringPage as Page;

  // Auto-handle 404 pages that occasionally appear during navigation
  await catering.addLocatorHandler(
    catering.getByText(/Error Code: 404/i),
    async () => {
      const backBtn = catering.getByRole('button', { name: /Back to previous page/i });
      if (await backBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await backBtn.click();
        await catering.waitForLoadState('domcontentloaded');
      }
    }
  );

  if (navigateTo) {
    await navigateK12CateringMenu(catering, navigateTo);
  }

  return catering;
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

/**
 * Set a paginated list's page-size control (e.g. "20 / page") to `size`
 * (default 100). Handles both a native <select> and a click-to-open combobox.
 * Best-effort: silently returns if no page-size control is on the page.
 */
export async function setListPageSize(page: Page, size = 100): Promise<void> {
  const control = page
    .getByRole('combobox', { name: /per page|page size|rows per page/i })
    .or(page.getByRole('button', { name: /\d+\s*\/\s*page/i }))
    .or(page.locator('select').filter({ hasText: /\d+\s*\/\s*page/i }))
    .first();

  if (!(await control.isVisible({ timeout: 5000 }).catch(() => false))) return;

  await control.click();

  // Native <select>: selectOption handles either spacing of the label.
  for (const label of [`${size} / page`, `${size}/page`]) {
    const ok = await control.selectOption({ label }).catch(() => null);
    if (ok) {
      await page.waitForTimeout(600);
      return;
    }
  }

  // Otherwise it is a popup menu — click the matching option.
  await page
    .getByRole('option', { name: new RegExp(`^\\s*${size}\\s*/\\s*page\\s*$`, 'i') })
    .first()
    .click()
    .catch(() => {});
  await page.waitForTimeout(600);
}

type FindRowAcrossPagesOptions = {
  /** Text/regex the target row must contain (e.g. the menu-item name). */
  match: string | RegExp;
  /** CSS for the row elements. Default: table rows / ARIA grid rows. */
  rowSelector?: string;
  /** Bump to this page size before searching; pass null to leave it as-is. */
  pageSize?: number | null;
  /** Max pages to walk before giving up. */
  maxPages?: number;
  /** How long to wait for the row to appear on each page. */
  timeoutPerPageMs?: number;
};

/**
 * Find a row in a paginated list, walking pages when needed.
 *
 * Some filters (e.g. Data Sync's "Local Overrides") only evaluate the items on
 * the CURRENT page, so a matching row can hide on page 2+. This first bumps the
 * page size (default 100 / page) to pull more rows onto one page, then — if the
 * row still is not visible — clicks through to the next page until it appears or
 * the pages run out.
 *
 * Returns the matching row Locator (scrolled into view). Throws if not found.
 *
 * Example:
 *   const row = await findRowAcrossPages(catering, { match: itemName });
 *   await expect(row.getByText(/^Overrides$/i)).toBeVisible();
 */
export async function findRowAcrossPages(
  page: Page,
  options: FindRowAcrossPagesOptions
): Promise<Locator> {
  const {
    match,
    rowSelector = 'table tbody tr, [role="row"]',
    pageSize = 100,
    maxPages = 10,
    timeoutPerPageMs = 4000,
  } = options;

  if (pageSize != null) {
    await setListPageSize(page, pageSize);
  }

  for (let pageIndex = 1; pageIndex <= maxPages; pageIndex++) {
    const row = page.locator(rowSelector).filter({ hasText: match }).first();
    if (await row.isVisible({ timeout: timeoutPerPageMs }).catch(() => false)) {
      await row.scrollIntoViewIfNeeded().catch(() => {});
      return row;
    }

    // Advance to the next page. Prefer an explicit Next control; fall back to
    // the numbered page button for the next index (e.g. "2", "3", ...).
    const nextByLabel = page
      .getByRole('button', { name: /next page|^next$|^›$|^»$|^>$/i })
      .first();
    const nextByNumber = page
      .getByRole('button', { name: new RegExp(`^\\s*${pageIndex + 1}\\s*$`) })
      .first();

    const next = (await nextByLabel
      .isVisible({ timeout: 1000 })
      .catch(() => false))
      ? nextByLabel
      : nextByNumber;

    const canAdvance =
      (await next.isVisible({ timeout: 1000 }).catch(() => false)) &&
      (await next.isEnabled().catch(() => false));
    if (!canAdvance) break;

    await next.click();
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(700);
  }

  throw new Error(
    `findRowAcrossPages: no row matching ${String(match)} found within ${maxPages} page(s).`
  );
}
