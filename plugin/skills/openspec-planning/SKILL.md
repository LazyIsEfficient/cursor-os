---
name: openspec-planning
description: Plans engineering changes as OpenSpec artifacts — proposals, spec deltas, task lists, and dispatch briefs validated by the openspec CLI. Use when planning any code change — specs, proposals, task lists for implementation. For game-design or marketing planning see game-design-shaper / marketing-shaper.
---

# OpenSpec planning

All engineering planning artifacts live on disk under `openspec/` in the
consumer repository root. The chat-YAML brief and chat-YAML task DAG are
superseded — a plan that exists only in chat is not a plan.

## Prerequisite (hard stop)

The `openspec` CLI is an external prerequisite like `git` or `gh` — never a
package.json dependency. Check `command -v openspec` (or
`openspec --version`). If missing, tell the user to run
`npm install -g @fission-ai/openspec` (requires Node >= 20.19) and stop until
it is available. CLI validation is Tier 0 — never hand-validate artifact
format.

If the consumer repository has no `openspec/` directory, run
`openspec init --tools cursor` there first. In THIS harness repository do not
run init (it writes upstream tool files that collide with the plugin layout);
the dogfooded tree is maintained by hand.

## Workflow

1. **Propose** — shaper intake ([prompt-shaping](../prompt-shaping/SKILL.md))
   writes `openspec/changes/<kebab-id>/proposal.md`, plus `design.md` when
   architectural decisions warrant.
2. **Plan** —
   [planning-and-task-breakdown](../planning-and-task-breakdown/SKILL.md)
   writes `tasks.md` (checkbox groups), delta `specs/<domain>/spec.md` for
   behavior contracts, and one dispatch brief per task at
   `dispatch/<task-id>.md`.
3. **Validate** — `openspec validate <id> --strict`. Fix what the CLI reports
   and re-run until clean. Validation is whole-change and fails until at
   least one spec delta exists, so it becomes a hard gate after the plan step
   and before any dispatch.
4. **Dispatch** — one Cursor `Task` per wave in dependency order; each Task
   prompt is built from its `dispatch/<task-id>.md` file. Implementers check
   off `tasks.md` items as they complete.
5. **Implement + gate** — the gate DAG and Task dispatch mechanics are
   unchanged ([gate-dag.md](../../references/gate-dag.md)).
6. **Archive** — after the PR merges, `openspec archive <id> -y` merges deltas
   into `openspec/specs/` and moves the change to `changes/archive/`. Never
   archive before merge.

## Dispatch brief contract

Every dispatchable task in `tasks.md` references a brief file
`openspec/changes/<id>/dispatch/<task-id>.md` containing the cold-context
fields an implementation agent requires: goal, files_read, files_write,
dependencies, conflicts, acceptance, verification. A `tasks.md` item without
its brief file is not dispatchable.

Formats and lifecycle detail:
[references/spec-format.md](references/spec-format.md),
[references/change-lifecycle.md](references/change-lifecycle.md). When the
installed CLI disagrees with these references, `openspec instructions
<artifact>` is the live source of truth.
