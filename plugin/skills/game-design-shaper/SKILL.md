---
name: game-design-shaper
description: Use to structure a vague game idea into a well-scoped game design brief before any concept, systems, balance, monetization, or marketing work begins. Triggers on "design a game", "game on X", "game idea", "prototype this", "game jam", "live game update", "game design plan", or when invoked as the /game-shape slash command. Produces a filled brief (full game, prototype, jam, or live-game update) that game-concept-creator and game-systems-designer consume. Do not use for briefs that are already well-scoped — go straight to the right execution skill. For engineering intake see prompt-shaping; for marketing intake see marketing-shaper; for course intake see course-shaper.
---

# Game Design Shaper

Turn half-formed game idea into **game brief** downstream skills ([game-concept-creator](../game-concept-creator/SKILL.md), `game-systems-designer`, `game-balancer`, [game-monetization-strategist](../game-monetization-strategist/SKILL.md), `iap-manager`, [game-marketer](../game-marketer/SKILL.md)) act on. You are intake interviewer, not designer. Do not generate concepts, define mechanics, balance numbers, pick monetization model, or write marketing copy — produce brief and stop.

User already supplied all load-bearing items? **Do not run this skill** — go straight to [game-concept-creator](../game-concept-creator/SKILL.md) (concept open) or `game-systems-designer` (concept locked).

## Procedure and Rules

See [references/procedure.md](references/procedure.md) for:
- Brief types (Full game, Prototype, Jam, Live game update) and which template to use
- Step-by-step intake procedure (round 1 questions, gap resolution, round 2)
- Hard rules (never guess silently, cap at two rounds, player verbs not feature lists, core fantasy mandatory, payment rails mandatory)
- Load-bearing items per brief type that cannot be assumed or deferred
- Output shape wording

## Related Skills

- [game-concept-creator](../game-concept-creator/SKILL.md) — consumes brief when concept still open
- [game-systems-designer](../game-systems-designer/SKILL.md) — consumes brief when concept locked
- [game-balancer](../game-balancer/SKILL.md) — number tuning once systems exist
- [game-monetization-strategist](../game-monetization-strategist/SKILL.md) — picks model based on payment rails captured here
- [iap-manager](../iap-manager/SKILL.md) — catalog and store ops if rails include IAP
- [game-marketer](../game-marketer/SKILL.md) — store pages, trailers, soft launch, communities
- [godot-engineer](../godot-engineer/SKILL.md) — implementation arm if build in Godot
- [prompt-shaping](../prompt-shaping/SKILL.md) — sibling shaper for engineering work
- [marketing-shaper](../marketing-shaper/SKILL.md) — sibling shaper for non-game marketing
- `course-shaper` — sibling shaper for teaching work
- `idea-refine` — if game *idea* itself still fuzzy, refine it first
