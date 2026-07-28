# SKU design patterns

SKU shapes that work, when each is right, how they interact.

## 1. Currency packs

**What:** soft / hard currency packs at increasing price tiers. Bigger packs = better value-per-dollar.

**When:** any F2P game with currency. Always-on.

**Best practices:**
- 4–6 tiers ($0.99 / $4.99 / $9.99 / $19.99 / $49.99 / $99.99)
- Each higher tier ≥20% more value-per-dollar than previous
- Highlight "best value" on mid-high tier (not top — whale-only)
- "First purchase 2× bonus" promo for new conversions

**Anti-pattern:** flat value-per-dollar across tiers (no incentive for bigger packs).

## 2. Starter pack

**What:** one-time, segment-targeted, heavy discount, surfaced early.

**When:** F2P always; single biggest free → minnow conversion lever.

**Best practices:**
- Surfaces D1–D3 of play (after first wow moment)
- One-time per account
- Heavy discount (~80% off equivalent value)
- Mix of currency + cosmetic + utility
- Tier 2 ($4.99) — low friction, easy yes
- Time-limited (48–72 hours after first surface)

**Anti-pattern:** repeating starter packs ("starter pack v2!"). Players catch on; trust drops.

## 3. Bundles (themed, anchored)

**What:** multiple items at discount vs singles. Often themed (Halloween, anniversary, season opening).

**When:** weekly / event-driven; *primary SKU type* for live-ops monetization.

**Best practices:**
- Mix currency + cosmetic + utility
- 30–50% notional discount
- Limited-time creates urgency
- Anchor to higher-priced "decoy" SKU nearby (positioning effect)
- Variants per segment (whale bundle, dolphin bundle)

**Anti-pattern:** bundle bloat (8 active bundles → choice paralysis → conversion drop).

## 4. Battle pass / season pass

**What:** time-bound progression track, free + paid tiers.

**When:** GaaS, F2P, live-ops with content cadence.

**Best practices:**
- 4–12 week season length (8 = sweet spot for most games)
- 50–100 tiers (100 common; players love "rewards every level")
- Free track has *meaningful* rewards (not just XP boosters)
- Paid track 5–10× free track value
- Premium tier ($19.99) skips first ~10–20 levels for whales
- "Pass conversion" = top-tier KPI — track weekly

**Anti-pattern:** back-to-back passes, no breaks; weak free track; pass too long (anxiety).

## 5. Cosmetics (singles)

**What:** single-cosmetic SKUs at premium prices.

**When:** cosmetic-strong games (PvP, multiplayer, identity-driven).

**Best practices:**
- Tiered rarity: $4.99 common / $9.99 rare / $19.99 epic / $49.99 legendary / $99.99 mythic
- Limited-time legendaries (FOMO-driven; ethical limit: don't fake time gate)
- Themed releases tied to events / collabs
- Visible to other players (otherwise no audience for cosmetic)

**Anti-pattern:** cosmetic-only IAP in single-player (low conversion); too many cosmetics (visual noise).

## 6. Ad removal

**What:** one-time SKU removing all ads.

**When:** ad-supported F2P; powerful minnow conversion.

**Best practices:**
- Tier 2 ($2.99 typical)
- Surfaces after a few ad views (timing the ask)
- Permanent (not subscription)
- Honest framing: "Remove ads" not "Get premium"

**Anti-pattern:** "Premium" tiers bundling ad removal with unwanted extras.

## 7. Subscription tier

**What:** monthly recurring access / perks / ad removal / daily currency.

**When:** GaaS with daily-engagement loop; ad-removal-plus models.

**Best practices:**
- Single tier for simplicity (multi-tier subs confuse)
- Tier 2 ($4.99/mo) typical
- Daily reward grant (reason to log in daily)
- Ad-free + cosmetic + occasional bonus
- Annual plan at 30% off monthly (LTV optimization)
- Free trial (3–7 days) to convert
- Easy cancellation (mandatory — players reward studios respecting this)

**Anti-pattern:** subscription gating content rather than enhancing; multi-tier confusion.

## 8. Skip / convenience SKUs

**What:** spend currency to skip timers, instant-craft, instant-revive.

**When:** time-gated mobile games (energy systems, build timers).

**Best practices:**
- Optional, never required for progression
- Whales love these; tune for whale ARPDAU
- Hard currency only (gem-priced)

**Anti-pattern:** designing artificial timer pain to sell skips ("dark pattern"). Players detect; trust drops.

## 9. Founders pack / VIP tier

**What:** premium-priced ($49.99–$99.99) named SKU with exclusive cosmetics, bonus currency, lifetime perks.

**When:** launch + anniversaries; whale acquisition.

**Best practices:**
- Tier 5–6 pricing
- "Forever" perks (small bonus on currency packs forever)
- Status item (unique cosmetic visible to others)
- Limited-time (founders-only, anniversary-only)

**Anti-pattern:** founders pack content nerfed later → trust break.

## 10. Web3 token packs

**What:** token bundles purchased with fiat.

**When:** web3 rails platform-permitted; web/desktop typically.

**Best practices:**
- Disclose chain, custody (custodial / non-custodial)
- KYC if jurisdiction requires
- Clear conversion rate displayed
- Separate from in-game currency unless identical (then treat as token IAP)

**Anti-pattern:** unclear token vs in-game-currency relationship; hidden gas / fees.

## 11. NFT mints

**What:** one-time primary mint of NFT items / characters / land.

**When:** collector-focused web3 games; identity / cosmetic / collectible items.

**Best practices:**
- Clear total supply
- Disclosed mint price + gas
- Royalty rate published
- Allowlist for early access (community / pre-sale buyers)
- Reveal mechanics (random vs picked)

**Anti-pattern:** mints with combat-effective items (locks balance); fake scarcity.

## 12. Token-required content (web3)

**What:** content gated behind token holdings (staking, holding-required).

**When:** advanced web3 games with mature token economy.

**Best practices:**
- Token utility = sink → helps token velocity
- Clearly disclosed requirements
- Web2 fallback path if possible

**Anti-pattern:** content *only* accessible to token holders alienates bulk of player base.

## How they combine

Most live F2P games run a mix:
- Currency packs (always-on)
- Starter pack (one-time per account)
- Battle pass (per season)
- Themed bundles (weekly)
- Cosmetics singles (catalog)
- Subscription (always-on)
- Ad removal (one-time)
- Skip SKUs (live-ops)

Already 8 SKU types. Pick ones fitting model and team capacity. Solo / small team: 4–6 SKU types max; live-ops studio: all 12.
