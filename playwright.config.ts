import * as dotenv from 'dotenv';
dotenv.config();

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 120000,
  expect: { timeout: 10000 },
  workers: process.env.CI ? 4 : undefined,
  fullyParallel: false,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'test-results/results.xml' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  use: {
    baseURL: process.env.BASE_URL?.trim() || 'https://qa.primeroedge.co',
    headless: true,
    storageState: 'playwright/.auth/admin.json',
    actionTimeout: 15000,
    navigationTimeout: 45000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});