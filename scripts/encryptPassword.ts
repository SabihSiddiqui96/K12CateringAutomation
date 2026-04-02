import * as path from 'path';
import * as dotenv from 'dotenv';
import { encryptPassword } from '../utils/crypto';

console.log('script started');

const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const plainPassword = process.argv[2];
console.log('plain password received:', !!plainPassword);

if (!plainPassword) {
  console.error('Usage: npx ts-node scripts/encryptPassword.ts <your-password>');
  process.exit(1);
}

const encrypted = encryptPassword(plainPassword);
console.log('encrypted value created');

console.log('\nAdd this line to your .env file:');
console.log(`ENCRYPTED_PASSWORD=${encrypted}\n`);