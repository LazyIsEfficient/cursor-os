# Tasks — consumer-verify-before-push

## 1. Push ledger gate

- [x] 1.1 Plain `git push` requires a valid verify ledger for HEAD (rule `git-push-without-verify`) in `plugin/scripts/before-shell-execution.mjs`
- [x] 1.2 Tier-A force-push (`git-history-rewrite`) and remote-ref-delete (`git-remote-ref-delete`) remain hard denies — unchanged by the ledger path
- [x] 1.3 Regression tests: deny push without ledger; allow with valid ledger; force/delete still denied even with a valid ledger

## 2. Stop hook follow-up

- [x] 2.1 `verify-ledger-stop` emits a one-shot follow-up when status is `completed`, worktree is dirty or ahead of upstream, and the ledger is invalid
- [x] 2.2 No follow-up when ledger is valid, worktree is clean and not ahead, or status is not `completed`
- [x] 2.3 Regression tests in `tests/security/verify-ledger-stop.test.mjs`

## 3. Rust clippy floor

- [x] 3.1 Rust profile coverage requires `cargo clippy --all-targets` and `-D warnings` (`-Dwarnings` or `-D` + `warnings`)
- [x] 3.2 Regression tests: weaker clippy forms do not satisfy rust coverage; CI-shaped clippy does

## 4. CI-parity sidecar

- [x] 4.1 `npm run verify:ci-parity` extracts check-shaped cmds from `.github/workflows/*`, justfile, and Makefile
- [x] 4.2 Optional `--write` writes `.cursor/verify-profile.json` (v1)
- [x] 4.3 When the v1 sidecar exists, custom coverage requires those exact cmds
- [x] 4.4 Command `/verify-ci-parity`; gate-dag documents the consumer once-then-record flow
- [x] 4.5 Regression tests in `tests/security/ci-parity.test.mjs`

## 5. Kill-switch and docs

- [x] 5.1 `VERIFY_PR_GATE_DISABLED=1` skips push gate, PR ledger gate, and stop follow-up
- [x] 5.2 `CHANGELOG.md` Unreleased Security bullets for push gate, stop hook, and rust clippy floor (ci-parity under Added)
- [x] 5.3 OpenSpec change `openspec/changes/consumer-verify-before-push/` with proposal, tasks, and `specs/pr-gates/spec.md`
