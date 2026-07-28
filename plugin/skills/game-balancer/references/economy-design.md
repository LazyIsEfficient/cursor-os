# Economy design

Game economy = **sources, sinks, flows between them**. Sources outpace sinks over player lifetime → world inflates. Sinks outpace sources → player feels gated, quits. Both fail.

## Vocabulary

- **Source / faucet** — anywhere currency or resource enters player's possession
- **Sink / drain** — anywhere currency or resource leaves player's possession
- **Velocity** — accumulation/depletion rate per unit time, per player profile
- **Stock** — current balance player holds
- **Flow** — net stock change per unit time
- **Conversion** — exchange between currencies / resources
- **Pity** — guarantees mitigating variance in random outcomes

## Faucet design

Sources should:
- **Connect to a verb.** Gold from killing monster = combat. Gold from clicking button = nothing.
- **Vary by activity.** Single dominant source creates grind. Multiple sources feed multiple verbs, produce variety.
- **Have caps for live ops.** Daily / weekly caps prevent botting, rate-limit abusive playstyles.
- **Differ across player profiles.** Whales should not earn 10× soft currency from 10× playtime — *paid* faucet scales for whales, not playtime faucet.

## Drain design

Sinks should:
- **Produce meaningful choice.** "Buy item X or Y" = sink. "Pay this fee to continue" = tax — removes currency without player decision.
- **Vary in size.** Mix small frequent sinks (repair, snacks) with large rare sinks (tier-up, prestige) — keeps economy active.
- **Match design's aesthetic.** Cozy games rarely have repair sinks (frustrating). Survival games depend on them (consequential).
- **Include luxury sinks for whales.** Whale with nowhere to spend excess currency leaves game. Cosmetics, status items, named rewards.

## Stock-vs-flow

Players think in *stocks* ("I have 5,000 gold"); economy lives in *flows* ("I net +700 gold per day"). Both matter:

- **Stock matters for friction.** Player never affording next tier feels gated. Player saving up and reaching goal feels rewarded.
- **Flow matters for sustainability.** Positive flow for everyone forever → inflation. Negative flow → churn.

Healthy designs target *small positive flow* for most profiles, with periodic large sinks (tier-ups, prestige resets) bringing stock down without pushing flow negative.

## Multi-currency hygiene

Design with multiple currencies:

- **Each currency must have clear role.** Soft (earnable) for routine purchases, hard (paid or rare) for premium goods, time-gated for engagement loops.
- **No cross-conversion in wrong direction.** Soft → hard = paywall avoidance, breaks model. Hard → soft fine (whales accelerating).
- **Currency count discipline.** 1–2 normal; 3 workable; 4+ almost always broken. Each extra currency multiplies cognitive load and spreadsheet rows.

## Soft / hard / time-gated

| Currency type | Source | Sink | Role |
|---|---|---|---|
| Soft | Earned through play | Routine purchases (consumables, repairs, common items) | Constant low-stakes engagement |
| Hard | Paid (IAP) or rare reward | Premium / status purchases (cosmetics, skips) | Whale lever; aspirational free-player goal |
| Time-gated (energy / stamina) | Regenerates on a clock; refillable with hard currency | Each play session costs N | Limits per-day engagement; produces buy-out points |

Game with all three must specify *role of each*. Game with two of three more common, easier to balance.

## Inflation and deflation

**Inflation** — sources > sinks over time. Symptoms: prices constant but earnings grow → things feel free; whales hoard; world content devalues; new content feels weak vs accumulated stock.

**Deflation** — sinks > sources over time. Symptoms: players run out of currency between activities; new content ignored as unaffordable; player choice contracts.

Both usually fixed by adjusting *flow*, not *stock*:
- Inflation → add luxury sink, raise expansion-content prices, or sink event
- Deflation → reduce sink rates, increase source rates, or source event

## Sink events vs source events

Live-ops economy levers:

- **Sink events** — limited-time goods absorbing excess stock (limited cosmetics, special tier-ups). Used when economy inflating.
- **Source events** — bonus weekend, double XP, free pack. Used when retention dropping or to re-engage lapsed players.

Intentional levers — plan with [game-monetization-strategist](../../game-monetization-strategist/SKILL.md) (commercial impact) and `iap-manager` (catalog impact).

## Web3 economy notes

Rails include web3 tokens or NFTs → additional concerns:

- **Token sources without sinks collapse economy.** "Play to earn" without sinks → token price collapses → players leave.
- **NFT'd content hard to nerf.** Legendary sword is NFT, you nerf it → owners revolt. Plan *content addition* over *content rebalance*.
- **Secondary markets = liquidity lever.** Active markets keep economy interesting; dead markets make assets feel worthless.
- **On-chain transactions have cost.** Gas, latency, finality constrain feasible runtime economy operations.
- **Speculation as gameplay.** Some players' primary verb is *trading*, not *playing*. Embrace in design or design against; ignoring doesn't make it disappear.

## Anti-patterns

- **Pure-grind economy** — one source (kill enemies); one sink (buy upgrades). Players feel like wage-slaves.
- **Whale-gated economy** — whale-tier content locked behind hard paywalls, no aspirational free path. Free players quit; whales cap; population collapses.
- **Phantom currency** — currency exists, player has nothing to do with it. Cut it.
- **Double-spend** — sink lets player buy what they could earn by playing. Choice removed.
- **Token economy with no sinks** — see above. Single most common web3 economy failure.

## Output

Capture in spreadsheet model:
- Currency table (one row per currency, with role)
- Sources sheet (per-currency, per-source)
- Sinks sheet (per-currency, per-sink)
- Velocities sheet (computed flows per profile)
- KPI rollup (predicted ARPDAU, retention shape, time-to-content)
- Sensitivity sheet (top 3–5 levers ±20%)
- Telemetry contract (what to instrument live to validate)
