# PvP balance

PvP balance differs qualitatively from PvE. Opponents *adapt* to your tuning. "Right" balance produces *healthy meta* — rarely the one where every option has 50% win rate.

## Symmetric vs asymmetric

- **Symmetric** — both sides start identical (StarCraft 1v1 mirror, fighting game mirror). Internal balance question: "do all actions / units / characters have equal viability?" Easier to reason about; usually less interesting at top level.
- **Asymmetric** — sides differ (races / characters / classes / starting hands). Balance question: "do *match-ups* across roster produce healthy meta?" Harder; usually more interesting; needs more telemetry.

Symmetric vs asymmetric is *design* call, not balance call. Balance the game you have.

## What "balanced" actually means

PvP goals, usually:

1. **No dominant strategy.** No single approach wins regardless of opponent.
2. **Multiple viable archetypes.** Several distinct competitive ways to play at top level.
3. **Skill expression.** Better player wins more often, not 100% of time.
4. **Comeback potential.** Losing positions recover (sometimes), not arbitrarily.
5. **Meta health.** *Commonly chosen* options stay interesting — not stale, not chaotic.

50% win rate on every character ≠ balanced — can mean "everyone mediocre" or "everyone interchangeable." 45–55% spread across roster with distinct archetypes usually healthier.

## Win rate, pick rate, ban rate

Three interacting metrics:

- **Win rate** — % matches won when option picked
- **Pick rate** — % matches where option picked
- **Ban rate** — % matches where option banned (if ban system exists)

Patterns:
- **High WR + high PR** — overpowered; nerf candidate
- **High WR + low PR** — sleeper / niche; investigate low pick rate
- **Low WR + high PR** — popular but weak; players love it even when it loses
- **Low WR + low PR** — dead; buff candidate or rework

Don't tune on win rate alone. 53% WR at 5% PR = fine. 51% WR at 40% PR = dominating meta despite "balanced" win rate.

## Skill bracket disaggregation

Win/pick rates differ wildly by skill bracket:
- 45% low skill, 60% high skill = *high-skill-ceiling* character. Buff at low, leave alone at high.
- 60% low, 45% high = *low-skill-floor*. Nerf at low (often remove braindead options), leave alone at high.

Balance pass using *aggregate* numbers across brackets fixes high-skill perceptions and breaks low-skill experience, or vice versa.

## Matchmaking interactions

PvP balance entangled with matchmaking. Balance changes right in isolation can break match quality:

- **Skill-based matchmaking + DDA.** Balance change making one character easier nudges matchmaker; users matched with weaker opponents; win rate rises; change looks worse than it is.
- **New player onboarding.** New players don't know what's strong; veteran-tuned balance pass makes new players bounce off characters veterans know are great.
- **Smurfs / bots.** Both inflate apparent win rate of "new" accounts. Balance read on lowest brackets contaminated.

Coordinate with matchmaking team (or relevant code in `godot-engineer`'s domain) before drawing conclusions.

## Patch cadence

PvP balance = *cadence* discipline:

- **Too rare** (yearly patches) — meta calcifies, players burn out
- **Too frequent** (weekly nerfs) — players can't develop skill; top players never feel mastered
- **Just right** — major patch every 4–8 weeks, hotfixes for emergencies

Each patch should:
- Address most distorted match-ups
- Avoid simultaneous large changes to multiple options (can't attribute meta shift)
- Communicate transparently — patch notes are part of social contract

## Buff over nerf, when possible

Two options out of balance → buff-the-weaker or nerf-the-stronger.

- **Buffing** — usually better received. Adds power; players feel rewarded.
- **Nerfing** — more reliable for meta health. Strongest option stays meta until it isn't.

Use both; lean buffs for first attempts, nerfs only when buffs would create roster-wide power creep.

## Counter-pick design

Healthy asymmetric PvP includes intentional counter-picks: A loses to B, B loses to C, C loses to A. Players learn matchup chart, pick adaptively.

- **Hard counters** — interesting once or twice per roster. More → game becomes "pick the counter, win."
- **Soft counters** — how most matchups should work. Small archetype-based advantage, not instant win.

Matchup matrix with many 70-30 cells → meta degenerates to "pick right counter." Aim most cells 45-55, few intentional 60-40s for archetypal flavor.

## Output

For PvP balance:
- **Matchup matrix** with target win rates per cell
- **Per-option WR / PR / BR table** with skill-bracket disaggregation
- **Patch plan** — which options to touch, how much, predicted impact
- **Telemetry contract** — match outcomes, picks, bans, per-bracket
- **Comms plan** with [game-marketer](../../game-marketer/SKILL.md) — patch notes are content
