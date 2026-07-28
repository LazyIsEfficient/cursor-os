---
name: openspec-archive
description: Archive a merged OpenSpec change — runs openspec archive <id> -y so spec deltas merge into openspec/specs/ and the change moves to changes/archive/. Pass the change id as the argument. Only after the implementing PR has merged.
---

# OpenSpec archive

Archive the change named by `$1`. This is the post-merge step: deltas merge into the main specs and the change leaves the active set.

Lifecycle: [change-lifecycle.md](../skills/openspec-planning/references/change-lifecycle.md).

## Step 0 — guards

1. `command -v openspec` — if missing, instruct `npm install -g @fission-ai/openspec` and stop.
2. Confirm `openspec/changes/$1/` exists and is not already under `changes/archive/`.
3. Confirm the implementing PR has **merged** (`gh pr view` / `gh pr list --state merged`). If it is still open, stop — never archive an unmerged change.
4. Run this from an up-to-date `main` checkout after pulling the merge, so the archived spec state matches what shipped.

## Step 1 — archive

1. Run `openspec validate $1 --strict` first; a change that no longer validates should be fixed before archiving, not archived broken (`--no-validate` exists upstream but is not recommended).
2. Run `openspec archive $1 -y`.
   - Deltas merge into `openspec/specs/<domain>/spec.md`; new domains get a stub `## Purpose` — fill it in as part of the same commit.
   - The change moves to `openspec/changes/archive/<date>-<id>/`.
   - For infrastructure/tooling changes with no requirement deltas, use `openspec archive $1 -y --skip-specs`.
3. Review the resulting diff (`git status`, `git diff`) — the merge edits main specs and is worth a human glance.

## Step 2 — commit

Commit the archive result on `main` through the normal PR path (ship gates apply per `scripts/gate-plan.sh`; `openspec/**` is docs-only there). Report the archived change id and which spec files were updated.
