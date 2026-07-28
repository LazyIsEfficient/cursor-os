---
name: planning-and-task-breakdown
description: Decomposes an approved OpenSpec change proposal into dependency-aware tasks on disk — tasks.md, spec deltas, and per-task dispatch briefs. Use when work spans multiple changes, agents, or verification stages.
---

# Planning and task breakdown

Plan only from complete OpenSpec proposal
(`openspec/changes/<id>/proposal.md` — see
[prompt-shaping](../prompt-shaping/SKILL.md)). Do not write implementation
code. Chat-YAML task DAG superseded: outputs are files in change
directory (see [openspec-planning](../openspec-planning/SKILL.md)).

## Outputs

1. `tasks.md` — checkbox groups (`## 1. Group` / `- [ ] 1.1 task`) in
   dependency order; apply phase parses this format.
2. Delta `specs/<domain>/spec.md` — one per capability named in
   proposal's Capabilities section, using `## ADDED/MODIFIED/REMOVED/RENAMED
   Requirements` with SHALL/MUST text and `#### Scenario:` blocks.
3. `dispatch/<task-id>.md` — one cold-context brief per task:

```yaml
id: T-<stable-slug>
goal: <one complete outcome>
subagent_type: <engineer or a stack specialist — optional, defaults to engineer>
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

Each brief must stand alone — fresh Cursor subagent with no conversation
history executes from it. Reference brief from its `tasks.md` item, e.g.
`- [ ] 2.1 Implement parser (brief: dispatch/T-parser.md)`.

## Build the DAG

1. Split work into small vertical outcomes.
2. Give every task stable, content-based ID such as `T-auth-session`; never
   use sequence numbers or reuse retired IDs. `X.Y` checkbox numbering in
   `tasks.md` is display order only — stable ID lives in brief.
3. Put foundations before consumers in `dependencies`; group `tasks.md`
   sections so a section's tasks depend only on earlier sections.
4. Compare every pair of `files_write` lists. Overlap requires symmetric
   `conflicts` declaration and serialized dispatch (separate waves).
5. Keep independent tasks in same wave. Dispatch parallel work as separate
   Cursor Task calls; do not invent or prescribe Task arguments.
6. Confirm every dependency and conflict names existing stable ID,
   graph acyclic, and at least one task has `dependencies: []`.
7. Run `openspec validate <id> --strict` — MUST exit 0 before any dispatch.
   Never hand-validate format.

## Required review contract

Every implementation branch ends with Pattern 3 gate DAG
([gate-dag.md](../../references/gate-dag.md)). Planner shorthand:

```text
checkpoint:impl-verified -> (Wave 1: code-review || security-review || library-review? || data-document?) -> (Wave 2: data-verify?) -> checkpoint:ship-ready
```

Legacy alias (same barrier intent): `local-verify -> (code-review || security-review) -> ship-ready` — expand to full gate DAG when dispatching; do not treat alias as permission to skip data-model or library nodes when triggered.

`checkpoint:impl-verified` is `npm run validate` (in this harness) plus brief
tests/build. Wave 1 reviewers start together only after that passes.
`checkpoint:ship-ready` requires every required node to return and every Tier 0
or evidence-backed Tier 1 finding fixed or explicitly waived. Tier 2
findings remain advisory — go to findings ledger.
