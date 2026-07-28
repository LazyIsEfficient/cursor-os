# Balance pass types

Five common balance-work kinds. Pick one before opening spreadsheet.

## 1. Economy balance

**Signal:** design has currencies, sources, sinks; team needs rates.

**Inputs:** system specs touching currency; player profiles; ARPDAU / LTV target (from [game-monetization-strategist](../../game-monetization-strategist/SKILL.md)); intended player lifetime.

**Outputs:** filled `economy-spreadsheet-skeleton.md`; per-currency velocity tables; time-to-content predictions; sensitivity analysis on top 3–5 levers.

**Pitfalls:**
- Tuning for median player only (whales bored, free quits)
- Ignoring time horizon (works week 1, breaks week 8)
- Designers setting "feels right" numbers without modeling

## 2. Progression balance

**Signal:** design has XP / levels / tiers / mastery; team needs curve.

**Inputs:** intended arc length (hours / sessions / days); intended reward map; comp curves to anchor against.

**Outputs:** filled `progression-curve-skeleton.md` per curve; reward map with each tier's role; sensitivity on growth rate and earn rate.

**Pitfalls:**
- Picking constants before curve shape
- Reward map disconnected from design's verbs and aesthetic
- Forgetting multiple play-rate cohorts (hardcore vs casual)

## 3. Difficulty balance

**Signal:** design is challenge-aesthetic; team needs encounter / level / boss tuning.

**Inputs:** verb depth axis from `game-systems-designer`; intended skill curve; failure design from design doc.

**Outputs:** difficulty curve plotted; per-encounter tuning; flow-channel analysis (skill vs challenge over time); telemetry validating fairness.

**Pitfalls:**
- Tuning to team's own skill (developer playtest bias)
- Confusing difficulty with grind (grind is *length*, not difficulty)
- No DDA / rubber-banding plan when difficulty band narrow

## 4. Content balance

**Signal:** design has variety drivers (cards, items, characters, levels); team needs no dominant strategy.

**Inputs:** content list; verb support per item; intended role of each item in meta.

**Outputs:** matchup matrix (or analog); per-item win-rate / pick-rate target; power-creep sensitivity; meta health plan.

**Pitfalls:**
- Internal balance (no item strongest) without external balance (meta funnels to 3 builds)
- Power creep across content drops
- "Just nerf" reflex when right answer is "buff alternatives"

## 5. Live re-tune

**Signal:** game live; data shows drift; re-tune needed without breaking trust.

**Inputs:** live telemetry; original model; player community expectations.

**Outputs:** re-tune plan (`live-rebalancing.md`); rollout plan (A/B if possible); rollback plan; comms plan with [game-marketer](../../game-marketer/SKILL.md); cross-check with `iap-manager` if catalogs touched.

**Pitfalls:**
- Silent nerfs to monetized content (NFTs, premium gear) without comms — destroys trust
- Re-tuning without A/B when population large enough to test
- Not updating model — next re-tune flies blind

## Cross-cutting

Balance pass usually does **one** of these well at a time. All five in one pass = changes individually defensible, collectively incoherent.
