# Debugging Workflows

Workflows fail in ways local code doesn't. Reach for these in order.

## 1. Read the Failed Step

Click into failing job → expand failed step. 80% of failures obvious here:
- Exit code + stderr
- Last command run
- Environment context (YAML block at top of each step)

Don't skip and re-run blindly. Re-running same flake five times wastes minutes, teaches nothing.

## 2. Re-run with Debug Logging

Re-run jobs → "Enable debug logging" checkbox. Or set repo secrets:
- `ACTIONS_RUNNER_DEBUG: true` — runner-level logs
- `ACTIONS_STEP_DEBUG: true` — per-step verbose

Use sparingly — debug logs noisy, persist with run.

## 3. Re-run Failed Jobs Only

Only some jobs failed → use **"Re-run failed jobs"** to keep successful job results. Saves minutes, preserves matrix shard data.

## 4. tmate Session (interactive shell)

For stubborn failures, drop into runner:

```yaml
- name: Setup tmate session
  if: failure()
  uses: mxschmitt/action-tmate@<sha>
  with:
    limit-access-to-actor: true
```

Rules:
- **Only on private repos or trusted forks.** tmate session on public PR is RCE.
- **Always `limit-access-to-actor`** — restricts to user who triggered run.
- **Timeout the job** so forgotten tmate doesn't burn minutes.
- Remove step after debugging. Don't leave tmate in main.

## 5. Local Reproduction with `act`

[`act`](https://github.com/nektos/act) runs workflows locally in Docker:

```bash
act pull_request                    # simulate a PR event
act -j test                         # run a specific job
act -j test -P ubuntu-24.04=...     # use a specific runner image
```

Caveats:
- Not 100% faithful to GitHub's runner image — some actions behave differently.
- No OIDC, no GitHub-hosted secrets unless provided locally.
- Best for syntax validation, step-level debugging, fast iteration on shell commands.

## 6. Branch-Based Iteration

Can't reproduce locally:
1. Create `debug/...` branch.
2. Add diagnostic steps (`env | sort`, `ls -la`, `which node`, `cat /etc/os-release`).
3. Push, observe, refine.
4. Squash debug commits before merging — never merge `console.log`-equivalents.

## Common Failure Modes

### "Permission denied" on token operation
- `permissions:` block too restrictive. Check job-level scope.
- For OIDC: missing `id-token: write`.
- For pushing commits: missing `contents: write`.

### Action behaves differently than docs
- Pinned to old SHA. Check action's release notes since your pin.
- Tag drift: pinned to `@v3` and it changed under you. Re-pin to SHA.

### Cache miss every run
- Key includes value changing every run (`${{ github.sha }}`, timestamps).
- Lockfile not committed.
- `hashFiles()` glob matches nothing.

### "Resource not accessible by integration"
- Default `GITHUB_TOKEN` lacks permission for that API. Grant it, or use PAT / GitHub App token.

### Works on `pull_request` but fails on `push`
- Different `github.ref` shape, different secrets availability, different `github.event.*` payload.

### Flaky test only in CI
- Timing differences (slower runner, no GPU, different timezone).
- Filesystem case sensitivity (Linux runner vs macOS dev).
- Environment variables existing locally but not in CI (or vice versa).

### "Composite action not found"
- Composite actions referenced as `./.github/actions/foo` require checkout step **before** action call.

## Debugging Etiquette

- Don't `continue-on-error: true` to "fix" failing step.
- Don't disable flaky test in CI without follow-up ticket.
- Don't merge debug logging into main.
- When you fix CI bug, leave comment in workflow YAML explaining fix — future self will hit same issue.
