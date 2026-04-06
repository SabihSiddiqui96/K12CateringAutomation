import { Locator, Page } from '@playwright/test';
import { getPlaywrightBaseUrl } from '../utils/baseUrl';

export class LoginPage {
  private readonly usernameInput: Locator;
  private readonly passwordInput: Locator;
  private readonly loginButton: Locator;

  constructor(private readonly page: Page) {
    this.usernameInput = page.locator('#UserNameTextBox');
    this.passwordInput = page.locator('#PasswordTextBox');
    this.loginButton = page.locator('#LoginButton');
  }

  async goto(): Promise<void> {
    try {
      await this.page.goto('/login.aspx', {
        waitUntil: 'commit',
        timeout: 120000,
      });

      await this.usernameInput.waitFor({ state: 'visible', timeout: 30000 });
      await this.passwordInput.waitFor({ state: 'visible', timeout: 30000 });
      await this.loginButton.waitFor({ state: 'visible', timeout: 30000 });
    } catch (error) {
      console.log('Current URL:', this.page.url());

      try {
        console.log('Page title:', await this.page.title());
      } catch {
        console.log('Page title: unavailable');
      }

      await this.page.screenshot({
        path: 'test-results/login-page-failure.png',
        fullPage: true,
      });

      const html = await this.page.content();
      const fs = await import('fs');
      fs.writeFileSync('test-results/login-page-failure.html', html);

      throw error;
    }
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

