# Tool Allowlists

`tools:` field is allowlist. Omit to inherit. List explicitly to restrict.

## Role-to-allowlist map

| Role | Allowlist | Rationale |
|---|---|---|
| **Build / implement** | (omit — inherit) | Needs full toolset for diversity of tasks |
| **Read-only reviewer** | `Read, Grep, Glob, Bash, WebFetch, WebSearch` | No `Edit` / `Write` / `NotebookEdit`; matches built-in Explore agent |
| **Intake / shaper** | `Read, Grep, Glob, Bash, WebFetch, WebSearch, AskUserQuestion` | Adds `AskUserQuestion`; excludes spawn (`Task`/`Agent`) + write tools |
| **Authoring (e.g., course-author)** | reviewer set + `Edit, Write, AskUserQuestion` | Genuine writing role; still no nested `Agent` |
| **Orchestrator** | inherit, including spawn (`Task` on Cursor, `Agent` on Claude Code) | Coordinates sub-agents — needs spawn permission |

## `Bash` is a soft-write vector

`Bash` can edit files, push to git, delete data — anything shell can. Including in "read-only" allowlist relies on agent's *system prompt* to enforce read-only intent, not tool boundary itself.

Same trade-off built-in Explore agent makes (has Bash). Defensible because:
- Most read-only review needs `git diff`, `git log`, `find`, `grep`, etc.
- Agents well-aligned to follow system-prompt instructions
- Alternative (no Bash) cripples real review work

But: do not market Bash-enabled agent as hard read-only guardrail. *Posture*, not *barrier*. Hard barrier required → drop `Bash`, accept cost.

## Spawn tool inclusion (`Task` / `Agent`)

Including platform spawn tool (`Task` on Cursor, `Agent` on Claude Code)
= agent can spawn sub-agents. Appropriate for orchestrators; footgun
for:
- **Reviewers** — review should be one coherent verdict, not tree of sub-reviews.
- **Shapers / intake** — intake should converge on brief, not branch.
- **Single-deliverable specialists** — spawning rarely improves quality, always increases latency.

Default for non-orchestrator agents: omit spawn tool from allowlist.
On Cursor, prefer `readonly: true` for reviewers instead of Claude-style
`tools:` list.

## Inheritance vs explicit allowlist

**Inherit (omit `tools:`)**:
- Simpler, fewer maintenance points
- Agent gains new tools automatically as harness adds them
- Right for build / implementation agents

**Explicit allowlist**:
- Hard guardrail for restricted roles
- Protects against drift if tool added that shouldn't apply
- Right for reviewers, intake, authoring, gated specialists

Rule of thumb: explicit allowlist when role's identity is *what it can't do*; inherit when role's identity is *what it does*.

## Common allowlist errors (severity order)

**Blocking**
- Read-only reviewer with `Edit`, `Write`, or `NotebookEdit` — direct contradiction with declared role
- Frontmatter `tools:` malformed YAML

**Should-fix**
- Intake agent with spawn tool (`Task` / `Agent`) — allows nested delegation, breaks intake convergence
- Build agent with overly restrictive allowlist — cripples for marginal benefit
- Reviewer needing `git diff` but `Bash` excluded — review can't actually run
- Cursor reviewer missing `readonly: true` — role posture not declared to platform

**Nit**
- Allowlist names tool that doesn't exist — silent ignore by some loaders; maintenance hazard. Verify against current platform tool list.
- Allowlist orders tools randomly — convention: read tools first, then write tools, then specialty tools (`AskUserQuestion`, etc.)

## Quick verification

Given agent file, check:

1. Role description says "read-only", "review", "audit", "verdict"? → Cursor: `readonly: true`; Claude Code: `tools` should exclude `Edit`, `Write`, `NotebookEdit`.
2. Description says "intake", "shape", "scope a brief"? → exclude spawn + write tools.
3. Description says "implement", "build", "ship"? → `tools` usually inherited (omitted); no `readonly: true`.
4. `Bash` present? → confirm role genuinely needs shell access; otherwise drop.
5. `Task` / `Agent` present? → confirm orchestrator; otherwise drop.
