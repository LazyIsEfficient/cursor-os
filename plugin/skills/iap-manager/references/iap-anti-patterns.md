# IAP anti-patterns

Patterns hurting revenue, retention, or trust. Many appear "by accident" when teams optimize single-SKU conversion without thinking about catalog as whole.

## 1. Mid-tier vacuum

Catalog has $0.99–$4.99 entry SKUs and $49.99+ whale SKUs, nothing in $9.99–$19.99. Dolphins (bulk of payers) have nowhere to land.

**Fix:** populate ladder. Season pass at $9.99. Mid-bundle at $19.99.

## 2. Bundle bloat

8+ active bundles at once. Choice paralysis. Conversion drops despite more options.

**Fix:** rotate bundles weekly. Display 2–3 active at once. Retire low-performers.

## 3. Fake scarcity

"23:59:58" countdown resetting every load. "Limited stock!" with no stock limit. Players reverse-engineer within days.

**Fix:** make limited-time real. Offer ends when timer hits zero. Honest scarcity converts; fake scarcity destroys trust.

## 4. Hidden subscription cost

Sub price in tiny text. "Free trial!" with recurring cost buried. Cancellation flow with friction.

**Fix:** display recurring cost clearly. Free trial mentions billing start. Cancellation simple. (Apple / Google policy require some of this; do *more* than minimum.)

## 5. Confused currencies

Multiple soft currencies looking alike (gold + silver + bronze + medal). Players can't tell what costs what.

**Fix:** 1–3 currencies, clearly distinct in role and visual identity. Strict catalog hygiene.

## 6. Inflated value comparisons

"$50 of value for $20!" when parts aren't actually worth $50. Players reverse-engineer comps.

**Fix:** comp must reflect actual catalog prices (or believable in-game equivalents). Never inflate.

## 7. Predatory paywalls

Hard pop-ups every 30 seconds. Forced paywalls (no dismiss). Whale-targeted high-pressure offers.

**Fix:** dismissibility mandatory. Hard pop-up frequency capped. Whales don't need pressure; they want clarity and value.

## 8. Starter pack v2

Player buys starter pack; "upgraded" starter pack appears, same shape. Players catch on within hours.

**Fix:** starter pack is *one-time per account*. Subsequent offers can exist (returning-player bundle, anniversary bundle) but with different identities.

## 9. Bait-and-switch composition

Bundle composition changes after launch ("we removed item X from this SKU"). Non-buyers don't notice; prior buyers feel betrayed.

**Fix:** never silently change live SKU composition. Retire SKU, launch new one with new composition.

## 10. Silent re-pricing

Live SKU price changes without comms. Players notice; community erupts.

**Fix:** announce price changes in advance (1–2 weeks). Compensate buyers who paid old price near change. Coordinate with [game-marketer](../../game-marketer/SKILL.md).

## 11. Subscription that gates content

Sub locks gameplay (not just enhances it). Non-subscribers feel paywalled out of their game.

**Fix:** subs enhance experience. Cosmetics, ad removal, daily currency. Don't gate gameplay behind sub unless entire model is sub-based (MMO).

## 12. Battle pass burnout

Back-to-back passes, no breaks; weak free track; wrong pass length.

**Fix:** 1–2 week gaps between seasons. Free track has meaningful rewards. Pass length 4–12 weeks.

## 13. Discount erosion

Premium / DLC discounted aggressively at first sale. Players learn to wait. Long-tail revenue collapses.

**Fix:** hold full price first 6–12 months. Sales are events, not default state.

## 14. Whale-specific dark patterns

Targeting whales with "spend $1,000 in 24 hours to unlock X" pressure. Some convert; many burn out, leave.

**Fix:** whales want clear aspirational targets, steady supply — not pressure. Status tiers, named SKUs, "founders" recognition. Whales = long-term relationships, not extraction targets.

## 15. Ad-network targeting hostility

High-frequency ads shown to paying users. "I paid to remove ads, why am I seeing them?" Ad-removal SKU must remove *all* ads, including promotional placements.

**Fix:** segment-aware ad serving. Payers see fewer ads; ad-removal SKU universal.

## 16. Region price arbitrage gap

Tier-3 prices legitimately lower (PPP-based), but gap so large VPN arbitrage becomes worthwhile.

**Fix:** keep PPP discounts reasonable (typically 30–60% off tier-1 USD, not 90%). Geolocate strictly.

## 17. Restore-purchases buried

Reinstalling players can't find restore button. Trust drops; refund requests rise.

**Fix:** prominent restore button in store / settings. Test restore flow for every SKU type before launch.

## 18. Cross-platform inventory mismatch

Player buys on iOS, plays on Android, SKU missing. Or vice versa. Refund requests; community uproar.

**Fix:** account-bind purchases. Receipt validation server = single source of truth across platforms.

## 19. Web3 mint-and-disappear

Primary mint sells out; team energy moves elsewhere; secondary market collapses; assets feel worthless.

**Fix:** plan *post-mint* operations as carefully as mint itself. Utility, content, event roadmap. NFT projects = long-term commitments.

## 20. KYC surprises

Web3 game requires KYC at certain thresholds (regulatory), players not told upfront. Player invests, hits threshold, gets gated.

**Fix:** disclose KYC requirements at sign-up. Map restrictions clearly per jurisdiction.

## 21. Loot box opacity

Drop rates undisclosed. Pity timer hidden. Players reverse-engineer; violates regulation in some markets.

**Fix:** disclose drop rates. Document pity timers. Comply with regional rules (JP, KR, EU all have rules).

## 22. The "monetization-as-feature" reflex

Monetization elements added late in development to "increase revenue." Bolt-on feels bolted-on; conversion poor; team mystified.

**Fix:** monetization is part of design. Catalog matches game's verbs and aesthetics, not separate stack.
