---
name: review-gate
description: Run the Pattern-3 review gate (gate DAG waves) on the current diff. Dispatches triggered Wave 1 reviewers as parallel read-only Cursor Tasks, then Wave 2 data-model-verifier when DATA_MODEL.md changed. Optionally name the task ID or changed paths to scope the gate; otherwise scope it from the actual diff.
---

# Review gate

Run the mandatory **Pattern 3 — Build + review pairing** gate on the current working-tree diff.

**Canonical spec:** [gate-dag.md](../references/gate-dag.md) — node IDs, triggers, waves, checkpoints. Encode that DAG exactly; do not invent parallel shortcuts that skip Wave 2 when `DATA_MODEL.md` changes.

The gate is fixed: `checkpoint:impl-verified -> (Wave 1 triggered nodes) -> (Wave 2 G-data-verify?) -> checkpoint:ship-ready`.
Do not skip a node, reorder waves, or declare ship-ready from a reviewer's word alone.

## Step 0 — `checkpoint:impl-verified`

1. Run `git status --porcelain`. If empty, stop: **no changes to review.**
2. List every changed path **including untracked files** (plain `git diff` omits them). Use `git add -N <untracked>` so contract/agent files appear in the diff.
3. Run local verification:
   - In this harness repository: `npm run validate` on any non-docs-only diff.
   - Plus task-specific checks from the brief (tests, build, lint, stack floors per [gate-dag.md](../references/gate-dag.md) § Checkpoints).
4. If verification fails, stop — do not dispatch gate agents. A skipped or unavailable check is not a pass.
5. Optional: `bash scripts/gate-plan.sh` to list required gate nodes.

Scope the change from `git status` and the actual `git diff`, not from a report of what was intended.

## Step 1 — Compute triggered nodes

From the changed path set, run `bash scripts/gate-plan.sh` (or classify flags the same way as `scripts/lib/gate-plan-lib.sh`). Include nodes per [gate-dag.md](../references/gate-dag.md) § Gate nodes and § Implementation close:

| Node | Include when |
|---|---|
| `G-code-review` | `is_code_change \|\| is_library` |
| `G-security-review` | `is_code_change \|\| is_library \|\| is_sensitive` |
| `G-data-document` | Same triggers — **Wave 1 only if** implementation did not already run it at session close (no `G-data-document:` in implementation agent report) |
| `G-library-review` | `is_library` (paths under `plugin/skills/` or `plugin/agents/`) |
| `G-data-verify` | **After Wave 1** — if `DATA_MODEL.md` is in the post-documenter diff |

If the diff is docs-only per ship-gate allowlist, stop: **gates skipped.**

## Step 2 — Wave 1 (parallel)

Dispatch **only triggered Wave 1 nodes** in a **single message, multiple `Task` calls** — wait for **all** to return before Wave 2. Sequential dispatch of independent Wave 1 nodes is a defect. Reviewers are `readonly: true`; they never edit, never run mutating actions, never delegate.

Typical mapping:

- **`code-reviewer`** — if `G-code-review` triggered
- **`security-reviewer`** — if `G-security-review` triggered
- **`data-model-documenter`** — if `G-data-document` triggered **and** not already run at implementation close
- **`library-reviewer`** — if `G-library-review` triggered

Brief each agent with a cold-context brief. Assume no parent conversation context. Supply exactly the fields the agent demands.

`code-reviewer` / `security-reviewer` / `library-reviewer`: task ID, goal, `files_read`, `files_write`, dependencies, conflicts, changed paths, diff or change description, acceptance criteria, and local verification evidence.

`data-model-documenter`: changed paths + brief per [implementation-close.md](../skills/data-model-documentation/references/implementation-close.md).

## Step 3 — Wave 2 (conditional)

After Wave 1 completes:

1. Re-check whether `DATA_MODEL.md` changed (`git diff HEAD -- DATA_MODEL.md` or status).
2. If yes: dispatch **`data-model-verifier`** (`G-data-verify`) with `readonly: true` — catalog diff, changed section names, and Source paths only (cold context).
3. If **hold** (REFUTED > 0): fix catalog or source, then **re-dispatch `data-model-verifier`** until **pass** before `checkpoint:ship-ready`.

## Step 4 — `checkpoint:ship-ready`

1. Summarize every gate agent verdict.
2. Fix Tier 0/1 findings, or record an **explicit human waiver**; log Tier 2 to findings ledger ([findings-ledger](../skills/findings-ledger/SKILL.md)).
3. Confirm PR description checkboxes match dispatched agents when opening or updating a PR.
4. Do **not** mark work complete, open/ready a PR, merge, tag, or release until all required nodes ran and findings are addressed.

Per [evidence-review-tiers](../rules/evidence-review-tiers.mdc): Tier 2 alone does not block; Tier 1 requires evidence to block. Before acting on any finding, open the cited `file:line` and re-run any cited deterministic check yourself.
