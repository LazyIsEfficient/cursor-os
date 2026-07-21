---
name: incremental-implementation
description: Implements an approved task in small testable increments with risk-proportional verification. Use for multi-file changes or changes with meaningful correctness risk.
---

# Incremental implementation

Consume one task block at a time. Before editing, read its `brief` and every
declared `files_read`; change only `files_write`. Confirm `dependencies` are
complete and `conflicts` are inactive. Stop if the task is not cold-context
complete or if an undeclared dependency or write conflict appears.

## Increment loop

1. Choose the smallest observable behavior that advances acceptance.
2. For behavior changes, write or identify a failing test first. For
   documentation-only or mechanically verified changes, state why a new test is
   not useful and run the relevant deterministic check.
3. Make the minimum change that satisfies that behavior.
4. Run the narrow test, then verification proportional to risk:
   - low: focused test or deterministic validator;
   - medium: focused plus affected suite and static checks;
   - high: affected suite, integration checks, and failure-path evidence.
5. Repeat only after the increment is green. Do not commit unless requested.

## Evidence handoff

Return exact evidence, not “tests pass”:

```yaml
task_id: T-<stable-slug>
files_read: [<paths actually read>]
files_changed: [<paths actually changed>]
verification:
  - command: <exact command>
    exit_code: <integer>
    result: <exact relevant output or deterministic summary>
acceptance: [<criterion and observed result>]
residual_risk: [<unverified item or empty>]
```

After local verification passes, the caller must run `code-reviewer` and
`security-reviewer` concurrently as read-only Cursor Tasks. Ship-ready requires
both results and resolution of all Tier 0 and evidence-backed Tier 1 findings;
Tier 2 is advisory.
