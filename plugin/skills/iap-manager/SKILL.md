---
name: iap-manager
description: Use when designing and operating the in-app purchase catalog of a game — SKU design, price-tier ladder, bundles, starter packs, battle pass tiering, A/B price tests, store config (App Store / Google Play / Steam DLC / web / web3), and per-region price localization. Triggers on "IAP catalog", "store SKUs", "pricing tiers", "starter pack", "bundle design", "battle pass tiering", "price test", "price localization", "App Store Connect", "Google Play Console", "Steam DLC", or when handed a monetization strategy with the catalog still open. Produces a catalog spec, per-region price tables, bundle compositions, and a price-test plan. For the macro model and KPI floors see game-monetization-strategist; for in-game economy curves see game-balancer; for store-page conversion and trailers see game-marketer.
---

# IAP Manager

Own **catalog and store operations**: design actual SKUs, set tiers and bundles, configure storefronts, plan price tests, operate catalog as live system. Do not pick macro monetization model ([game-monetization-strategist](../game-monetization-strategist/SKILL.md) does), tune in-game economy rates (`game-balancer` does), or design systems IAP plugs into (`game-systems-designer` does).

Two failure modes:

- **No-shape catalog.** Few SKUs picked by gut, no price-tier ladder, no segment-targeted compositions. Mediocre conversion across board; whales unserved; minnows have no entry path.
- **Theater catalog.** Catalog *looks* sophisticated but doesn't connect to player verbs, doesn't serve segment economics, isn't tested live. Team confuses complexity with optimization.

Right stance: **populate price-tier ladder deliberately, design SKUs matching segment wants, A/B test the ones that matter most, operate catalog as living system.**

## When this skill applies

- Monetization strategy from [game-monetization-strategist](../game-monetization-strategist/SKILL.md) arrives with catalog *shape* but not per-SKU detail.
- Team needs App Store / Google Play / Steam / web catalog built for launch.
- Live game needs catalog adjustments — new bundles, re-priced SKUs, new battle pass tiering, A/B price tests.
- New region added, needs price localization.
- Platform policy change (Apple / Google / Steam) requires catalog re-architecture.

Question is *which model to use* → route to [game-monetization-strategist](../game-monetization-strategist/SKILL.md). Question is *in-game economy rates* → route to `game-balancer`. Question is *store-page conversion (icon, screenshots, description)* → route to [game-marketer](../game-marketer/SKILL.md).

## Procedure

1. **Read monetization strategy.** Identify: catalog shape (currency packs / bundles / passes / cosmetics / ads-removal / sub), price-tier ladder intent, segment economics, KPI floors.

2. **Identify catalog work type.** New launch / live re-tune / new region / platform shift. Use [references/catalog-types.md](references/catalog-types.md).

3. **Design SKU list.** Use [references/sku-design-patterns.md](references/sku-design-patterns.md). Per SKU: name, segment target, content composition, price tier, store category, A/B variant if any. Fill `assets/iap-catalog-template.md`.

4. **Set price-tier ladder.** Use [references/price-tier-ladder.md](references/price-tier-ladder.md). $0.99 / $4.99 / $9.99 / $19.99 / $49.99 / $99.99 (or local equivalents). Each tier ≥1 compelling SKU.

5. **Compose bundles and starter packs.** Use [references/bundles-and-starter-packs.md](references/bundles-and-starter-packs.md). Bundle perceived value > sum of parts. Starter pack hits new players within first hour.

6. **Tier battle pass / season pass** if catalog includes one. Free vs paid track structure; reward density curve; cosmetic / mechanical / status mix per tier.

7. **Plan A/B price tests.** Use [references/price-testing.md](references/price-testing.md). Pick 2–3 SKUs with biggest revenue impact; test ±20% / ±50% with proper controls.

8. **Localize prices** per region. Use [references/price-localization.md](references/price-localization.md). Don't just convert USD → local — anchor to local price psychology and platform tier maps.

9. **Configure storefronts.** App Store Connect, Google Play Console, Steam Partner, Stripe, web3 marketplaces if applicable. Use [references/store-config-checklist.md](references/store-config-checklist.md). Coordinate with `godot-engineer` for client-side IAP plumbing.

10. **Hand off live operations plan.** What to monitor, catalog refresh cadence, kill triggers for bad-performing SKUs.

## Universal rules

- **Match SKUs to segments.** Whale SKUs serve whale motivations; minnow SKUs serve minnow motivations. "One-size-fits-all" catalog underserves all segments.
- **Populate full ladder.** Mid-tier vacuum (no $4.99–$19.99 SKUs) → dolphins don't convert. Lopsided high-end → whales hit ceiling, stop.
- **Bundles beat singles.** Bundle of 3 items at 30% off singles outperforms singles. Bundles are *primary* SKU type, not afterthought.
- **Starter pack mandatory** in F2P. First paywall touch should have starter pack at heavy discount, high perceived value. Often 20–40% of new-player conversion.
- **A/B test few SKUs that matter.** Don't test everything; test 2–3 SKUs with biggest revenue impact. Rest tuned via comp benchmarks.
- **Don't lie about value.** Bundle comparisons must be honest. "$50 of value for $20" fine if parts genuinely total $50 in game's pricing. Inflated comparisons get detected; trust hard to rebuild.
- **Don't manipulate scarcity.** Real limited-time offers fine. Fake resetting countdowns = dark patterns.
- **Localize prices, don't translate.** Local price psychology differs (¥120 in JP = "small"; $1.20 in US = "small"; converting one to other doesn't preserve psychology).
- **Do not change in-game economy rates.** SKU implies rate change → hand back to `game-balancer`.
- **Do not change macro model.** Catalog implies model change (e.g. "we need a sub tier") → hand back to [game-monetization-strategist](../game-monetization-strategist/SKILL.md).
- **Coordinate trust on monetized content changes.** Re-pricing or re-composing existing paid bundles requires comms (route to [game-marketer](../game-marketer/SKILL.md)), often compensation (with [game-monetization-strategist](../game-monetization-strategist/SKILL.md)).

## References

- [references/catalog-types.md](references/catalog-types.md) — new launch / live re-tune / new region / platform shift; how each differs
- [references/sku-design-patterns.md](references/sku-design-patterns.md) — currency packs, bundles, starter packs, passes, cosmetics, ad-removal, sub tiers, web3 SKUs
- [references/price-tier-ladder.md](references/price-tier-ladder.md) — populating ladder; per-tier psychology; per-platform price tier maps
- [references/bundles-and-starter-packs.md](references/bundles-and-starter-packs.md) — bundle composition, perceived value, decoy effect, starter pack timing
- [references/price-testing.md](references/price-testing.md) — A/B test design for prices, statistical power, ramp, kill criteria
- [references/price-localization.md](references/price-localization.md) — per-region pricing, platform tier maps, currency psychology, cross-border arbitrage
- [references/store-config-checklist.md](references/store-config-checklist.md) — App Store Connect / Google Play / Steam / Stripe / web3 store configuration
- [references/store-side-ux.md](references/store-side-ux.md) — paywall placement, offer flow, soft pop-ups, dismissibility, accessibility
- [references/web3-iap-notes.md](references/web3-iap-notes.md) — token packs, NFT mints, secondary market integration, platform policy
- [references/iap-anti-patterns.md](references/iap-anti-patterns.md) — fake scarcity, hidden costs, confused currencies, paywalled fun

## Assets

- [assets/iap-catalog-template.md](assets/iap-catalog-template.md) — canonical catalog spec
- [assets/price-tier-ladder-template.md](assets/price-tier-ladder-template.md) — per-tier SKU population
- [assets/bundle-composition-template.md](assets/bundle-composition-template.md) — bundle composition with perceived-value math
- [assets/price-test-plan-template.md](assets/price-test-plan-template.md) — A/B price test plan with stats and kill criteria
- [assets/region-price-table-template.md](assets/region-price-table-template.md) — per-region price per SKU

## Related skills

- [game-monetization-strategist](../game-monetization-strategist/SKILL.md) — produces catalog *shape* and price-tier ladder this skill populates
- [game-balancer](../game-balancer/SKILL.md) — provides currency velocities and grind-time targets sizing starter packs / bundles
- [game-systems-designer](../game-systems-designer/SKILL.md) — systems define content available to bundle
- [game-marketer](../game-marketer/SKILL.md) — store-page conversion, paywall comms, sale comms, segment messaging
- [godot-engineer](../godot-engineer/SKILL.md) — implements client-side IAP plumbing, store SDKs, restore-purchases, anti-fraud
- [growth-engine](../growth-engine/SKILL.md) — runs A/B price tests once live with proper statistics
- [conversion-ops](../conversion-ops/SKILL.md) — store-side funnel optimization (CRO patterns transfer)
- [revenue-intelligence](../revenue-intelligence/SKILL.md) — closes loop on which SKUs drive cohort revenue
- [security-engineering](../security-engineering/SKILL.md) — receipt validation, anti-fraud, restore-purchase abuse, web3 wallet security
