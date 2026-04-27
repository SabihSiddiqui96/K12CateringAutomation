// Loads .env.release and spawns playwright test with those env vars.
// dotenv won't override vars already set, so .env.release values win over .env.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.release') });

const { execSync } = require('child_process');
execSync('npx playwright test', { stdio: 'inherit', env: process.env });
