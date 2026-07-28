# Price-tier ladder

Set of price points a game offers. Each tier serves a segment and a moment. Healthy catalogs populate every tier with ≥1 compelling SKU; gaps leave money on the table.

## The standard tiers (USD)

| Tier | USD | Audience | Common SKU type | Mood |
|---|---|---|---|---|
| T1 | $0.99 | First-touch / tip jar | Tiny currency pack | "Try the IAP path" |
| T2 | $2.99 | Minnow utility | Ad-removal, smallest currency | "Friction removal" |
| T3 | $4.99 | Minnow / starter | Starter pack, small currency, monthly sub | "Easy yes" |
| T4 | $9.99 | Dolphin core | Season pass, mid currency, themed bundle | "Worth it" |
| T5 | $19.99 | Dolphin / whale-bridge | Premium pass, large currency, dolphin bundle | "Treat yourself" |
| T6 | $49.99 | Whale | Whale currency, legendary cosmetic | "I want all the things" |
| T7 | $99.99 | Top whale | Top whale currency, named bundle, founders | "I love this game" |

(Some platforms / regions add $14.99, $29.99, $79.99 intermediate tiers — use them when populating mid-tier bundles.)

## Tier psychology

Tiers feel different:

- **$0.99** — "free-but-paying"; lowest commitment; useful for "try the IAP" moment
- **$2.99 / $4.99** — "small impulse"; feels free relative to coffee; minimal regret
- **$9.99** — "premium app price" anchor; compared to apps and games bought before
- **$19.99 / $49.99** — "deliberate purchase"; players think before clicking
- **$99.99** — "I'm investing in this game"; serious whale signal

$4.99 vs $5.99 isn't 20% — it's "small impulse" vs "I'm thinking about this." Anchor to psychology, not linear price.

## Coverage rules

- **Every tier T2–T6 ≥1 SKU.** T2 missing → minnows have no entry; T5 missing → whales hit ceiling, stop.
- **Max 3 SKUs per tier on display at once.** More = choice paralysis.
- **Ladder *progresses in value*.** Tier 3 gives better value-per-dollar than Tier 2 *only if more content*. Don't punish minnows with a worse-deal small pack.

## Common gaps

### Mid-tier vacuum

Catalog has $0.99–$4.99 entry SKUs and $49.99+ whale SKUs, nothing in $9.99–$19.99. Dolphins (bulk of payers) have nowhere to land. Dolphin-tier conversion stalls.

**Fix:** add 1–2 SKUs at $9.99 (season pass, mid-currency bundle) and 1 at $19.99 (premium bundle).

### Top-tier vacuum

Catalog has $0.99–$19.99 SKUs, nothing above. Whales hit ceiling, stop spending.

**Fix:** add $49.99 currency pack and $99.99 named bundle / founders.

### Bottom-tier vacuum

Catalog starts at $9.99. Free-to-minnow conversion poor — entry friction too high.

**Fix:** add $2.99 ad-removal or $4.99 starter pack.

## Per-platform tier maps

Platforms don't all use linear prices.

### App Store

App Store tiers numbered (T1, T3, T5, T10, T20...). Apple maintains tier-map document translating tiers to local prices per region. Mapping is **not** flat exchange rate — anchored to local price psychology.

- T1: $0.99 / ¥120 / £0.99 / €0.99
- T5: $4.99 / ¥610 / £4.49 / €4.99
- T10: $9.99 / ¥1,220 / £9.99 / €9.99
- T20: $19.99 / ¥2,440 / £18.99 / €19.99

Use Apple's tier — don't invent local prices. Apple's psychology research works for you.

### Google Play

Similar structure (price tier maps); broadly aligned with App Store. Verify exact mapping for new SKUs.

### Steam

Custom prices allowed; regional pricing recommendations provided. Use recommendations as baseline, adjust. Round to .99 / .49 conventions.

### Web (Stripe)

Arbitrary pricing. Same psychology as platform tiers. Avoid weird prices like $4.27 — players read as "untrusted."

### Web3 marketplaces

Token-priced SKUs depend on chain-native token. NFT mints typically priced in chain-native. Disclose wrapper / fiat conversion clearly.

## Refresh cadence

- **Quarterly:** review tier population; identify gaps; add SKUs as needed
- **On platform tier-map updates:** Apple / Google publish updates periodically
- **On regional events:** holiday-specific SKUs at adjusted tiers (Black Friday, 11.11, golden week)
