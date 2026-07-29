## ADDED Requirements

### Requirement: Account-key and credential-exfiltration gh commands are hard-denied
The beforeShellExecution guard SHALL deny `gh ssh-key add`, `gh gpg-key add`,
and `gh auth token` unconditionally — no valid verify ledger SHALL soften
these denials. The denial SHALL name rules `gh-account-key-add` and
`gh-auth-token` respectively.

#### Scenario: SSH key addition denied
- **GIVEN** a valid verify ledger exists for the current HEAD
- **WHEN** the agent runs `gh ssh-key add ~/.ssh/id_rsa.pub`
- **THEN** the guard denies the command with rule `gh-account-key-add`

#### Scenario: GPG key addition denied
- **WHEN** the agent runs `gh gpg-key add ~/key.asc`
- **THEN** the guard denies the command with rule `gh-account-key-add`

#### Scenario: Auth token exfiltration denied
- **WHEN** the agent runs `gh auth token` (with or without `--hostname`)
- **THEN** the guard denies the command with rule `gh-auth-token`

### Requirement: gh extension and alias mutations are hard-denied
The beforeShellExecution guard SHALL deny `gh extension install`,
`gh extension upgrade`, `gh alias set`, and `gh alias delete`
unconditionally, naming rules `gh-extension-install` and `gh-alias-mutation`
respectively. Alias expansions are invisible to hook command matching, so
alias mutation MUST NOT be permitted at any ledger state.

#### Scenario: Extension install denied
- **WHEN** the agent runs `gh extension install owner/gh-cool` or `gh extension upgrade --all`
- **THEN** the guard denies the command with rule `gh-extension-install`

#### Scenario: Alias mutation denied
- **WHEN** the agent runs `gh alias set bugs 'issue list --label bug'` or `gh alias delete bugs`
- **THEN** the guard denies the command with rule `gh-alias-mutation`

#### Scenario: Read-only extension and alias forms allowed
- **WHEN** the agent runs `gh alias list`
- **THEN** the guard allows the command

### Requirement: gh pr merge is hard-denied in all forms
The beforeShellExecution guard SHALL deny every `gh pr merge` invocation —
including `--auto`, `--squash`, and `--delete-branch` forms and glued-flag
combinations — with rule `gh-pr-merge`, regardless of verify-ledger state.
Repo doctrine: humans merge; an agent merge bypasses the entire ship-gate
DAG.

#### Scenario: Plain merge denied
- **GIVEN** a valid verify ledger exists for the current HEAD
- **WHEN** the agent runs `gh pr merge 123`
- **THEN** the guard denies the command with rule `gh-pr-merge`

#### Scenario: Glued-flag merge denied
- **WHEN** the agent runs `gh pr merge --squash --auto 123`
- **THEN** the guard denies the command with rule `gh-pr-merge`

### Requirement: gh release creation, editing, and asset mutation are hard-denied
The beforeShellExecution guard SHALL deny `gh release create`,
`gh release edit`, `gh release upload`, and `gh release delete-asset`
unconditionally with rule `gh-release-mutation`, alongside
the existing `gh release delete` denial (`remote-object-delete`). Releases
and their assets are owned by `release.yml` and the tag-from-main CI guard.

#### Scenario: Release create denied
- **WHEN** the agent runs `gh release create v1.0.0`
- **THEN** the guard denies the command with rule `gh-release-mutation`

#### Scenario: Release edit denied
- **WHEN** the agent runs `gh release edit v1.0.0 --draft=false`
- **THEN** the guard denies the command with rule `gh-release-mutation`

#### Scenario: Release asset upload denied
- **WHEN** the agent runs `gh release upload v1.0.0 dist.zip` or `gh release -R owner/repo upload v1.0.0 dist.zip`
- **THEN** the guard denies the command with rule `gh-release-mutation`

#### Scenario: Release asset deletion denied
- **WHEN** the agent runs `gh release delete-asset v1.0.0 asset.zip`
- **THEN** the guard denies the command with rule `gh-release-mutation`

#### Scenario: Read-only release forms allowed
- **WHEN** the agent runs `gh release view v1.0.0` or `gh release list`
- **THEN** the guard allows the command

### Requirement: gh verb resolution is position-aware and fails closed
The beforeShellExecution guard SHALL resolve the verb of every gated `gh`
group as the first non-flag word after the group name, consuming the values
of gh's value-taking flags (`-R`, `--repo`, `--hostname`), including glued
`-Ro/r` and `--repo=o/r` forms. Flags that are not `--flag=value` form and
are not known value-taking flags SHALL conservatively consume no value. All
Tier A hard denies, all Tier B ledger gates, and the `gh repo delete` /
`gh release delete` denials SHALL test this resolved verb — a flag between
the group name and the verb MUST NOT evade any rule. When the verb position
cannot be resolved (`--` before the verb), the guard SHALL fail closed:
Tier-A-shaped groups deny with their most restrictive hard rule, and
Tier-B-shaped groups (`secret`/`variable`/`workflow`) require the verify
ledger.

#### Scenario: Flag-before-verb Tier A form denied
- **GIVEN** a valid verify ledger exists for the current HEAD
- **WHEN** the agent runs `gh pr -R owner/repo merge 12`, `gh pr -Rowner/repo merge 12`, or `gh auth --hostname x token`
- **THEN** the guard denies the command with rule `gh-pr-merge` / `gh-auth-token`

#### Scenario: Flag-before-verb Tier B form gated
- **GIVEN** no valid verify ledger exists for the current HEAD
- **WHEN** the agent runs `gh secret -R owner/repo set MY_SECRET`, `gh workflow -R owner/repo run ci.yml`, `gh pr -R owner/repo review 12 --approve`, `gh repo -R owner/repo rename x`, or `gh variable --repo owner/repo delete MY_VAR`
- **THEN** the guard denies the command with the verify-ledger rule

#### Scenario: Unresolvable verb position fails closed
- **WHEN** the agent runs `gh pr -- merge 12`
- **THEN** the guard denies the command with rule `gh-pr-merge`

#### Scenario: Read-only flag forms allowed
- **GIVEN** no verify ledger exists
- **WHEN** the agent runs `gh pr -R owner/repo view 12`, `gh pr -R owner/repo checks`, `gh repo -R owner/repo view`, `gh release -R owner/repo list`, or `gh pr review 12 -R owner/repo --comment`
- **THEN** the guard allows the command

### Requirement: Shared-state gh mutations require a verify ledger
The beforeShellExecution guard SHALL require a valid verify ledger
(`.cursor/verify-ledger.json` proving `impl_verified` for the current HEAD,
via the same `gh-pr-without-verify` rule as `gh pr create|ready`) for:
`gh secret set|delete`, `gh variable set|delete`,
`gh workflow run|disable|enable`, `gh pr close|reopen`,
`gh pr review --approve|--request-changes`, and
`gh repo create|fork|rename`.

#### Scenario: Secret set without a ledger
- **GIVEN** no valid verify ledger exists for the current HEAD
- **WHEN** the agent runs `gh secret set MY_SECRET`
- **THEN** the guard denies the command with the verify-ledger rule

#### Scenario: Workflow mutation without a ledger
- **GIVEN** no valid verify ledger exists for the current HEAD
- **WHEN** the agent runs `gh workflow run ci.yml` (or `disable` / `enable`)
- **THEN** the guard denies the command with the verify-ledger rule

#### Scenario: PR review approval without a ledger
- **GIVEN** no valid verify ledger exists for the current HEAD
- **WHEN** the agent runs `gh pr review 123 --approve` or `gh pr review --request-changes 123`
- **THEN** the guard denies the command with the verify-ledger rule

#### Scenario: Repo creation without a ledger
- **GIVEN** no valid verify ledger exists for the current HEAD
- **WHEN** the agent runs `gh repo create my-repo --private`, `gh repo fork owner/repo`, or `gh repo rename new-name`
- **THEN** the guard denies the command with the verify-ledger rule

#### Scenario: Gated mutation with a valid ledger
- **GIVEN** a valid verify ledger proves `impl_verified` for the current HEAD
- **WHEN** the agent runs a Tier B gated mutation (e.g. `gh pr close 123`)
- **THEN** the guard allows the command

### Requirement: Read-only gh forms are not gated
The beforeShellExecution guard SHALL allow read-only `gh` forms without a
verify ledger: `gh pr view|list|status|checks|diff`,
`gh pr review --comment`, `gh release view|list`, `gh workflow list|view`,
`gh secret list`, `gh repo view|list`, `gh alias list`, and
`gh auth status`.

#### Scenario: PR read-only forms allowed
- **GIVEN** no verify ledger exists
- **WHEN** the agent runs `gh pr view 123`, `gh pr list`, `gh pr status`, `gh pr checks 123`, or `gh pr diff 123`
- **THEN** the guard allows the command

#### Scenario: PR review comment allowed
- **GIVEN** no verify ledger exists
- **WHEN** the agent runs `gh pr review 123 --comment lgtm`
- **THEN** the guard allows the command

#### Scenario: Auth status allowed
- **GIVEN** no verify ledger exists
- **WHEN** the agent runs `gh auth status`
- **THEN** the guard allows the command
