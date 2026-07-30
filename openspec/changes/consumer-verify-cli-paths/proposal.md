## Why

Consumer repos (e.g. univille-class) do not have `npm run verify:record` or
`npm run verify:ci-parity` in their package.json — those scripts exist only
in the cursor-os harness checkout. Deny messages, stop follow-up,
`/verify-ci-parity`, `formatRecordRecipe`, gate-dag, and eng agents told
consumers to run harness-only npm aliases, so agents failed to record.

## What Changes

- Shared helpers in `plugin/scripts/lib/verify-cli-paths.mjs`:
  `verifyPluginScriptsRoot`, `formatRecordVerifyCommand`,
  `formatCiParityCommand`.
- `formatRecordRecipe` and agent deny / stop messages use the
  `node "<plugin-root>/scripts/….mjs"` form first; npm mentioned only as
  harness dogfood.
- Consumer-facing docs, eng agents, and CLI usage banners aligned.

## Capabilities

### Modified Capabilities
- `pr-gates`: Consumer-facing verify recipes MUST use plugin script paths,
  not harness npm script names.

## Impact

- `plugin/scripts/lib/verify-cli-paths.mjs` (new)
- `plugin/scripts/lib/ci-parity-lib.mjs`, `verify-ledger-lib.mjs`,
  `verify-ledger-stop-lib.mjs`
- Docs / agents / commands / CHANGELOG
- `tests/security/ci-parity.test.mjs`
