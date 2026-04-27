/**
 * Same origin/path used for relative navigations (e.g. page.goto('/')).
 * Override in CI or locally with BASE_URL if needed.
 */
export function getPlaywrightBaseUrl(): string {
  return process.env.BASE_URL?.trim() || 'https://qa.primeroedge.co';
}

export function getK12CateringUrl(): string {
  return process.env.K12_CATERING_URL?.trim() || 'https://qak12cateringui.perseusedge.com';
}

export function getK12CateringLoginUrl(): string {
  const loginPath = process.env.LOGIN_PATH?.trim() || '/login';
  return `${getK12CateringUrl()}${loginPath}`;
}
