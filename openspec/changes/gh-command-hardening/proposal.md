## Why

A security review of the audit Tier 1 sweep found pre-existing ungated `gh`
mutation paths in `plugin/scripts/before-shell-execution.mjs`. Probes
confirmed every one of these returned `{"permission":"allow"}` with no verify
ledger:

- **Account takeover** — `gh ssh-key add` / `gh gpg-key add` persist
  attacker-controlled credentials on the user's GitHub account.
- **Supply-chain RCE** — `gh extension install|upgrade` executes arbitrary
  third-party code as the user.
- **Gate bypass via aliases** — `gh alias set|delete` creates command
  expansions invisible to hook command matching, bypassing every other gate.
- **Ship-gate bypass** — `gh pr merge` (all forms) merges without the
  ship-gate DAG; repo doctrine is humans merge.
- **Release-process bypass** — `gh release create|edit` sidesteps
  `release.yml` and the tag-from-main CI guard.
- **Credential exfiltration** — `gh auth token` prints the OAuth token.
- **Ungated shared-state mutations** — secrets/variables, workflow
  dispatch/enable/disable, PR close/reopen/approve, and repo
  create/fork/rename mutate shared state with no checkpoint:impl-verified
  requirement.

## What Changes

Two tiers in the high-impact `gh` rule of
`plugin/scripts/before-shell-execution.mjs`:

- **Tier A — hard denies** (distinct rules, never softened by a verify
  ledger): `gh ssh-key add` / `gh gpg-key add` (`gh-account-key-add`),
  `gh extension install|upgrade` (`gh-extension-install`),
  `gh alias set|delete` (`gh-alias-mutation`), all `gh pr merge` forms
  (`gh-pr-merge`), `gh release create|edit` (`gh-release-mutation`),
  `gh auth token` (`gh-auth-token`).
- **Tier B — verify-ledger gates** (same `gh-pr-without-verify` rule and
  `verifyLedgerAllowsGhPr` path as `gh pr create|ready`): `gh secret
  set|delete`, `gh variable set|delete`, `gh workflow run|disable|enable`,
  `gh pr close|reopen`, `gh pr review --approve|--request-changes`,
  `gh repo create|fork|rename`.
- Read-only `gh` forms stay ungated: `pr view|list|status|checks|diff`,
  `release view|list`, `workflow list|view`, `secret list`,
  `repo view|list`, `alias list`, `auth status`, and
  `gh pr review --comment`.

## Capabilities

### New Capabilities

### Modified Capabilities
- `pr-gates`: Extend the shell-guard `gh` surface with Tier A hard denies
  and Tier B verify-ledger gates.

## Impact

- `plugin/scripts/before-shell-execution.mjs` (Tier A denies + Tier B gates)
- `tests/security/before-shell-execution.test.mjs` (regression coverage)
- `DATA_MODEL.md` (`BeforeShellExecutionHook` two-tier `gh` policy)
- `CHANGELOG.md` (Unreleased Security entry)
- `plugin/.cursor-plugin/inventory.json` (regenerated hashes)
