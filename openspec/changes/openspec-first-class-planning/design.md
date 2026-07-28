## Context

Planning today produces chat-YAML: `prompt-shaping` returns a brief block and
`planning-and-task-breakdown` returns a task-DAG block. Both are consumed
immediately by the orchestrator and then lost. The gate DAG and Task dispatch
mechanics are sound and stay unchanged; only the planning artifacts move.

Verified against `openspec` CLI v1.6.0 (`@fission-ai/openspec`):

- `openspec init --tools cursor` scaffolds `openspec/config.yaml` (schema
  `spec-driven`) and tool instruction files; in this repo init is not run —
  the tree is maintained by hand.
- Artifact DAG: proposal → (design, specs) → tasks. Whole-change validation
  (`openspec validate <id> [--strict]`) fails until at least one spec delta
  exists — deltas are required even without `--strict`.
- Delta format: `## ADDED/MODIFIED/REMOVED/RENAMED Requirements`, each
  `### Requirement:` needs at least one `#### Scenario:` block (exactly four
  hashtags) with WHEN/THEN bullets.
- `openspec archive <id> -y` merges deltas into `openspec/specs/` and moves
  the change to `openspec/changes/archive/<date>-<id>/`.

## Goals / Non-Goals

**Goals:**

- Engineering planning artifacts are files under `openspec/` — durable,
  diffable, CLI-validated, archivable.
- The `openspec` CLI is a global prerequisite like `git`/`gh`; the
  zero-third-party-dependency rule is untouched.
- Dispatch briefs remain cold-context-complete, now as
  `dispatch/<task-id>.md` files referenced from `tasks.md`.

**Non-Goals:**

- Unifying domain shapers (game-design, marketing, blog, course) onto OpenSpec
  — follow-up.
- Changing gate DAG nodes, Task dispatch mechanics, or ship-gate CI.
- Vendoring or wrapping the CLI; no npm dependency.

## Decisions

1. **External CLI prerequisite, not a package.** `openspec` is installed
   globally (`npm install -g @fission-ai/openspec`, Node >= 20.19) and
   documented in both READMEs. Nothing enters package.json. Validation via
   the CLI is Tier 0; agents never hand-validate format.
2. **Replace, don't mirror.** Chat-YAML brief/DAG outputs are removed as
   primary artifacts rather than kept alongside OpenSpec files — two sources
   of truth would drift. The 7-field dispatchability gate survives as the
   proposal completeness check; DAG invariants (stable IDs, acyclicity,
   symmetric conflicts) survive as planner rules encoded in `tasks.md`
   grouping and dispatch briefs.
3. **Dispatch briefs are per-task files.** `openspec/changes/<id>/dispatch/
   <task-id>.md` carries goal/files_read/files_write/dependencies/conflicts/
   acceptance/verification — the fields implementation agents require with
   cold context. `tasks.md` items reference these files.
4. **`openspec/**` is docs-only in gate planners.** Markdown specs and config
   (`config.yaml`, `.openspec.yaml`) without code changes need no ship gates;
   both `gate-plan-lib.sh` and `dispatch-gate-plan-lib.mjs` classify it so,
   kept in sync.
5. **Dogfood by hand.** This repo maintains `openspec/` manually; init's
   upstream tool files would collide with the plugin layout.

## Risks / Trade-offs

- [CLI absent on a consumer machine] → hard-stop instruction in the skill and
  commands; no silent fallback to chat planning.
- [Whole-change validation fails at proposal time (no deltas yet)] → propose
  command treats a deltas-only validation failure as "pending plan"; strict
  validation becomes a hard gate again once the planner writes deltas, before
  any dispatch.
- [Upstream CLI format drift] → skill pins behavior to verified v1.6.0
  semantics and instructs `openspec instructions <artifact>` as the live
  source of format truth.

## Open Questions

- Should domain shapers adopt OpenSpec later (tracked as follow-up, not in
  this change).
