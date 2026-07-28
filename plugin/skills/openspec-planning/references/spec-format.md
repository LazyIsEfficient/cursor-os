# OpenSpec artifact format

Verified against `openspec` CLI v1.6.0 (`@fission-ai/openspec`). When the
installed CLI differs, trust `openspec instructions <artifact> --change <id>`
— it prints the schema's live template and rules per artifact.

## Repository layout

```text
openspec/
├── config.yaml                    # schema: spec-driven (from openspec init)
├── project.md                     # project context (hand-maintained)
├── specs/<domain>/spec.md         # source of truth, merged on archive
└── changes/<change-id>/
    ├── .openspec.yaml             # schema + created date (from openspec new change)
    ├── proposal.md                # why & what
    ├── design.md                  # how — only when decisions warrant
    ├── tasks.md                   # checkbox task groups
    ├── dispatch/<task-id>.md      # per-task cold-context briefs (harness extension)
    └── specs/<domain>/spec.md     # deltas against main specs
```

`dispatch/` is a cursor-harness extension, not an upstream artifact; the CLI
ignores unknown files in the change directory.

## proposal.md

Sections: `## Why` (1–2 sentences), `## What Changes` (bullets; mark breaking
changes **BREAKING**), `## Capabilities` (`### New Capabilities` /
`### Modified Capabilities`, kebab-case names — each becomes
`specs/<name>/spec.md`), `## Impact`.

## design.md

Create only for cross-cutting change, new external dependency, significant
data model change, security/performance/migration complexity, or ambiguity.
Sections: `## Context`, `## Goals / Non-Goals`, `## Decisions` (with
alternatives), `## Risks / Trade-offs`, optionally `## Migration Plan`,
`## Open Questions`.

## Spec deltas — changes/<id>/specs/<domain>/spec.md

Delta operations as `##` headers:

- `## ADDED Requirements` — new behavior.
- `## MODIFIED Requirements` — changed behavior; MUST copy the entire existing
  requirement block and edit it (partial content loses detail at archive).
- `## REMOVED Requirements` — MUST include `**Reason**` and `**Migration**`.
- `## RENAMED Requirements` — FROM:/TO: format only.

Requirement format:

```markdown
### Requirement: <name>
<normative text using SHALL/MUST — avoid should/may>

#### Scenario: <name>
- **WHEN** <condition>
- **THEN** <expected outcome>
```

Rules the CLI enforces: every requirement needs at least one scenario;
scenarios MUST use exactly four hashtags (`####`); a change MUST contain at
least one delta or even plain `openspec validate <id>` fails. MODIFIED header
text must match the existing requirement (whitespace-insensitive). A scenario
at the wrong heading level (e.g. three hashtags) is dropped from parsing —
the CLI emits an INFO that the header is ignored, then validation fails with
an explicit `ADDED "<name>" must include at least one scenario` ERROR and
Next-steps guidance.

## tasks.md

```markdown
## 1. <Group name>

- [ ] 1.1 <task description>
- [ ] 1.2 <task description>
```

Every task is a `- [ ] X.Y` checkbox — the apply phase parses this format to
track progress; non-checkbox lines are not tracked. Group related tasks under
numbered `##` headings; order by dependency. Completed tasks are checked
(`- [x]`). Harness extension: append the dispatch brief reference to each
dispatchable item, e.g. `- [ ] 2.1 Implement parser (brief: dispatch/T-parser.md)`.

## Main specs — openspec/specs/<domain>/spec.md

Written by `openspec archive`, not by hand during a change:

```markdown
# <domain> Specification

## Purpose
<filled in after archive>

## Requirements
### Requirement: <name>
...
```
