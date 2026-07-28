# Description and Routing

Loader matches user intent against descriptions. Routing quality lives or dies in this field.

## The structure

```
Use when <situation>. Triggers on <globs/keywords>. For <adjacent concern> see <other-skill>.
```

Three jobs:
1. **WHAT** — situation that calls for this skill/agent
2. **WHEN** — concrete triggers (file patterns, user vocabulary, slash commands)
3. **WHERE NOT** — cross-references to siblings handling adjacent concerns

Third job most under-used. Without it, loader has no way to deflect to better match — picks first description that fires.

## Specificity for routing

Description that could match anything matches nothing well.

| Bad | Better |
|---|---|
| "Use for code-related tasks" | "Use when implementing TypeScript backend features — APIs, services, database queries" |
| "Triggers on coding keywords" | `Triggers on edits to ".ts" files, mentions of "API endpoint", "Prisma", "migration"` |
| "Use for any review" | "Use proactively after non-trivial code changes for multi-axis review (correctness, design, perf)" |
| "Helps with marketing" | "Use when the deliverable is content, an experiment, or an outbound sequence" |

Test: read description aloud. Could equally describe three other skills in library → not specific enough.

## Trigger vocabulary

Match real user phrasing, not internal jargon.

Users say:
- "fix this bug" — not "remediate this defect"
- "make it faster" — not "optimize the critical path"
- "review my PR" — not "audit the changeset"
- "design a course" — not "produce instructional materials"

Unsure what users say → scan recent conversation history for actual phrasing.

### Keyword density

- 5–12 keywords healthy
- 15+ keywords signals weak description — loader can't discriminate
- Single-word triggers ("design", "test") too broad alone; pair with context ("system design", "test strategy")
- File globs (`**/*.test.ts`) concrete + discriminating — prefer when skill file-scoped

## Proactive markers

Phrases like "Use proactively after X" or "MUST BE USED before Y" tell loader to fire agent without explicit user request.

When to use:
- **Reviewers**: yes — "Use proactively after non-trivial code changes"
- **Security gates**: yes — "Use proactively before merging changes that touch auth, sessions, crypto"
- **Performance / quality gates**: case by case — only if cost of skipping high
- **Builders**: rarely — fire on explicit work; auto-firing causes noise
- **Intake / shapers**: never — explicitly user-invoked

Proactive marker without precise trigger condition worse than no marker — agent fires every turn, becomes noise or gets ignored.

```
Bad:  Use proactively when reviewing code.
Good: Use proactively after any non-trivial code change before reporting work as done.
Bad:  MUST BE USED for security.
Good: Use proactively before merging changes that touch auth, sessions, crypto, or input validation.
```

## Cross-references

Every adjacent skill/agent should be named in description so loader routes correctly when request lands closer to sibling:

```
For Solidity contracts see web3-smart-contract-engineering. For Godot games see godot-engineer.
For read-only review verdicts see code-reviewer.
```

### Bidirectional refs

A says "see B for X" → does B's description (or related-skills section) name A? Asymmetric refs leave dead ends.

Find inbound refs:

```bash
grep -r "<skill-name>" .claude/skills/ .claude/agents/
```

Zero hits = orphan; investigate.

## Verifying a collision before you report it

Shared trigger keyword between two skills is **not** automatically routing collision. Deliberately shared keywords, disambiguated by reciprocal "not when" clauses, are intended pattern — loader reads deflection, routes correctly.

Before reporting collision, run this check:

0. **Confirm two skills actually contend.** Collision requires *real* overlap: shared trigger keyword, or two file-globs both matching same file/request. Two skills not competing for same request are not colliding just because neither names other — expected, not finding. (General code-review skill + test-strategy skill don't contend merely because neither cites other.) No genuine overlap → stop here, no finding.
1. Read **both** skills' `description` + `when_to_use`, including every `Not when … use <other>` clause.
2. Ask: does each side already deflect to other on shared trigger?

| Both sides deflect (reciprocal "not when") | Only one side deflects | Neither side deflects |
|---|---|---|
| **Not a finding.** Resolved — do not report. | Should-fix: add missing reverse tiebreaker. | Blocking/should-fix: real collision, no disambiguation. |

Quote actual "not when" line from each side as evidence (or, for "neither" column, paste `grep` showing tiebreaker absent). "These two share a keyword" *without* checking both tiebreakers is not finding — half a check, single biggest source of false-positive collision reports.

Example: `marketing-shaper` + `outbound-engine` both trigger on "outbound campaign", but `marketing-shaper`'s description says "see outbound-engine" + reverse says "see marketing-shaper". Reciprocal — resolved — not a finding.

## Description anti-patterns

- Starts with "I" or "We" (first-person)
- Doesn't include "Use when…" — pure WHAT, no WHEN
- Lists 20+ keywords (signal of "couldn't decide what this is")
- Includes "etc." or "and more" (vague hedge, signals incomplete thinking)
- Uses company or project names that won't transfer to other repos
- "Use proactively" without specifying *when* — fires unconditionally
- No trailing cross-references when adjacent skills clearly exist
- Triggers list contains only generic keywords ("code", "design", "test") with no discriminators
