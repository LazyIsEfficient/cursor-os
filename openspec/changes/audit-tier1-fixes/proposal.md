## Why

A full-repo audit of the gate machinery found live bypasses in Tier 0/1
controls plus hygiene drift between twin implementations:

- **`gh api` bypass** — the beforeShellExecution verify-ledger gate covers
  only `gh pr create|ready`; `gh api repos/{o}/{r}/pulls -f head=...` creates
  PRs (and any other repo mutation) with no ledger check (reproduced in audit).
- **Remote ref deletion allowed** — `git push origin :feat/old` and
  `git push --delete` rewrite shared remote state but were not denied
  alongside force-push.
- **Bash↔JS gate-plan divergence** — the JS twin's dispatch-brief check
  (`startsWith("openspec/changes/") && includes("/dispatch/")`) matches
  `openspec/changes/dispatch/foo.md`; the bash pattern
  `openspec/changes/*/dispatch/*` requires a change-id segment. Identical
  change sets classify differently.
- **CI ship-gates trust the PR's gate scripts** — `check-pr-ship-gates` runs
  gate scripts from the PR checkout, so a PR can weaken its own gates.

## What Changes

- Extend the high-impact `gh` rule in `plugin/scripts/before-shell-execution.mjs`:
  mutating `gh api` calls (explicit `-X/--method` POST/PUT/PATCH/DELETE, or
  implicit POST via `-f/--field`, `-F/--raw-field`, `--input`) require a valid
  verify ledger, same as `gh pr create|ready`. Read-only `gh api` (GET) stays
  allowed.
- Deny remote ref deletion via push (`:dst` empty-src refspecs and
  `--delete` / `-d` flag forms) alongside force-push denial.
- Align `plugin/scripts/lib/dispatch-gate-plan-lib.mjs` to the bash twin:
  dispatch-brief classification requires a non-empty span between
  `openspec/changes/` and `/dispatch/`; sync comments updated in both files.
- Run gate scripts from the base ref in CI ship-gates (companion workstream;
  spec'd here, implemented separately).

## Capabilities

### New Capabilities
- `pr-gates`: Shell-guard PR/remote-state gates — verify-ledger coverage of
  `gh` mutation surfaces, remote-ref-delete denial, and bash/JS gate-planner
  parity, with CI ship-gates running gate logic from the base ref.

### Modified Capabilities

## Impact

- `plugin/scripts/before-shell-execution.mjs` (gh api ledger gate,
  refspec-delete denial)
- `tests/security/before-shell-execution.test.mjs` (regression coverage)
- `plugin/scripts/lib/dispatch-gate-plan-lib.mjs`, `scripts/lib/gate-plan-lib.sh`
  (twin parity + sync comments)
- `tests/security/dispatch-gate.test.mjs`, `scripts/gate-plan-test.sh`
  (fixtures)
- `.github/workflows/` + `scripts/check-pr-ship-gates.sh` (base-ref gate
  execution — companion agent)
