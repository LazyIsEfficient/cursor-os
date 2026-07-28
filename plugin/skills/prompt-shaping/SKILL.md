---
name: prompt-shaping
description: Turns ambiguous engineering request into OpenSpec change proposal on disk. Use before planning or delegation when scope, constraints, acceptance criteria, or repository impact unclear.
---

# Prompt shaping

Produce OpenSpec proposal a cold-context planning step can execute without
conversation history. Output artifact is
`openspec/changes/<kebab-id>/proposal.md` written to disk — chat-YAML
brief superseded (see [openspec-planning](../openspec-planning/SKILL.md)).
Do not implement or delegate while load-bearing question unresolved.

## Procedure

1. Read request and only repository context needed to identify scope.
2. Check `openspec` CLI prerequisite first (`command -v openspec`); missing →
   instruct `npm install -g @fission-ai/openspec` and stop.
3. Ask one batched round of questions for missing goal, acceptance, constraints.
4. Record minor uncertainty under Assumptions note; never hide a guess.
5. Scaffold change (`openspec new change <kebab-id>`), write
   `proposal.md` per format in
   [spec-format.md](../openspec-planning/references/spec-format.md), mapping
   brief fields:

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

Proposal complete only when `goal`, `context`, `acceptance`,
`constraints`, `files_read`, `files_write`, `verification` concrete.
Replace conversational references like "the file above" with actual
path, state, or quoted requirement. `## Capabilities` must name each new or
modified capability in kebab-case — planner turns them into spec deltas.

Write `design.md` only when architectural decisions warrant (see
[spec-format.md](../openspec-planning/references/spec-format.md)). Validate
with `openspec validate <id> --strict`; "no deltas yet" error expected
until planner runs — anything else is real failure.
