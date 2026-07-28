# Tasks

## 1. Foundation

- [x] 1.1 Sync main, branch `feat/cavemen-style`, archive `openspec-first-class-planning`
- [x] 1.2 Prepend concision directive to `plugin/rules/communication.mdc` body
- [x] 1.3 Create root `AGENTS.md` with directive + pointer to CONTRIBUTING.md and plugin/rules/
- [x] 1.4 Create `plugin/references/caveman-style.md` style contract with before/after examples
- [x] 1.5 Regenerate `plugin/.cursor-plugin/inventory.json` via `node scripts/generate-plugin-inventory.mjs`
- [x] 1.6 Update `plugin/commands/skill-new.md` to require caveman-style for new skills
- [x] 1.7 Scaffold this change, validate `openspec validate cavemen-style-rewrite --strict`
- [x] 1.8 CHANGELOG.md Unreleased entries; `npm test` + `node scripts/validate.mjs` green; commit + push branch

## 2. Wave 1 — game batch (9)

- [x] 2.1 Rewrite game-balancer, game-concept-creator, game-design-shaper
- [x] 2.2 Rewrite game-marketer, game-monetization-strategist, game-systems-designer
- [x] 2.3 Rewrite godot-engineer, phaser-engineer, iap-manager
- [x] 2.4 Regenerate inventory; `npm test` + validate green; commit

## 3. Wave 2 — typescript + testing batch (12)

- [x] 3.1 Rewrite typescript-analytics, typescript-data-engineering
- [x] 3.2 Rewrite typescript-testing-backend, typescript-testing-frontend, browser-testing-with-devtools
- [x] 3.3 Rewrite data-model-documentation, data-model-verification, findings-ledger
- [x] 3.4 Rewrite incremental-implementation, memory-extraction, session-state, telemetry
- [x] 3.5 Regenerate inventory; `npm test` + validate green; commit

## 4. Wave 3 — engineering/infra batch (12)

- [x] 4.1 Rewrite autoresearch, code-review-and-quality, deployment-pipelines
- [x] 4.2 Rewrite devops-engineer, rust-engineer, web3-smart-contract-engineering
- [x] 4.3 Rewrite security-engineering, site-reliability-engineering, release-manager
- [x] 4.4 Rewrite openspec-planning, planning-and-task-breakdown, prompt-shaping
- [x] 4.5 Regenerate inventory; `npm test` + validate green; commit

## 5. Wave 4 — marketing/content/misc batch (13)

- [x] 5.1 Rewrite content-ops, content-pipeline, conversion-ops, growth-engine
- [x] 5.2 Rewrite marketing-shaper, outbound-engine, revenue-intelligence, seo-ops
- [x] 5.3 Rewrite adversarial-claims-reviewer, library-investigator, skill-library-review
- [x] 5.4 Rewrite codebase-cost-estimator, security
- [x] 5.5 Regenerate inventory; `npm test` + validate green; commit

## 6. Review / ship

- [ ] 6.1 Dispatch library-reviewer across rewritten library; address Tier 0/1 findings
- [ ] 6.2 Verify frontmatter `name`/`description` unchanged vs main (routing regression check)
- [ ] 6.3 CHANGELOG.md finalize; full `npm test` + `node scripts/validate.mjs` green
- [ ] 6.4 Open PR to main; archive change after merge
