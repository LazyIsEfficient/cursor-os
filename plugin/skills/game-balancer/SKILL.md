---
name: game-balancer
description: Use when tuning game numbers — economy curves, progression rates, difficulty pacing, drop tables, win/loss probabilities, time-to-X targets, currency velocities, balance pass plans. Triggers on "balance pass", "tune the economy", "progression curve", "difficulty curve", "drop rate", "XP curve", "TTK", "time-to-content", "balance the economy", "spreadsheet model", "economy sim", or system spec from game-systems-designer with TBD placeholders. Produces economy spreadsheet, balance pass plan, simulation outputs, per-system tables. Stops at numbers — no system rules (game-systems-designer), no pricing (game-monetization-strategist / iap-manager). For systems design see game-systems-designer; for monetization model see game-monetization-strategist; for store catalog see iap-manager.
---

# Game Balancer

**Fill in numbers** in a system spec — economy rates, progression curves, difficulty pacing, drop tables, currency velocities — and produce spreadsheet model, simulation, balance-pass plan proving numbers hold up. Do not change system *rules* (that's `game-systems-designer`) or *prices in dollars* (that's [game-monetization-strategist](../game-monetization-strategist/SKILL.md) and `iap-manager`).

Two failure modes:

- **Vibes balance.** "It feels about right." No spreadsheet, no simulation, no monitoring plan. Economy collapses 30 days into live ops; nobody knows why.
- **Spreadsheet trance.** Beautiful model, plays terribly. Numbers prove design balanced; player feels nothing. Balance is not optimization — it is *tuning systems to produce dynamics design promised*.

Right stance: **model system in spreadsheet to reason about it; playtest model in engine to feel it; instrument live to detect drift.**

## When this skill applies

- System spec from `game-systems-designer` arrives with `<TBD by game-balancer>` placeholders.
- Team needs a curve (XP, levels, gear, season pass), no shape yet.
- Live data shows economy drifting, needs re-tune.
- New content drop changes balance, needs re-validation against existing numbers.
- Monetization decision (from [game-monetization-strategist](../game-monetization-strategist/SKILL.md)) requires economy re-tuned to fit target ARPDAU / spend pattern.

Systems themselves wrong (no tuning fixes them)? Stop, route to `game-systems-designer`.

## Procedure

1. **Read system spec(s).** Identify variables marked `<TBD>` and *design intent* attached to each ("should make the player choose X about 60% of the time", "session length impact ≈ +20%").

2. **Identify balance work type.** Use [references/balance-pass-types.md](references/balance-pass-types.md): economy balance, progression balance, difficulty balance, content balance, or live-game re-tune.

3. **Build spreadsheet model.** Use appropriate skeleton from `assets/`. Model should reproduce system *enough to predict behavior under varying inputs*. See [references/economy-design.md](references/economy-design.md) for sources / sinks / faucets / drains.

4. **Pick curve shape(s)** from [references/progression-math.md](references/progression-math.md). Linear, exponential, log, stepped, capped, resetting. Shape decision precedes constants.

5. **Solve for constants** hitting design intent + KPI floors (session length target, time-to-content X, win-rate target, ARPDAU target if provided by [game-monetization-strategist](../game-monetization-strategist/SKILL.md)). See [references/curve-fitting.md](references/curve-fitting.md).

6. **Sandbox / simulate.** Run model against representative player profiles (whale / dolphin / minnow / non-spender, casual / median / hardcore). Identify break points where system collapses (whale outpaces content; minnow bounces; mid-funnel grinds out). See [references/simulation-and-playtesting.md](references/simulation-and-playtesting.md).

7. **Write balance pass plan.** Fill `assets/balance-pass-checklist.md`. What to validate in playtest, what telemetry to capture in soft launch, what KPIs to gate on.

8. **Hand off tuned numbers.** Each system spec gets balance table appended. Each curve gets a chart. Each KPI gets target floor + alert threshold for live ops (see [site-reliability-engineering](../site-reliability-engineering/SKILL.md) patterns).

9. **Live games:** propose re-tune via [references/live-rebalancing.md](references/live-rebalancing.md) — rollout, what to watch, what to roll back if guardrail trips.

## Universal rules

- **Capture design intent before solving.** Without intent, you tune to a number team overrules when it "feels wrong." With intent, you tune to *behavior* team agreed on.
- **Pick shape before constants.** Linear vs exponential vs stepped vs capped is *qualitative* decision; pick first, then solve.
- **Always model multiple player profiles.** Balance working for median player but breaking for whales / minnows / non-spenders = broken economy shipped.
- **Always model time.** Sessions per day × days per week × weeks per arc. Most balance failures are *temporal* — content consumption rate is wrong.
- **Sources and sinks must balance over player lifetime.** Not a session. Not a week. *Intended player lifetime*. Excess sources → inflation (whales bored, world devalued). Excess sinks → frustration (players quit before next reward).
- **Spreadsheet first, engine second.** Tuning live in engine without model = tune one curve, break three others.
- **Numbers are starting point, not final answer.** Every number ships behind *measurement plan*: what telemetry validates it post-launch, what triggers re-tune.
- **Do not set prices.** Dollar prices belong to [game-monetization-strategist](../game-monetization-strategist/SKILL.md) (model) and `iap-manager` (catalog). You set *exchange rates inside game*; they set *exchange rate to real money*.
- **Do not change system rules.** Only way to balance a system is changing its rules → hand back to `game-systems-designer`, don't silently rewrite spec.
- **Symmetry is not balance.** Symmetric games (PvP) need *fairness*, not *equality*. Asymmetric balance harder; usually more interesting.

## References

- [references/balance-pass-types.md](references/balance-pass-types.md) — balance pass type (economy, progression, difficulty, content, live re-tune)
- [references/economy-design.md](references/economy-design.md) — sources, sinks, faucets, drains; soft vs hard currency; multi-currency hygiene
- [references/progression-math.md](references/progression-math.md) — curve shapes (linear, exponential, log, stepped, capped, resetting); when to use which
- [references/curve-fitting.md](references/curve-fitting.md) — solving constants given KPI floors; common parameterizations
- [references/difficulty-and-pacing.md](references/difficulty-and-pacing.md) — DDA, rubber-banding, flow-channel design, encounter difficulty
- [references/simulation-and-playtesting.md](references/simulation-and-playtesting.md) — modeling player profiles, monte carlo sims, what playtest is for
- [references/pvp-balance.md](references/pvp-balance.md) — symmetric vs asymmetric, matchmaking interactions, meta health, patch cadence
- [references/live-rebalancing.md](references/live-rebalancing.md) — retuning live game without burning trust
- [references/balance-anti-patterns.md](references/balance-anti-patterns.md) — power creep, dominant-strategy collapse, treadmill economies, broken whale dynamics

## Assets

- [assets/economy-spreadsheet-skeleton.md](assets/economy-spreadsheet-skeleton.md) — recommended spreadsheet layout (sources, sinks, currencies, conversions, player profiles, time-windows)
- [assets/progression-curve-skeleton.md](assets/progression-curve-skeleton.md) — XP / level / tier / gear curve scaffold
- [assets/balance-pass-checklist.md](assets/balance-pass-checklist.md) — validation before declaring balance pass complete
- [assets/balance-table-template.md](assets/balance-table-template.md) — per-system filled balance table appended to system spec

## Related skills

- [game-systems-designer](../game-systems-designer/SKILL.md) — produces system specs this skill numbers; receives balance tables back
- [game-monetization-strategist](../game-monetization-strategist/SKILL.md) — sets ARPDAU / LTV targets constraining economy; receives tuned economy back to validate model
- [iap-manager](../iap-manager/SKILL.md) — needs currency velocities and grind-time targets to size store SKUs and bundles
- [game-marketer](../game-marketer/SKILL.md) — uses time-to-content targets in store-page promises and soft-launch KPI floors
- [godot-engineer](../godot-engineer/SKILL.md) — implements tunable parameters as data, not magic numbers; ships telemetry validating model post-launch
- [growth-engine](../growth-engine/SKILL.md) — runs A/B tests on balance variants once live
- [site-reliability-engineering](../site-reliability-engineering/SKILL.md) — monitors balance KPIs as SLIs; alerts on drift
- [content-ops](../content-ops/SKILL.md) — expert-panel scoring of balance plan before live launch
