# Launch week

7-day window around launch = highest-attention moment game gets. Most games' lifetime revenue meaningfully shaped by this week.

## T-30 to T-1

See `assets/launch-plan-template.md` for full pre-launch timeline. Headlines:

- **T-30:** assets locked, press kit out, embargo coverage scheduled, soft-launch data → global UA plan
- **T-14:** trailer drop, press lifts (or T-7), creator videos scheduled, Discord pre-launch event
- **T-7:** all stores verified live, IAP catalog locked, launch comms drafted, server stress-tested
- **T-1:** final QA, last social tease, team briefed on launch-day playbook

## Launch day (T-0)

### Hour 0
- **Release goes live** at chosen launch hour (10am PT typical for global)
- **Launch trailer** pinned across all channels
- **Social posts** simultaneous (X, TikTok, Instagram, Discord, Reddit)
- **Email blast** to wishlist / mailing list
- **Influencer videos** go live (creators briefed for T-0 timing)
- **Discord launch event** kicks off
- **Press review embargoes lift** (if T-0)

### Hours 1–4
- **Crash-rate alerts** monitored (>0.5pp drop = escalation)
- **Server-load** monitored (with `site-reliability-engineering`)
- **Conversion-funnel** monitored (with `iap-manager`)
- **Review-score** monitored (App Store / Google Play / Steam)
- **Community sentiment** monitored (Discord, Reddit, X mentions)
- **Support ticket** triage (with support team)

### Hours 4–24
- **Hotfix capability** ready (with `godot-engineer`)
- **First-day numbers** report against KPI floors
- **Influencer reactions** monitored — top creators' coverage drives next 24h
- **Press review aggregation** — what's the consensus
- **Discord moderation** intensified (high-traffic moderation needs are real)

## Launch week (T+1 to T+7)

### Daily metrics review (with `game-monetization-strategist`)
- Cohort retention (D1 today, D2 tomorrow, etc.)
- Conversion funnel
- ARPDAU vs predicted
- Per-channel ROAS

### Daily community engagement
- Devs in Discord channel (more than usual; high-attention week)
- Reply-to on social
- AMAs / livestreams during week

### Creative refresh on UA
- Creative decays fast at launch from oversaturation
- Refresh creatives mid-week on performance drop
- Scale spend on winners

### Press / influencer follow-up
- "Day of" coverage → "what's next" coverage
- Reach out for follow-up reviews and content
- Compile press / influencer reactions for shareable content

### First patch (T+3 to T+7)
- Bug fixes from launch-day reports
- *Not* balance changes (don't react to launch-day complaints with balance; data unstable)
- Hotfix communication on Discord, X, Reddit

### First content tease
- "Here's what's coming next month"
- Roadmap teaser (light)
- Pre-establish post-launch cadence

## Post-launch beat (T+8 onwards)

- **Weekly metrics review** locked in
- **First major content event** (T+14 to T+30) — "we shipped, here's more"
- **Re-engagement campaign** for D7 lapsers (with `iap-manager`)
- **Player survey** for qualitative feedback (coordinate with `ux-research`)
- **Long-term roadmap reveal** for season / quarter / year
- **Live-ops cadence locks in** (with `game-monetization-strategist`)

## What launch week does (and doesn't do)

**Does:**
- Set *trajectory* of game's first 90 days
- Establish studio reputation (review-bombing or critical love both stick)
- Burn through wishlist / hype audience (converts during this window)
- Provide real KPI signal at scale (first post-soft-launch model-reality meeting)

**Doesn't:**
- Determine lifetime revenue (first 90 days, first season, first year of live ops do)
- Give team time to react to balance complaints (data unstable; resist over-reacting)
- Replace live ops (strong launch + weak live ops = 6-month decay)

## Hand-off after launch week

- **`game-monetization-strategist`:** model updates from real data; live-ops KPI floors finalized
- **`iap-manager`:** catalog adjustments from first-week data
- **`game-balancer`:** first emergency re-tune if needed (after data stabilizes ~T+14)
- **`game-systems-designer`:** surfacing system issues (re-route here)
- **`godot-engineer`:** ongoing hotfix queue
- **`site-reliability-engineering`:** SLI / alerting locked in; on-call rotation

## Anti-patterns

- **Pre-emptive balance changes** in launch week (data unstable; over-correcting risk)
- **Going silent after launch day** ("phew, shipped" reads as abandonment to community)
- **Creative spend frozen** at launch-day allocations (winners need scaling, losers killing)
- **Ignoring critical reviews** in week 1 ("it'll blow over" — sometimes; sometimes leading indicator)
- **Skipping post-launch beat planning** before launch happens (no momentum after launch week)
