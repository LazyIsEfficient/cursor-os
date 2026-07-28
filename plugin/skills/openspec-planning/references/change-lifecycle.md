# OpenSpec change lifecycle

Verified against `openspec` CLI v1.6.0. The artifact DAG is
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
   validation is whole-change and becomes meaningful once specs exist.
2. **Plan** — write delta `specs/<domain>/spec.md` and `tasks.md`; write
   `dispatch/<task-id>.md` briefs (harness extension).
3. **Validate** — `openspec validate <id> --strict` MUST exit 0 before any
   implementation dispatch. Fix CLI-reported issues and re-run.
4. **Apply** — dispatch implementation Tasks wave by wave; implementers check
   off `tasks.md` items (`- [x]`) as they complete. `openspec status` and the
   apply tooling read checkbox state, so keep it accurate.
5. **Archive** — only after the PR merges: `openspec archive <id> -y`. Deltas
   merge into `openspec/specs/<domain>/spec.md` (new domains get a stub
   Purpose to fill in), and the change moves under `changes/archive/`.
   Use `--skip-specs` for infrastructure/doc-only changes with no requirement
   deltas — not for behavior changes.

## Failure handling

- **CLI missing** — instruct `npm install -g @fission-ai/openspec` (Node
  >= 20.19) and stop. No silent fallback to chat planning.
- **Validation fails** — read the CLI's "Next steps" output;
  `openspec show <id> --json --deltas-only` shows what the parser actually
  extracted. The silent-failure classics: scenarios with three hashtags,
  bullets instead of `#### Scenario:` blocks, MODIFIED with partial content.
- **No deltas warranted** (pure refactor, tooling) — the change still needs
  at least one delta to validate; if truly no requirement changes, document
  the work in `tasks.md` + `proposal.md` and archive later with
  `--skip-specs`, accepting that strict validation stays red meanwhile — or
  fold the work into a change that does carry deltas. Prefer the fold.

## Dogfood note (this repository)

Maintain `openspec/` by hand here. Do not run `openspec init` in the harness
repo — it writes upstream tool files (`.cursor/skills`, `.cursor/commands`)
that collide with the plugin layout. Validation, status, list, and archive
all work on the hand-maintained tree.
