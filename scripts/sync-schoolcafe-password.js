#!/usr/bin/env node
/** Copies the SchoolCafe 2.0 QA password into this repo's .env and the K12 pipeline. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env');
const SC2_ENV_FILE = path.resolve(ROOT, '..', 'SchoolCafe2.0Automation', '.env');
const STATE_FILE = path.join(ROOT, '.sc-password-sync.json');
const DEFINITIONS = 'https://dev.azure.com/Cybersoft-Technologies-Inc/K12-Catering/_apis/build/definitions';
const DEFINITION_ID = 2397;
const VAR_NAME = 'qaSchoolCafePassword';

function readEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

function cipherKey(env) {
  const key = env.ENCRYPTION_KEY || '';
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY in .env must be 32 characters');
  return Buffer.from(key, 'utf8');
}

function encrypt(plain, key) {
  const iv = crypto.randomBytes(16);
  const c = crypto.createCipheriv('aes-256-cbc', key, iv);
  return `${iv.toString('hex')}:${Buffer.concat([c.update(plain, 'utf8'), c.final()]).toString('hex')}`;
}

function decrypt(value, key) {
  const [iv, data] = String(value || '').split(':');
  if (!iv || !data) return '';
  try {
    const d = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(iv, 'hex'));
    return Buffer.concat([d.update(Buffer.from(data, 'hex')), d.final()]).toString('utf8');
  } catch {
    return '';
  }
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}

async function updatePipeline(encrypted, pat) {
  const headers = {
    Authorization: 'Basic ' + Buffer.from(':' + pat).toString('base64'),
    'Content-Type': 'application/json',
  };
  const url = `${DEFINITIONS}/${DEFINITION_ID}?api-version=7.0`;
  const getRes = await fetch(url, { headers });
  if (!getRes.ok) throw new Error(`GET definition ${DEFINITION_ID}: HTTP ${getRes.status}`);
  const def = await getRes.json();
  // Secret variables come back with no value; sending them back unchanged keeps them.
  def.variables = def.variables || {};
  def.variables[VAR_NAME] = { ...(def.variables[VAR_NAME] || {}), value: encrypted, isSecret: true };
  const putRes = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(def) });
  if (!putRes.ok) throw new Error(`PUT definition ${DEFINITION_ID}: HTTP ${putRes.status} ${(await putRes.text()).slice(0, 200)}`);
}

async function syncSchoolCafePassword({ log = console.log, dryRun = false } = {}) {
  if (!fs.existsSync(SC2_ENV_FILE)) { log(`password sync: ${SC2_ENV_FILE} not found - skipped.`); return; }
  const source = readEnv(SC2_ENV_FILE).SC2_PASSWORD;
  if (!source) { log('password sync: SC2_PASSWORD missing in SchoolCafe 2.0 .env - skipped.'); return; }

  const env = readEnv(ENV_FILE);
  const key = cipherKey(env);
  let encrypted = env[VAR_NAME];

  if (decrypt(encrypted, key) !== source) {
    encrypted = encrypt(source, key);
    if (dryRun) {
      log('password sync: .env is out of date (dry run, not written).');
    } else {
      const raw = fs.readFileSync(ENV_FILE, 'utf8');
      const next = new RegExp(`^${VAR_NAME}=.*$`, 'm').test(raw)
        ? raw.replace(new RegExp(`^${VAR_NAME}=.*$`, 'm'), `${VAR_NAME}=${encrypted}`)
        : raw.replace(/\s*$/, `\n${VAR_NAME}=${encrypted}\n`);
      fs.writeFileSync(ENV_FILE, next);
      log('password sync: .env updated from SchoolCafe 2.0.');
    }
  } else {
    log('password sync: .env already current.');
  }

  const state = readState();
  if (state.pipelineHash === sha(source)) { log('password sync: pipeline already current.'); return; }
  if (dryRun) { log('password sync: pipeline is out of date (dry run, not pushed).'); return; }
  if (!env.AZURE_DEVOPS_PAT) { log('password sync: AZURE_DEVOPS_PAT missing - pipeline not updated.'); return; }
  await updatePipeline(encrypted, env.AZURE_DEVOPS_PAT);
  fs.writeFileSync(STATE_FILE, JSON.stringify({ pipelineHash: sha(source), at: new Date().toISOString() }, null, 2));
  log(`password sync: pipeline variable ${VAR_NAME} updated.`);
}

module.exports = { syncSchoolCafePassword };

if (require.main === module) {
  syncSchoolCafePassword({ dryRun: process.argv.includes('--dry-run') }).catch((e) => {
    console.error(`password sync failed: ${e.message}`);
    process.exit(1);
  });
}
