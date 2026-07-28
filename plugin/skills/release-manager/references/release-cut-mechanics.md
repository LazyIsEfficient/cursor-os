# Release cut mechanics — branch, PR, and version tag

Release doc edits and version tag go through **git + GitHub CLI** (`gh`), not
direct commits to default branch unless team explicitly allows.

1. **Branch** — From agreed base (usually latest default branch), create
   new branch for this cut, e.g. `release/v1.1.0-docs` or
   `chore/release-1.1.0-changelog` (match team naming if one exists).
2. **Commit** — Update CHANGELOG and release assessment on that branch; push
   to `origin`.
3. **PR** — Open pull request with `gh pr create` (clear title: version plus
   "release notes" / "release docs"; body summarizes scope, risk, review
   asks).
4. **Merge** — After review and green checks, merge via repo's normal
   process (merge queue, squash policy, etc.).
5. **Tag** — Annotated tag name is **`v` + semver** matching agreed
   release number, e.g. `v1.1.0` for release `1.1.0`. On **merged commit** on
   branch that should carry tag (almost always default branch at
   release SHA), use GitHub CLI, for example:
   - **Release + tag in one step** (common):
     `gh release create v1.1.0 --title "v1.1.0" --notes-file path/to/snippet.md`
     (or `--generate-notes` if matches repo practice), which creates tag
     at `HEAD` when run on correct checkout.
   - **Tag already created locally**: push tag, then optionally
     `gh release create v1.1.0` to attach release metadata.

Confirm `gh auth status` and repo context (`gh repo view`) before mutating
remotes. If monorepo documents different tagging or release command
sequence, follow that document over this generic pattern.

## Release workflow checklist

Copy and track when driving a cut:

```
Release progress:
- [ ] Confirm target version, branch name, and freeze window with owners
- [ ] Sync from agreed base; list commits/packages in scope
- [ ] Create a new branch for release doc updates; edit CHANGELOG + release assessment there only
- [ ] Push branch; open PR with gh pr create; resolve conflicts and re-run repo checks until green
- [ ] Merge the PR via the repo's normal process
- [ ] Checkout/pull default branch at the release merge SHA; tag as vMAJOR.MINOR.PATCH using gh
- [ ] Post summary to agreed channel: scope, blockers, ETA, asks
- [ ] Hand off to whoever runs deploy/publish after tag if that is a separate step
```

## Conflict resolution on a release branch

- Prefer **smallest correct merge** — preserve both sides' intent; avoid
  "take ours" wholesale unless policy says so.
- After conflicts: **run repo's standard checks** (lint, typecheck, tests)
  before declaring clean. Red check after conflict resolution is Tier 0
  evidence merge was wrong, not flake to retry past.
- If conflict reflects **product or design choice**, stop and route to
  owning engineer or PM rather than guessing.
