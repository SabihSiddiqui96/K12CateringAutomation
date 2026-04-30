import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { getEnvVar } from './utils/env';

function resolveEnvFile(): string {
  const envFile = getEnvVar('ENV_FILE', { required: false });
  if (envFile) return envFile;
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
    baseURL: getEnvVar('BASE_URL', { required: false }) || 'https://qa.primeroedge.co',
    headless: !!process.env.CI,
    ignoreHTTPSErrors: true,
    userAgent: process.env.CI
      ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      : undefined,
    launchOptions: process.env.CI
      ? {
          args: [
            '--disable-http2',
            '--ignore-certificate-errors',
          ],
        }
      : undefined,
    actionTimeout: 15000,
    navigationTimeout: positiveIntFromEnv('NAVIGATION_TIMEOUT_MS', process.env.CI ? 60000 : 45000),
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: process.env.CI ? 'chrome' : undefined,
      },
    },
  ],
});
