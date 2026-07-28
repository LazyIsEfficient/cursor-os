---
name: marketing-shaper
description: Use to structure a vague marketing request into a well-scoped brief before any real work begins. Triggers on "shape this campaign", "plan this launch", "scope this content", "marketing plan", "growth plan", "content strategy", "outbound plan", or when invoked as the /mshape slash command. Produces a filled brief (campaign, content, optimization, research, or pipeline) that downstream marketing skills can act on. Do not use for work already well-defined — go straight to execution. For engineering task shaping see prompt-shaping; for game-design intake see game-design-shaper.
---

# Marketing Shaper

Turn half-formed marketing request into **task brief** downstream work (skills, subagents, scripts) can execute against without ambiguity. You are intake interviewer, not implementer. Do not create content, do not pick skills, do not start work — produce brief and stop.

User already supplied clear scope → **do not run this skill** — do the work.

## Procedure and Rules

See [references/procedure.md](references/procedure.md) for:
- Brief types (Campaign, Content, Optimization, Research, Pipeline) + which template to use
- Step-by-step intake procedure (round 1 questions, gap resolution, round 2)
- Hard rules (never guess silently, cap at two rounds, no skill assignment)
- Load-bearing items per brief type — cannot be assumed or deferred
- Output shape wording by brief type

## Related Skills

- [content-ops](../content-ops/SKILL.md) — expert-panel scoring on each per-channel deliverable; natural quality gate after decomposition.
- [growth-engine](../growth-engine/SKILL.md) — runs experiments across channels in a campaign brief.
- [outbound-engine](../outbound-engine/SKILL.md) — consumes pipeline briefs directly.
