---
name: verify-ci-parity
description: Scan consumer CI (workflows/justfile/Makefile) and emit record-verify recipe + optional .cursor/verify-profile.json. Use when CI floors differ from local, "local green CI red", verify profile missing/stale, or user says "CI parity" / "/verify-ci-parity".
---

# Verify CI parity

Record consumer-repo CI check floor once. Local verify ledger must match what CI runs.

## When

- Once per consumer repo (first verify-before-push setup)
- When `.github/workflows/*`, `justfile`/`Justfile`, or `Makefile` change
- Symptom: local green, CI red — local recorded cmds ≠ CI

## How

From consumer repo root. Primary form uses the installed plugin scripts
(`CURSOR_PLUGIN_ROOT`, else `~/.cursor/plugins/local/cursor-harness`):

```bash
node "${CURSOR_PLUGIN_ROOT:-$HOME/.cursor/plugins/local/cursor-harness}/scripts/ci-parity.mjs"
```

Prints `# profile: <rust|node-harness|custom>` plus one
`node "…/scripts/record-verify.mjs" --profile … --run -- <cmd>` line per
extracted check.

Write sidecar (commit in consumer repo so agents share the floor):

```bash
node "${CURSOR_PLUGIN_ROOT:-$HOME/.cursor/plugins/local/cursor-harness}/scripts/ci-parity.mjs" --write
```

Writes `.cursor/verify-profile.json` (`version: 1`, `commands`, `source: "ci-parity"`).

Exit: `0` ok · `1` no check cmds found · `2` usage error.

Harness checkout only (this repo's `package.json` aliases — not present in
consumer apps):

```bash
npm run verify:ci-parity
npm run verify:ci-parity -- --write
```

## Then record

Run every printed recipe line (spawn only — `--run`). Example:

```bash
node "${CURSOR_PLUGIN_ROOT:-$HOME/.cursor/plugins/local/cursor-harness}/scripts/record-verify.mjs" --profile rust --run -- cargo fmt --check
node "${CURSOR_PLUGIN_ROOT:-$HOME/.cursor/plugins/local/cursor-harness}/scripts/record-verify.mjs" --profile rust --run -- cargo clippy --all-targets -- -D warnings
node "${CURSOR_PLUGIN_ROOT:-$HOME/.cursor/plugins/local/cursor-harness}/scripts/record-verify.mjs" --profile rust --run -- cargo test
```

**Custom + sidecar:** if `.cursor/verify-profile.json` exists, ledger `cmd` strings MUST match those entries exactly (exit 0, spawned). No profile file → custom still needs ≥2 verification-shaped cmds.

## Triggers

CI parity · local green CI red · verify profile · `/verify-ci-parity`
