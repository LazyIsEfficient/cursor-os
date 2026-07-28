# Player verbs

Verb = what player *does*. Every system exists to support a verb (or gets cut). Every verb has same anatomy. Imprecise verb specs ship games where "controls feel weird" — usually verb-design problem misdiagnosed as tuning problem.

## Verb anatomy

Per verb (max three):

1. **Input** — literal player action (button, gesture, drag, decision under time pressure)
2. **Representation** — what player sees / hears in response (animation, particles, audio, screen feedback)
3. **Feedback** — what tells player *whether action worked, and how well* (numbers, hit-stop, juice, audio pitch, visual escalation)
4. **Failure** — how verb can fail, what failing feels like (whiff, miss, overcommit, cancelled)
5. **Depth axis** — how verb *grows* across play arc (timing → reading → mind games → optimization)

Verb missing any of these feels mushy.

## The depth axis (often missed)

Verb without depth axis = verb player gets bored of. Examples:

- **Punching** in beat-em-up — Depth: combo timing → enemy-type-specific responses → resource management (super meter) → spacing and hitboxes
- **Building** in city builder — Depth: placement → adjacency bonuses → supply chains → optimization for endgame goals
- **Negotiation** in RPG — Depth: dialogue choices → reading characters → maintaining personae across factions → triggering long-term consequences

Can't name 3–4 depth levels for a verb → verb shallow, player exhausts it in first hour. Deepen it or drop it.

## Three verbs maximum

Why three:
- Each verb needs **input space** (buttons, screen real estate, control schemes). More than three → controls fight themselves.
- Each verb needs **content** exercising it. More than three → content production explodes.
- Each verb needs **mastery time**. Players have finite attention budget for learning verbs in first hours.

Design with more than three "core" verbs? Some are actually:
- **Sub-verbs** (variations on primary verb — "dash" is sub-verb of "move")
- **System interactions** (player isn't doing them; they're picking what system does)
- **Meta-verbs** (between sessions — "build a deck" is meta-verb to "play a card" core verb)

Refactor until three. Can't → concept has too many ideas (back to [game-concept-creator](../../game-concept-creator/SKILL.md)).

## Verbs vs features

Common mistake: listing features as verbs.

| Feature (wrong) | Verb (right) |
|---|---|
| Skill tree | Specialize |
| Crafting | Combine |
| Multiplayer | Coordinate / compete / deceive |
| Achievements | Collect |
| Quests | Pursue |
| Dialogue | Persuade / interrogate |
| Inventory | Choose / discard |

Verb = what player *does mentally*, not menu they navigate. "Skill tree" with no real choice (take everything in order) supports no verb.

## The verb-mechanic-aesthetic chain

Each verb traces back to one or more aesthetics:

- **Dodge** → Sensation, Challenge
- **Build** → Expression, Discovery
- **Trade** → Fellowship, Challenge
- **Decide** (under time pressure) → Challenge, sometimes Submission
- **Read** (other players, NPCs) → Fellowship, Discovery
- **Collect** → Discovery, Submission

Verbs not tracing back to aesthetic = *features dressed as verbs*. Chain must hold all the way: MDA aesthetic → dynamic → mechanic → verb.

## Verbs and accessibility

Specify accessibility per verb:

- **Input alternatives** — keyboard, controller, touch, one-handed, accessibility hardware
- **Time pressure** — can verb be performed without time pressure (difficulty toggle)
- **Sensory channel** — does verb require seeing color / hearing audio / fine motor control
- **Cognitive load** — does verb require remembering hidden state, holding multiple things in mind

Accessibility decisions belong in verb spec, not separate end-pass. See `ux-design` for screen-level accessibility.

## Output for system specs

Per verb:

```
## Verb: <name>
- Input: <literal action — button / gesture / decision>
- Representation: <what the player sees and hears>
- Feedback: <what tells the player success/failure and how much>
- Failure: <how it can fail, and what failure feels like>
- Depth axis: <stage 1 → stage 2 → stage 3 → stage 4>
- Aesthetic supported: <which 1–2 from MDA>
- Accessibility: <input alternatives, time-pressure toggles, sensory alternatives>
```
