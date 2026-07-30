## MODIFIED Requirements

### Requirement: Consumer verify recipes use plugin scripts
Consumer-facing verify recipes (deny agent messages, stop follow-up,
`formatRecordRecipe`, `/verify-ci-parity`, gate-dag, eng agents) SHALL
instruct operators to run plugin scripts via
`node "<CURSOR_PLUGIN_ROOT or ~/.cursor/plugins/local/cursor-harness>/scripts/…"`.
Harness-only npm aliases (`npm run verify:record`, `npm run verify:ci-parity`)
MAY appear only as an optional "harness dogfood" / "harness checkout only"
note. They MUST NOT be the primary consumer instruction.

#### Scenario: formatRecordRecipe primary line is plugin script
- **GIVEN** `formatRecordRecipe` is called with a profile and at least one command
- **WHEN** the recipe string is inspected
- **THEN** each primary line contains `record-verify.mjs` under a `node "…"`
  invocation and does not start with `npm run verify:record`

#### Scenario: Deny message prefers plugin path
- **GIVEN** a deny for `gh-pr-without-verify` or `git-push-without-verify`
- **WHEN** the agent message is shown
- **THEN** the first record instruction is a `node "…/scripts/record-verify.mjs"`
  form (plugin root from `CURSOR_PLUGIN_ROOT` or the local install path)
