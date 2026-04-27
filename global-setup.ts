import { chromium, FullConfig } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { getPlaywrightBaseUrl } from './utils/baseUrl';
import { loginToPrimeroEdge } from './utils/helpers';
import { getAuthMetaPath, getAuthStoragePath } from './utils/authStorage';

dotenv.config({ path: process.env.ENV_FILE?.trim() || '.env' });

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const username = process.env.PE_USERNAME?.trim();
  if (!username) {
    throw new Error('globalSetup: set PE_USERNAME in .env (or the environment) before running tests.');
  }

  const stateFile = getAuthStoragePath();
  const metaFile = getAuthMetaPath();
  const dir = path.dirname(stateFile);
  fs.mkdirSync(dir, { recursive: true });

  const force = process.env.FORCE_AUTH === '1';
  let needAuth = force;

  if (!fs.existsSync(stateFile)) {
    needAuth = true;
  } else if (fs.existsSync(metaFile)) {
    const previous = fs.readFileSync(metaFile, 'utf8').trim();
    if (previous !== username) {
      needAuth = true;
    }
  } else {
    needAuth = true;
  }

  if (!needAuth) {
    return;
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL: getPlaywrightBaseUrl(),
  });
  const page = await context.newPage();

  try {
    await loginToPrimeroEdge(page);
    await context.storageState({ path: stateFile });
    fs.writeFileSync(metaFile, username, 'utf8');
  } finally {
    await context.close();
    await browser.close();
  }
}
