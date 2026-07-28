# Frontmatter Rules

Frontmatter = loader's primary input. Errors here cause silent misrouting.

## Required fields

### `name`
- Lowercase, hyphenated, no spaces or underscores
- Must match directory name (skills) or file basename (agents)
- Mismatch = **blocking** error — loader uses field, not path

Valid: `release-manager`, `code-reviewer`, `web3-smart-contract-engineering`
Invalid: `ReleaseManager`, `release_manager`, `release manager`, `Release-Manager`

### `description`
- Third person, written for loader — not human reader
- Under 1024 characters (some loaders enforce hard)
- States both **WHAT** skill/agent does + **WHEN** to load it
- Ends with cross-references to adjacent skills/agents

Pattern:

```
Use when <situation>. Triggers on <file globs> or mentions of "<keyword>", "<keyword>". For <related concern> see <other-skill>.
```

Description without trigger vocabulary forces loader to match on WHAT only — too low-signal for accurate routing. See [description-and-routing.md](description-and-routing.md) for full rubric.

## Optional fields (agents)

### `readonly` (Cursor)
- `true` for read-only reviewers + auditors
- Cursor Harness agents use this instead of Claude Code `tools:` lists
- Declared read-only role without `readonly: true` = should-fix;
  contradiction with write language in body = blocking

### `tools` (Claude Code)
- Comma-separated allowlist of tool names
- Omit to inherit all tools from parent agent
- Must match declared role (read-only ↛ Edit; intake ↛ Agent)
- See [tool-allowlists.md](tool-allowlists.md) for role-to-allowlist map
- Not used on Cursor Harness agents (unsupported frontmatter)

### `model`
- Optional model hint where platform supports it
- Omit to inherit from parent / default

## File structure (skills)

```
<skill-name>/
├── SKILL.md          # required — entry point with frontmatter
├── references/       # optional — deep-dive docs loaded on demand
├── assets/           # optional — templates the agent fills out
└── scripts/          # optional — runnable helpers
```

- Folder name must match `name` frontmatter exactly.
- `SKILL.md` should stay under ~100 lines. Long content moves to `references/`.
- Templates agent **fills out and copies** belong in `assets/`, not `references/`.
- Runnable scripts go in `scripts/`, not inlined in `SKILL.md`.

## Common frontmatter errors (severity order)

**Blocking**
- `name` doesn't match folder/file basename — silent misroute
- `description` missing or empty
- `tools:` includes write tools (`Edit`, `Write`, `NotebookEdit`) on agent declaring itself read-only
- `tools:` field present but malformed YAML

**Should-fix**
- Description starts first-person ("I am a...", "I help with...") instead of third-person ("Use when...")
- Description states only WHAT, no WHEN (no `Use when...` or trigger vocabulary)
- Description ends without cross-references — leaves loader no fallback when sibling better fit
- Description uses project-specific paths (`apps/foo/...`) that don't transfer
- Description over 1024 chars

**Nit**
- Description over 800 chars (cuttable without losing routing signal)
- Trailing whitespace, inconsistent quoting in YAML
- Cross-references in narrative form ("you might also want...") instead of conventional "For X see Y"

## Validation checklist

- [ ] `name` matches folder/file
- [ ] `description` includes "Use when..."
- [ ] `description` includes at least one concrete trigger keyword
- [ ] `description` ends with at least one "For X see Y" cross-reference (when adjacent skills exist)
- [ ] `description` under 1024 chars
- [ ] `tools` allowlist (if present) coherent with declared role
- [ ] No company-specific or project-specific identifiers in description body
- [ ] SKILL.md folder structure matches convention (references/, assets/, scripts/)
