import { test, expect, Page } from '@playwright/test';
import fs from 'fs';
import { PDFParse } from 'pdf-parse';

import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Guest Menu - Download PDF', () => {
  let catering: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    catering = await loginToK12Catering(page);
  });

  test.beforeEach(async () => {
    await catering.getByRole('button', { name: 'Go to home page' }).click();
    await catering.waitForLoadState('domcontentloaded');
    await navigateK12CateringMenu(catering, 'Guest Menu');
    await catering.waitForLoadState('domcontentloaded');
  });

  test('Guest Menu - Download PDF button is visible on the Guest Menu page', async () => {
    await expect(
      catering.getByRole('button', { name: 'Download menu as PDF' }),
    ).toBeVisible({ timeout: 10000 });
  });

  test('Guest Menu - Download PDF button triggers a file download with correct content', async () => {
    const downloadPromise = catering.waitForEvent('download', {
      timeout: 15000,
    });
    await catering
      .getByRole('button', { name: 'Download menu as PDF' })
      .click();
    const download = await downloadPromise;

    // Verify filename is a PDF
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);

    // Read PDF content
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();

    const pdfBuffer = fs.readFileSync(downloadPath!);
    const parser = new PDFParse({ data: pdfBuffer });
    const pdfData = await parser.getText();
    const pdfText = pdfData.text;

    // Verify PDF title
    expect(pdfText).toContain('Guest Menu');
    expect(pdfText).toContain('Mercer County School District');

    // Verify generated date is present
    expect(pdfText).toMatch(/Generated on/i);

    // Verify table column headers are always present
    expect(pdfText).toContain('Item Name');
    expect(pdfText).toContain('Price');
    expect(pdfText).toContain('Serves');
    expect(pdfText).toContain('Min Order');

    // Verify PDF has actual content (not empty or corrupted)
    expect(pdfText.length).toBeGreaterThan(100);
  });
});
