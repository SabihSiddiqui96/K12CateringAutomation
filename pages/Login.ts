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
    await this.page.goto('/login.aspx', {
      waitUntil: 'domcontentloaded',
      timeout: 180000,
    });

    await this.usernameInput.waitFor({
      state: 'visible',
      timeout: 60000,
    });

    await this.passwordInput.waitFor({
      state: 'visible',
      timeout: 60000,
    });

    await this.loginButton.waitFor({
      state: 'visible',
      timeout: 60000,
    });
  }

  async enterUsername(username: string): Promise<void> {
    await this.usernameInput.fill(username);
  }

  async enterPassword(password: string): Promise<void> {
    await this.passwordInput.fill(password, { noWaitAfter: true });

    await this.page.locator('#PasswordTextBox').evaluate((el, value) => {
      (el as HTMLInputElement).value = value;
    }, password);
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

