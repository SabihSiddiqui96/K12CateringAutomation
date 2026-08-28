#!/usr/bin/env node
/**
 * Mirror this repo into the Cybersoft.Platform monorepo folder.
 *
 * The platform repo keeps each automation project as a plain folder
 * (ExpressPoint, K12Catering, SchoolCafe, SCTV), not a submodule, so this
 * copies files across and makes its own commit there. Histories stay separate
 * on purpose: the monorepo sees one clean commit per sync instead of this
 * repo's several hundred.
 *
 * Only files git already tracks here are copied, which is what keeps secrets
 * out: .env, .env.release, node_modules and test-results are all gitignored, so
 * they can never reach the shared repo. Files deleted here are deleted there too,
 * so the folder is a true mirror rather than an append.
 *
 * The mirror never lands on AutomationProjects itself. That branch is shared
 * company code, so a sync either cuts its own camelCase branch off it (--branch)
 * or adds a commit to a branch that already has a PR open (--update-branch).
 *
 * Run with --help for usage.
 *
 * Auth: AZURE_DEVOPS_CODE_PAT in .env (needs Code Read & Write; the older
 * AZURE_DEVOPS_PAT is Work Items only and will not work here).
 */
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

// Run git in `repo`. Throws so the caller decides what to do. allowFail is for
// probes where a non-zero exit is a real answer ("that ref does not exist").
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

// Parse `git status --porcelain=v1 -z`. Use -z: the default output quotes odd
// paths and puts a rename on one line as "old -> new", so a filename with a
// newline or " -> " in it breaks a naive split. With -z each entry is
// NUL-terminated and a rename spends two records.
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

// Read one key out of .env. Handles `export KEY=`, comments and quoted values.
// Small on purpose - .env here is only ever written by hand or by our own
// tooling - but it no longer hands back the quotes as part of the PAT, which
// showed up as a 401 that made no sense.
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
  //   --branch        cut a fresh branch off BRANCH (the normal case)
  //   --update-branch reuse an existing remote branch, so an open PR picks the
  //                   new commit up instead of needing a second PR
  const featureBranch = argValue(args, '--branch', '-b');
  const updateBranch = argValue(args, '--update-branch', '-u');
  const targetBranch = updateBranch || featureBranch;

  // --- preflight -----------------------------------------------------------

  if (!fs.existsSync(TARGET_REPO)) {
    fail(`platform repo not found at ${TARGET_REPO}`);
  }

  const pat = readEnvValue('AZURE_DEVOPS_CODE_PAT');
  if (!pat && !noPush && !dryRun) {
    fail('AZURE_DEVOPS_CODE_PAT not found in .env (needs Code Read & Write).');
  }

  // Refuse to run against a dirty platform checkout — committing someone else's
  // half-finished work into a shared repo is not ours to do.
  const targetDirty = porcelainEntries(TARGET_REPO).filter(
    (l) => l.trim() && !l.includes(PREFIX),
  );
  if (targetDirty.length) {
    console.error('Platform repo has uncommitted changes outside ' + PREFIX + ':');
    targetDirty.slice(0, 10).forEach((l) => console.error('  ' + l));
    fail('resolve those first — refusing to touch a dirty shared checkout.');
  }

  // The point of this mirror is "what I committed here shows up there", so a
  // half-edited working tree must not leak into the shared repo. Tracked-file
  // edits block; untracked scratch files are ignored since they are never copied.
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

  // Start from what the remote has now, not from whatever this shared checkout
  // is parked on - a stale checkout is how you get a non-fast-forward push that
  // fails after the commit is already made.
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
      // If that branch already exists remotely with commits our base does not
      // have, the push would be rejected. Say so now, not after committing.
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
    // Leave the shared checkout back on BRANCH so the next sync starts clean and
    // nobody finds it parked on a one-off branch.
    if (movedOffBaseBranch) git(TARGET_REPO, ['checkout', BRANCH], true);
  }
}

function syncFiles({ args, dryRun, noPush, commitMessage, targetBranch, updateBranch, pat }) {
  // --- work out the file set -----------------------------------------------

  // Tracked files only: this is the gitignore filter that keeps .env out.
  // Read the index with modes so gitlinks (mode 160000, i.e. submodules) can be
  // dropped — they are directories on disk, so copying them byte-for-byte throws
  // EISDIR, and a submodule pointer means nothing in a plain-folder mirror anyway.
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

  // Files that live in this repo but have no business in the shared monorepo. The
  // mirror is meant to carry the K12 automation suite; freshdesk-notify.js is a
  // RingCentral notifier whose real home is the FO-SprintBurnDown repo, and the copy
  // here is dead — it is paused and nothing runs it. Syncing edits to a dead file into
  // a repo other teams read is noise.
  //
  // Excluded paths are left ALONE at the target: not copied over, and not treated as
  // stale either. Dropping them from the source set without also dropping them from the
  // removal candidates would silently delete them from the shared repo on the next sync,
  // which is a much bigger action than "stop mirroring this file".
  const EXCLUDE = new Set([
    // Real home is the FO-SprintBurnDown repo; the copy here is paused and dead.
    'scripts/freshdesk-notify.js',
    // Local Task Scheduler tooling for this machine, not shared test automation. The
    // .vbs hardcodes an absolute path under this user profile, and auto-rerun-latest.js
    // shells out to scripts/rerun-failed.js, which is gitignored and therefore absent
    // from the mirror - so both are broken by construction anywhere but here.
    'scripts/auto-rerun-latest.js',
    'scripts/auto-rerun-hidden.vbs',
  ]);

  if (EXCLUDE.size) {
    const dropped = sourceFiles.filter((f) => EXCLUDE.has(f));
    if (dropped.length) console.log(`Not mirrored (excluded): ${dropped.join(', ')}`);
  }
  sourceFiles = sourceFiles.filter((f) => !EXCLUDE.has(f));

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

  // --- apply ---------------------------------------------------------------

  for (const rel of stale) {
    fs.rmSync(path.join(TARGET_REPO, PREFIX, rel), { force: true });
  }

  for (const rel of sourceFiles) {
    const dest = path.join(TARGET_REPO, PREFIX, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(SOURCE, rel), dest);
  }

  // --force is required, not sloppiness. This repo's .gitignore is itself one of
  // the copied files, so git re-applies it inside the mirror and refuses paths
  // that are legitimately tracked here — files added before a later ignore rule,
  // or force-added at the time. The source repo's tracked set is the authority on
  // what belongs in the mirror; nothing outside that set is ever copied, so there
  // is no risk of sweeping in build output or secrets.
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

  // Push over an authenticated URL built at call time so the PAT is never written
  // into .git/config where it would sit on disk in the shared checkout.
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

// One place turns a failure into an exit code, so the helpers above can throw
// instead of calling process.exit(1) from deep inside and skipping the restore.
try {
  run(process.argv.slice(2));
} catch (e) {
  console.error(e instanceof GitError ? e.message : `ERROR: ${e.message}`);
  process.exit(1);
}
