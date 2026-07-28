# Content and levels

Content = recurring fuel player consumes. Levels, encounters, cards, quests, characters, items, narrative beats — all of it. Content design fails two predictable ways: **producing too little** (game runs out fast) and **producing too much sameness** (content exists, doesn't feel like content).

## What's the content unit?

Pick *the* unit content production is measured in:

- **Levels** — handcrafted spaces (platformer, puzzle, narrative game)
- **Encounters** — combat or social setups (RPG, tactics, roguelike)
- **Cards** — reusable atoms combined by player (deckbuilder, autobattler)
- **Quests / missions** — authored objectives (open world, MMO)
- **Characters** — playable or NPCs (gacha, fighting game, roster shooter)
- **Items / loot** — gear, cosmetics, consumables (ARPG, looter shooter)
- **Story beats** — narrative chunks (visual novel, adventure game)
- **Events** — live-ops time-boxed content (GaaS, F2P)

Most games have *one* primary content unit + 1–2 secondary. Identifying primary unit tells you production-capacity bottleneck and what content cadence pipeline must produce.

## Production model

Pick how content produced:

- **Handcrafted** — designers author each unit one by one. High craft, low quantity, expensive. Good for: narrative games, premium indies, set-piece moments.
- **Procedural** — content generated from rules and parameters. Low craft per unit, high quantity, cheap to produce *but expensive to make feel good*. Good for: roguelikes, survival, replayable session games.
- **Hybrid** — handcrafted set pieces glued with procedural connective tissue. Most successful long-form games use this. Examples: handcrafted dungeons + procedural between-dungeon space; handcrafted boss encounters + procedural waves.
- **UGC (user-generated)** — players make content; team makes tools. Low marginal cost per unit, high marginal cost in tools and moderation. Good for: long-tail games, community-led titles.

Production model **must match team capacity**. 2-person team picking "handcrafted, 100 levels" ships 12 levels and exhaustion. 50-person team picking "procedural, infinite" ships samey-feeling game.

## Variety drivers

Procedural and hybrid content needs explicit variety drivers, or feels samey within hours. Drivers:

- **Mechanical variety** — different enemy behaviors, different room rules, different deck archetypes
- **Combinatorial variety** — small atoms × many combinations (like *Slay the Spire*'s relics × cards)
- **Aesthetic variety** — visual / audio / tone shifts that *feel* different even when underlying mechanics repeat
- **Narrative variety** — layer of authored context per content unit
- **Player-driven variety** — players make different choices interacting differently with same content

Right driver depends on targeted aesthetic. Discovery-aesthetic games need more *novelty* per unit. Challenge-aesthetic games need more *combinatorial* depth. Fellowship-aesthetic games need more *player-driven* variety.

## Content cadence

Live-ops games: content is *schedule*, not quantity:

- **Daily** — login rewards, one-day events, daily quests
- **Weekly** — weekly events, weekly bosses, weekly leaderboards
- **Bi-weekly / monthly** — patch cadence, balance updates
- **Seasonal** — battle pass, season story, ladder reset (typically 4–12 weeks)
- **Annual** — major content drops, expansion-level changes

Live-ops game without sustainable cadence loses players within one season. Pick cadence team can hold *for a year*, not a sprint.

## Level / encounter design pillars

For handcrafted units:

1. **Beat structure** — every level has open / build / twist / climax / resolve shape (see `level-spec-template.md`). Levels without twist feel like previous level.
2. **Verb practice** — each level exercises 1–2 verbs from design. New verbs introduced gradually; old verbs *re-used differently* in new contexts.
3. **Pacing density** — events per minute. Too few = boring. Too many = exhausting. Right density is aesthetic-dependent (action high, exploration low, cozy lowest).
4. **Failure case** — every level can be lost; loss is fair (player can attribute it); player keeps something on retry.
5. **Replay incentive** — replayable games: level differs on subsequent plays (different goal, different score, different route).

## Content density and hour-to-content ratio

Rough sanity check: does content production match play target?

- **Premium narrative game** — ~1 hour designer time per ~5 minutes play (high craft)
- **Premium replayable game** — ~1 hour designer time per ~30 minutes play (replays + content)
- **F2P / live ops** — content per hour drops over time; meta and social loops carry play hours
- **Roguelike / procedural** — content density *lower per unit* but *higher per play hour* (variety drivers do the work)

Design demands 100 hours play, team has capacity for 10 hours handcrafted content → math doesn't work. Drop play target, change production model, or shrink scope.

## Output for the design doc

In §8 of design doc:

- **Content unit** (one primary)
- **Production model** (handcrafted / procedural / hybrid / UGC)
- **Content per arc** (e.g. "20 hand-built levels in chapter 1, +60 procedural in endless mode")
- **Variety drivers** (which kinds, which carry most weight)
- **Content cadence** for live ops (or "no live ops" if not applicable)

Per handcrafted level / encounter, fill `assets/level-spec-template.md`.
