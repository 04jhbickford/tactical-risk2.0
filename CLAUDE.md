# Tactical Risk — project instructions

Browser-based WWII grand-strategy game (vanilla ES modules, no bundler).
Multiplayer uses Firebase Auth and Firestore. Live hosting is the Vercel
project `tactical-risk2.0` at `https://tactical-risk20.vercel.app`.
Production deploys when a reviewer merges to `main`. Agents never merge
and never deploy.
Entry point: `index.html` → `src/main.js`. Game rules/state: `src/state/gameState.js`.
Multiplayer sync: `src/multiplayer/` (syncManager, lobbyManager, multiplayerGuard, surrender).
Bug log: `BUGS.md` (add every playtest round there).

## Deployment workflow — MANDATORY

The live site is Vercel Production for `tactical-risk2.0`
(`https://tactical-risk20.vercel.app`). Firebase stays Auth and Firestore.
Git and the deploy are only connected by discipline. The V2.46 incident: fixes sat
uncommitted in a `.claude/worktrees/*` worktree whose branch pointer matched main,
so every "is it merged?" check passed while live users ran the broken build for weeks.

Rules:

1. **Never end a session with code changes uncommitted.** Commit on the
   feature branch (never detached HEAD) and push. A reviewer merges to `main`.
   Agents never merge and never deploy.
2. **Production deploy is Vercel’s deploy from a merge to `main`.**
   Do not `firebase deploy` the live site. Do not use `ALLOW_DIRTY_DEPLOY=1`.
3. **After a Production deploy run** `node tools/verify-deployed.mjs` — it
   fetches live `src/version.js` (default `https://tactical-risk20.vercel.app`,
   or pass the origin) and fails unless live `GAME_VERSION` matches the local file.
4. **Bump `GAME_VERSION`** in `src/version.js` for every deployed change so
   playtesters can confirm which build they're on.
5. **Worktree hygiene:** before assuming a past fix landed, check
   `git -C ".claude/worktrees/<name>" status --short` — a clean branch pointer
   does NOT mean the fix was committed. Port stranded diffs to main or discard them.

## Conventions

- Version commits: `V2.NN: <summary>` (see git log).
- Multiplayer authority: the HOST client runs AI turns; non-host clients must
  never mutate state outside their own turn (enforced by `multiplayerGuard` +
  transaction-guarded pushes in `syncManager`).
- Firestore queries: avoid compound inequality/range filters that require
  composite indexes (`firestore.indexes.json` is intentionally empty); stick to
  equality/in/array-contains shapes that index-merge.
