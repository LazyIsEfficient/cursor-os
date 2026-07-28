# OpenSpec change lifecycle

Verified against `openspec` CLI v1.6.0. Artifact DAG is
`proposal → (design, specs) → tasks`; validation is whole-change.

## CLI quick reference

| Command | Purpose |
|---|---|
| `openspec --version` | Prerequisite check (also `command -v openspec`) |
| `openspec init --tools cursor` | Scaffold `openspec/` in a consumer repo |
| `openspec new change <kebab-id>` | Create `changes/<id>/` + `.openspec.yaml` |
| `openspec instructions <artifact> --change <id>` | Live template + rules for proposal/design/specs/tasks |
| `openspec status --change <id>` | Artifact completion for a change |
| `openspec validate <id> --strict` | Tier-0 whole-change validation gate |
| `openspec list --changes --json` | Machine-readable active changes |
| `openspec archive <id> -y` | Merge deltas into `specs/`, move change to `changes/archive/<date>-<id>/` |

## Lifecycle

1. **Propose** — `openspec new change <id>`, write `proposal.md` (+
   `design.md` when warranted). At this point `openspec validate <id>
   --strict` fails with "Change must have at least one delta" — expected;
   validation is whole-change, becomes meaningful once specs exist.
2. **Plan** — write delta `specs/<domain>/spec.md` and `tasks.md`; write
   `dispatch/<task-id>.md` briefs (harness extension).
3. **Validate** — `openspec validate <id> --strict` MUST exit 0 before any
   implementation dispatch. Fix CLI-reported issues and re-run.
4. **Apply** — dispatch implementation Tasks wave by wave; implementers check
   off `tasks.md` items (`- [x]`) as they complete. `openspec status` and
   apply tooling read checkbox state, so keep accurate.
5. **Archive** — only after PR merges: `openspec archive <id> -y`. Deltas
   merge into `openspec/specs/<domain>/spec.md` (new domains get stub
   Purpose to fill in), change moves under `changes/archive/`.
   Use `--skip-specs` for infrastructure/doc-only changes with no requirement
   deltas — not for behavior changes.

## Failure handling

- **CLI missing** — instruct `npm install -g @fission-ai/openspec` (Node
  >= 20.19) and stop. No silent fallback to chat planning.
- **Validation fails** — read CLI's "Next steps" output;
  `openspec show <id> --json --deltas-only` shows what parser actually
  extracted. Classic failure: scenario at wrong heading level
  (three hashtags or bullets) dropped from parsing — CLI emits INFO
  that header ignored, then fails with `ADDED "<name>" must include at
  least one scenario`. Also watch MODIFIED with partial content.
- **No deltas warranted** (pure refactor, tooling) — change still needs
  at least one delta to validate; if truly no requirement changes, document
  work in `tasks.md` + `proposal.md` and archive later with
  `--skip-specs`, accepting strict validation stays red meanwhile — or
  fold work into change that does carry deltas. Prefer the fold.

## Dogfood note (this repository)

Maintain `openspec/` by hand here. Do not run `openspec init` in harness
repo — it writes upstream tool files (`.cursor/skills`, `.cursor/commands`)
colliding with plugin layout. Validation, status, list, archive
all work on hand-maintained tree.
