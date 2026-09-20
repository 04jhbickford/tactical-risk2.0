// Predeploy guard for Tactical Risk.
// Wired into firebase.json (hosting.predeploy) so it runs on EVERY `firebase deploy`.
//
// Firebase hosting deploys the raw contents of the working directory — it has no
// idea what git thinks. This script makes the deploy fail loudly whenever the
// working directory could diverge from committed main:
//
//   1. Detached HEAD (deploying from no branch)
//   2. Not on the main branch
//   3. Uncommitted changes to tracked files
//   4. Uncommitted changes stranded inside .claude/worktrees/* — the exact trap
//      that shipped the broken V2.46 build: fixes sat uncommitted in a worktree
//      whose branch pointer matched main, so everything *looked* merged
//
// Override (emergencies only): set ALLOW_DIRTY_DEPLOY=1

import { execSync } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

const repoRoot = process.cwd();
const problems = [];
const warnings = [];

function git(args, cwd = repoRoot) {
  return execSync(`git ${args}`, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

// --- 1 & 2: branch checks ---
let branch = '';
try {
  branch = git('rev-parse --abbrev-ref HEAD');
} catch (e) {
  problems.push('Not a git repository (or git not available). Refusing to deploy unversioned code.');
}

if (branch === 'HEAD') {
  problems.push('You are on a DETACHED HEAD. Deploys must come from the main branch.\n    Fix: git switch main   (then commit your changes)');
} else if (branch && branch !== 'main') {
  problems.push(`You are on branch '${branch}', not 'main'. Merge to main before deploying.`);
}

// --- 3: uncommitted changes to tracked files ---
if (branch) {
  const dirty = git('status --porcelain --untracked-files=no');
  if (dirty) {
    problems.push(`Uncommitted changes to tracked files — the deploy would not match any commit:\n${dirty.split('\n').map(l => '    ' + l).join('\n')}\n    Fix: commit these changes first.`);
  }

  // Untracked source files also get deployed by firebase (public: ".") — warn.
  const untracked = git('status --porcelain')
    .split('\n')
    .filter(l => l.startsWith('??'))
    .map(l => l.slice(3))
    .filter(f => /\.(js|mjs|css|html|json)$/.test(f) && !f.includes('node_modules'));
  if (untracked.length > 0) {
    warnings.push(`Untracked source files will be deployed but are not in git:\n${untracked.map(f => '    ?? ' + f).join('\n')}`);
  }

  // Unpushed commits: warn (site will be ahead of origin/main)
  try {
    const ahead = git('rev-list --count origin/main..HEAD');
    if (parseInt(ahead, 10) > 0) {
      warnings.push(`main is ${ahead} commit(s) ahead of origin/main — push after deploying so the remote matches the live site.`);
    }
  } catch { /* no origin — skip */ }
}

// --- 4: stranded uncommitted work in .claude/worktrees ---
const worktreesDir = join(repoRoot, '.claude', 'worktrees');
if (existsSync(worktreesDir)) {
  for (const name of readdirSync(worktreesDir)) {
    const wt = join(worktreesDir, name);
    try {
      // A pruned/broken worktree makes git fall back to the parent repo and
      // report ITS status — verify git actually resolves to this worktree
      const toplevel = git('rev-parse --show-toplevel', wt).replace(/\//g, '\\').toLowerCase();
      if (!toplevel.endsWith(`\\${name.toLowerCase()}`)) continue;

      const dirty = git('status --porcelain --untracked-files=no', wt);
      if (dirty) {
        problems.push(
          `Worktree '.claude/worktrees/${name}' has UNCOMMITTED changes:\n` +
          dirty.split('\n').slice(0, 10).map(l => '    ' + l).join('\n') +
          `\n    This is the exact trap that shipped the broken V2.46 build.` +
          `\n    Fix: port the changes to main (git -C ".claude/worktrees/${name}" diff | git apply),` +
          `\n    or discard them (git -C ".claude/worktrees/${name}" checkout -- .), then re-deploy.`
        );
      }
    } catch { /* not a valid worktree — ignore */ }
  }
}

// --- report ---
for (const w of warnings) console.warn(`\n[predeploy] WARNING: ${w}`);

if (problems.length > 0) {
  console.error('\n============================================================');
  console.error('[predeploy] DEPLOY BLOCKED — the working tree does not match');
  console.error('committed main. Deploying now would repeat the V2.46 incident.');
  console.error('============================================================');
  problems.forEach((p, i) => console.error(`\n${i + 1}. ${p}`));
  if (process.env.ALLOW_DIRTY_DEPLOY === '1') {
    console.error('\n[predeploy] ALLOW_DIRTY_DEPLOY=1 set — proceeding anyway. You have been warned.');
  } else {
    console.error('\n(Emergency override: set ALLOW_DIRTY_DEPLOY=1)');
    process.exit(1);
  }
}

console.log(`[predeploy] OK — deploying committed main (${branch ? git('rev-parse --short HEAD') : 'unknown'})`);
