const fs = require('fs');
const path = require('path');

const env = process.argv[2]; // 'qa' or 'release'
const settingsPath = path.resolve(__dirname, '../.vscode/settings.json');

let settings = {};
if (fs.existsSync(settingsPath)) {
  try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch (_) {}
}

if (env === 'release') {
  settings['playwright.env'] = { ...settings['playwright.env'], ENV_FILE: '.env.release' };
  console.log('');
  console.log('  Switched to: RELEASE (UAT)');
  console.log('  Play button now runs against: https://uatk12catering.perseusedge.com');
  console.log('');
} else {
  if (settings['playwright.env']) {
    delete settings['playwright.env']['ENV_FILE'];
    if (Object.keys(settings['playwright.env']).length === 0) {
      delete settings['playwright.env'];
    }
  }
  console.log('');
  console.log('  Switched to: QA (Daily)');
  console.log('  Play button now runs against: https://qa.primeroedge.co');
  console.log('');
}

fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
