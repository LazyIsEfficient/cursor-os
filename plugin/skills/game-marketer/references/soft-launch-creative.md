# Soft-launch creative

Phase where team learns *which creative concepts work* before global launch. Multiple concepts × variants × networks; per-creative ROAS tracking; weekly iteration.

## The core practice

1. **Generate 4–6 distinct creative concepts** (different angles on game; see `assets/soft-launch-creative-plan-template.md` for examples).
2. **3 variants per concept** differing in hook / length / aspect.
3. **5 ad networks** in parallel: Meta, Google Ads, TikTok, Unity Ads, AppLovin / IronSource.
4. **Refresh creatives weekly** — kill bottom decile, add fresh variants.
5. **Optimize for ROAS, not just CPI.** Cheap install with bad retention worse than expensive install with strong retention.

## Generating concepts (the "angles")

Per concept, answer: what one thing are we testing the audience on?

- **Power fantasy** — "Become unstoppable"
- **Cozy / comfort** — "Build your dream"
- **Comedy / fail** — "When it all goes wrong"
- **Social proof** — "What players are saying" (UGC-style)
- **Surprise / twist** — "Wait, what?"
- **Mystery / story** — "What's down there?"
- **Skill flex** — "Try and beat this"
- **Aesthetic** — "Look at this"
- **Wedge** — "We're the only game that lets you ___"

Pick 4–6. Don't test 12 — per-concept sample size too small.

## Variants within a concept

Each concept gets 3 variants differing in:

- **Hook** — alternate openings (different visuals, different opening line)
- **Length** — 15s vs 30s (different pacing)
- **Aspect** — 16:9 (Meta video, YouTube) vs 9:16 (TikTok, Stories, Shorts)

Don't vary too much per variant — identify which *concept* works, then iterate within concept.

## Network mix

Each network has different audience and strength:

- **Meta (FB/IG/Reels)** — broad reach, strong ROAS-optimization SDKs, mature for mobile games
- **Google Ads** — App Campaigns for Installs (search + YouTube + Display); strong for high-intent
- **TikTok** — younger demo, viral CTR potential, retention historically lower than Meta
- **Unity Ads** — in-game placements, rewarded video, high intent (player already playing similar games)
- **AppLovin / IronSource** — hyper-casual / casual mobile bias, large supply, programmatic
- **Reddit / X / Discord** — niche / community games (low volume, high quality)
- **Twitch / YouTube creator** — coverage-driven, harder to attribute precisely

Budget split typically 40/25/15/10/10 across top 5; adjust per game category and prior data.

## Per-creative KPIs

| KPI | What it measures | Used for |
|---|---|---|
| CPI | Cost per install | Network cost efficiency |
| CTR | Click-through rate | Hook strength |
| CR | Conversion rate (click → install) | Store-page strength |
| D1 retention (per creative) | Quality of the install | Audience fit |
| D7 retention (per creative) | Sustained quality | Real audience match |
| ARPDAU (per creative cohort) | Revenue per user | Spending audience |
| D7 ROAS | Revenue / cost at D7 | Acquisition profitability |
| D30 LTV | Long-term value | The truest signal (lagging) |

Creative with cheap CPI but bad D7 retention *worse* than high CPI + strong D7 retention. Always optimize for ROAS.

## Creative decay

Creative typically peaks within 1–2 weeks, then degrades. Causes:
- Audience fatigue (same people see creative repeatedly)
- Network algorithm already targeted receptive segment
- Creative "burned"

Refresh cadence:
- **Weekly:** kill bottom-decile creatives; add 2–3 fresh variants
- **Bi-weekly:** introduce new concept (rotation across 6 angles)
- **Monthly:** comprehensive review of winning concepts; refresh winners with new variants

## Network-specific patterns

### Meta
- Vertical creative (9:16) outperforms horizontal in Stories / Reels
- Native-feel content beats polished-AAA-trailer feel
- Multiple short variants (15s) often beat one polished 30s
- ROAS bidding mature; let network optimize

### TikTok
- "Native" feel critical — over-polished AAA trailers fail
- Trending sounds / formats lift CTR significantly
- Hook within 1–2 seconds; faster than horizontal video
- Creator-style content (POV, ungainly, real) often wins

### Google Ads (App Campaigns for Installs)
- Less creative control — Google auto-rotates assets
- Provide multiple creative assets (HTML5, video, image); let Google test
- Optimize for tCPA (target cost per acquisition) or tROAS

### Unity / AppLovin / IronSource
- Playable ads convert well (interactive demo)
- Rewarded video placements higher quality than interstitials
- Network-specific ad formats (e.g. Unity's "playable" SDK) need custom production

## Audience targeting

Within networks:

- **Lookalikes** from existing player IDs (Meta: from your install list)
- **Interest-based** for cold acquisition (gaming interests, comp-title fans)
- **Geo-targeted** during soft launch (soft-launch geos)
- **Exclusion lists** (existing players, lapsed players for reactivation)

Coordinate with `iap-manager` for payer IDs (high-LTV lookalikes).

## Decision framework

After each soft-launch week:

1. Rank creatives by D7 ROAS (or earlier proxy if D7 unavailable)
2. Kill bottom 30% (poor performers)
3. Scale top 30% (more spend on winners)
4. Add fresh variants of top concepts (creative refresh)
5. Test new concept (rotate the bottom)

After 4–8 weeks:
- Identify 1–2 winning *concepts* (not just creatives)
- Identify delivering network mix
- Identify audience signals (geo, demo, interests) of high-LTV cohorts
- Build global UA plan from these signals

## Hand-off to global launch

Soft-launch creative learnings become global launch inputs:

- **Top 3 concepts** carry forward as launch creative spine
- **Top hooks / angles** seed new variants for global creative production
- **Network mix** sets global UA channel split
- **Audience targeting** sets global launch lookalikes
- **CPI ceiling** that delivered ROAS sets global UA budget cap

## Anti-patterns

- **Single-concept testing** — "we believe in our trailer; just buy media on it." No creative concept survives untested alternatives.
- **Optimize for CPI only** — drives "cheap installs that don't pay back."
- **Polished-AAA only** — misses TikTok / Reels / Shorts native audiences rejecting this aesthetic.
- **No creative refresh** — same creatives 4 weeks; performance decays; ROAS drops.
- **Abandoning network too fast** — give network 2–3 weeks before deciding; first week often algorithm exploring.
- **Stopping a winner** — working creative → don't pull spend; scale until performance flattens.
