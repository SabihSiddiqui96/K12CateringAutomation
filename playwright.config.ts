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

function positiveIntFromEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export default defineConfig({
  testDir: './tests',
  timeout: positiveIntFromEnv('TEST_TIMEOUT_MS', process.env.CI ? 180000 : 90000),
  expect: { timeout: positiveIntFromEnv('EXPECT_TIMEOUT_MS', 15000) },
  workers: process.env.CI ? 1 : undefined,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'test-results/results.xml' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  use: {
    baseURL: process.env.BASE_URL?.trim() || 'https://qa.primeroedge.co',
    headless: !!process.env.CI,
    actionTimeout: 15000,
    navigationTimeout: positiveIntFromEnv('NAVIGATION_TIMEOUT_MS', process.env.CI ? 60000 : 45000),
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
