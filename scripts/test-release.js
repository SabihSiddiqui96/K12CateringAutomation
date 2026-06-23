// Release / UAT runner — thin wrapper around the env-aware runner.
// Posts Release-worded start/complete webhooks (and a CANCELED notice if the
// run is interrupted), running the full suite against .env.release (UAT).
//   node scripts/test-release.js            # run
//   node scripts/test-release.js --cancel   # just post a CANCELED notice
const path = require('path');
const { spawnSync } = require('child_process');
const passthrough = process.argv.slice(2);
const r = spawnSync('node', [path.join(__dirname, 'run-tests.js'), 'release', ...passthrough], {
  stdio: 'inherit',
});
process.exit(r.status == null ? 1 : r.status);
