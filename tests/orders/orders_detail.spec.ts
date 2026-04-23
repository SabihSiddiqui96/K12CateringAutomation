import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.use({ storageState: { cookies: [], origins: [] } });

let catering: Page;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  catering = await loginToK12Catering(page);
});

test.beforeEach(async () => {
  await navigateK12CateringMenu(catering, 'Orders');
  await catering.waitForLoadState('domcontentloaded');
  // Click the first order's View Details button
  await catering
    .getByRole('button', { name: /View details for order/i })
    .first()
    .click();
  await catering.waitForLoadState('domcontentloaded');
});

test('Orders - Detail page header shows order ID and total', async () => {
  // H1 is split into two spans: "Order" + "#XXXXXXXX" — use locator('h1') directly
  await expect(catering.locator('h1')).toBeVisible({ timeout: 10000 });
  await expect(catering.locator('h1')).toContainText('Order');
  await expect(
    catering.getByText('Order details and management'),
  ).toBeVisible();
  // Total amount is an h2 starting with "$"
  await expect(catering.getByRole('heading', { name: /^\$/ })).toBeVisible();
});

test('Orders - Order Summary section displays all required fields', async () => {
  await expect(
    catering.getByRole('heading', { name: 'Order Summary' }),
  ).toBeVisible({ timeout: 10000 });
  await expect(catering.getByText('Submitted on')).toBeVisible();
  await expect(catering.getByText('Status', { exact: true })).toBeVisible();
  await expect(catering.getByText('Event Date')).toBeVisible();
  await expect(catering.getByText('Event Time')).toBeVisible();
  await expect(catering.getByText('Number of Guests')).toBeVisible();
  await expect(catering.getByText('Setup Time')).toBeVisible();
  // exact: true to avoid matching "Payment Contact Name"
  await expect(
    catering.getByText('Contact Name', { exact: true }),
  ).toBeVisible();
  await expect(catering.getByText('Phone', { exact: true })).toBeVisible();
  await expect(catering.getByText('Email', { exact: true })).toBeVisible();
  await expect(catering.getByText('Location Name')).toBeVisible();
  await expect(catering.getByText('Delivery Address')).toBeVisible();
});

test('Orders - Admin Actions panel displays Mark As Delivered and Cancel Order buttons', async () => {
  await expect(
    catering.getByRole('heading', { name: 'Admin Actions' }),
  ).toBeVisible({ timeout: 10000 });
  await expect(
    catering.getByRole('button', { name: 'Mark this order as delivered' }),
  ).toBeVisible();
  await expect(
    catering.getByRole('button', { name: 'Cancel this order' }),
  ).toBeVisible();
});

test('Orders - Options panel shows all action buttons', async () => {
  await expect(catering.getByRole('heading', { name: 'Options' })).toBeVisible({
    timeout: 10000,
  });
  await expect(
    catering.getByRole('button', { name: 'Print Invoice' }),
  ).toBeVisible();
  await expect(
    catering.getByRole('button', { name: 'Add to Calendar' }),
  ).toBeVisible();
  await expect(
    catering.getByRole('button', { name: 'Download Invoice' }),
  ).toBeVisible();
  await expect(
    catering.getByRole('button', { name: 'Download Order Details' }),
  ).toBeVisible();
  await expect(
    catering.getByRole('button', { name: 'Edit Order' }),
  ).toBeVisible();
});

test('Orders - Order Items section shows item table with totals', async () => {
  await expect(
    catering.getByRole('heading', { name: 'Order Items' }),
  ).toBeVisible({ timeout: 10000 });
  // Scope column headers to <thead> to avoid matching "Total:" and "Subtotal:" in the footer
  const thead = catering.locator('table thead');
  await expect(thead.getByText('Item')).toBeVisible();
  await expect(thead.getByText('Qty')).toBeVisible();
  await expect(thead.getByText('Unit Price')).toBeVisible();
  await expect(thead.getByText('Total')).toBeVisible();
  // These are in the table footer rows, no strict mode conflict
  await expect(catering.getByText('Subtotal:')).toBeVisible();
  await expect(catering.getByText('Tax:')).toBeVisible();
  await expect(catering.getByText('Delivery Fee:')).toBeVisible();
});

test('Orders - Order Activity section is visible', async () => {
  await expect(
    catering.getByRole('heading', { name: 'Order Activity' }),
  ).toBeVisible({ timeout: 10000 });
  await expect(catering.getByText('Order created')).toBeVisible();
});

test('Orders - Back button returns to orders list', async () => {
  await catering.getByRole('button', { name: 'Back to orders' }).click();
  await catering.waitForLoadState('domcontentloaded');
  await expect(
    catering.getByRole('heading', { name: 'Order Management' }),
  ).toBeVisible({ timeout: 10000 });
});
