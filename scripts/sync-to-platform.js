#!/usr/bin/env node
/** Mirror this repo into the Cybersoft.Platform monorepo folder. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SOURCE = path.resolve(__dirname, '..');
const TARGET_REPO = 'C:\\Users\\sabih.siddiqui\\Desktop\\Automation\\Cybersoft.Platform';
const PREFIX = 'Cybersoft.Platform.TestAutomation/K12CateringAutomation';
const BRANCH = 'AutomationProjects';
const REMOTE_PATH =
  'dev.azure.com/Cybersoft-Technologies-Inc/Platform/_git/Cybersoft.Platform';

const USAGE = `Mirror this repo into ${PREFIX} in the Cybersoft.Platform monorepo.

Usage:
  node scripts/sync-to-platform.js --dry-run                 show what would change
  node scripts/sync-to-platform.js --branch paginationFix    new branch off ${BRANCH}
  node scripts/sync-to-platform.js -b addMethodFix -m "msg"  ... with a commit message
  node scripts/sync-to-platform.js -u existing-pr-branch     add a commit to an
                                                             existing branch (updates
                                                             its open PR)
  node scripts/sync-to-platform.js -b someFix --no-push      commit locally only

Options:
  --dry-run                  list new/changed/removed files and stop
  -b, --branch <name>        create <name> off ${BRANCH}; must be camelCase
  -u, --update-branch <name> reuse an existing remote branch and commit on top
  -m, --message <text>       commit message (default: "Update K12Catering automation")
      --allow-dirty          sync the working tree even with uncommitted changes
      --no-push              commit in the platform repo but do not push
  -h, --help                 show this

Auth: AZURE_DEVOPS_CODE_PAT in .env (Code Read & Write).`;

class GitError extends Error {}

// Run git in `repo`.
function git(repo, gitArgs, allowFail = false) {
  try {
    return execFileSync('git', ['-C', repo, ...gitArgs], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    }).trim();
  } catch (e) {
    if (allowFail) return '';
    throw new GitError(`git ${gitArgs.join(' ')} failed:\n${e.stderr || e.message}`);
  }
}

// Parse `git status --porcelain=v1 -z`.
function porcelainEntries(repo) {
  const raw = (() => {
    try {
      return execFileSync('git', ['-C', repo, 'status', '--porcelain=v1', '-z'], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      });
    } catch {
      return '';
    }
  })();

  const records = raw.split('\0').filter((r) => r.length > 0);
  const entries = [];
  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];
    entries.push(record);
    // A rename/copy carries its source path in the following record.
    if (/^[RC]/.test(record)) i += 1;
  }
  return entries;
}

// Read one key out of .env.
function readEnvValue(key) {
  let text = '';
  try {
    text = fs.readFileSync(path.join(SOURCE, '.env'), 'utf8');
  } catch {
    return '';
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^export\s+/, '');
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1 || line.slice(0, eq).trim() !== key) continue;
    const value = line.slice(eq + 1).trim();
    const quoted = /^(['"])([\s\S]*)\1$/.exec(value);
    return quoted ? quoted[2] : value;
  }
  return '';
}

function fail(msg) {
  throw new Error(msg);
}

function argValue(args, ...flags) {
  const i = args.findIndex((a) => flags.includes(a));
  return i !== -1 ? args[i + 1] : '';
}

function run(args) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(USAGE);
    return;
  }
  // Only restore the checkout if we actually moved it off BRANCH.
  let movedOffBaseBranch = false;

  const dryRun = args.includes('--dry-run');
  const noPush = args.includes('--no-push');
  const commitMessage = argValue(args, '-m', '--message') || 'Update K12Catering automation';

  // Neither lands on BRANCH itself - it is shared company code.
  const featureBranch = argValue(args, '--branch', '-b');
  const updateBranch = argValue(args, '--update-branch', '-u');
  const targetBranch = updateBranch || featureBranch;

  // --- preflight

  if (!fs.existsSync(TARGET_REPO)) {
    fail(`platform repo not found at ${TARGET_REPO}`);
  }

  const pat = readEnvValue('AZURE_DEVOPS_CODE_PAT');
  if (!pat && !noPush && !dryRun) {
    fail('AZURE_DEVOPS_CODE_PAT not found in .env (needs Code Read & Write).');
  }

  // Refuse to run against a dirty platform checkout
  const targetDirty = porcelainEntries(TARGET_REPO).filter(
    (l) => l.trim() && !l.includes(PREFIX),
  );
  if (targetDirty.length) {
    console.error('Platform repo has uncommitted changes outside ' + PREFIX + ':');
    targetDirty.slice(0, 10).forEach((l) => console.error('  ' + l));
    fail('resolve those first — refusing to touch a dirty shared checkout.');
  }

  // The point of this mirror is "what I committed here shows up there"
  const sourceDirty = porcelainEntries(SOURCE).filter((l) => l.trim() && !l.startsWith('??'));
  if (sourceDirty.length && !args.includes('--allow-dirty')) {
    console.error('This repo has uncommitted changes:');
    sourceDirty.forEach((l) => console.error('  ' + l));
    fail(
      'commit them first so the mirror matches your history ' +
        '(or pass --allow-dirty to sync the working tree anyway).',
    );
  }

  if (!dryRun) {
    if (featureBranch && updateBranch) {
      fail('pass either --branch (new) or --update-branch (existing), not both.');
    }
    if (!targetBranch) {
      fail(
        'a branch name is required: --branch <camelCaseName> (e.g. paginationFix),\n' +
          'or --update-branch <name> to add a commit to a branch that already has a PR.\n' +
          `The mirror is never pushed to ${BRANCH} directly.`,
      );
    }
    // camelCase only for branches we create; an existing one keeps its name.
    if (featureBranch && !/^[a-z][A-Za-z0-9]*$/.test(featureBranch)) {
      fail(
        `branch "${featureBranch}" is not camelCase. Use letters and digits only, ` +
          'starting lowercase — e.g. paginationFix, addMethodFix. No dashes or underscores.',
      );
    }
    if (targetBranch === BRANCH) {
      fail(`refusing to push to ${BRANCH} directly — pick a new branch name.`);
    }
  }

  // Start from what the remote has now, not from whatever this shared checkout is parked on
  if (!dryRun) {
    const authFetch = `https://anything:${pat}@${REMOTE_PATH}`;
    git(TARGET_REPO, ['fetch', authFetch, BRANCH], true);
    const baseRef = git(TARGET_REPO, ['rev-parse', 'FETCH_HEAD'], true) || BRANCH;

    if (updateBranch) {
      git(TARGET_REPO, ['fetch', authFetch, updateBranch], true);
      const remoteTip = git(TARGET_REPO, ['rev-parse', 'FETCH_HEAD'], true);
      if (!remoteTip) {
        fail(
          `branch "${updateBranch}" does not exist on the remote. ` +
            'Use --branch <camelCaseName> to create a new one.',
        );
      }
      git(TARGET_REPO, ['checkout', '-B', updateBranch, remoteTip]);
      movedOffBaseBranch = true;
      console.log(
        `Continuing ${updateBranch} from its remote tip (${remoteTip.slice(0, 7)}).`,
      );
    } else {
      // If that branch already exists remotely with commits our base does not have
      git(TARGET_REPO, ['fetch', authFetch, featureBranch], true);
      const existingTip = git(TARGET_REPO, ['rev-parse', 'FETCH_HEAD'], true);
      if (existingTip && existingTip !== baseRef) {
        const isAncestor = (() => {
          try {
            execFileSync(
              'git',
              ['-C', TARGET_REPO, 'merge-base', '--is-ancestor', existingTip, baseRef],
              { stdio: 'ignore' },
            );
            return true;
          } catch {
            return false;
          }
        })();
        if (!isAncestor) {
          fail(
            `branch "${featureBranch}" already exists on the remote with commits that ` +
              `${BRANCH} does not have, so pushing a fresh branch over it would be rejected.\n` +
              `Use --update-branch ${featureBranch} to add a commit on top of it instead, ` +
              'or pick a different branch name.',
          );
        }
      }
      git(TARGET_REPO, ['checkout', '-B', featureBranch, baseRef]);
      movedOffBaseBranch = true;
      console.log(`Branched ${featureBranch} off ${BRANCH} (${baseRef.slice(0, 7)}).`);
    }
  }

  try {
    syncFiles({ args, dryRun, noPush, commitMessage, targetBranch, updateBranch, pat });
  } finally {
    // Leave the shared checkout back on BRANCH so the next sync starts clean and nobody finds it
    if (movedOffBaseBranch) git(TARGET_REPO, ['checkout', BRANCH], true);
  }
}

function syncFiles({ args, dryRun, noPush, commitMessage, targetBranch, updateBranch, pat }) {
  // --- work out the file set

  // Tracked files only: this is the gitignore filter that keeps .env out.
  let sourceFiles = [];
  const submodules = [];
  for (const line of git(SOURCE, ['ls-files', '--stage']).split('\n')) {
    if (!line.trim()) continue;
    const mode = line.slice(0, 6);
    const file = line.slice(line.indexOf('\t') + 1);
    if (mode === '160000') submodules.push(file);
    else sourceFiles.push(file);
  }
  if (submodules.length) {
    console.log(`Skipping ${submodules.length} submodule(s): ${submodules.join(', ')}`);
  }

  // Files that live in this repo but have no business in the shared monorepo.
  const EXCLUDE = new Set([
    // Local Task Scheduler tooling for this machine, not shared test automation.
    'scripts/auto-rerun-latest.js',
    'scripts/auto-rerun-hidden.vbs',
  ]);

  // Paths that must NEVER exist in the shared repo.
  const PURGE_PATTERNS = [
    /(^|\/)CLAUDE\.md$/i,
    /(^|\/)AGENTS\.md$/i,
    /(^|\/)\.claude\//i,
    /(^|\/)\.cursor\//i,
    /(^|\/)\.aider/i,
    /(^|\/)copilot[^/]*$/i,
    // Hands the still-failing set to a headless assistant session
    /^scripts\/auto-triage\.js$/,
    // This script itself.
    /^scripts\/sync-to-platform\.js$/,
    // Real home is the FO-SprintBurnDown repo
    /^scripts\/freshdesk-notify\.js$/,
  ];
  const isPurged = (f) => PURGE_PATTERNS.some((re) => re.test(f));

  if (EXCLUDE.size) {
    const dropped = sourceFiles.filter((f) => EXCLUDE.has(f));
    if (dropped.length) console.log(`Not mirrored (excluded): ${dropped.join(', ')}`);
  }
  sourceFiles = sourceFiles.filter((f) => !EXCLUDE.has(f));

  const purged = sourceFiles.filter(isPurged);
  if (purged.length) {
    console.log(`Never mirrored (purged): ${purged.join(', ')}`);
  }
  // Dropped from the source set only.
  sourceFiles = sourceFiles.filter((f) => !isPurged(f));

  const targetFiles = git(TARGET_REPO, ['ls-files', PREFIX])
    .split('\n')
    .filter(Boolean)
    .map((f) => f.slice(PREFIX.length + 1))
    .filter((f) => !EXCLUDE.has(f));

  const sourceSet = new Set(sourceFiles);
  const stale = targetFiles.filter((f) => !sourceSet.has(f));

  const added = [];
  const changed = [];
  for (const rel of sourceFiles) {
    const src = path.join(SOURCE, rel);
    const dest = path.join(TARGET_REPO, PREFIX, rel);
    if (!fs.existsSync(dest)) {
      added.push(rel);
    } else {
      const a = fs.readFileSync(src);
      const b = fs.readFileSync(dest);
      if (!a.equals(b)) changed.push(rel);
    }
  }

  console.log(`Source (this repo):  ${sourceFiles.length} tracked files`);
  console.log(`Target (${PREFIX}): ${targetFiles.length} tracked files`);
  console.log('');
  console.log(`  new:     ${added.length}`);
  console.log(`  changed: ${changed.length}`);
  console.log(`  removed: ${stale.length}`);

  const show = (label, list) => {
    if (!list.length) return;
    console.log(`\n${label}:`);
    list.slice(0, 40).forEach((f) => console.log('  ' + f));
    if (list.length > 40) console.log(`  ... and ${list.length - 40} more`);
  };
  show('NEW', added);
  show('CHANGED', changed);
  show('REMOVED', stale);

  if (!added.length && !changed.length && !stale.length) {
    console.log('\nAlready up to date — nothing to sync.');
    return;
  }

  if (dryRun) {
    console.log('\n--- dry run, nothing written ---');
    return;
  }

  // --- apply

  for (const rel of stale) {
    fs.rmSync(path.join(TARGET_REPO, PREFIX, rel), { force: true });
  }

  for (const rel of sourceFiles) {
    const dest = path.join(TARGET_REPO, PREFIX, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(SOURCE, rel), dest);
  }

  // --force is required, not sloppiness.
  git(TARGET_REPO, ['add', '--all', '--force', PREFIX]);

  const staged = git(TARGET_REPO, ['diff', '--cached', '--name-only', PREFIX], true);
  if (!staged) {
    console.log('\nNothing staged after copy — already in sync.');
    return;
  }

  git(TARGET_REPO, ['commit', '-m', commitMessage]);
  console.log(`\nCommitted to ${targetBranch}: ${commitMessage}`);

  if (noPush) {
    console.log('--no-push given; stopping before push.');
    return;
  }

  // Push over an authenticated URL built at call time so the PAT is never written into
  const authUrl = `https://anything:${pat}@${REMOTE_PATH}`;
  try {
    execFileSync('git', ['-C', TARGET_REPO, 'push', authUrl, `HEAD:${targetBranch}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    const detail = (e.stderr || e.message || '').replace(pat, '<PAT>');
    fail(`push failed:\n${detail}`);
  }

  console.log(`\nPushed branch: ${targetBranch}`);
  if (updateBranch) {
    console.log('Its open PR now includes this commit.');
  } else {
    console.log('Open the PR here:');
    console.log(
      `  https://dev.azure.com/Cybersoft-Technologies-Inc/Platform/_git/Cybersoft.Platform/` +
        `pullrequestcreate?sourceRef=${targetBranch}&targetRef=${BRANCH}`,
    );
  }
}

// One place turns a failure into an exit code
try {
  run(process.argv.slice(2));
} catch (e) {
  console.error(e instanceof GitError ? e.message : `ERROR: ${e.message}`);
  process.exit(1);
}
