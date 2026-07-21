---
name: planning-and-task-breakdown
description: Decomposes an approved engineering brief into dependency-aware Cursor tasks. Use when work spans multiple changes, agents, or verification stages.
---

# Planning and task breakdown

Plan only from a cold-context-complete brief. Do not write implementation code.

## Task contract

Give every task a stable, content-based ID such as `T-auth-session`; never use
sequence numbers or reuse retired IDs. Each task must stand alone:

```yaml
id: T-<stable-slug>
goal: <one complete outcome>
brief: <all context needed by a fresh Cursor subagent>
files_read:
  - <exact path or narrow pattern>
files_write:
  - <exact path or narrow pattern>
dependencies:
  - <task ID>
conflicts:
  - <task ID>
acceptance:
  - <observable criterion>
verification:
  - <exact command or check>
```

## Build the DAG

1. Split work into small vertical outcomes.
2. Put foundations before consumers in `dependencies`.
3. Compare every pair of `files_write` lists. Overlap requires a symmetric
   `conflicts` declaration and serialized dispatch.
4. Keep independent tasks in the same wave. Dispatch parallel work as separate
   Cursor Task calls; do not invent or prescribe Task arguments.
5. Confirm every dependency and conflict names an existing stable ID, the graph
   is acyclic, and at least one task has `dependencies: []`.

## Required review contract

Every implementation branch ends with these fixed checkpoints:

```text
local-verify -> (code-review || security-review) -> ship-ready
```

`code-review` and `security-review` start together only after local verification
passes. `ship-ready` requires both read-only reviews to return and every Tier 0
or evidence-backed Tier 1 finding to be addressed. Tier 2 findings remain
advisory and go to the findings ledger.
