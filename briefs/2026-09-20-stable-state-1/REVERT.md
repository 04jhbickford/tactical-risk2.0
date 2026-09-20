# Stable State 1 — revert / redeploy

Rollback point **before** the dual-path Classic | New UX (Three chrome) fork.
Do **not** force-push `main` history.

## Tag

| Field | Value |
|---|---|
| Tag | `stable-state-1` (annotated) |
| SHA | `f0f3b486378d7061c9dbf541ecbb90d56d6c9fde` |
| Stamp | `V2.81.56` (post-PR #82 persist combat capture) |
| Date | 20 Sep 2026 |

Confirm on remote:

```bash
git ls-remote --tags origin stable-state-1
git rev-parse stable-state-1^{}
```

Must equal `f0f3b486378d7061c9dbf541ecbb90d56d6c9fde`.

### Remote status (20 Sep 2026)

| Remote | Tag present? |
|---|---|
| `04jhbickford/Tactical-Risk` (live SoT) | **No** — `cursor[bot]` has no write (403). SHA is already on `origin/main`; James can `git tag -a stable-state-1 f0f3b486378d7061c9dbf541ecbb90d56d6c9fde` and push the tag. |
| `04jhbickford/tactical-risk2.0` (this agent's assigned repo) | **Yes** — annotated tag `stable-state-1` → `f0f3b486378d7061c9dbf541ecbb90d56d6c9fde` |

## Live

| Field | Value |
|---|---|
| Production URL | https://tactical-risk20.vercel.app |
| Vercel project | `tactical-risk2.0` (`prj_ufMEaP0z2dzqHcK54OL8DpB6bI66`) |
| Team | `james-projects-20d8de40` (`team_Kt967yGsw09y50xW3FhBTppb`) |
| GitHub source of truth | `04jhbickford/Tactical-Risk` (`main`) |
| Production deploy at tag | `dpl_2ukozB8EcbSTdhcV9sKzUXCrSEQn` · `githubCommitSha=f0f3b486378d7061c9dbf541ecbb90d56d6c9fde` |

## If dual-path fails — redeploy the tag (do not rewrite main)

1. Check out the tag (detached or a revert branch). **Do not** `git push --force` to `main`.

```bash
git fetch origin tag stable-state-1
git checkout -B restore-stable-state-1 stable-state-1
```

2. Redeploy that tree to production (Vercel production of `tactical-risk2.0` / https://tactical-risk20.vercel.app). Either:

   - Open a PR `restore-stable-state-1` → `main` that resets `main` to the tag via a **revert merge** (keeps history), then merge; or
   - In Vercel: Promote / Instant Rollback to deploy `dpl_2ukozB8EcbSTdhcV9sKzUXCrSEQn` (rollback candidate).

3. Confirm L0 / lobby stamp is `V2.81.56` after a hard reload.

4. Smoke Classic create + join. Dual-path / `?ux=three` must be gone.

## Do not

- Force-push `main` to delete dual-path commits.
- Retire Classic Canvas as part of a panic revert.
- Redeploy the solo eval tip (`V2.81.56-ux-solo.18` / `cursor/unit-sheet-clickthrough-d314`) as a replacement for live Classic.
