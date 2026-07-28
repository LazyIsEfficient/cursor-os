---
name: openspec-apply
description: Implement an OpenSpec change — validates it, reads tasks.md, and dispatches Cursor Task waves in dependency order, each Task built from its dispatch/<task-id>.md brief. Pass the change id as the argument.
---

# OpenSpec apply

Execute the change named by `$1` (a kebab-case id under `openspec/changes/`). The gate DAG and Task dispatch mechanics are unchanged — this command only changes where the plan lives.

**Canonical contract:** [openspec-planning](../skills/openspec-planning/SKILL.md). Lifecycle: [change-lifecycle.md](../skills/openspec-planning/references/change-lifecycle.md).

## Step 0 — prerequisite and validation gate

1. `command -v openspec` — if missing, instruct `npm install -g @fission-ai/openspec` and stop.
2. Confirm `openspec/changes/$1/` exists; if not, stop and list active changes (`openspec list --changes`).
3. Run `openspec validate $1 --strict`. Non-zero exit → do **not** dispatch; fix the artifacts first. A skipped or unavailable check is not a pass.

## Step 1 — compute waves

1. Read `openspec/changes/$1/tasks.md` — unchecked items (`- [ ]`) are remaining work.
2. Read every `dispatch/<task-id>.md` referenced by remaining items. An item without its brief file is **not dispatchable** — stop and write the brief first (fields: goal, files_read, files_write, dependencies, conflicts, acceptance, verification).
3. Build waves: a task joins a wave only when every task in its `dependencies` is already checked off or in an earlier wave. Tasks sharing a `conflicts` edge or overlapping `files_write` never share a wave. Keep waves to 3–5 tasks; independent tasks in the same wave dispatch in parallel.

## Step 2 — dispatch waves

For each wave, dispatch all tasks in a **single message, multiple `Task` calls** — sequential dispatch of independent work is a defect. Each Task prompt is built cold-context-complete from its `dispatch/<task-id>.md` brief: the subagent has no parent conversation context, so the brief must stand alone. Use the implementation `subagent_type` the brief calls for (`engineer` or a stack specialist).

Wait for the whole wave before dispatching the next. A subagent report is not proof of repository state — spot-check the diff before marking its tasks complete.

## Step 3 — track completion

As each task verifies, check it off in `tasks.md` (`- [x]`) — apply tooling and `openspec status` read checkbox state, so keep it accurate.

## Step 4 — gate and finish

After all tasks complete, run the Pattern 3 gate DAG ([gate-dag.md](../references/gate-dag.md)) on the full diff before declaring the change implemented. Do **not** archive here — archive after the PR merges via `/openspec-archive $1`.
