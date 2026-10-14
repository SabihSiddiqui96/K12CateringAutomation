import { getEnvVar } from './env';

/** Same origin/path used for relative navigations (e.g. */
export function getPlaywrightBaseUrl(): string {
  return getEnvVar('BASE_URL', { required: false }) || 'https://qa.primeroedge.co';
}

export function getK12CateringUrl(): string {
  const url = getEnvVar('K12_CATERING_URL', { required: false });
  // An unset pipeline variable arrives as the literal "$(K12_CATERING_URL)".
  return url && /^https?:\/\//i.test(url) ? url : 'https://qak12cateringui.perseusedge.com';
}

// LOGIN_PATH is the PrimeroEdge login (/login.aspx on QA); Catering's is always /login.
export function getK12CateringLoginUrl(): string {
  return `${getK12CateringUrl()}/login`;
}
