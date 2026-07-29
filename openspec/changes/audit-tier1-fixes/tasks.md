# Tasks — audit-tier1-fixes

Four workstreams; checkboxes owned by the orchestrator.

## 1. gh api verify-ledger gate

- [ ] 1.1 Extend high-impact `gh` rule in `plugin/scripts/before-shell-execution.mjs` — mutating `gh api` (explicit `-X/--method` POST/PUT/PATCH/DELETE, implicit POST via `-f/-F/--field/--raw-field/--input`) requires a valid verify ledger
- [ ] 1.2 Regression tests in `tests/security/before-shell-execution.test.mjs`: valid ledger → allow; missing/invalid → deny; GET → allow

## 2. Remote ref deletion denial

- [ ] 2.1 Deny `git push origin :dst` (empty-src refspec) and `git push --delete` / `-d` flag forms in `plugin/scripts/before-shell-execution.mjs`
- [ ] 2.2 Regression tests: refspec-delete and `--delete`/`-d` forms denied; ordinary push allowed

## 3. Bash↔JS gate-plan twin parity

- [ ] 3.1 Align `plugin/scripts/lib/dispatch-gate-plan-lib.mjs` dispatch-brief check to `scripts/lib/gate-plan-lib.sh` (require a change-id segment between `openspec/changes/` and `/dispatch/`); keep sync comments accurate in both files
- [ ] 3.2 Update fixtures: `tests/security/dispatch-gate.test.mjs` and `scripts/gate-plan-test.sh` cover the bare `openspec/changes/dispatch/foo.md` docs-only case

## 4. CI ship-gates run gate scripts from base ref

- [ ] 4.1 `check-pr-ship-gates` executes gate-plan/ship-gate scripts checked out from the PR base ref, not the PR head (companion agent implements)
- [ ] 4.2 Regression coverage: a PR that weakens its own gate scripts cannot pass ship gates
