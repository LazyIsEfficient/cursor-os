# Tasks — openspec-first-class-planning

Executed by a single implementation agent, so no `dispatch/` briefs were
needed for this change; groups below ran in order.

## 1. Dogfood scaffolding

- [x] 1.1 Create `openspec/project.md` and this change directory by hand
- [x] 1.2 Pass `openspec validate openspec-first-class-planning --strict`

## 2. New skill and references

- [x] 2.1 `plugin/skills/openspec-planning/SKILL.md` — contract, prerequisite hard-stop, workflow
- [x] 2.2 `references/spec-format.md` — verified upstream format (v1.6.0)
- [x] 2.3 `references/change-lifecycle.md` — propose/plan/apply/archive + CLI table

## 3. Commands

- [x] 3.1 `plugin/commands/openspec-propose.md`
- [x] 3.2 `plugin/commands/openspec-apply.md`
- [x] 3.3 `plugin/commands/openspec-archive.md`

## 4. Rewire planning skills

- [x] 4.1 `prompt-shaping` outputs `openspec/changes/<id>/proposal.md`; 7-field gate becomes completeness check
- [x] 4.2 `planning-and-task-breakdown` outputs `tasks.md` + deltas + `dispatch/<task-id>.md`; DAG invariants preserved

## 5. Rules

- [x] 5.1 `orchestrator-first.mdc` — add Pattern 1
- [x] 5.2 `anti-patterns.mdc` — forbid chat-only engineering planning

## 6. Wiring, tests, docs

- [x] 6.1 Gate planners classify `openspec/**` docs-only (both libs in sync) + gate-plan fixture
- [x] 6.2 READMEs: prerequisite + component lists; regenerate inventory
- [x] 6.3 CHANGELOG Unreleased entries
- [x] 6.4 DATA_MODEL.md OpenSpecChange + OpenSpecSpecDelta sections
- [x] 6.5 Contract test for skill/commands

## 7. Ship

- [ ] 7.1 `npm test` + `node scripts/validate.mjs` green; verify ledger recorded
- [ ] 7.2 Wave 1 reviews (code, security, library, data-model-documenter); Wave 2 data-model-verifier
- [ ] 7.3 Push + PR "Make OpenSpec first-class for planning" (no merge, no version bump, no archive yet)
