import { Locator, Page } from '@playwright/test';
import { getEnvVar } from '../utils/env';

function positiveIntFromEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class LoginPage {
  private readonly usernameInput: Locator;
  private readonly passwordInput: Locator;
  private readonly loginButton: Locator;

  constructor(private readonly page: Page) {
    this.usernameInput = page.locator('#UserNameTextBox, #email-input');
    this.passwordInput = page.locator('#PasswordTextBox, #password-input');
    this.loginButton = page.getByRole('button', {
      name: /sign in|log in/i,
    }).or(
      page.getByLabel("Sign in to your account")
    ).or(
      page.locator('#LoginButton')
    ).or(
      page.locator('button[type="submit"]')
    );
  }

  async goto(): Promise<void> {
    const loginPath = getEnvVar('LOGIN_PATH', { required: false }) || '/login.aspx';
    const maxAttempts = positiveIntFromEnv('LOGIN_MAX_ATTEMPTS', 3);
    const navigationTimeout = positiveIntFromEnv('LOGIN_NAVIGATION_TIMEOUT_MS', process.env.CI ? 30000 : 60000);
    const formTimeout = positiveIntFromEnv('LOGIN_FORM_TIMEOUT_MS', process.env.CI ? 30000 : 60000);
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await this.page.goto(loginPath, {
          waitUntil: 'domcontentloaded',
          timeout: navigationTimeout,
        });

        if (response && response.status() >= 400) {
          console.warn(`[login] ${loginPath} returned HTTP ${response.status()} on attempt ${attempt}/${maxAttempts}`);
        }

        await this.usernameInput.waitFor({
          state: 'visible',
          timeout: formTimeout,
        });

        await this.passwordInput.waitFor({
          state: 'visible',
          timeout: formTimeout,
        });

        await this.loginButton.waitFor({
          state: 'visible',
          timeout: formTimeout,
        });

        return;
      } catch (err) {
        lastError = err;
        console.warn(`[login] attempt ${attempt}/${maxAttempts} failed at ${this.page.url() || loginPath}: ${errorMessage(err)}`);
        if (attempt === maxAttempts) throw err;
        await delay(attempt * 5000);
      }
    }

    throw new Error(`Login page was not ready after ${maxAttempts} attempts. Last error: ${errorMessage(lastError)}`);
  }

  async enterUsername(username: string): Promise<void> {
    await this.usernameInput.fill(username);
  }

  async enterPassword(password: string): Promise<void> {
    await this.passwordInput.fill(password);
  }

  async clickLogin(): Promise<void> {
    await this.loginButton.click();
  }

  async login(username: string, password: string): Promise<void> {
    await this.enterUsername(username);
    await this.enterPassword(password);
    await this.clickLogin();
  }
}
