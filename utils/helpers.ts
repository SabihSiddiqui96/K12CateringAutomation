import { expect, Locator, Page } from '@playwright/test';
import { LoginPage } from '../pages/Login';
import { decryptPassword } from './crypto';
import { getEnvVar, getRequiredEnvVar } from './env';
import { getK12CateringUrl } from './baseUrl';

export function getDistrictName(): string {
  return getEnvVar('DISTRICT_NAME', { required: false }) || 'Mercer County School District';
}

export function getSecondaryDistrictName(): string {
  return getEnvVar('SECONDARY_DISTRICT_NAME', { required: false }) || 'Berkeley School District';
}

// Auto-dismiss the "Catering vX.Y.Z is Now Available" What's-New release announcement modal.
export async function registerReleaseNotificationHandler(page: Page): Promise<void> {
  await page.addLocatorHandler(
    page.getByRole('button', { name: 'Close notification' }),
    async (locator) => {
      await locator.click().catch(() => {});
    }
  );
}

// Escape a string for use inside a RegExp. dataSync re-exports it.
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Rows in the app's paginated lists.
export const LIST_ROW_SELECTOR = 'table tbody tr, [role="row"]';

// Wait for a list to re-render after a filter/search/page-size change instead of sleeping.
export async function waitForListSettled(page: Page): Promise<void> {
  await page
    .locator('[aria-busy="true"], [role="progressbar"], .animate-spin, svg.animate-spin')
    .first()
    .waitFor({ state: 'hidden', timeout: 10000 })
    .catch(() => undefined);
}

// Build a case-insensitive regex that matches a district name on screen even when the app
export function getDistrictNameRegex(name: string = getDistrictName()): RegExp {
  const escaped = escapeRegExp(name).replace(/['‘’]/g, "['\\u2018\\u2019]");
  return new RegExp(escaped, 'i');
}

// Whether we're running against the UAT/Release env (direct K12 login).
export function isUatDirectLogin(): boolean {
  return getEnvVar('DIRECT_K12_LOGIN', { required: false }) === 'true';
}

// The demo customer ACCOUNT an admin manages in the Accounts list.
export function getCustomerAccountEmail(): string {
  return isUatDirectLogin()
    ? getEnvVar('UAT_ACCOUNT_CUSTOMER_EMAIL', { required: false }) || 'SiddiquiUATTesting@outlook.com'
    : getEnvVar('QA_ACCOUNT_CUSTOMER_EMAIL', { required: false }) || 'SabihQATesting@outlook.com';
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
  /** Ceiling on the per-step wait, not a fixed sleep. */
  settleMs?: number;
};

type ScrollUntilVisibleAndClickOptions = {
  target: Locator | string;
  container?: Locator;
  maxScrolls?: number;
  stepPx?: number;
  settleMs?: number;
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

// Logs in to SchoolCafé (qa.perseusedge.com)
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
  await expect(page.locator('nav [title="Home"]')).toBeVisible({
    timeout: positiveIntFromEnv('SCHOOLCAFE_LOGIN_TIMEOUT_MS', process.env.CI ? 60000 : 30000),
  });
}

// Signs in on a login form that is already on screen.
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
  // The page has TWO links to /K12Catering/K12Catering.aspx
  const cateringLink = page
    .locator('a[href*="K12Catering.aspx" i]:visible')
    .first();

  // The Workspace tile has been observed to disappear entirely from the PrimeroEdge dashboard
  if (await cateringLink.count() === 0) {
    const target = new URL('/K12Catering/K12Catering.aspx', page.url()).toString();
    console.log(
      `[login] no K12 Catering tile on the PrimeroEdge workspace; navigating directly to ${target}`
    );
    // That page is the same launch interstitial the tile leads to
    const redirectedTab = page
      .context()
      .waitForEvent('page', { timeout: 20_000 })
      .catch(() => undefined);
    await page.goto(target, { waitUntil: 'domcontentloaded' });
    const openedPage = await redirectedTab;
    return openedPage ?? page;
  }

  const newTabPromise = page
    .context()
    .waitForEvent('page', { timeout: 15_000 })
    .catch(() => undefined);

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

  // Navigate rather than click
  if (await launcherLink.isVisible({ timeout: 3000 }).catch(() => false)) {
    const href = await launcherLink.getAttribute('href');
    if (href) {
      await page.goto(href, { waitUntil: 'domcontentloaded' });
    } else {
      await launcherLink.click();
      await page.waitForLoadState('domcontentloaded');
    }
  }

  // The sidebar is the "launch finished" signal.
  if (await sidebar.isVisible({ timeout: 15000 }).catch(() => false)) {
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
      await sidebar.waitFor({ state: 'visible', timeout: 15000 }).catch(() => { });
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
  | 'User Feedback'
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

  // Authenticate to PrimeroEdge once.
  await loginToPrimeroEdge(page);

  const directLogin = getEnvVar('DIRECT_K12_LOGIN', { required: false }) === 'true';

  // Smart login-phase retry
  const maxAttempts = positiveIntFromEnv('K12_LOGIN_RETRIES', 3);
  let cateringPage: Page | undefined;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // On a retry, wait a (growing) moment first
      if (attempt > 1) {
        const backoffMs = positiveIntFromEnv('K12_LOGIN_RETRY_BACKOFF_MS', 5000) * (attempt - 1);
        await page.waitForTimeout(backoffMs);
        await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => { });

        // A backend blip can land us on the PrimeroEdge "Internal Server Error / Error Code
        const on500 = await page
          .getByText(/Internal Server Error|Error Code:\s*500/i)
          .first()
          .isVisible({ timeout: 2000 })
          .catch(() => false);
        if (on500) {
          await loginToPrimeroEdge(page).catch(() => { });
        }
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
      // Discard a half-opened catering tab so the next attempt starts clean (the main `page` stays
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

  // Auto-handle the PrimeroEdge SSO re-launch interstitial ("You will be automatically
  await catering.addLocatorHandler(
    // .first() is load-bearing.
    catering.getByText(/automatically authenticated and redirected to Catering/i).first(),
    async () => {
      await dismissReauthInterstitial(catering);
    }
  );

  await registerReleaseNotificationHandler(catering);

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

  await expect(sidebar).toBeVisible();

  const menuButton = sidebar.getByLabel(`Navigate to ${menuItem}`);

  await expect(menuButton).toBeVisible();
  await menuButton.click();
}

/** Wait out the PrimeroEdge SSO re-launch interstitial ("You will be automatically */
export async function dismissReauthInterstitial(page: Page): Promise<void> {
  // The relaunch can re-trigger (e.g.
  for (let i = 0; i < 3; i += 1) {
    // .first() for the same reason as the handler above
    const banner = page
      .getByText(/automatically authenticated and redirected to Catering/i)
      .first();
    if (!(await banner.isVisible({ timeout: 1000 }).catch(() => false))) {
      if (i > 0) console.log(`[reauth] interstitial cleared after ${i} attempt(s)`);
      return;
    }
    console.log(`[reauth] interstitial visible, attempt ${i + 1}/3 at ${page.url().slice(0, 80)}`);
    // The link's accessible name is exactly "link".
    await page
      .getByRole('link', { name: 'link', exact: true })
      .first()
      .click()
      .catch(() => undefined);
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await banner.waitFor({ state: 'hidden', timeout: 12000 }).catch(() => undefined);
  }
}

// For something merely below the fold use locator.scrollIntoViewIfNeeded().
export async function scrollUntilVisible(
  page: Page,
  options: ScrollUntilVisibleOptions = {}
): Promise<void> {
  const {
    target,
    container,
    maxScrolls = 100,
    stepPx = 900,
    settleMs = 500,
  } = options;

  const locator = target ? toLocator(page, target).first() : null;

  if (locator && await locator.isVisible().catch(() => false)) {
    await locator.scrollIntoViewIfNeeded();
    return;
  }

  const readState = () =>
    container ? getContainerScrollState(container) : getDocumentScrollState(page);

  let stagnantCount = 0;

  for (let i = 0; i < maxScrolls; i++) {
    const before = await readState();

    if (container) {
      await scrollContainerDown(container, stepPx);
    } else {
      await scrollDocumentDown(page, stepPx);
    }

    if (locator) {
      // The target showing up is the whole point of the scroll
      const appeared = await locator
        .waitFor({ state: 'visible', timeout: settleMs })
        .then(() => true)
        .catch(() => false);
      if (appeared) {
        await locator.scrollIntoViewIfNeeded();
        return;
      }
    } else {
      // No target: wait for the view to actually move or for more content to render.
      await expect(async () => {
        const now = await readState();
        expect(
          now.scrollTop !== before.scrollTop || now.scrollHeight !== before.scrollHeight,
        ).toBeTruthy();
      })
        .toPass({ timeout: settleMs, intervals: [50, 100, 200] })
        .catch(() => undefined);
    }

    // Lazily-rendered rows can still be arriving after the scroll settles.
    await waitForListSettled(page);

    const after = await readState();

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
    settleMs = 500,
  } = options;

  const locator = toLocator(page, target).first();

  await scrollUntilVisible(page, {
    target: locator,
    container,
    maxScrolls,
    stepPx,
    settleMs,
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

/** Set a paginated list's page-size control (e.g. */
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
      await waitForListSettled(page);
      return;
    }
  }

  // Otherwise it is a popup menu: click the option and wait for it to close.
  const option = page
    .getByRole('option', { name: new RegExp(`^\\s*${size}\\s*/\\s*page\\s*$`, 'i') })
    .first();
  if (await option.isVisible({ timeout: 3000 }).catch(() => false)) {
    await option.click();
    await option.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => undefined);
  }
  await waitForListSettled(page);
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

/** Find a row in a paginated list, walking pages when needed. */
export async function findRowAcrossPages(
  page: Page,
  options: FindRowAcrossPagesOptions
): Promise<Locator> {
  const {
    match,
    rowSelector = LIST_ROW_SELECTOR,
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

    // Advance to the next page.
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

    // Wait for the rows to actually turn over rather than sleeping.
    const firstRowBefore = await page
      .locator(rowSelector)
      .first()
      .textContent()
      .catch(() => null);
    await next.click();
    await waitForListSettled(page);
    await expect(async () => {
      const firstRowAfter = await page
        .locator(rowSelector)
        .first()
        .textContent()
        .catch(() => null);
      expect(firstRowAfter).not.toBe(firstRowBefore);
    })
      .toPass({ timeout: 8000, intervals: [200, 400, 800] })
      .catch(() => undefined);
  }

  throw new Error(
    `findRowAcrossPages: no row matching ${String(match)} found within ${maxPages} page(s).`
  );
}
