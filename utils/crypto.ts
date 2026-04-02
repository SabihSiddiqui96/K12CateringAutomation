import * as crypto from 'crypto';
import { getRequiredEnvVar } from './env';

const ALGORITHM = 'aes-256-cbc';
const KEY_LENGTH = 32;

function getKey(): Buffer {
  const key = getRequiredEnvVar('ENCRYPTION_KEY');
  if (key.length !== KEY_LENGTH) {
    throw new Error(`ENCRYPTION_KEY must be exactly ${KEY_LENGTH} characters (currently ${key.length})`);
  }
  return Buffer.from(key, 'utf8');
}

export function encryptPassword(plaintext: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptPassword(encrypted: string): string {
  const [ivHex, encryptedHex] = encrypted.split(':');
  if (!ivHex || !encryptedHex) {
    throw new Error('Invalid encrypted password format. Expected format: <iv_hex>:<encrypted_hex>');
  }
  const iv = Buffer.from(ivHex, 'hex');
  const encryptedBuffer = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  return Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]).toString('utf8');
}
