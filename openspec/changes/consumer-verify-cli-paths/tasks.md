# Tasks — consumer-verify-cli-paths

## 1. Helpers + recipes

- [x] 1.1 Add `plugin/scripts/lib/verify-cli-paths.mjs` (`verifyPluginScriptsRoot`, `formatRecordVerifyCommand`, `formatCiParityCommand`)
- [x] 1.2 `formatRecordRecipe` uses `formatRecordVerifyCommand`
- [x] 1.3 Deny + stop messages show node+plugin-root form first; npm as harness dogfood only

## 2. Docs + agents

- [x] 2.1 Update `/verify-ci-parity`, gate-dag, actual-diff-verification, eng agents, CLI banners, CHANGELOG Fixed
- [x] 2.2 Tiny openspec change folder

## 3. Tests + validate

- [x] 3.1 Assert `formatRecordRecipe` contains `record-verify.mjs` and primary line is not `npm run verify:record`
- [x] 3.2 `npm run validate` + affected tests green; regen inventory if hashes change
