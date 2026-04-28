import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

function resolveEnvFile(): string {
  if (process.env.ENV_FILE) return process.env.ENV_FILE.trim();
  try {
    const settings = JSON.parse(fs.readFileSync(path.resolve(__dirname, '.vscode/settings.json'), 'utf8'));
    return settings?.['playwright.env']?.ENV_FILE?.trim() || '.env';
  } catch {
    return '.env';
  }
}

dotenv.config({ path: resolveEnvFile() });

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 90000,
  expect: { timeout: 10000 },
  workers: process.env.CI ? 3 : undefined,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'test-results/results.xml' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  use: {
    baseURL: process.env.BASE_URL?.trim() || 'https://qa.primeroedge.co',
    headless: !!process.env.CI,
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