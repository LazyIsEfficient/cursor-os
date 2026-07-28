# MDA — Mechanics, Dynamics, Aesthetics

MDA framework (Hunicke, LeBlanc, Zubek, 2004) = discipline keeping game *feeling like its pitch*. Designers see Mechanics → Dynamics → Aesthetics; players experience reverse. Designing in player's direction (aesthetics first) stops game shipping with great mechanics that add up to nothing.

## The three layers

- **Mechanics** — rules of game. Inputs, outputs, state transitions, win/lose conditions, numbers. What engineer implements.
- **Dynamics** — runtime behavior as players interact with system. Emergent patterns: arms races, racing-for-resources, deceptive bluffing, tension-and-release.
- **Aesthetics** — player's emotional response. What game *feels like* to play.

Designer's job: start at *aesthetic*, work back through *dynamics* producing it, only then write *mechanics* producing those dynamics.

## The eight aesthetics (LeBlanc)

Starter vocabulary. Game can promise more than one, but needs **one or two dominant** aesthetics — anything more fragments pitch.

1. **Sensation** — sensory pleasure (juice, feel, screen shake, audio impact)
2. **Fantasy** — make-believe (you *are* a wizard / spy / chef)
3. **Narrative** — drama unfolding (story beats, character arcs)
4. **Challenge** — obstacle course (mastery, skill ceiling)
5. **Fellowship** — social framework (community, belonging)
6. **Discovery** — uncharted territory (novelty, exploration, surprise)
7. **Expression** — self-discovery (creativity, identity, customization)
8. **Submission** — pastime (mindless flow, killing time)

## Designing backwards

Wrong order: "let's add a crafting system, a skill tree, and a faction reputation." Mechanics-first. You ship game with three systems, no idea what it feels like.

Right order:

1. **Pick the aesthetic.** "We want this game to feel like the *Discovery* of poking at an indifferent system + the *Expression* of building a personal identity inside it."
2. **Specify the dynamics.** "Players should encounter unexplained behavior that rewards experimentation. Players should make hundreds of small visible choices that compound into a recognizable personal style."
3. **Write mechanics producing those dynamics.** Now crafting system, skill tree, faction reputation either earn their place (produce chosen dynamics) or get cut.

Mechanic doesn't produce dynamic producing aesthetic in design doc → **cut the mechanic**. Single most useful test in systems design.

## Common mismatches

- **Pitched as "Fellowship"** (social, belonging) but mechanics all single-player. Dynamics never produce aesthetic.
- **Pitched as "Challenge"** (mastery) but every action succeeds with one button press. Dynamics produce *Submission*, not *Challenge*.
- **Pitched as "Discovery"** but quest log tells player exactly where to go. Dynamics produce checklist, not exploration.
- **Pitched as "Expression"** but customization purely cosmetic, invisible to others. Expression needs audience.

Not bugs in mechanics — MDA-misalignments. Fix at dynamics layer, not by adding more mechanics.

## When MDA is the wrong tool

MDA weak at:

- **Narrative-led games** — authored story beats matter more than emergent dynamics. Use it to design *systems-around-the-story*, not story itself.
- **Pure social/cultural design** (matchmaking culture, community moderation, tournament structure) — dynamics emerge from *players*, not system.
- **Live-ops cadence** — meta-game is operator's calendar, not in-game systems.

For those, supplement with player-research methods (`ux-research`) and content-strategy thinking.

## Output

Every design doc explicitly names:
- 1–2 dominant aesthetics
- 1–2 supporting aesthetics
- Aesthetics *not* targeted (as important as what *is* targeted)
- Per aesthetic: dynamics that should produce it, mechanics that should produce those dynamics

Designer can't write that chain → game is mechanics-first, ships as mechanics-first.
