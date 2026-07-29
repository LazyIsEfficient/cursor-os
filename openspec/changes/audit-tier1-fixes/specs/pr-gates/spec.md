## ADDED Requirements

### Requirement: Mutating gh api calls require a verify ledger
The beforeShellExecution guard SHALL require a valid verify ledger
(`.cursor/verify-ledger.json` proving `impl_verified` for the current HEAD)
for every `gh api` invocation that mutates GitHub state: any call with an
explicit `-X`/`--method` of POST, PUT, PATCH, or DELETE, and any call whose
body flags (`-f`/`--field`, `-F`/`--raw-field`, `--input`) make `gh api`
default to POST. Read-only `gh api` calls (no method flags, or GET) SHALL be
allowed without a ledger.

#### Scenario: gh api PR creation without a ledger
- **GIVEN** no valid verify ledger exists for the current HEAD
- **WHEN** the agent runs `gh api repos/{owner}/{repo}/pulls -f head=...`
- **THEN** the guard denies the command with the verify-ledger rule

#### Scenario: gh api mutation with a valid ledger
- **GIVEN** a valid verify ledger proves `impl_verified` for the current HEAD
- **WHEN** the agent runs a mutating `gh api` call (explicit `-X DELETE` or body-flag POST)
- **THEN** the guard allows the command

#### Scenario: Read-only gh api stays allowed
- **GIVEN** no verify ledger exists
- **WHEN** the agent runs `gh api repos/{owner}/{repo}` with no method or body flags (or explicit GET)
- **THEN** the guard allows the command

### Requirement: Remote ref deletion via git push is denied
The beforeShellExecution guard SHALL deny `git push` forms that delete remote
refs: refspecs with an empty source starting with `:` (e.g.
`git push origin :feat/old`) and the `--delete` / `-d` flag forms, alongside
the existing force-push denial. Ordinary pushes SHALL remain allowed.

#### Scenario: Empty-source refspec
- **WHEN** the agent runs `git push origin :feat/old`
- **THEN** the guard denies the command

#### Scenario: Delete flag form
- **WHEN** the agent runs `git push --delete origin feat/old` or `git push -d origin feat/old`
- **THEN** the guard denies the command

#### Scenario: Ordinary push allowed
- **WHEN** the agent runs `git push origin feat/new-work` with no force, delete, or empty-src refspec
- **THEN** the guard allows the command

### Requirement: Bash and JS gate planners classify identical change sets identically
`scripts/lib/gate-plan-lib.sh` and
`plugin/scripts/lib/dispatch-gate-plan-lib.mjs` SHALL produce the same
classification (code/library/sensitive/docs-only) for any changed-path set.
The OpenSpec dispatch-brief class SHALL require a non-empty path span between
`openspec/changes/` and `/dispatch/`, matching the bash glob
`openspec/changes/*/dispatch/*`.

#### Scenario: Real dispatch brief gates
- **GIVEN** the changed paths include `openspec/changes/foo/dispatch/T-x.md`
- **WHEN** either gate planner classifies the change set
- **THEN** both classify it as sensitive (gates run, not docs-only)

#### Scenario: Bare dispatch directory path is docs-only
- **GIVEN** the changed paths include only `openspec/changes/dispatch/foo.md`
- **WHEN** either gate planner classifies the change set
- **THEN** both classify it as docs-only (no sensitive flag)

### Requirement: CI ship-gates execute gate scripts from the base ref
The CI ship-gate check SHALL execute gate-planning and ship-gate scripts
checked out from the PR's base ref, not from the PR head, so a pull request
MUST NOT be able to weaken the gate logic that judges it.

#### Scenario: PR weakens its own gate scripts
- **GIVEN** a PR modifies gate scripts so that its own changes would pass review gates
- **WHEN** CI runs the ship-gate check
- **THEN** the gate logic from the base ref is used and the PR's modifications do not relax its own gates

#### Scenario: Gate script changes are still reviewed
- **WHEN** a PR legitimately changes gate scripts
- **THEN** those changes are classified sensitive and require the standard reviewer wave before merge
