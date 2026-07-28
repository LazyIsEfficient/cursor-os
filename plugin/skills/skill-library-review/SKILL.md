---
name: skill-library-review
description: Method for reviewing a library of Cursor plugin skills and agents (and Claude Code skills, agents, slash commands, workflows when scoped) — frontmatter correctness, routing quality, tool allowlists or readonly posture, cross-reference coherence, single-responsibility, file structure, anti-pattern detection. Triggers on "review skills", "audit agents", "skill library", "is this skill right", or iterating on plugin/skills/ or plugin/agents/. For dispatched audit against cold-context brief — use library-reviewer agent. For evidence-only mechanical probes with no quality verdict — use library-investigator. Not for application source-code review — use code-review-and-quality.
---

# Skill Library Review

Review skill + agent definitions loader uses to route work. Vague
descriptions, single-responsibility violations, stale cross-references cause
silent misroutes. Catch before users hit them.

Operate read-only. Cite `file:line` for every concrete finding.

## Universal Rules

- **Verdict first.** Lead with `pass` / `fix-before-merge` / `hold` +
  one-line reason.
- **Cite the file.** Quote exact live text at `file:line`. Memory is not
  evidence.
- **Mark severity.** Blocking, should-fix, or nit.
- **Routing specificity is non-negotiable.** Descriptions must discriminate.
- **Role posture must match.** Cursor: `readonly: true` for reviewers. Claude
  Code: `tools:` must not grant `Edit`/`Write` to read-only role.
- **One coherent role per agent, one concern per skill.**
- **Cross-references resolve.** Bidirectional refs preferred when symmetric.
- **Shared keyword ≠ collision** until both sides lack reciprocal "not when".
- **`SKILL.md` stays under ~100 lines.** Long content → `references/`.
- **No invented criticism.**

## Review order

1. **Library shape** — see [references/library-shape.md](references/library-shape.md)
2. **Frontmatter** — [references/frontmatter-rules.md](references/frontmatter-rules.md)
3. **Description quality** — [references/description-and-routing.md](references/description-and-routing.md)
4. **Tool / readonly coherence** — [references/tool-allowlists.md](references/tool-allowlists.md)
5. **Cross-reference coherence**
6. **Anti-patterns** — [references/anti-patterns.md](references/anti-patterns.md)

Claude Code commands/workflows in scope → see
[references/commands-and-workflows.md](references/commands-and-workflows.md)
(Claude uses `Agent`; Cursor uses `Task`).

## Tier discipline

- **Tier 0:** `npm run validate` territory — cite it, don't re-find it.
- **Tier 1:** quoted live line is evidence (role contradiction, dangling
  ref).
- **Tier 2:** routing/specificity judgments — advisory via
  [findings-ledger](../findings-ledger/SKILL.md).

## Output

Use [assets/review-template.md](assets/review-template.md).

## Related

- [code-review-and-quality](../code-review-and-quality/SKILL.md)
- [library-investigator](../library-investigator/SKILL.md)
- [library-reviewer](../../agents/library-reviewer.md)
- [findings-ledger](../findings-ledger/SKILL.md)
