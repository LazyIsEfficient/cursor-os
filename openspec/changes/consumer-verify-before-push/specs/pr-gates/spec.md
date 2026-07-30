## ADDED Requirements

### Requirement: Plain git push requires a valid verify ledger
The beforeShellExecution guard SHALL require a valid verify ledger
(`.cursor/verify-ledger.json` proving `impl_verified` for the current HEAD)
for every plain `git push` that is not already classified as a Tier-A
force-push or remote-ref-delete. Denial SHALL name rule
`git-push-without-verify`. Tier-A force-push (`git-history-rewrite`) and
remote-ref-delete (`git-remote-ref-delete`) SHALL remain hard denies —
a valid verify ledger MUST NOT soften them.

#### Scenario: Plain push without a ledger
- **GIVEN** no valid verify ledger exists for the current HEAD
- **WHEN** the agent runs `git push origin feat/new-work` with no force,
  delete, mirror, prune, or empty-src refspec
- **THEN** the guard denies the command with rule `git-push-without-verify`

#### Scenario: Plain push with a valid ledger
- **GIVEN** a valid verify ledger proves `impl_verified` for the current HEAD
- **WHEN** the agent runs `git push origin feat/new-work` with no force,
  delete, mirror, prune, or empty-src refspec
- **THEN** the guard allows the command

#### Scenario: Force push remains hard-denied
- **GIVEN** a valid verify ledger proves `impl_verified` for the current HEAD
- **WHEN** the agent runs `git push --force origin feat/new-work` (or
  `--force-with-lease`, `-f`, or `+refspec`)
- **THEN** the guard denies the command with rule `git-history-rewrite`

#### Scenario: Remote ref delete remains hard-denied
- **GIVEN** a valid verify ledger proves `impl_verified` for the current HEAD
- **WHEN** the agent runs `git push origin :feat/old` or
  `git push --delete origin feat/old`
- **THEN** the guard denies the command with rule `git-remote-ref-delete`

### Requirement: VERIFY_PR_GATE_DISABLED skips push, PR, and stop follow-up
When environment variable `VERIFY_PR_GATE_DISABLED` is set to `1`, the
beforeShellExecution guard SHALL skip the verify-ledger checks for plain
`git push` and for `gh pr create|ready` (and other ledger-gated `gh`
mutations that share `verifyLedgerAllowsGhPr`), and the stop hook SHALL
emit no follow-up. Tier-A hard denies (force-push, remote-ref-delete, and
other Tier-A `gh` rules) SHALL remain in force.

#### Scenario: Kill-switch allows push and PR without a ledger
- **GIVEN** `VERIFY_PR_GATE_DISABLED=1` and no valid verify ledger
- **WHEN** the agent runs a plain `git push` or `gh pr create`
- **THEN** the guard allows the command (ledger checks skipped)

#### Scenario: Kill-switch suppresses stop follow-up
- **GIVEN** `VERIFY_PR_GATE_DISABLED=1`, a dirty or ahead worktree, and an
  invalid verify ledger
- **WHEN** the stop hook runs with status `completed`
- **THEN** the stop hook returns no follow-up message

### Requirement: Stop hook follows up once when dirty or ahead and ledger invalid
The verify-ledger stop hook SHALL emit a single follow-up message when the
session status is `completed`, the worktree is dirty or the branch is ahead
of upstream, and the verify ledger does not prove `impl_verified` for the
current HEAD. The follow-up SHALL instruct the agent to record verification
via `verify:record` before the next push/PR. When the ledger is valid, the
worktree is clean and not ahead, or status is not `completed`, the hook
SHALL emit no follow-up.

#### Scenario: Dirty worktree with invalid ledger
- **GIVEN** the worktree has uncommitted changes and no valid verify ledger
  for HEAD
- **WHEN** the stop hook runs with status `completed`
- **THEN** the hook returns a follow-up message directing `verify:record`

#### Scenario: Ahead of upstream with invalid ledger
- **GIVEN** the branch is ahead of upstream and no valid verify ledger for HEAD
- **WHEN** the stop hook runs with status `completed`
- **THEN** the hook returns a follow-up message directing `verify:record`

#### Scenario: Valid ledger suppresses follow-up
- **GIVEN** a dirty or ahead worktree and a valid verify ledger for HEAD
- **WHEN** the stop hook runs with status `completed`
- **THEN** the hook returns no follow-up message

#### Scenario: Clean and not-ahead suppresses follow-up
- **GIVEN** a clean worktree that is not ahead of upstream and an invalid
  verify ledger
- **WHEN** the stop hook runs with status `completed`
- **THEN** the hook returns no follow-up message

### Requirement: Rust profile clippy requires --all-targets and -D warnings
For verify-ledger profile `rust`, coverage SHALL require a spawned
`cargo clippy` command that includes `--all-targets` and denies warnings
via `-D warnings` (accepted forms: `-Dwarnings`, or `-D` followed by
`warnings`, including after `--`). A clippy invocation missing either
`--all-targets` or the deny-warnings flag SHALL NOT satisfy rust coverage.

#### Scenario: CI-shaped clippy satisfies rust coverage
- **GIVEN** a rust-profile ledger recording `cargo fmt --check`,
  `cargo clippy --all-targets -- -D warnings`, and `cargo test` (or
  nextest), all with exit 0 and `spawned: true`
- **WHEN** the ledger is validated for the current HEAD
- **THEN** rust coverage passes and `impl_verified` may be true

#### Scenario: Weaker clippy fails rust coverage
- **GIVEN** a rust-profile ledger whose clippy command lacks `--all-targets`
  or lacks `-D warnings`
- **WHEN** the ledger is validated for the current HEAD
- **THEN** rust coverage fails and `impl_verified` is false

### Requirement: Custom coverage requires exact cmds from verify-profile sidecar
When a valid `.cursor/verify-profile.json` (version 1) exists at the project
root, verify-ledger profile `custom` SHALL require that every command listed
in that sidecar has been recorded as a spawned success for the current HEAD.
Absent the sidecar, custom coverage SHALL fall back to the existing ≥2
verification-shaped command rule.

#### Scenario: Sidecar present requires exact commands
- **GIVEN** `.cursor/verify-profile.json` v1 lists specific check commands
- **WHEN** a custom-profile ledger is validated for HEAD
- **THEN** coverage requires those exact commands (not merely any ≥2
  verification-shaped commands)

#### Scenario: Missing sidecar uses default custom rule
- **GIVEN** no `.cursor/verify-profile.json` exists
- **WHEN** a custom-profile ledger is validated for HEAD
- **THEN** coverage requires ≥2 verification-shaped spawned commands

### Requirement: verify:ci-parity extracts check cmds and optionally writes sidecar
`npm run verify:ci-parity` (via `plugin/scripts/ci-parity.mjs`) SHALL scan
`.github/workflows/*`, justfile, and Makefile for check-shaped commands,
print `verify:record` recipe lines to stdout, and when `--write` is passed
SHALL write `.cursor/verify-profile.json` with those commands. When no check
commands are found the command SHALL exit nonzero without writing a sidecar.

#### Scenario: Extract and print recipe
- **GIVEN** a consumer repo whose workflows or Makefile contain check-shaped
  commands
- **WHEN** the agent runs `npm run verify:ci-parity`
- **THEN** the tool prints `verify:record` recipe lines for the extracted
  commands and exits 0

#### Scenario: Write sidecar with --write
- **GIVEN** check-shaped commands exist in CI sources
- **WHEN** the agent runs `npm run verify:ci-parity -- --write`
- **THEN** the tool writes `.cursor/verify-profile.json` with those commands
  and exits 0

#### Scenario: No check commands found
- **GIVEN** no check-shaped commands in workflows, justfile, or Makefile
- **WHEN** the agent runs `npm run verify:ci-parity`
- **THEN** the tool exits nonzero and does not write a sidecar
