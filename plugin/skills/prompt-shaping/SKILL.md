---
name: prompt-shaping
description: Turns an ambiguous engineering request into an OpenSpec change proposal on disk. Use before planning or delegation when scope, constraints, acceptance criteria, or repository impact are unclear.
---

# Prompt shaping

Produce an OpenSpec proposal a cold-context planning step can execute without
conversation history. The output artifact is
`openspec/changes/<kebab-id>/proposal.md` written to disk — the chat-YAML
brief is superseded (see [openspec-planning](../openspec-planning/SKILL.md)).
Do not implement or delegate while a load-bearing question is unresolved.

## Procedure

1. Read the request and only the repository context needed to identify scope.
2. Check the `openspec` CLI prerequisite first (`command -v openspec`); if
   missing, instruct `npm install -g @fission-ai/openspec` and stop.
3. Ask one batched round of questions for missing goal, acceptance, or constraints.
4. Record minor uncertainty under an Assumptions note; never hide a guess.
5. Scaffold the change (`openspec new change <kebab-id>`) and write
   `proposal.md` per the format in
   [spec-format.md](../openspec-planning/references/spec-format.md), mapping
   the brief fields:

```yaml
goal: <one observable outcome>                  # -> ## Why
context: <current behavior and evidence>        # -> ## Why / ## What Changes
acceptance:
  - <verifiable criterion>                      # -> ## What Changes
constraints:
  - <must preserve>                             # -> ## What Changes / design.md
out_of_scope:
  - <explicit exclusion>                        # -> ## What Changes (non-goals)
files_read:
  - <path or pattern the executor must inspect> # -> ## Impact
files_write:
  - <path or pattern the executor may change>   # -> ## Impact / Capabilities
dependencies:
  - <external decision, task ID, or artifact>   # -> ## Impact
conflicts:
  - <task, owner, or overlapping write path>    # -> ## Impact / design.md risks
verification:
  - <exact check or observable result>          # -> carried into tasks.md by the planner
assumptions:
  - <explicit assumption>                       # -> ## Impact / design.md open questions
```

## Completeness gate

The proposal is complete only when `goal`, `context`, `acceptance`,
`constraints`, `files_read`, `files_write`, and `verification` are concrete.
Replace conversational references such as "the file above" with the actual
path, state, or quoted requirement. `## Capabilities` must name each new or
modified capability in kebab-case — the planner turns them into spec deltas.

Write `design.md` only when architectural decisions warrant (see
[spec-format.md](../openspec-planning/references/spec-format.md)). Validate
with `openspec validate <id> --strict`; a "no deltas yet" error is expected
until the planner runs — anything else is a real failure.
