# Project context — cursor-harness

Cursor Harness is a dependency-free Cursor plugin for correctness-first
engineering workflows: shape, plan, implement, verify, review, ship.

- Consumer plugin lives under `plugin/` (agents, skills, commands, rules,
  hooks). Maintainer tooling (validator, release, benchmark) lives under
  `scripts/`, `tests/`, `benchmark/`.
- Zero third-party npm dependencies — `package-lock.json` must stay clean.
  External CLIs (`git`, `gh`, `openspec`) are prerequisites, not packages.
- Tier-0 gate: `npm run validate` plus `npm test`. Ship gates follow
  `plugin/references/gate-dag.md` (Pattern 3) and `scripts/gate-plan.sh`.
- This `openspec/` tree is dogfooded by hand. Do not run `openspec init`
  here — it writes upstream tool files (`.cursor/skills`, `.cursor/commands`)
  that collide with this repository's own plugin layout.
