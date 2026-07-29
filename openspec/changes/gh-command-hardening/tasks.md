# Tasks — gh-command-hardening

## 1. Tier A hard denies

- [x] 1.1 Deny `gh ssh-key add` / `gh gpg-key add` (`gh-account-key-add`), `gh extension install|upgrade` (`gh-extension-install`), `gh alias set|delete` (`gh-alias-mutation`), all `gh pr merge` forms (`gh-pr-merge`), `gh release create|edit` (`gh-release-mutation`), `gh auth token` (`gh-auth-token`) in `plugin/scripts/before-shell-execution.mjs`
- [x] 1.2 Regression tests: every Tier A form denied (incl. glued-flag `gh pr merge --squash --auto`) even with a valid verify ledger present

## 2. Tier B verify-ledger gates

- [x] 2.1 Gate `gh secret set|delete`, `gh variable set|delete`, `gh workflow run|disable|enable`, `gh pr close|reopen`, `gh pr review --approve|--request-changes`, `gh repo create|fork|rename` through `verifyLedgerAllowsGhPr` (rule `gh-pr-without-verify`)
- [x] 2.2 Regression tests: each Tier B form denied without a ledger and allowed with a valid ledger for HEAD; read-only forms (`pr view|list|status|checks|diff`, `pr review --comment`, `release view|list`, `workflow list|view`, `secret list`, `repo view|list`, `alias list`, `auth status`) allowed without a ledger

## 3. Docs and inventory

- [x] 3.1 `DATA_MODEL.md` `BeforeShellExecutionHook` section: Tier A rules + Tier B gated mutations with file:line sources
- [x] 3.2 `CHANGELOG.md` Unreleased `### Security` entry
- [x] 3.3 Regenerate `plugin/.cursor-plugin/inventory.json`; `npm run validate` green

## 4. Position-aware verb resolution (flag-before-verb evasion fix)

- [x] 4.1 Resolve the post-group verb via `resolveGhVerb` (first non-flag word, consuming `-R`/`--repo`/`--hostname` values incl. glued `-Ro/r` / `--repo=o/r`); all Tier A/B checks and `gh repo delete` / `gh release delete` test the resolved verb; unresolvable verb position fails closed (Tier-A-shaped groups hard-deny, Tier-B-shaped groups ledger-gate)
- [x] 4.2 Add `gh release upload` / `gh release delete-asset` to `gh-release-mutation`
- [x] 4.3 Regression tests: flag-before-verb forms of every Tier A rule denied (with ledger), Tier B forms denied without / allowed with a ledger, glued forms, read-only flag forms allowed, flag-before-verb `repo delete` / `release delete` denied
