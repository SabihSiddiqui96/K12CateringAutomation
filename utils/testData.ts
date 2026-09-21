/** Test data that more than one spec needs, in one place and overridable by env. */
import { getEnvVar } from './env';
import { getSecondaryDistrictName, isUatDirectLogin } from './helpers';

/** Password the specs reset the demo customer account to before signing in as them. */
export function getCustomerPassword(): string {
  return getEnvVar('QA_CUSTOMER_PASSWORD', { required: false }) || 'Password1!';
}

/** The district data sync pushes TO */
export function getDataSyncTargetDistrict(): string {
  const configured = getEnvVar('DATA_SYNC_TARGET_DISTRICT', { required: false });
  if (configured) return configured;
  return isUatDirectLogin() ? 'Lees' : getSecondaryDistrictName();
}
