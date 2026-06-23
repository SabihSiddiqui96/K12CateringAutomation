// QA runner — thin wrapper around the env-aware runner.
// Posts QA-worded start/complete webhooks (and a CANCELED notice if the run is
// interrupted), running the full suite against .env (QA).
//   node scripts/test-qa.js            # run
//   node scripts/test-qa.js --cancel   # just post a CANCELED notice
const path = require('path');
const { spawnSync } = require('child_process');
const passthrough = process.argv.slice(2);
const r = spawnSync('node', [path.join(__dirname, 'run-tests.js'), 'qa', ...passthrough], {
  stdio: 'inherit',
});
process.exit(r.status == null ? 1 : r.status);
