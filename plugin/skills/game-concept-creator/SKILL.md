---
name: game-concept-creator
description: "Use to generate, evaluate, refine pitch-quality game concepts — theme × mechanic × audience combinations as one-pagers. Triggers on \"game concept\", \"concept pitch\", \"ideate a game\", \"what game should we make\", \"concept one-pager\", \"elevator pitch for a game\", \"remix this concept\", or filled brief from game-design-shaper with concept still open. Produces concept one-pager (logline, fantasy, hook, target player, 3 verbs, payment rails, comparable titles, risks) consumed by game-systems-designer. Stops at pitch — no systems design, balance, design docs. For systems design see game-systems-designer; for intake shaping see game-design-shaper; for generic ideation see idea-refine."
---

# Game Concept Creator

Turn fuzzy game brief (or single sentence) into one or more **concept one-pagers** downstream skills (`game-systems-designer`, `game-balancer`, `game-monetization-strategist`, `iap-manager`, `game-marketer`) act on. You are pitcher, not designer. Produce loglines, fantasies, hooks, risks — do not specify mechanics in detail or define numbers.

Good concept one-pager survives *elevator test*: stranger reads it in 60 seconds, describes game back to you. If they can't, concept not ready for systems work.

## When this skill applies

- Brief from `game-design-shaper` arrives with target player, fantasy hint, payment rails captured — no concrete pitch.
- User wants to **explore options** ("give me 5 concepts that fit this brief").
- User wants to **stress-test** existing concept against alternatives or remixes.
- User wants to **refine** half-written pitch into something publisher / partner / team can react to.

User already has locked concept, ready to define systems? **Skip this skill**, go to `game-systems-designer`.

## Procedure

1. **Read brief or initial idea** end-to-end. Identify what's locked (target player, platform, payment rails, scope) vs open (theme, mechanic, hook).

2. **Payment rails not in input? Ask first.** Use `AskUserQuestion`. Payment rails are hard constraint on which concepts even shippable. Web2 IAP / web2 ads / web2 subscription / web3 tokens / web3 NFTs / hybrid / none — plus jurisdictional or platform constraints. **Do not generate concepts blind to this.** See `references/payment-rails-decision.md` for how rails shape concepts.

3. **Diverge.** Generate 5–10 candidate concepts, each a *single line*: `[Genre] where you [verb] to [goal] in [setting] with [twist]`. Use `references/concept-frameworks.md` for combinatorial sources (theme × mechanic × audience). Push for *range* — do not converge yet.

4. **Converge.** Present 5–10 candidates to user, ranked by fit against brief. Ask which 1–3 to expand. Use `AskUserQuestion`.

5. **Expand chosen concept(s).** Per concept, fill `assets/concept-one-pager-template.md`. One concept per one-pager — do not stack.

6. **Stress-test each one-pager** against `references/concept-stress-tests.md` (hook, fantasy clarity, comp differentiation, payment-rails fit, scope realism, risk inventory). Note failed tests in one-pager's `Risks` section — do not silently fix.

7. **Output one-pager(s)** in fenced markdown blocks. Add one line above each: *"Here is concept '[title]'. Pass to `game-systems-designer` to start systems work, or remix with `game-concept-creator` again."* Then stop.

## Universal rules

- **Logline non-negotiable.** Every concept needs `[Genre] where you [verb] to [goal] in [setting] with [twist]` line. Can't write it → concept not ready.
- **Fantasy first, then mechanic.** "You are a __" before "you press __ to __". Mechanics serve fantasy; mechanics-first pitching produces forgettable concepts.
- **Three verbs maximum.** Concept with five verbs is five concepts. Force a cut.
- **Payment-rails fit is hard test.** Concept requiring session-based microtransactions can't ship as one-time premium; concept depending on long grind sessions can't ship as F2P with aggressive ad walls. Surface conflict.
- **Comp titles mandatory.** Name 2–3 comparable games. "Like nothing else" is almost always a lie or a red flag.
- **Risks are first-class.** Every one-pager names top 1–3 risks (mechanical, market, platform, technical, regulatory). Concept without risks listed hasn't been thought through.
- **Web3 is constraint, not concept.** "It's like X but with NFTs" is not a concept. Concept is fantasy and verb; web3 is rails decision that may or may not serve it.
- **Stop at pitch.** Do not draft systems, balance numbers, define IAP catalogs, or write design docs. Hand off.

## References

- [references/concept-frameworks.md](references/concept-frameworks.md) — theme × mechanic × audience combinatorics, MDA pre-thinking, fantasy archetypes
- [references/payment-rails-decision.md](references/payment-rails-decision.md) — how rails (none / IAP / ads / subscription / tokens / NFTs / hybrid) shape what concepts can ship
- [references/concept-stress-tests.md](references/concept-stress-tests.md) — elevator test, hook test, comp-differentiation test, rails-fit test, scope test, risk inventory

## Assets

- [assets/concept-one-pager-template.md](assets/concept-one-pager-template.md) — canonical concept output
- [assets/concept-batch-template.md](assets/concept-batch-template.md) — presenting 5–10 candidate loglines before convergence

## Related skills

- [game-design-shaper](../game-design-shaper/SKILL.md) — produces brief this skill consumes
- [game-systems-designer](../game-systems-designer/SKILL.md) — consumes concept one-pager, starts systems work
- [game-monetization-strategist](../game-monetization-strategist/SKILL.md) — consumes payment-rails decision captured here
- [game-marketer](../game-marketer/SKILL.md) — store page and trailer hook should descend from concept logline
- `idea-refine` — generic divergent/convergent ideation; use upstream when *idea itself* (not just game pitch) fuzzy
- [content-ops](../content-ops/SKILL.md) — expert-panel scoring of one-pager before committing to systems work
- `deck-generator` — turn one-pager into pitch deck for publishers / investors
