# Curve fitting

Solving for constants once curve shape chosen.

## The core problem

You have:
- Chosen shape (linear / exponential / polynomial / log / stepped / capped / resetting)
- Design intent ("median player reaches L60 in 50 days")
- Player profile data (sessions/day, plays/session, earn rate per play)

You need:
- Concrete constants (e.g. `a = 100, r = 1.18` for `cost = a * r^(L-1)`)
- Validation that constants produce intent across multiple profiles

## Step-by-step

1. **Convert intent into quantity.** "L60 in 50 days" → "total_xp(L60) divided by xp_per_day = 50."
2. **Compute earn-per-day per profile.** Median: 3 sessions × 1000 XP/session = 3000 XP/day.
3. **Pick starting growth rate.** Exponential XP: start at `r = 1.18`.
4. **Solve for `a`** (L1 → L2 cost) such that `cumulative(60) / earn_per_day = 50`.
5. **Validate against other profiles.** Hardcore (6 × 1500 = 9000 XP/day) should reach L60 in ~17 days. Casual (1.5 × 800 = 1200 XP/day) in ~125 days. Numbers don't match intent for those profiles → *curve shape is wrong* — don't keep tuning constants.
6. **Plot it.** Visual sanity check that curve matches chosen shape.
7. **Document the math.** Future re-tunes need to know what was solved for.

## Common parameterizations

### Exponential

`cost(L) = a * r^(L-1)`

`cumulative(L) = a * (r^L - 1) / (r - 1)`

Picking `r`:
- Gentle growth: 1.10–1.15 (RPG XP, social games)
- Standard growth: 1.15–1.20 (most action games)
- Steep growth: 1.20–1.30 (challenge-aesthetic; players opt in)
- Avoid `r > 1.30` unless design *intentionally* wants late-game grind

### Polynomial

`cost(L) = a * L^k`

`cumulative(L) ≈ (a / (k+1)) * L^(k+1)` (for `L` large)

Picking `k`:
- `k = 1.5`: gentle
- `k = 2`: quadratic — late game ~4× a level halfway through
- `k = 2.5–3`: cubic — much steeper

Polynomial often good "between linear and exponential" choice when exponential overshoots.

### Logarithmic (mastery / diminishing returns)

`progress(t) = a * log(b * t + 1)` or `mastery(plays) = a * sqrt(plays)` (similar shape, simpler math)

Picking `a` and `b`:
- `a` controls *ceiling* (asymptotic max)
- `b` controls *steepness* (how quickly player approaches ceiling)

Logarithmic is for *skill or mastery* — each additional play teaches less than last. Bad for content unlocks.

### Stepped

Piecewise. Pick:
- **Tier intervals** (every 5 levels, every 10 levels, every quarter of curve)
- **Tier costs** (often exponential between tiers, sudden jump at boundary)
- **Tier rewards** (named, distinct, narratively meaningful)

Keep tier count low — 5–10 tiers typical. 20+ tiers feels arbitrary.

## When the constants don't fit

No constants produce intent across all profiles → constraints conflict:

1. **Shape is wrong.** Try different shape.
2. **Intent unrealistic.** 50-day median arc with 17-day hardcore arc = 3× spread. Design wants 2× spread → less-steep curve. Design wants 5× spread → steeper curve.
3. **Earn rates wrong.** Recheck `xp_per_play` — might need different value.
4. **Design intent has hidden assumptions.** "Median reaches endgame in 50 days" might assume daily play. Weekend player takes much longer.

Stuck → push back to `game-systems-designer` with conflict surfaced explicitly.

## Solver tools

- **Spreadsheet goal-seek / solver** — fine for single-variable problems
- **Python `scipy.optimize`** — multi-variable, multi-constraint
- **Custom one-off scripts** — often fastest path; don't over-engineer
- **By inspection** — simple problems, 1–2 levers: iterate manually

Tool doesn't matter; *math* matters. Well-modeled spreadsheet beats poorly-modeled solver every time.

## Cross-validation

After fitting:

- **Plot** curve; visually matches intended shape
- **Run through profiles table** — every profile hits design intent for that profile
- **Check sensitivity** — ±20% on key constants; how badly does model break?
- **Compare to comp titles** — curve 3× steeper than every comp → design intent unusual or curve wrong

## Output

Per fitted curve, capture:
- **Final constants** with units
- **Source equation** (re-derivable)
- **Earn-rate assumption** per profile (re-tune knows what to revisit)
- **Days-to-cap prediction** per profile (live data has target)
- **Sensitivity** on top 2 constants
