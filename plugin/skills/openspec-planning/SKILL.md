---
name: openspec-planning
description: Plans engineering changes as OpenSpec artifacts — proposals, spec deltas, task lists, dispatch briefs validated by openspec CLI. Use when planning any code change — specs, proposals, task lists for implementation. For game-design or marketing planning see game-design-shaper / marketing-shaper.
---

# OpenSpec planning

All engineering planning artifacts live on disk under `openspec/` in
consumer repository root. Chat-YAML brief and chat-YAML task DAG
superseded — plan existing only in chat is not a plan.

## Prerequisite (hard stop)

`openspec` CLI is external prerequisite like `git` or `gh` — never a
package.json dependency. Check `command -v openspec` (or
`openspec --version`). Missing → tell user to run
`npm install -g @fission-ai/openspec` (requires Node >= 20.19) and stop until
available. CLI validation is Tier 0 — never hand-validate artifact
format. CLI prints telemetry notice on every invocation; collects
anonymous usage stats unless user opts out with `OPENSPEC_TELEMETRY=0` —
mention this when instructing install.

Consumer repository has no `openspec/` directory → run
`openspec init --tools cursor` there first. In THIS harness repository do not
run init (writes upstream tool files colliding with plugin layout);
dogfooded tree maintained by hand.

## Workflow

1. **Propose** — shaper intake ([prompt-shaping](../prompt-shaping/SKILL.md))
   writes `openspec/changes/<kebab-id>/proposal.md`, plus `design.md` when
   architectural decisions warrant.
2. **Plan** —
   [planning-and-task-breakdown](../planning-and-task-breakdown/SKILL.md)
   writes `tasks.md` (checkbox groups), delta `specs/<domain>/spec.md` for
   behavior contracts, and one dispatch brief per task at
   `dispatch/<task-id>.md`.
3. **Validate** — `openspec validate <id> --strict`. Fix what CLI reports,
   re-run until clean. Validation is whole-change and fails until at
   least one spec delta exists — becomes hard gate after plan step,
   before any dispatch.
4. **Dispatch** — one Cursor `Task` per task, dispatched as parallel calls
   wave by wave in dependency order; each Task prompt built from its
   `dispatch/<task-id>.md` file. Implementers check off `tasks.md` items as
   they complete.
5. **Implement + gate** — gate DAG and Task dispatch mechanics
   unchanged ([gate-dag.md](../../references/gate-dag.md)).
6. **Archive** — after PR merges, `openspec archive <id> -y` merges deltas
   into `openspec/specs/` and moves change to `changes/archive/`. Never
   archive before merge.

## Dispatch brief contract

Every dispatchable task in `tasks.md` references brief file
`openspec/changes/<id>/dispatch/<task-id>.md` containing cold-context
fields implementation agent requires: goal, files_read, files_write,
dependencies, conflicts, acceptance, verification — plus optional
`subagent_type` (`engineer` or stack specialist name; defaults to
`engineer`). `tasks.md` item without its brief file is not dispatchable.

Formats and lifecycle detail:
[references/spec-format.md](references/spec-format.md),
[references/change-lifecycle.md](references/change-lifecycle.md). When
installed CLI disagrees with these references, `openspec instructions
<artifact>` is live source of truth.
