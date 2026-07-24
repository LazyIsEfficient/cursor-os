---
name: agent-new
description: Scaffold a new agent under plugin/agents/ (frontmatter + body + Skills-available block) and hand it to library-reviewer via Task. Pass the kebab-case agent name as the argument (e.g. `/agent-new incident-responder`).
---

You are scaffolding a new agent definition for this Cursor plugin so a maintainer gets a conforming starting point in one step. A conforming agent file matches the shape used by `plugin/agents/code-reviewer.md` and `plugin/agents/engineer.md`: YAML frontmatter with `name`, `description` (trigger vocabulary + "For X see Y" cross-refs), and optionally `readonly: true` for review/audit roles — then a body that requires a cold-context brief, ending with a "## Skills available" link section.

Do **not** emit Claude-only frontmatter such as `tools:` — this plugin's validator rejects it. Cursor reviewers declare posture with `readonly: true`; build/intake agents omit `readonly`.

## Step 1 — resolve the agent name

The agent name is `$1`. If `$ARGUMENTS` is empty, STOP and ask the user: "What is the agent name? (kebab-case, e.g. `incident-responder`)". Do not invent a name.

Use the resolved name (call it `<name>`) verbatim for both the `name:` field and the filename. It must be kebab-case and must match the file stem. If `$1` is not kebab-case (lowercase, hyphen-separated, no spaces/underscores/capitals), STOP and report the violation — do not auto-correct silently.

## Step 1.5 — check for collision

Before writing anything, use `Glob` to check whether `plugin/agents/$1.md` already exists (glob `plugin/agents/$1.md`). If it exists, STOP and report the collision — do NOT overwrite. Tell the maintainer the agent `$1` already exists and they must pick a different name or edit the existing file directly.

## Step 2 — choose role posture (readonly vs writing)

Before writing frontmatter, pick the role implied by the name, using [tool-allowlists.md](../skills/skill-library-review/references/tool-allowlists.md) as the intent map — adapted to Cursor:

- **Read-only reviewer / auditor** → set `readonly: true`. Body must promise no mutation (e.g. "Never edit files, run mutating actions, or delegate.").
- **Intake / shaper** → omit `readonly` (writing/intake agents edit briefs). No nested `Task` dispatch from the agent body.
- **Authoring** → omit `readonly`.
- **Build / implement** → omit `readonly` (inherits full toolset).
- **Orchestrator** → omit `readonly`. Body may dispatch via Cursor `Task` (not Claude `Agent`).

If the role is genuinely unknown from the name, do NOT guess: emit `readonly: true` only when the name clearly says review/audit/verify/probe; otherwise omit `readonly` and leave a `TODO` in the body noting the role must be classified.

Also remind the author (in the final report, not inside YAML): new agents must be added to `READONLY_AGENTS` or `WRITING_AGENTS` in `scripts/lib/repository-validator.mjs` or `npm run validate` fails.

## Step 3 — write the file

Create `plugin/agents/<name>.md` with EXACTLY this structure for a **writing / build / intake** role (substitute `<name>`; leave every `TODO` literal — do not fabricate triggers):

```
---
name: <name>
description: TODO one-line role summary. Use when TODO trigger conditions. Triggers on TODO "phrase", TODO "phrase". For TODO related-task see TODO other-agent.
---

You are TODO one-sentence identity and primary goal.

Accept only a cold-context brief that declares `goal`, `files_read`, `files_write`, `dependencies`, `conflicts`, acceptance criteria, and verification. Stop and report the missing field rather than guessing from conversation history.

## Operating principles

- TODO core rule 1
- TODO core rule 2
- TODO core rule 3

## What this agent handles

- TODO scenario 1
- TODO scenario 2

## Skills available

- TODO skill-name — TODO what it provides
- TODO skill-name — TODO what it provides

## Delegate

This agent does not nest Cursor `Task` calls — it reports back to the caller.
```

If the chosen role is a **read-only reviewer / auditor**, use this frontmatter and opening instead (keep the same Skills / Delegate sections, adapted as below):

```
---
name: <name>
description: TODO one-line role summary. Use when TODO trigger conditions. Triggers on TODO "phrase", TODO "phrase". For TODO related-task see TODO other-agent.
readonly: true
---

You are a read-only reviewer. Never edit files, run mutating actions, or
delegate. Require a cold-context brief containing the task ID, goal,
`files_read`, `files_write`, dependencies, conflicts, changed paths, diff or
change description, acceptance criteria, and local verification evidence.

TODO — one-sentence identity beyond the read-only posture.
```

For **audit-only** roles (library/document auditors with no write scope), the brief may require `files_read` only — leave a `TODO` noting whether this agent belongs in `AUDIT_ONLY_AGENTS` in `scripts/lib/repository-validator.mjs`.

If the chosen role is an **orchestrator** (it delegates to subagents via the Cursor `Task` tool), replace the `## Delegate` body with:

```
## Delegate

This agent is an orchestrator: it decomposes work and dispatches subagents via the Cursor `Task` tool (`subagent_type`), then reviews and integrates their results. Do not use Claude Code's `Agent` tool name.
```

For all non-orchestrator roles, keep the `## Delegate` "does not nest Cursor `Task` calls" body shown in the writing template.

Do not put comments inside the `---` fences — invalid YAML breaks the generated file. If you need to record why `readonly` was omitted, put a single HTML comment in the body *below* the closing `---`.

## Step 4 — hand to library-reviewer

After the file is written, dispatch a `library-reviewer` agent via a Cursor `Task` (`subagent_type: "library-reviewer"`, `readonly: true`). Brief it cold-context complete: task ID, goal, paths under review (`plugin/agents/<name>.md`), and `files_read`. Tell it: "Review the newly scaffolded agent definition at `plugin/agents/<name>.md` for frontmatter correctness (no `tools:` field; `readonly: true` only for review/audit roles), routing/trigger quality, cold-context brief requirement, and the Skills-available block. It is a scaffold with intentional `TODO` placeholders — flag those as expected-incomplete, not errors, and focus your verdict on whether the *structure* conforms. Respond under 150 words."

Then report to the user: the file path, the posture you chose (`readonly: true` vs writing) and why, the validator classification reminder (`READONLY_AGENTS` / `WRITING_AGENTS`), and the reviewer's verdict.
