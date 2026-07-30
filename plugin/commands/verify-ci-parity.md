---
name: verify-ci-parity
description: Scan consumer CI (workflows/justfile/Makefile) and emit verify:record recipe + optional .cursor/verify-profile.json. Use when CI floors differ from local, "local green CI red", verify profile missing/stale, or user says "CI parity" / "/verify-ci-parity".
---

# Verify CI parity

Record consumer-repo CI check floor once. Local verify ledger must match what CI runs.

## When

- Once per consumer repo (first verify-before-push setup)
- When `.github/workflows/*`, `justfile`/`Justfile`, or `Makefile` change
- Symptom: local green, CI red — local recorded cmds ≠ CI

## How

From consumer repo root (plugin installed or harness checkout):

```bash
npm run verify:ci-parity
# or
node path/to/plugin/scripts/ci-parity.mjs
```

Prints `# profile: <rust|node-harness|custom>` plus one `npm run verify:record -- --profile … --run -- <cmd>` line per extracted check.

Write sidecar (commit in consumer repo so agents share the floor):

```bash
npm run verify:ci-parity -- --write
# or
node path/to/plugin/scripts/ci-parity.mjs --write
```

Writes `.cursor/verify-profile.json` (`version: 1`, `commands`, `source: "ci-parity"`).

Exit: `0` ok · `1` no check cmds found · `2` usage error.

## Then record

Run every printed recipe line (spawn only — `--run`). Example:

```bash
npm run verify:record -- --profile rust --run -- cargo fmt --check
npm run verify:record -- --profile rust --run -- cargo clippy --all-targets -- -D warnings
npm run verify:record -- --profile rust --run -- cargo test
```

**Custom + sidecar:** if `.cursor/verify-profile.json` exists, ledger `cmd` strings MUST match those entries exactly (exit 0, spawned). No profile file → custom still needs ≥2 verification-shaped cmds.

## Triggers

CI parity · local green CI red · verify profile · `/verify-ci-parity`
