import { Locator, Page } from '@playwright/test';

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
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.page.goto(process.env.LOGIN_PATH || '/login.aspx', {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        });
        break;
      } catch (err) {
        if (attempt === maxAttempts) throw err;
        await this.page.waitForTimeout(attempt * 5000);
      }
    }

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

