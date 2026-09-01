/**
 * Test data that more than one spec needs, in one place and overridable by env.
 *
 * District names and the demo customer's email already live in ./helpers; this is
 * for values that were sitting as literals inside individual specs.
 */
import { getEnvVar } from './env';
import { getSecondaryDistrictName, isUatDirectLogin } from './helpers';

/**
 * Password the specs reset the demo customer account to before signing in as them.
 * Not a secret: the test sets it on a throwaway QA account moments before using it.
 * Env-overridable so a stricter password policy does not mean editing three specs.
 */
export function getCustomerPassword(): string {
  return getEnvVar('QA_CUSTOMER_PASSWORD', { required: false }) || 'Password1!';
}

/**
 * The district data sync pushes TO - the opted-in sibling of the primary, where the
 * specs make their local overrides. Berkeley on QA, Lees on UAT.
 */
export function getDataSyncTargetDistrict(): string {
  const configured = getEnvVar('DATA_SYNC_TARGET_DISTRICT', { required: false });
  if (configured) return configured;
  return isUatDirectLogin() ? 'Lees' : getSecondaryDistrictName();
}
