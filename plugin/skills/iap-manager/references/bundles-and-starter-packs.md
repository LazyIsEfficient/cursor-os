# Bundles and starter packs

Two highest-leverage F2P SKU types. Catalog with strong bundles + strong starter pack beats catalog with great currency packs alone.

## Why bundles work

- **Perceived value** — 3 things at 30% off feels like *more* than 3 separate purchases at single price
- **Anchoring** — "regular price" comparison primes the discount
- **Decoy effect** — small SKU next to bundle makes bundle look like better deal
- **Decision economy** — player doesn't choose "currency or cosmetic"; bundle gives both

## Bundle composition principles

Good bundle:

1. **Mixes value types.** Currency + cosmetic + utility hits more motivations than 3 currency packs.
2. **Includes a "hero" item.** One thing genuinely desirable on its own (legendary cosmetic, season pass).
3. **Has honest comp.** "$50 of value for $20" must reflect actual prices. Inflated comps detected; trust drops.
4. **Targets a segment.** Whale bundle composition ≠ minnow bundle composition.
5. **Carries a theme.** Thematic bundles (Halloween, anniversary, season opening) feel curated; arbitrary bundles feel like inventory clearance.

## Bundle pricing

- **30–50% off notional** = sweet spot. Less feels stingy; more makes comp look manipulated.
- **Bundle lands at clear tier** ($9.99 / $19.99 / $49.99) — not $11.99 (looks weird).
- **Limited-time** versions can carry higher prices if limited-time is real.

## Starter pack

Single highest-leverage F2P SKU. Well-designed starter pack converts 5–15% of free players into payers within first week.

### Starter pack rules

1. **Surface early** — D1–D3 of play, after first wow moment, before any other paywall.
2. **One-time per account** — buying removes offer; no "v2" replacement.
3. **Heavy discount** — 70–90% off equivalent value (justified by LTV of converting free player to payer).
4. **Tier 2 ($4.99)** — low friction; minnow-level commitment.
5. **Mix of value types** — currency + cosmetic + utility (mirrors good bundle).
6. **Time-limited** — 48–72 hours after first surface.
7. **Honest content** — no hidden caveats, no "valid only on certain levels."

### Starter pack composition example (mobile RPG)

| Item | Equivalent value | Notes |
|---|---|---|
| 500 gems | $4.99 | (a small pack alone costs $4.99) |
| 5,000 gold | $2.00 | in-game equivalent |
| Hero crystal × 5 | $5.00 | (each is 1/10 of a $9.99 hero pull) |
| Energy refill × 3 | $2.97 | |
| Exclusive cosmetic | $4.99 | starter-pack-only — never sold elsewhere |
| **Total notional** | **~$20** | |
| **Bundle price** | **$4.99** | |
| **Discount** | **75%** | |

"$20 for $5" — a *real* deal that converts.

## Themed bundles

Themed bundles (Halloween, Christmas, Lunar New Year, anniversary, world events, character birthdays) carry narrative weight, feel less transactional.

### Theme bundle rules

1. **Theme connects to game world** — Halloween in fantasy game lands; Halloween in sci-fi needs more effort.
2. **Limited-time is real** — typically 1–4 weeks.
3. **Includes themed cosmetic** — ideally only available in this bundle.
4. **Returns annually** — players know Halloween bundle comes back: creates anticipation, reduces FOMO.

## Decoy effect

Low-value SKU next to bundle makes bundle look better:

- Bundle (1,200 gems + skin + 5,000 gold) at $9.99
- Decoy SKU: 500 gems alone at $4.99

Bundle reads "for $5 more I get a skin and 5,000 gold AND more gems." Bundle conversion rises.

**Not** dark pattern — both SKUs real and honest. Decoy shapes perceived bundle value.

## Per-segment bundles

| Segment | Bundle shape | Tier | Hero item |
|---|---|---|---|
| Minnow | Starter pack (one-time) | $4.99 | Cosmetic + currency |
| Dolphin | Themed bundle (weekly) | $9.99 | Themed cosmetic + 1,200 gems |
| Whale | Premium bundle (limited) | $49.99 | Legendary cosmetic + huge currency |

## Anti-patterns

- **Bundle stacking** — 5 active bundles at once. Choice paralysis. Conversion drops despite more options.
- **Bundle re-runs as "limited-time"** — players notice repetition. Trust drops.
- **Inflated value comps** — "$200 of value for $20!" with parts never sold at listed prices. Players reverse-engineer.
- **Starter pack v2 after first bought** — same offer, different name. Detected; trust drops.
- **Bundles costing more than sum of parts** — happens with currency + sub bundles, bad math. Insulting; conversion drops.

## Telemetry

Per bundle:
- **View rate** — % of DAU seeing offer
- **Conversion rate** — % of viewers buying
- **Repeat purchase** — % of buyers re-buying (when applicable)
- **Per-bundle ARPDAU contribution**
- **Downstream LTV** — buyers' D30 / D90 LTV vs non-buyers' (validates bundle *acquires* spending behavior, doesn't just shift it)

Hand telemetry contract to `godot-engineer` for instrumentation.
