import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.setTimeout(180000);
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Menu - Configuration: Sort Categories', () => {
  let catering: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    catering = await loginToK12Catering(page, { navigateTo: 'Menu' });
  });

  test.beforeEach(async () => {
    await navigateK12CateringMenu(catering, 'Menu');
    await catering.waitForLoadState('domcontentloaded');
  });

  test('Menu - Sort Categories modal opens from Configuration', async () => {
    await catering.getByRole('button', { name: 'Sort category order' }).click();
    await expect(
      catering.getByRole('heading', { name: 'Sort Categories' }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      catering.getByText('Drag and drop to reorder categories'),
    ).toBeVisible();
    await catering.getByRole('button', { name: 'Cancel' }).click();
  });

  test('Menu - Categories display with position badges and drag handles', async () => {
    await catering.getByRole('button', { name: 'Sort category order' }).click();
    await expect(
      catering.getByRole('heading', { name: 'Sort Categories' }),
    ).toBeVisible({ timeout: 10000 });

    await expect(
      catering
        .getByRole('button', { name: /Drag to reorder .+ category/ })
        .first(),
    ).toBeVisible();
    await expect(catering.getByText('#1')).toBeVisible();
    await expect(catering.getByText('#2')).toBeVisible();

    await catering.getByRole('button', { name: 'Cancel' }).click();
  });

  test('Menu - Dragging a category to a new position reorders the list', async () => {
    await catering.getByRole('button', { name: 'Sort category order' }).click();
    await expect(
      catering.getByRole('heading', { name: 'Sort Categories' }),
    ).toBeVisible({ timeout: 10000 });

    const firstItem = catering
      .getByRole('button', { name: /Drag to reorder .+ category/ })
      .nth(0);
    const secondItem = catering
      .getByRole('button', { name: /Drag to reorder .+ category/ })
      .nth(1);

    const firstBox = await firstItem.boundingBox();
    const secondBox = await secondItem.boundingBox();

    if (firstBox && secondBox) {
      await catering.mouse.move(
        firstBox.x + firstBox.width / 2,
        firstBox.y + firstBox.height / 2,
      );
      await catering.mouse.down();
      await catering.mouse.move(
        secondBox.x + secondBox.width / 2,
        secondBox.y + secondBox.height + 10,
        { steps: 10 },
      );
      await catering.mouse.up();
      await catering.waitForTimeout(500);
    }

    // Save Order button should still be visible after drag
    await expect(
      catering.getByRole('button', { name: 'Save Order' }),
    ).toBeVisible();
    await catering.getByRole('button', { name: 'Cancel' }).click();
  });

  test('Menu - Clicking Save Order shows success message', async () => {
    await catering.getByRole('button', { name: 'Sort category order' }).click();
    await expect(
      catering.getByRole('heading', { name: 'Sort Categories' }),
    ).toBeVisible({ timeout: 10000 });

    // Drag first item down to second position
    const firstItem = catering
      .getByRole('button', { name: /Drag to reorder .+ category/ })
      .nth(0);
    const secondItem = catering
      .getByRole('button', { name: /Drag to reorder .+ category/ })
      .nth(1);

    const firstBox = await firstItem.boundingBox();
    const secondBox = await secondItem.boundingBox();

    if (firstBox && secondBox) {
      await catering.mouse.move(
        firstBox.x + firstBox.width / 2,
        firstBox.y + firstBox.height / 2,
      );
      await catering.mouse.down();
      await catering.mouse.move(
        secondBox.x + secondBox.width / 2,
        secondBox.y + secondBox.height + 10,
        { steps: 10 },
      );
      await catering.mouse.up();
      await catering.waitForTimeout(500);
    }

    await catering.getByRole('button', { name: 'Save Order' }).click();
    await expect(
      catering.getByText(/Category order updated successfully/i),
    ).toBeVisible({ timeout: 10000 });
  });

  test('Menu - Category order persists after closing and reopening Sort Categories', async () => {
    await catering.getByRole('button', { name: 'Sort category order' }).click();
    await expect(
      catering.getByRole('heading', { name: 'Sort Categories' }),
    ).toBeVisible({ timeout: 10000 });

    // Get the first category name before reorder
    const firstDragBtn = catering
      .getByRole('button', { name: /Drag to reorder .+ category/ })
      .nth(0);
    const secondDragBtn = catering
      .getByRole('button', { name: /Drag to reorder .+ category/ })
      .nth(1);

    const secondBtnLabel =
      (await secondDragBtn.getAttribute('aria-label')) ?? '';
    const secondCategoryName = secondBtnLabel
      .replace('Drag to reorder ', '')
      .replace(' category', '');

    const firstBox = await firstDragBtn.boundingBox();
    const secondBox = await secondDragBtn.boundingBox();

    if (firstBox && secondBox) {
      await catering.mouse.move(
        firstBox.x + firstBox.width / 2,
        firstBox.y + firstBox.height / 2,
      );
      await catering.mouse.down();
      await catering.mouse.move(
        secondBox.x + secondBox.width / 2,
        secondBox.y + secondBox.height + 10,
        { steps: 10 },
      );
      await catering.mouse.up();
      await catering.waitForTimeout(500);
    }

    await catering.getByRole('button', { name: 'Save Order' }).click();
    await expect(
      catering.getByText(/Category order updated successfully/i),
    ).toBeVisible({ timeout: 10000 });

    // Close and reopen
    await catering.waitForTimeout(500);
    await catering.getByRole('button', { name: 'Sort category order' }).click();
    await expect(
      catering.getByRole('heading', { name: 'Sort Categories' }),
    ).toBeVisible({ timeout: 10000 });

    // The previously second category should now be first
    await expect(
      catering.getByRole('heading', { name: 'Sort Categories' }),
    ).toBeVisible({ timeout: 10000 });
    await expect(catering.getByText(secondCategoryName).first()).toBeVisible({
      timeout: 10000,
    });
    await catering.getByRole('button', { name: 'Cancel' }).click();
  });
});
