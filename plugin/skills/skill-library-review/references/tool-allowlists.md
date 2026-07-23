# Tool Allowlists

The `tools:` field is an allowlist. Omit to inherit. List explicitly to restrict.

## Role-to-allowlist map

| Role | Allowlist | Rationale |
|---|---|---|
| **Build / implement** | (omit — inherit) | Needs full toolset for the diversity of tasks |
| **Read-only reviewer** | `Read, Grep, Glob, Bash, WebFetch, WebSearch` | No `Edit` / `Write` / `NotebookEdit`; matches the built-in Explore agent |
| **Intake / shaper** | `Read, Grep, Glob, Bash, WebFetch, WebSearch, AskUserQuestion` | Adds `AskUserQuestion`; excludes spawn (`Task`/`Agent`) and write tools |
| **Authoring (e.g., course-author)** | reviewer set + `Edit, Write, AskUserQuestion` | Genuine writing role; still no nested `Agent` |
| **Orchestrator** | inherit, including spawn (`Task` on Cursor, `Agent` on Claude Code) | Coordinates sub-agents — needs spawn permission |

## `Bash` is a soft-write vector

`Bash` can edit files, push to git, delete data — anything the shell can. Including it in a "read-only" allowlist relies on the agent's *system prompt* to enforce read-only intent, not the tool boundary itself.

This is the same trade-off the built-in Explore agent makes (it has Bash). It's defensible because:
- Most read-only review needs `git diff`, `git log`, `find`, `grep`, etc.
- Agents are well-aligned to follow system-prompt instructions
- The alternative (no Bash) cripples real review work

But: do not market a Bash-enabled agent as a hard read-only guardrail. It is a *posture*, not a *barrier*. If a hard barrier is required, drop `Bash` and accept the cost.

## Spawn tool inclusion (`Task` / `Agent`)

Including the platform spawn tool (`Task` on Cursor, `Agent` on Claude Code)
means the agent can spawn sub-agents. Appropriate for orchestrators; a footgun
for:
- **Reviewers** — review should be one coherent verdict, not a tree of
  sub-reviews.
- **Shapers / intake** — intake should converge on a brief, not branch.
- **Single-deliverable specialists** — spawning rarely improves quality and
  always increases latency.

Default for non-orchestrator agents: omit the spawn tool from the allowlist.
On Cursor, prefer `readonly: true` for reviewers instead of a Claude-style
`tools:` list.

## Inheritance vs explicit allowlist

**Inherit (omit `tools:`)**:
- Simpler, fewer maintenance points
- Agent gains new tools automatically as the harness adds them
- Right for build / implementation agents

**Explicit allowlist**:
- Hard guardrail for restricted roles
- Protects against drift if a tool gets added that shouldn't apply
- Right for reviewers, intake, authoring, gated specialists

Rule of thumb: explicit allowlist when the role's identity is *what it can't do*; inherit when the role's identity is *what it does*.

## Common allowlist errors (in severity order)

**Blocking**
- Read-only reviewer with `Edit`, `Write`, or `NotebookEdit` — direct contradiction with declared role
- Frontmatter `tools:` is malformed YAML

**Should-fix**
- Intake agent with spawn tool (`Task` / `Agent`) — allows nested delegation, breaks intake convergence
- Build agent with overly restrictive allowlist — cripples it for marginal benefit
- Reviewer that needs `git diff` but `Bash` is excluded — review can't actually run
- Cursor reviewer missing `readonly: true` — role posture not declared to the platform

**Nit**
- Allowlist names a tool that doesn't exist — silent ignore by some loaders; also a maintenance hazard. Verify against the current platform tool list.
- Allowlist orders tools randomly — convention is to list read tools first, then write tools, then specialty tools (`AskUserQuestion`, etc.)

## Quick verification

Given an agent file, check:

1. Does the role description say "read-only", "review", "audit", "verdict"? → Cursor: `readonly: true`; Claude Code: `tools` should exclude `Edit`, `Write`, `NotebookEdit`.
2. Does the description say "intake", "shape", "scope a brief"? → exclude spawn and write tools.
3. Does the description say "implement", "build", "ship"? → `tools` should usually be inherited (omitted); no `readonly: true`.
4. Is `Bash` present? → confirm the role genuinely needs shell access; otherwise drop it.
5. Is `Task` / `Agent` present? → confirm this is an orchestrator; otherwise drop it.
