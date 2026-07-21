---
name: review-gate
description: Run the fixed review gate on the current change. Dispatches code-reviewer and security-reviewer in parallel as read-only subagents, then adjudicates findings by evidence tier. Optionally name the task ID or changed paths to scope the gate; otherwise scope it from the actual diff.
---

# Review gate

The gate is fixed: `local-verify -> (code-review || security-review) -> ship-ready`.
Do not skip a node, reorder it, or declare ship-ready from a reviewer's word alone.

## 1. Require local verification first

Do not dispatch until local deterministic verification has already run and its
evidence is in hand: the commands, their exit status, and their output. If that
evidence does not exist, stop and run the smallest relevant tests, build, lint,
or validation commands first. A skipped or unavailable check is not a pass.

Scope the change from `git status` and the actual `git diff`, not from a report
of what was intended.

## 2. Dispatch both reviewers in parallel

Issue `code-reviewer` and `security-reviewer` as `Task` subagents with multiple
calls in a single message. Sequential dispatch of these two is a defect. Both
are `readonly: true`; they never edit, never run mutating actions, never delegate.

Each reviewer requires a cold-context brief. Assume no parent conversation
context. Supply exactly the fields the agent demands.

`code-reviewer` brief: task ID, goal, `files_read`, `files_write`, dependencies,
conflicts, changed paths, diff or change description, acceptance criteria, and
local verification evidence.

`security-reviewer` brief: task ID, threat boundary, `files_read`,
`files_write`, dependencies, conflicts, changed paths, diff or change
description, acceptance criteria, and local verification evidence.

Both return YAML with `findings` (each carrying `tier`, `location`, `claim`,
`evidence`, `disposition`) and `ship_ready`.

## 3. Verify before acting on any finding

A reviewer's verdict is a claim, not a diff. Before you act on a finding, open
the cited `file:line` in the repository and confirm it says what the reviewer
says it says. Re-run any cited deterministic check yourself. If the repository
contradicts the finding, state the discrepancy and drop the finding.

## 4. Adjudicate by tier

- **Tier 0** — an already-failing deterministic check. Blocks. Fix now.
- **Tier 1** — judgment with an attached reproducing artifact, failing test,
  deterministic command, or explicit counterexample with pinned inputs. Blocks
  only when that artifact actually reproduces. A Tier 1 claim with no artifact
  is Tier 2; demote it.
- **Tier 2** — unevidenced judgment, taste, or concern. Advisory only, never a
  gate. Emit it to the findings ledger using the entry contract in
  [findings-ledger](../skills/findings-ledger/SKILL.md).

A critical-security failure is non-compensable: passing unrelated checks,
aggregate quality, and speed do not offset it.

## 5. Declare ship-ready

Declare ship-ready only when both reviewers returned and no Tier 0 or
evidence-backed Tier 1 finding remains unresolved. Report the verification
commands and outcomes accurately.
