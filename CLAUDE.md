# Tactical Risk — project instructions

Browser-based WWII grand-strategy game (vanilla ES modules, no bundler).
Multiplayer via Firebase (Auth + Firestore); hosting via Firebase Hosting.
Entry point: `index.html` → `src/main.js`. Game rules/state: `src/state/gameState.js`.
Multiplayer sync: `src/multiplayer/` (syncManager, lobbyManager, multiplayerGuard, surrender).
Bug log: `BUGS.md` (add every playtest round there).

## Deployment workflow — MANDATORY

The live site is Firebase Hosting serving the RAW working directory (`public: "."`).
Git and the deploy are only connected by discipline. The V2.46 incident: fixes sat
uncommitted in a `.claude/worktrees/*` worktree whose branch pointer matched main,
so every "is it merged?" check passed while live users ran the broken build for weeks.

Rules (enforced by `tools/predeploy-check.mjs`, wired into `firebase.json` predeploy):

1. **Never end a session with code changes uncommitted.** Commit on `main`
   (never detached HEAD), push, and deploy in the same session the changes land.
2. **Deploy = `firebase deploy` from the repo root on a clean `main`.**
   The predeploy hook blocks detached HEAD, non-main branches, uncommitted
   tracked changes, and uncommitted changes stranded in `.claude/worktrees/*`.
   Do not use `ALLOW_DIRTY_DEPLOY=1` except in a genuine emergency.
3. **After every deploy run** `node tools/verify-deployed.mjs` — it compares the
   live site's `GAME_VERSION` against the local checkout and fails on mismatch.
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
