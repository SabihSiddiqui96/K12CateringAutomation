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
    console.log('LOGIN DEBUG: using updated goto()');

    const gotoPromise = this.page
      .goto('/login.aspx', {
        waitUntil: 'commit',
        timeout: 120000,
      })
      .catch((error) => {
        console.log('page.goto error ignored during CI warmup:', error);
      });

    console.log('LOGIN DEBUG: waitForFunction timeout = 120000');

    await this.page.waitForFunction(
      () => {
        return (
          !!document.querySelector('#UserNameTextBox') &&
          !!document.querySelector('#PasswordTextBox') &&
          !!document.querySelector('#LoginButton')
        );
      },
      { timeout: 120000 }
    );

    await gotoPromise;
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

