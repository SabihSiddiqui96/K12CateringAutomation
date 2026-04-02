/**
 * Same origin/path used for relative navigations (e.g. page.goto('/')).
 * Override in CI or locally with BASE_URL if needed.
 */
export function getPlaywrightBaseUrl(): string {
  return process.env.BASE_URL?.trim() || 'https://qa.primeroedge.co/login.aspx';
}
