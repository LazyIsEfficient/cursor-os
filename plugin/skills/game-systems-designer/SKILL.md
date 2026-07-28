---
name: game-systems-designer
description: Use when designing game systems from locked concept — core loops, meta loops, player verbs, progression, content systems, level structure, narrative integration. Triggers on "game design doc", "GDD", "system spec", "core loop design", "progression design", "level design", "MDA", "design the systems", or one-pager from game-concept-creator. Produces design doc plus per-system specs that game-balancer numbers, game-monetization-strategist prices, iap-manager stocks, godot-engineer (or another engine team) builds. Stops at design — no number tuning, pricing, or engine code. For balance numbers see game-balancer; for monetization model see game-monetization-strategist; for the engine implementation see godot-engineer; for game UX see ux-design.
---

# Game Systems Designer

Turn locked concept (one-pager from [game-concept-creator](../game-concept-creator/SKILL.md)) into **design** downstream skills can build, balance, monetize, ship. Produce: design doc, per-system specs, loop diagrams, progression structure, level/content framework. Do not pick numbers (`game-balancer`), pick monetization model ([game-monetization-strategist](../game-monetization-strategist/SKILL.md)), or write engine code (`godot-engineer`).

Concept still open? **Stop**, route to [game-concept-creator](../game-concept-creator/SKILL.md). Systems locked, team wants numbers tuned? **Stop**, route to `game-balancer`.

## Procedure

1. Read concept one-pager end-to-end (fantasy, aesthetics, player verbs, payment rails, comp titles).
2. Apply MDA backwards — *aesthetics* → *dynamics* → *mechanics*. See [references/mda-framework.md](references/mda-framework.md).
3. Specify core loop — see [references/core-loops-and-progression.md](references/core-loops-and-progression.md). One core loop only.
4. Specify meta loops — what carries between sessions; each must connect back to core loop.
5. Specify player verbs — per verb (max 3): input, representation, feedback, failure mode, depth axis. See [references/player-verbs.md](references/player-verbs.md).
6. Specify content systems — type, volume per arc, variety source. See [references/content-and-levels.md](references/content-and-levels.md).
7. Specify narrative integration — delivery method, minimum narrative needed. See [references/narrative-and-pacing.md](references/narrative-and-pacing.md).
8. Specify failure and onboarding — see [references/onboarding-and-failure.md](references/onboarding-and-failure.md).
9. Fill `assets/design-doc-template.md` — canonical design output.
10. Fill `assets/system-spec-template.md` once per major system.
11. Validate cohesion — see [references/cohesion-checklist.md](references/cohesion-checklist.md). Every system must answer "what does this make better in the rest of the game?"
12. Hand off to `game-balancer`, [game-monetization-strategist](../game-monetization-strategist/SKILL.md), `iap-manager`, `godot-engineer`, `ux-design`, [game-marketer](../game-marketer/SKILL.md).

## Universal Rules

- Aesthetics first, mechanics last
- One core loop; two means one is meta
- Three player verbs maximum
- Every system must compound — system that makes no other better gets cut
- Failure is a system — design how it feels fair, what players take from it
- Numbers are placeholders — use `<TBD by game-balancer>` for damage values, XP curves, drop rates
- Pricing is not a system — no dollar values or store SKUs in design doc
- Stop at spec — no engine code, shaders, or networking

## Related Skills

- [game-concept-creator](../game-concept-creator/SKILL.md) — produces one-pager this skill consumes
- [game-balancer](../game-balancer/SKILL.md) — tunes numbers in system specs
- [game-monetization-strategist](../game-monetization-strategist/SKILL.md) — picks model fitting systems
- [iap-manager](../iap-manager/SKILL.md) — catalogs SKUs design implies
- [game-marketer](../game-marketer/SKILL.md) — positions game using design's strongest hooks
- [godot-engineer](../godot-engineer/SKILL.md) — builds design in Godot 4 + C#
- `ux-design` — designs screens, flows, microcopy on top of systems
- [content-ops](../content-ops/SKILL.md) — expert-panel scoring of design doc before committing to build
