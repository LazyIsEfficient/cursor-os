## Why

Consumer feedback ("CI Failures, Plz fix") showed two verify-before-ship
holes that let agents skip local proof and still push:

- **Skip-verify via push** — `gh pr create|ready` already required a valid
  verify ledger, but plain `git push` did not. Agents pushed first, opened
  the PR later (or never), and CI became the first real check.
- **Local ≠ CI** — rust profile accepted a weaker clippy floor than typical
  consumer CI (`--all-targets` + `-D warnings`), and custom profiles had no
  way to pin the exact check commands extracted from workflows /
  justfile / Makefile. Drift produced green local ledgers and red CI.

## What Changes

- **Push ledger gate** — plain `git push` requires a valid
  `.cursor/verify-ledger.json` proving `impl_verified` for HEAD (rule
  `git-push-without-verify`). Tier-A force-push and remote-ref-delete
  denials stay hard denies (unchanged).
- **Stop follow-up** — when the session completes with a dirty worktree or
  commits ahead of upstream and the ledger is invalid, the stop hook emits
  a one-shot follow-up (`verify-ledger-stop`, `loop_limit: 1`).
- **Rust clippy floor** — rust profile coverage requires
  `cargo clippy --all-targets` plus `-D warnings` (including `-Dwarnings`
  and `-D` + `warnings` after `--`).
- **CI-parity sidecar** — `npm run verify:ci-parity` (`ci-parity.mjs`) scans
  workflows / justfile / Makefile, prints `verify:record` recipe lines, and
  optionally writes `.cursor/verify-profile.json`. When that v1 sidecar
  exists, custom coverage requires those exact commands.
- **Kill-switch** — `VERIFY_PR_GATE_DISABLED=1` skips the push gate, the PR
  ledger gate, and the stop follow-up (emergency only).

## Capabilities

### New Capabilities

### Modified Capabilities
- `pr-gates`: Extend shell-guard / stop-hook / verify-ledger surface with
  push ledger gate, stop follow-up, rust clippy floor, and ci-parity
  sidecar requirements.

## Impact

- `plugin/scripts/before-shell-execution.mjs` (plain `git push` ledger gate)
- `plugin/scripts/lib/verify-ledger-lib.mjs` (clippy floor, profile sidecar,
  kill-switch covering push + PR)
- `plugin/scripts/verify-ledger-stop.mjs` + `lib/verify-ledger-stop-lib.mjs`
- `plugin/scripts/ci-parity.mjs` + `lib/ci-parity-lib.mjs`
- `tests/security/*` (push gate, stop hook, clippy, ci-parity)
- `CHANGELOG.md` (Unreleased Security + existing ci-parity Added)
- Docs / gate-dag / commands (`/verify-ci-parity`)
