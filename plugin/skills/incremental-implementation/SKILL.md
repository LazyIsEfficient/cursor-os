---
name: incremental-implementation
description: Implements an approved task in small testable increments that reach checkpoint:impl-verified. Use for multi-file changes or changes with meaningful correctness risk.
---

# Incremental implementation

Consume one task block at a time. Before editing, read its `brief` and every declared `files_read`; change only `files_write`. Confirm `dependencies` complete and `conflicts` inactive. Stop if task not cold-context complete or undeclared dependency or write conflict appears.

## Increment loop

1. Choose smallest observable behavior that advances acceptance.
2. For behavior changes, write or identify failing test first. For documentation-only or mechanically verified changes, state why new test not useful and run relevant deterministic check.
3. Make minimum change satisfying that behavior.
4. Run narrow test, then reach **`checkpoint:impl-verified`** for increment ([gate-dag.md](../../references/gate-dag.md)):
   - Floor (always): every brief verification command to exit 0; in this harness, `npm run validate` on non-docs-only diffs; stack floors (Rust CI shape, `tsc`/build, etc.) when those stacks in scope.
   - Additional depth may scale with risk (integration and failure paths for high risk) — never as way to skip floor.
   - Skipped or unavailable check is not a pass.
5. Repeat only after increment green. Do not commit unless requested.

## Evidence handoff

Return exact evidence, not "tests pass":

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
G-data-document: <updated | no-op | skipped-docs-only>
```

After `checkpoint:impl-verified` and session close (`G-data-document` per
[implementation-close.md](../data-model-documentation/references/implementation-close.md)),
caller must run Pattern 3 from [gate-dag.md](../../references/gate-dag.md): Wave 1 triggered reviewers as parallel read-only Cursor Tasks; Wave 2 `data-model-verifier` when `DATA_MODEL.md` changed. `checkpoint:ship-ready` requires required nodes returned and resolution of all Tier 0 and evidence-backed Tier 1 findings (or explicit waiver); Tier 2 advisory.
