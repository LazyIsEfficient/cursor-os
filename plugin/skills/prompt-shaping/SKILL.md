---
name: prompt-shaping
description: Turns an ambiguous engineering request into a cold-context-complete brief. Use before planning or delegation when scope, constraints, acceptance criteria, or repository impact are unclear.
---

# Prompt shaping

Produce a cold-context brief that a new Cursor subagent can execute without
conversation history. Do not implement or delegate while a load-bearing
question is unresolved.

## Procedure

1. Read the request and only the repository context needed to identify scope.
2. Ask one batched round of questions for missing goal, acceptance, or constraints.
3. Record minor uncertainty under `assumptions`; never hide a guess.
4. Return the brief below. Use `[]` when a list is genuinely empty.

```yaml
goal: <one observable outcome>
repository: <absolute or workspace-relative root>
context: <current behavior and relevant evidence>
acceptance:
  - <verifiable criterion>
constraints:
  - <must preserve>
out_of_scope:
  - <explicit exclusion>
files_read:
  - <path or pattern the executor must inspect>
files_write:
  - <path or pattern the executor may change>
dependencies:
  - <external decision, task ID, or artifact>
conflicts:
  - <task, owner, or overlapping write path>
verification:
  - <exact check or observable result>
assumptions:
  - <explicit assumption>
```

The brief is dispatchable only when `goal`, `repository`, `acceptance`,
`constraints`, `files_read`, `files_write`, and `verification` are concrete.
Replace conversational references such as “the file above” with the actual
path, state, or quoted requirement.
