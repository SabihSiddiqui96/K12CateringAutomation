import { getEnvVar } from './env';

/** Same origin/path used for relative navigations (e.g. */
export function getPlaywrightBaseUrl(): string {
  return getEnvVar('BASE_URL', { required: false }) || 'https://qa.primeroedge.co';
}

export function getK12CateringUrl(): string {
  return getEnvVar('K12_CATERING_URL', { required: false }) || 'https://qak12cateringui.perseusedge.com';
}

export function getK12CateringLoginUrl(): string {
  const loginPath = getEnvVar('LOGIN_PATH', { required: false }) || '/login';
  return `${getK12CateringUrl()}${loginPath}`;
}
