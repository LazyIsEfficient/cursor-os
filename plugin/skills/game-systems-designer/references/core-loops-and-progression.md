# Core loops and progression

Game = stack of loops. Shortest loop runs in seconds; longest runs across months of live ops. Designing a game is mostly **picking right loops at right tempos and making sure they connect**.

## Anatomy of a loop

Every loop has same five parts:

1. **Decision** — player makes a choice (with meaningful trade-offs).
2. **Action** — player executes the choice.
3. **Feedback** — system responds (visual, audio, state change).
4. **Reward / consequence** — loop produces something player keeps.
5. **Context for the next decision** — world now slightly different; next decision informed by last.

Any of five missing → loop broken:
- No real decision → chore, not game.
- No clear feedback → player feels disconnected.
- No reward → no reason to repeat.
- No new context → next decision identical to last; game repetitive in bad way.

## The core loop

**Core loop** = activity player does *most often*; rest of game wraps around it. Roguelike: kill enemies → pick power → enter next room. Card game: play turn → draw → respond. City builder: place buildings → wait for ticks → upgrade.

Core loop rules:

- **One core loop, not two.** Two "core" loops → one is meta (longer cadence) or two minigames glued together.
- **Loop length: seconds to a few minutes.** Longer = meta loop.
- **Player runs this loop hundreds of times per session.** If not, it's not core.
- **Fun on its own**, no progression. Power, narrative, progression amplify fun loop. They cannot make boring loop fun.

## Meta loops

Meta loops carry between sessions. *Reason to come back*. Common kinds:

- **Vertical progression** — player gets stronger (XP, levels, gear, mastery)
- **Horizontal progression** — player gets more options (unlocks, characters, builds)
- **Collection** — player completes a set (cards, achievements, NPCs befriended)
- **Narrative** — story beats unlock as player proceeds
- **Social** — clans, leaderboards, friend lists, shared seasons
- **Seasonal / live ops** — limited-time content drops on schedule

Meta loop rules:

- **Each meta loop must connect back to core loop.** Progression should change *how player runs core loop*, not just *that they run it more*.
- **One to three meta loops, not five.** Too many fragments player attention; they progress in nothing.
- **Cadence matters.** Vertical progression every few minutes (early), then every few hours (mid), then every few sessions (late). Live-ops on fixed weekly/seasonal beat. Cadence schedules player's life around game.

## The loop-of-loops

Long-life games (live ops, MMOs, GaaS) have **loop-of-loops** layer above meta:

- **Daily** — log in, claim, run few core loops, hit daily target
- **Weekly** — finish weekly quest, climb a tier, raid night
- **Seasonal** — battle pass, season story, ladder reset
- **Annual / arc** — major content drops, expansion-level changes

Each layer must *reward returning at that cadence*. Game with no weekly hook loses player by week three.

## When to add a third loop

Most concepts need exactly two loops: core + one meta. Adding third (often collection or social loop) appropriate when:

- Dominant aesthetic is **Fellowship** or **Expression** (third loop carries social/identity weight).
- Game is **service-shaped**, needs daily/weekly/seasonal cadences.
- Team has **content production capacity** to feed third loop.

Third loop is *not* fix for weak core loop. Players bounce off core → more meta makes it worse, not better.

## Progression curves (design intent only — numbers from `game-balancer`)

Capture curve *shape* in design, not values:

- **Linear** — each level / tier costs same (rare; usually only short games)
- **Exponential** — each level costs N× the last (XP grinds, RPG levels)
- **Stepped** — long flats interrupted by sudden spikes (gear tiers, prestige systems)
- **Capped** — progression has hard ceiling (skill mastery, season-long ladders)
- **Resetting** — progression resets each run / season (roguelikes, ladder seasons)

Shape choice constrains possible player journey. Match curve to target aesthetics.

## Anti-patterns

- **Progression treadmill** — players grind for upgrades that only let them grind faster for next upgrade. Dynamic is *Submission*, not *Challenge* or *Discovery*. Fine for cozy games; lethal for action games pitched as challenge.
- **Choice that isn't** — "decision" in loop has one obviously correct answer. Cut alternative, shorten loop.
- **Loop without hook back** — meta loop unlocks something, but unlock doesn't change *how* player runs core loop. Player progresses; play stays same; player leaves.
- **Two cores in a trench coat** — two loops at same cadence (e.g. combat + base-building both session-length). Players can't context-switch fast enough; one loop withers.

## Output for the design doc

Per loop:

- **Name** and **layer** (core / meta / loop-of-loops daily / weekly / seasonal)
- **Length** (seconds / minutes / hours / days)
- **The five parts** (decision / action / feedback / reward / context for next)
- **Connection** — how this loop changes player behavior in *other* loops
- **Curve shape** (if it carries progression) — without numbers
