# Model stress tests

Run strategy through these scenarios. Each tests whether model survives adverse condition. Model breaking on any of them will break in live ops.

## 1. Retention shortfall (-30%)

D7 retention comes in 30% below target.

**Predicted impact:**
- DAU 30% smaller
- LTV scales linearly with retention → 30% lower
- ROAS payback extends ~40% (math compounds)
- Whale concentration may rise (whales retain better than dolphins/minnows)

**Action:**
- Re-tune onboarding (route to `game-systems-designer` for first-hour design)
- Re-tune early-game economy (route to `game-balancer` for source/sink rates)
- Reduce CPI (raise UA quality bar; route to `game-marketer`)
- Retention floor breached → re-tune or kill

## 2. IAP conversion shortfall (-50%)

Conversion to first IAP 50% below target.

**Predicted impact:**
- ARPDAU drops ~50% (assuming repeat-purchase rate holds)
- LTV drops 50%
- ROAS payback may extend 2× — ad spend unprofitable

**Action:**
- Re-price entry tier (route to `iap-manager` — usually drop entry tier price)
- Improve store-page conversion (route to `iap-manager` and `ux-design`)
- Strengthen "first wow" reward (route to `game-systems-designer` and `game-balancer`)
- Add starter-pack offer at first paywall touch
- Re-evaluate target audience (UA may acquire wrong segment)

## 3. Whale concentration shock

Top 1% revenue share drops from 40% to 25% (whales churn or migrate).

**Predicted impact:**
- 15pp of revenue evaporated
- Single-segment business model now vulnerable
- May indicate end-game content drought, status-perception loss, or competitor migration

**Action:**
- Diagnose whale churn (exit interviews, telemetry analysis)
- Add aspirational endgame content (route to `game-systems-designer`)
- Add status SKUs (route to `iap-manager` — VIP tier, founders pack)
- Diversify model (lean harder on dolphins / minnows / ads if applicable)

## 4. Platform fee change (+10%)

Apple / Google / Steam raises fee 30% → 40%, or removes discount tier.

**Predicted impact:**
- Effective revenue per IAP drops ~14% (10pp on net)
- ROAS payback extends ~16%
- Margin compression flows directly to studio P&L

**Action:**
- Raise prices (carefully — may reduce conversion)
- Push revenue through subscription / web routes (where permitted)
- Re-evaluate platform mix (iOS much less profitable → shift mobile UA to Android?)
- Web3 hybrid games: re-evaluate web3 storefront economics

## 5. Regulatory change

Loot boxes banned in target market. Crypto IAP restricted further. Age rating tightens (e.g. 18+ on monetization-heavy content).

**Predicted impact:**
- Specific SKUs unsellable in regulated markets
- Reachable market shrinks
- Compliance work / re-architecture required

**Action:**
- Assess affected catalog with `iap-manager`
- Adjust catalog by region (gacha → guarantee-based; loot box → odds-disclosed; etc.)
- Web3: check rails still permitted; web2 fallback path ready
- Communicate transparently with affected players (route to `game-marketer`)

## 6. Adblock / ad-revenue drop

Ad revenue drops 40% (post-IDFA-style change, network policy shift, adblocker uptake).

**Predicted impact:**
- Ad-supported model: ARPDAU drops 40%, ROAS collapses
- Hybrid: free segment less valuable; whale dependency rises
- Pure premium: no impact

**Action:**
- Ad-supported: shift aggressively into IAP, sub, or premium model
- Re-tune ad placement (more rewarded video, fewer interstitials)
- Re-evaluate non-ad acquisition channels
- Hybrid: probably acceptable; lean harder into IAP segments

## 7. Token velocity collapse (web3)

Token sources outpaced sinks; price collapses; players' earnings devalue; new players' ROI poor.

**Predicted impact:**
- Retention drops sharply (implicit "play to earn" contract broke)
- New player acquisition fails (no compelling earn ROI)
- Treasury / team holdings devalue

**Action:**
- Emergency sink injection (high-utility content priced in token)
- Source rate reduction (carefully — players hate this; coordinate comms)
- Protocol-level changes (token burn, buyback, staking incentives)
- Honest communication: "we underestimated supply; here's the plan"
- Long-term: rebuild model with actual demand curve, not speculative one

## 8. NFT secondary market dry-up

Secondary market goes inactive. NFTs feel illiquid, unsellable.

**Predicted impact:**
- Royalty revenue drops near-zero
- NFT-owning players feel locked in or stranded
- Primary mint demand likely drops too (no liquidity to exit)

**Action:**
- Add NFT utility independent of secondary market (in-game effects, social status)
- Consider buyback programs (if treasury supports)
- Re-evaluate: is model NFT-dependent, or NFT a feature on top of working web2 model?

## 9. Seasonal / content drought

Content cadence slips. Battle pass weak. New content delayed.

**Predicted impact:**
- Retention drops (no reason to return)
- Pass conversion drops (pass perceived weak)
- ARPDAU drops 20–40% during drought

**Action:**
- Soft launch temporary event or limited-time content
- Acknowledge with comms ("content delayed because X; here's the plan")
- Live ops teams: rebuild content pipeline capacity (route to studio leadership / `team-lead`)

## 10. Whale revolt (silent nerf / NFT nerf / store change)

Monetized item changed in way whales perceive as bait-and-switch.

**Predicted impact:**
- Whale churn spike (immediate)
- Refund storm
- Community trust drop; review-bombing
- Long-term: future paid items face skepticism

**Action:**
- Restore original behavior or compensate concretely
- Public apology with specifics (route to `game-marketer`)
- Document failure for next time
- Studios: invest in trust contract (transparency, advance notice, compensation policies)

## 11. Acquisition channel collapse

Dominant UA channel (Meta, Google Ads, TikTok, etc.) becomes dramatically less effective.

**Predicted impact:**
- CPI rises 50%+; ROAS drops below profitable
- DAU growth stalls
- Long-term: game shrinks

**Action:**
- Diversify acquisition (route to `game-marketer`)
- Shift creative concepts; old creative decays
- Lean on organic / community / influencer (slower, more durable)
- Re-evaluate model — UA economics permanently degraded → model may shift toward longer LTV (subscription, premium)

## 12. Competitive launch

Direct competitor launches, similar concept, similar audience.

**Predicted impact:**
- UA costs rise (auction competition)
- Retention may drop (audience attention split)
- Press / influencer coverage harder to land

**Action:**
- Lean into differentiation (route to `game-marketer` for positioning refresh)
- Don't chase competitor's monetization tactics — defend yours
- Consider content drop / event recapturing attention
- Long-term: audience settles into 1–2 winners; play for that position

## Output

Per scenario strategy shows resilience:
- Predicted impact magnitude
- Action plan with responsible skill / team
- Whether floor breached (yes → failure-mode strategy must avoid)

Stress-testing isn't predicting future — it's identifying *which scenarios kill the model*, surfacing as risks before they happen.
