# Segment economics

Classic spender pyramid: whales / dolphins / minnows / non-spenders. Model must work for *each tier*, not just average — average hides dynamics driving revenue and churn.

## The pyramid (rough F2P benchmarks)

| Segment | % of installs | % of payers | % of revenue | ARPU/month | Notes |
|---|---|---|---|---|---|
| Whale | 0.5–1% | 8–15% | 30–50% | $200+ | Top concentration in mid-core RPG / strategy / gacha |
| Dolphin | 3–5% | 40–60% | 30–40% | $20–$200 | Most consistent payer base |
| Minnow | 10–20% | 30–50% | 10–20% | $1–$20 | Often single-purchase (starter pack, ad removal) |
| Free | 70–85% | 0% | 0% (or via ads) | $0 | Population whales play with; ad inventory; virality |

**Casual / hyper-casual:** flatter distribution (less whale concentration). **Mid-core** and **gacha:** steeper concentration.

## Whales

**What they want:**
- **Speed** — accelerate past time gates
- **Status** — exclusive cosmetics, leaderboard placements, named ranks
- **Completion** — own everything, finish every collection
- **Power** (in pay-to-progression games)
- **VIP treatment** — better support, early access, recognition

**What they need to keep paying:**
- Ongoing content at their pace (whales burn through normal content fast)
- Recognized status (other players must *see* it)
- Aspirational targets (something to spend toward)
- Trust paid items won't be silently nerfed

**Failure modes:**
- Out of content → quit
- Status diluted by inflation → quit
- Paid item nerfed without compensation → quit, tell others
- Free players outpace whale status (whale-perceived) → quit

## Dolphins

**What they want:**
- Meaningful affordable upgrades (battle pass, mid-tier bundles)
- Occasional luxury ("I deserve this" purchase)
- Season completion
- Predictable spend pattern (no impulse pressure)

**What they need to keep paying:**
- Clear mid-tier value ($9.99 / $19.99 SKUs feel *worth it*)
- Battle pass content cadence
- Themed bundles around content drops

**Failure modes:**
- Perceives high-tier as paywall; can't reach without becoming whale
- Battle pass burnout from too-frequent passes
- Content slowdown → drops to minnow

## Minnows

**What they want:**
- "Removed friction" purchase (ad removal, starter pack, season pass)
- One-time validation game is worth supporting
- Often single lifetime purchase

**What they need to keep paying (or repeat):**
- Clear next-step purchase (minnow → dolphin path)
- Time-bound re-engagement offers (returning-player bundle, anniversary pack)

**Failure modes:**
- Buys once, never again — many minnows are *one-purchase players*; fine, expected, modeled
- Never converts up — usually no clear upgrade path

## Free players

**Roles in model:**
- **Population for whales' multiplayer** — whales need someone to play with
- **Ad inventory** — if rails include ads
- **Virality** — invite friends, post screenshots, generate social proof
- **Conversion pool** — small % become payers; % matters at scale

**What they want:**
- A real game (not paywall demo)
- Aspirational free goals (reach endgame eventually, even slowly)
- Daily / weekly hooks that don't feel like paywalled jail

**Failure modes:**
- Frustrated by paywalls → uninstall, review-bomb
- Ad fatigue → uninstall
- No social loop → uninstall

## Lapsed-then-return

Segment overlapping all others — churned, came back. Behave differently:
- More likely to spend on "welcome back" bundle than fresh install
- Re-engagement timing matters (30–90 days after lapse = sweet spot)
- Seasonal narratives = strong re-engagement hooks

## Per-segment tactics

### For whales:
- Premium-tier battle pass (whale-only content)
- Top-tier currency packs ($49.99 / $99.99)
- Exclusive cosmetics behind named-tier purchases
- VIP or "Founders" tiers
- Personal account managers (mid-core, common over certain spend threshold)

### For dolphins:
- Standard battle pass
- Mid-tier bundles ($4.99 / $9.99 / $19.99)
- Themed limited-time content
- Conversion paths "complete the pass" → "buy next pass" automatically

### For minnows:
- One-time starter pack (heavily over-valued; ~80% off equivalent value)
- Ad-removal SKU (if rails include ads)
- Season pass at low tier
- "Re-engagement bundle" after 14+ days absence

### For free:
- Rewarded video ads
- Free battle pass track
- Daily login rewards
- Referral bonuses (friend invites)
- Generous F2P endgame progression (slow but reachable)

## Whale-resilience check

Top 1% of revenue evaporates (whale churn event, regulatory action, segment migration) — game still ship sustainable P&L?

- **Yes** — model healthy; whales are bonus, not life-support
- **No** — whale-concentrated model; one bad month at top destroys business

Most F2P games have some whale concentration. Risk threshold: **top 1% > 50% of revenue** → single-segment business; that segment moves fast.

## Per-segment ROAS

Price acquisition cost per segment, not blanket:
- Whale-shaped install (high IAP signal in first 24h): CPI $50+ affordable
- Dolphin install: CPI $5–$15
- Minnow install: CPI $1–$5
- Free install: CPI ≤ $0.50

Most ad networks support optimized acquisition (UA optimized for purchase events, IAP value, ROAS). Coordinate with `game-marketer` on optimization signals.

## Output

In strategy doc:
- Per-segment % of installs, payers, revenue
- Per-segment ARPU/month and retention assumption
- Per-segment primary tactics (which SKUs, which experiences)
- Conversion funnel between segments
- Whale-resilience check result
