import { expect, Locator, Page } from '@playwright/test';

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
    const fs = await import('fs');

    try {
      await this.page.goto('/login.aspx', {
        waitUntil: 'commit',
        timeout: 30000,
      }).catch(() => {
        console.log('page.goto timed out or returned early, continuing to element-based checks...');
      });

      await expect(this.usernameInput).toBeVisible({ timeout: 30000 });
      await expect(this.passwordInput).toBeVisible({ timeout: 30000 });
      await expect(this.loginButton).toBeVisible({ timeout: 30000 });
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

