---
name: openspec-propose
description: Shape an engineering request into an OpenSpec change — runs the prompt-shaping intake, scaffolds openspec/changes/<kebab-id>/proposal.md (plus design.md when warranted), and validates with openspec validate <id> --strict. Pass the raw request as arguments. For game-design or marketing requests use those shapers instead.
---

# OpenSpec propose

Turn the request in `$ARGUMENTS` into a validated OpenSpec change proposal on disk. Chat-YAML briefs are superseded — the proposal file is the artifact.

**Canonical contract:** [openspec-planning](../skills/openspec-planning/SKILL.md) — prerequisite hard-stop, workflow, dispatch brief contract. Format detail: [spec-format.md](../skills/openspec-planning/references/spec-format.md).

## Step 0 — prerequisite

Run `command -v openspec` (or `openspec --version`). If missing, tell the user to run `npm install -g @fission-ai/openspec` (Node >= 20.19) and **stop** — do not fall back to chat planning. If the repo has no `openspec/` directory, run `openspec init --tools cursor` first (consumer repos only — never in the harness repo itself; see the skill's dogfood note).

## Step 1 — intake

Run the [prompt-shaping](../skills/prompt-shaping/SKILL.md) procedure: read only the repository context needed to identify scope, ask one batched round of questions for missing goal/acceptance/constraints, and record minor uncertainty as assumptions. Do not scaffold while a load-bearing question is unresolved.

## Step 2 — scaffold the change

1. Derive a kebab-case change id from the goal (e.g. `add-rate-limiting`).
2. `openspec new change <id>` (creates `openspec/changes/<id>/` + `.openspec.yaml`).
3. Write `proposal.md` mapping the shaped brief:
   - `## Why` — the problem, from goal/context.
   - `## What Changes` — the change bullets; **BREAKING** markers where applicable; fold in `out_of_scope` as explicit non-changes.
   - `## Capabilities` — new/modified kebab-case capability names; each becomes a spec delta in the plan step. Check `openspec/specs/` before listing modified capabilities.
   - `## Impact` — affected code, APIs, dependencies (from `files_read`/`files_write` scope and constraints).
4. Write `design.md` only when warranted (cross-cutting change, new external dependency, significant data model change, security/performance/migration complexity, or ambiguity — see spec-format).
5. The proposal is complete only when goal, context, acceptance, constraints, files_read/files_write scope, and verification are all concrete — the shaper's dispatchability gate, applied to the proposal's sections.

## Step 3 — validate

Run `openspec validate <id> --strict`.

- Validation is **whole-change**: at proposal time it fails with "Change must have at least one delta" until the planner writes `specs/` deltas. If that is the only error, report the change as **proposed, pending plan** and stop — do not invent placeholder requirements to force green.
- Any other error is real: fix the artifact and re-run until clean.

## Step 4 — hand off

Tell the user the change id and the next step: run the planner (`planning-and-task-breakdown` via the openspec-planning workflow) to write `tasks.md`, spec deltas, and `dispatch/<task-id>.md` briefs, then re-validate, then `/openspec-apply <id>` — which dispatches implementation as parallel Cursor `Task` waves.
