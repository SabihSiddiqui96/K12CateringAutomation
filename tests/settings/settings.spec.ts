import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
  getCustomerAccountEmail,
} from '../../utils/helpers';
import { getRequiredEnvVar } from '../../utils/env';
import { decryptPassword } from '../../utils/crypto';
import { getK12CateringLoginUrl } from '../../utils/baseUrl';
import { addFirstMenuItemToCart, proceedToCheckout } from '../../utils/orderFlow';
import { switchToCustomerDistrict } from '../../utils/dataSync';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Open the checkout calendar and return the calendar's own "today". */
async function openEventCalendar(p: Page): Promise<Date> {
  await p.getByRole('button', { name: /Select Event Date/i }).click();
  const today = p.getByRole('button', { name: /, today/ });
  await expect(today).toBeVisible();
  const [, month, day, year] = ((await today.getAttribute('aria-label')) ?? '')
    .match(/(\w+) (\d{1,2}), (\d{4})/) ?? [];
  return new Date(Number(year), MONTHS.indexOf(month), Number(day));
}

/** The calendar button for `date`, paging forward a month if it is not shown yet. */
async function dayButton(p: Page, date: Date) {
  const label = `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  const btn = p.locator(`button[aria-label^="${label}"]`);
  if (!(await btn.isVisible().catch(() => false))) {
    await p.getByRole('button', { name: 'Next month' }).click();
  }
  await expect(btn).toBeVisible();
  return btn;
}

/** Empty the cart from the checkout sidebar. */
async function emptyCart(p: Page): Promise<void> {
  const remove = p.getByRole('button', { name: 'Remove from cart' });
  for (let i = 0; i < 10 && (await remove.first().isVisible().catch(() => false)); i++) {
    await remove.first().click();
    await p.waitForTimeout(500);
  }
}

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Settings', () => {
  let catering: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    catering = await loginToK12Catering(page);
  });

  test.beforeEach(async () => {
    // A modal left open by a previous test puts a full-screen backdrop over the sidebar
    const backdrop = catering.locator('div[aria-label="Close dialog"]').first();
    if (await backdrop.waitFor({ state: 'visible', timeout: 2000 }).then(() => true, () => false)) {
      await catering.reload({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
      await catering
        .locator('aside[aria-label="Main navigation"]')
        .waitFor({ state: 'visible', timeout: 30000 })
        .catch(() => undefined);
    }
    await navigateK12CateringMenu(catering, 'Settings');
    await catering.waitForLoadState('domcontentloaded');
  });

  async function openModal(btnName: RegExp) {
    await catering.getByRole('button', { name: btnName }).click();
    await catering.waitForTimeout(500);
  }

  async function closeModal() {
    const cancelBtn = catering.getByRole('button', { name: /Cancel/i });
    if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cancelBtn.click();
    } else {
      await catering.keyboard.press('Escape');
    }
    await catering.waitForTimeout(300);
  }


  test('Settings - Page heading and all major sections are visible', async () => {
    await expect(catering.locator('h1')).toContainText('Settings');
    await expect(catering.getByRole('region', { name: /Business settings/i })).toBeVisible();
    await expect(catering.getByRole('region', { name: /Operation schedule settings/i })).toBeVisible();
    await expect(catering.getByRole('heading', { name: /Hours of Operation/i })).toBeVisible();
    await expect(catering.getByRole('heading', { name: /Order Lead Time/i })).toBeVisible();
    await expect(catering.getByRole('heading', { name: /Max Event Date/i })).toBeVisible();
    await expect(catering.getByRole('heading', { name: /Order Settings/i })).toBeVisible();
    await expect(catering.getByRole('heading', { name: /Sales Tax Rate/i })).toBeVisible();
    await expect(catering.getByRole('heading', { name: /Delivery Fee/i })).toBeVisible();
    // T-118254 added "Minimum Order Amount for Complimentary Items"
    await expect(
      catering.getByRole('heading', { name: 'Minimum Order Amount', exact: true }),
    ).toBeVisible();
    await expect(catering.getByRole('region', { name: /Short URL settings/i })).toBeVisible();
    await expect(catering.getByRole('region', { name: /Holiday schedule settings/i })).toBeVisible();
  });

  test('Settings - Order Lead Time shows current value and modal with Save/Cancel', async () => {
    await expect(catering.getByText(/\d+ Days?/i).first()).toBeVisible();
    await openModal(/Edit order lead time/i);
    const input = catering.getByRole('spinbutton').or(catering.getByRole('textbox', { name: /lead time/i })).first();
    await expect(input).toBeVisible();
    await expect(catering.getByRole('button', { name: /Save/i })).toBeVisible();
    await input.clear();
    await input.fill('99');
    await closeModal();
    await expect(catering.getByText(/99 Days?/i)).not.toBeVisible({ timeout: 3000 });
  });

  test('Settings - Minimum Order Amount modal shows helper text and Save button', async () => {
    await openModal(/Edit minimum order amount/i);
    await expect(catering.getByText(/Set to \$0 to disable/i)).toBeVisible();
    await expect(catering.getByRole('button', { name: /Save/i })).toBeVisible();
    await closeModal();
  });

  test('Settings - Short URL section shows URL value and action buttons', async () => {
    await expect(catering.getByRole('heading', { name: /Short URL/i })).toBeVisible();
    await expect(catering.getByText(/https:\/\/.*\/GUEST\//i)).toBeVisible();
    await expect(catering.getByRole('button', { name: /Open Short URL in new tab/i })).toBeVisible();
    await expect(catering.getByRole('button', { name: /Copy Short URL to clipboard/i })).toBeVisible();
    await expect(catering.getByRole('button', { name: /Edit Short URL/i })).toBeVisible();
  });

  test('Settings - Holiday Schedule section shows heading, year filter and Add Holiday button', async () => {
    await expect(catering.getByRole('region', { name: /Holiday schedule settings/i })).toBeVisible();
    await expect(catering.getByRole('heading', { name: /Holiday Schedule/i })).toBeVisible();
    await expect(catering.getByRole('button', { name: /Add new holiday/i })).toBeVisible();
    await expect(catering.getByText(/Filter holidays by year/i)).toBeVisible();
    const year = new Date().getFullYear();
    await expect(catering.getByRole('heading', { name: new RegExp(`Holiday list for ${year}`, 'i') })).toBeVisible();
  });

  test('Settings - District Contacts section shows existing contacts with edit/delete buttons', async () => {
    await expect(catering.getByRole('heading', { name: /District Contacts/i })).toBeVisible();
    await expect(catering.getByRole('button', { name: /Add\s+(new\s+)?contact/i })).toBeVisible();
    await expect(catering.getByRole('button', { name: /^Edit .+$/i }).first()).toBeVisible();
    await expect(catering.getByRole('button', { name: /^Delete .+$/i }).first()).toBeVisible();
  });

  test('Settings - Order Lead Time restricts customers but an admin can pick any date', async ({ browser }) => {
    test.slow();
    // On UAT the customer lives in a different district from the admin's default.
    await switchToCustomerDistrict(catering);
    await navigateK12CateringMenu(catering, 'Settings');
    const leadText = (await catering
      .getByRole('heading', { name: 'Order Lead Time', exact: true })
      .locator('xpath=following-sibling::p[1]')
      .innerText()).trim();
    const leadDays = Number(leadText.match(/\d+/)?.[0]);
    expect(leadDays, 'Order Lead Time is configured').toBeGreaterThan(0);

    const insideLeadTime = (today: Date) =>
      Array.from({ length: leadDays }, (_, k) =>
        new Date(today.getFullYear(), today.getMonth(), today.getDate() + k));

    // Admin: the days inside the lead time stay selectable.
    try {
      await addFirstMenuItemToCart(catering);
      await proceedToCheckout(catering);
      const today = await openEventCalendar(catering);
      for (const date of insideLeadTime(today)) {
        await expect(await dayButton(catering, date)).toBeEnabled();
      }
    } finally {
      await emptyCart(catering).catch(() => undefined);
    }

    // Customer: the same days are blocked and the lead time is spelled out.
    const ctx = await browser.newContext();
    const customer = await ctx.newPage();
    try {
      await customer.goto(getK12CateringLoginUrl());
      await customer.locator('#email-input').fill(getCustomerAccountEmail());
      await customer.locator('#password-input').fill(decryptPassword(getRequiredEnvVar('K12_CUSTOMER_ENCRYPTED_PASSWORD')));
      await customer.getByRole('button', { name: /Sign in/i }).click();
      await expect(customer.locator('aside[aria-label="Main navigation"]')).toBeVisible({ timeout: 30000 });
      const dismiss = customer.locator('button[aria-label^="Dismiss notification"]').first();
      for (let i = 0; i < 5 && (await dismiss.isVisible({ timeout: 2000 }).catch(() => false)); i++) {
        await dismiss.click().catch(() => undefined);
      }

      await customer.getByLabel('Navigate to Menu').click();
      await customer.getByText(/Loading Menu/i).waitFor({ state: 'hidden', timeout: 30000 }).catch(() => undefined);
      await customer.getByRole('button', { name: /^Add to Cart$/i }).first().click();
      await customer.getByRole('button', { name: /^Add to Cart$/i }).last().click();
      await expect(customer.getByRole('button', { name: 'Remove from cart' }).first()).toBeVisible();
      await customer.getByRole('button', { name: /Proceed to Checkout/i }).filter({ visible: true }).first().click();
      await expect(customer).toHaveURL(/\/checkout/i);

      await expect(
        customer.getByText(new RegExp(`at least ${leadDays} days? in advance`, 'i')),
      ).toBeVisible();
      const today = await openEventCalendar(customer);
      for (const date of insideLeadTime(today)) {
        await expect(await dayButton(customer, date)).toBeDisabled();
      }
    } finally {
      await emptyCart(customer).catch(() => undefined);
      await ctx.close();
    }
  });
});
