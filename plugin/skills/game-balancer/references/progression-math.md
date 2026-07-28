# Progression math

Choose curve **shape** before solving **constants**. Shape says what player journey *feels* like; constants set how long it takes.

## Common curve shapes

### Linear

`cost(level) = a + b*(level)`

- **Player feel:** every level costs same. Predictable. No acceleration.
- **Use for:** short games (≤10 levels), narrative-led games, tutorials.
- **Avoid for:** long games — late game has no weight.

### Exponential

`cost(level) = a * r^(level-1)` where `r > 1` (commonly 1.10–1.25)

- **Player feel:** late levels take meaningfully longer than early. Strong early progression sense; mountain-to-climb late.
- **Use for:** RPGs, MMOs, GaaS leveling.
- **Avoid for:** competitive PvP where late-level players hold permanent stat advantage and early/late can't match-make.
- **Common `r` values:** 1.10 (gentle), 1.18 (standard), 1.25 (steep). >1.30 starts feeling grindy.

### Polynomial / power

`cost(level) = a * level^k` where `k > 1` (commonly 1.5–2.5)

- **Player feel:** grows faster than linear, slower than exponential. Mid-late game stretches without punishing.
- **Use for:** XP curves where exponential too steep, linear too flat.

### Logarithmic

`progress(time) = a * log(b * time + 1)`

- **Player feel:** lots of progress early, slowing down. Honeymoon shape.
- **Use for:** mastery curves, skill ratings, idle-game prestige.
- **Avoid for:** content unlocks (player feels stuck mid-game).

### Stepped

`cost(level) = piecewise(level)` — long flats interrupted by sudden jumps

- **Player feel:** "tier-ups" — mostly smooth progress, periodic wall, breakthrough, big jump.
- **Use for:** gear tiers, prestige systems, ranked ladders, season tiers (battle pass).
- **Avoid for:** core XP driving moment-to-moment play (wall feels arbitrary).

### Capped

`cost(level) = formula until level <= cap; afterwards = ∞ (or alt path)`

- **Player feel:** "I finished the season." Closure. Next season opens.
- **Use for:** seasonal content, time-bound progression, anti-burnout in PvP.
- **Always pair with** alternative aspirational goal at cap (mastery, prestige, cosmetic, status badge).

### Resetting

Cap with periodic reset to baseline.

- **Player feel:** "fresh start." Re-engagement opportunity.
- **Use for:** roguelike runs, ladder seasons, prestige loops, battle pass cycles.
- **Risk:** reset costs too much (e.g. all gear lost) → players feel cheated. Costs too little (no real loss) → reset has no narrative weight.

## Picking the shape

| If the design wants ... | Pick |
|---|---|
| Simple, short-arc progression | Linear |
| RPG-style "the climb gets steeper" | Exponential |
| Mid-game stretching without grind | Polynomial |
| Mastery / diminishing returns | Logarithmic |
| Tier-ups with breakthroughs | Stepped |
| Bounded seasonal content | Capped |
| Repeatable fresh starts | Resetting |

Combine shapes: e.g. exponential XP to L60, then capped + alt-mastery curve after. Most live games = *layers* of curves, not single curve.

## Solving for constants

Given chosen shape + design intent ("median player reaches L60 in 50 days at 3 sessions/day, 1000 XP/session"):

1. Compute total XP needed: `cumulative_xp(60)` for chosen shape and growth rate
2. Compute XP/day for median profile: `sessions/day × XP/session = 3000 XP/day`
3. Compute days to L60: `total_xp / 3000 = days`
4. Adjust growth rate or starting cost until days matches intent (here, 50)

For exponential `r`:

- `r = 1.10` → gentle late-game; total XP for 60 levels at `a = 100` ~30,400 → ~10 days at 3000 XP/day. Too fast.
- `r = 1.18` → moderate climb; total XP ~187,000 → ~62 days. About right.
- `r = 1.22` → steep climb; total XP ~530,000 → ~177 days. Too slow.

Solving by inspection. Complex multi-curve systems → spreadsheet solver or 10-line script.

## Reward map placement

Rewards land at *significant* tiers, not arbitrary:

- **First reward** — within first 10–20 minutes of play (onboarding completion)
- **First "wow" reward** — within first 2–3 sessions (validates meta loop)
- **Mid-arc unlock** — curve midpoint (rotates play experience)
- **Capstone reward** — at cap ("I made it" moment)

Reward at every tier dilutes meaning. Reward at no tier feels grindy. Place rewards where *curve naturally creates emotion* (after steep climb, at tier-up, first day of season).

## Pity systems and pseudo-random distribution

Random-drop progression (loot, gacha, gambling-adjacent):

- **True random** — each attempt independent. Players hate true random for rare items; variance too large.
- **PRD (pseudo-random distribution)** — hit probability increases per miss; hit resets counter. Used in *Dota 2*, etc.
- **Hard pity** — guaranteed drop after N consecutive misses. Caps frustration.
- **Soft pity** — drop rate ramps from N misses, before hard pity at M.
- **Cross-pull pity** — pity counter persists across sessions / banners. Players treat as ownership of progress.

Document algorithm. Disclose drop rates where jurisdiction requires. *Don't* hide algorithm relying on player ignorance — it leaks; trust harder to recover than build.

## Power creep

Each new content drop at least as strong as last. Over many drops:
- Old content feels useless
- Returning players fall behind
- Skill ceiling becomes power-floor

Defenses:
- **Sideways content** — new drops add *options*, not raw power
- **Rotating buffs / nerfs** — meta cycles keep older content viable
- **Power resets** — seasonal resets, prestige systems
- **Gating new content behind older content** — old gear keeps long-tail purpose

## Output

Per curve in design:
- Filled `progression-curve-skeleton.md`
- Chosen shape and intent it serves
- Constants and math producing them
- Curve plot (visual sanity check)
- Reward map per tier
- Sensitivity to growth-rate and earn-rate variation
