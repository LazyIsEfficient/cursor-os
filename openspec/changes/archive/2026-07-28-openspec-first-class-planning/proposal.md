## Why

Engineering planning artifacts currently exist only as chat-YAML — the
`prompt-shaping` brief and the `planning-and-task-breakdown` task DAG. They
die with the conversation, cannot be validated, diffed, reviewed, or archived,
and every consumer repo re-derives them per session. OpenSpec provides a
CLI-validated, on-disk planning format with a defined lifecycle
(propose → plan → apply → archive).

## What Changes

- New skill `openspec-planning`: engineering planning artifacts live under
  `openspec/` in the consumer repo; CLI validation is Tier 0.
- New commands `/openspec-propose`, `/openspec-apply`, `/openspec-archive`
  covering the change lifecycle.
- **BREAKING** `prompt-shaping` output artifact is now
  `openspec/changes/<id>/proposal.md` on disk, not a chat-YAML brief.
- **BREAKING** `planning-and-task-breakdown` output artifacts are now
  `tasks.md`, delta `specs/<domain>/spec.md`, and per-task
  `dispatch/<task-id>.md` briefs, not a chat-YAML DAG.
- `orchestrator-first` gains Pattern 1 (shaper → proposal → planner → fan-out);
  `anti-patterns` forbids chat-only planning for engineering work.
- Gate planners classify `openspec/**` as docs-only (markdown specs without
  code changes need no ship gates).
- This repository dogfoods `openspec/` by hand (no `openspec init` — it would
  drop upstream tool files into the plugin repo).
- Domain shapers (game-design, marketing, blog, course) keep their formats;
  unifying them is explicit follow-up.

## Capabilities

### New Capabilities
- `planning`: OpenSpec-first engineering planning — proposals, spec deltas,
  task lists, and dispatch briefs stored under `openspec/`, validated by the
  `openspec` CLI, and archived after merge.

### Modified Capabilities

## Impact

- `plugin/skills/openspec-planning/` (new), `plugin/skills/prompt-shaping/`,
  `plugin/skills/planning-and-task-breakdown/` (rewired outputs)
- `plugin/commands/openspec-{propose,apply,archive}.md` (new)
- `plugin/rules/orchestrator-first.mdc`, `plugin/rules/anti-patterns.mdc`
- `scripts/lib/gate-plan-lib.sh`, `plugin/scripts/lib/dispatch-gate-plan-lib.mjs`
  (docs-only classification for `openspec/**`; kept in sync)
- `README.md`, `plugin/README.md` (prerequisite + component lists),
  `CHANGELOG.md`, `DATA_MODEL.md`, `tests/`
- New external prerequisite for users of the planning workflow: global
  `openspec` CLI (`npm install -g @fission-ai/openspec`, Node >= 20.19).
  No npm dependencies added — zero-third-party-dependency rule intact.
