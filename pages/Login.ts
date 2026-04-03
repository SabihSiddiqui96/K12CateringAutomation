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
    await this.page.goto(getPlaywrightBaseUrl());
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

