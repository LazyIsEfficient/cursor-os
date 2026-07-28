# Library Shape

Before reviewing individual files, ask: should this even be a skill / agent? Library-shape problems most expensive to fix later — file-level issues = local edits; shape problems require renames, splits, merges, cross-reference updates across library.

## Skill vs agent vs ambient

| Form | Use when | Examples |
|---|---|---|
| **Ambient rule** (CLAUDE.md, always-loaded) | Cross-cutting policy applying to every interaction | "Don't add error handling for impossible scenarios", commit message format |
| **Skill** (`SKILL.md`, loaded on match) | Domain knowledge, rules, reference patterns *current* agent should follow when working in that domain | `code-review-and-quality`, `security-engineering`, `typescript-testing-backend` |
| **Agent** (`plugin/agents/` or `.claude/agents/`, delegated) | Discrete deliverable produced by focused role with own context window | `code-reviewer`, `engineer`, `technical-pm` |

Same domain can have both: skill carries rules; agent is role applying them. `code-reviewer` agent uses `code-review-and-quality` skill.

## When to make something a skill

- A *way of working* — discipline, conventions, rules
- Applies during other work, not as standalone deliverable
- Any agent doing this kind of work should follow it
- Examples: `code-review-and-quality`, `release-manager`, `deployment-pipelines`

## When to make something an agent

- Clear, named deliverable (verdict, brief, design doc, lesson, campaign)
- Commonly delegated as complete unit
- Benefits from isolated context window (large research, no cross-domain bleed)
- Multiple skills naturally cluster around role
- Examples: `code-reviewer`, `engineer`, `marketer`, `prompt-shaper`

## When to make something ambient (CLAUDE.md)

- Applies to *every* turn, regardless of task
- About agent behavior, not domain expertise
- Skipping it would be a bug
- Examples: communication style, commit conventions, "don't introduce OWASP-class bugs"

## Single-responsibility check

Describe role in one sentence without "or"?
- ✅ "Reviews code for correctness, design, and standards" — coordinated axes of one task
- ❌ "Reviews code or designs systems or shapes ideas" — three roles in a trench coat

"or" connecting unrelated *domains* (not related axes of same task) → split.

## Consolidation candidates

Two definitions doing same job. Consolidate when:
- Descriptions overlap by >50%
- Triggers fire on same vocabulary
- Deliverable same shape

Common patterns:
- Multiple skills covering "same testing concern from slightly different angles"
- Reviewer + auditor + checker agents all returning verdicts on same scope
- Three "shaper" skills with overlapping question protocols

## Split candidates

One definition spanning two domains. Split when:
- Description uses "or" between unrelated concerns
- Skill has to caveat ("for X see Y, for Z stay here") more than 2–3 times
- Single `SKILL.md` grows past ~150 lines covering two areas
- Two unrelated user vocabularies trigger same skill
- Two contributors keep editing same file for unrelated reasons

## Orphaned skills

Skill with **zero inbound references** from other skills/agents is suspect:
- Maybe genuinely standalone (e.g., `planning-and-task-breakdown` = discipline skill applied across many tasks — document as such in description)
- More often: renamed, superseded, or never wired in

Find orphans:

```bash
# For each skill, count inbound refs (Cursor plugin layout)
for skill in plugin/skills/*/; do
  name=$(basename "$skill")
  count=$(grep -r "$name" plugin/ --exclude-dir="$skill" | wc -l)
  echo "$count $name"
done | sort -n
```

Zero hits = investigate.

## Skills that should be agents

Promote when:
- Commonly delegated as complete unit ("review the changes", "shape this idea")
- Clear deliverable / output format
- Benefits from isolated context window
- Natural verb ("review", "shape", "audit") fits role

## Skills that should stay skills

Keep as skill when:
- Rule / policy / discipline (always applied during other work)
- No discrete "deliverable" — a *way of working*
- Agent's parent should follow it, not delegate to it

Keep ambient (don't make a skill at all):
- House style, tone-of-voice, formatting conventions colouring every response
- Any policy applying to every turn

## Library-shape smells

- **Too many agents** — every skill becomes agent. Symptom: agent descriptions overlap heavily; parent has to think hard about which to call. Fix: collapse to broader agents, keep rest as skills.
- **Too few agents** — one agent does everything. Symptom: agent description = paragraph of "or"s. Fix: identify natural delegation seams (review, intake, specialized stacks).
- **Skill–agent name collision** — same name for both, no clear "skill carries rules, agent is role" relationship. Fix: clarify relationship in both descriptions, or rename one.
- **Cluster without agent** — five skills always loaded together for same kind of work. Fix: consider agent bundling them.
