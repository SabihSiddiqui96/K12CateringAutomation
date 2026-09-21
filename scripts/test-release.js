// Release / UAT runner — thin wrapper around the env-aware runner.
const path = require('path');
const { spawnSync } = require('child_process');
const passthrough = process.argv.slice(2);
const r = spawnSync('node', [path.join(__dirname, 'run-tests.js'), 'release', ...passthrough], {
  stdio: 'inherit',
});
process.exit(r.status == null ? 1 : r.status);
