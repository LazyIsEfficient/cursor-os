# Soft launch

Controlled release in limited markets before global launch. Highest-fidelity model validation pre-global. Skipping soft launch = shipping global launch failing on KPIs catchable in 6 weeks of CA / AU / NZ data.

## Goals

- **Validate KPI floors.** Do actual D1 / D7 / D30 / ARPDAU match strategy predictions?
- **Find paywalls and quit moments.** What in live experience was invisible in playtest?
- **Calibrate acquisition.** Realistic CPI for target ICP?
- **Stress the systems.** Server load, payment flows, support volume, anti-fraud.
- **Iterate fast.** Last chance to re-tune before global attention window.

## Geo selection

Pick geos that:

- **Reflect global audience** in language (English-first usually) and behavior (mobile / PC habits)
- **Are smaller than global market** — underwhelming launch doesn't hurt long-term reputation
- **Have population for sample target** in budget timeline
- **Have payment rails comparable to global** (don't soft-launch where dominant rail unavailable globally)

Common geos:
- **CA, AU, NZ** — English-speaking, US/UK-like behavior, smaller markets, established for soft launch
- **PH, ID, VN** — Southeast Asia; high mobile penetration; lower ARPU, high engagement
- **MX, BR** — Latin America; growing markets; useful with Spanish/Portuguese localization
- **NL, IE, NO** — small Western European markets; tier-1 ARPU; useful for higher-spend categories

Web3 games: also factor *jurisdictions where crypto IAP permitted* — limits geo set further.

## Duration and sample size

Rough targets:

- **Sample target** — 10,000+ DAU for retention KPI confidence; 50,000+ for monetization KPIs
- **Time per cohort** — D1 = 1 day; D7 = a week; D30 = a month. Plan accordingly.
- **Total duration** — 4–12 weeks typical. <4 → shaky D7 data. >12 → team procrastinating.

## Decision criteria (gates)

Per KPI, three thresholds — see `kpis-and-floors.md`:

- **Floor** — below → kill or major rework
- **Target** — ship globally with iteration plan
- **Strong** — ship globally, scale acquisition aggressively

Any KPI below floor → re-tune-or-kill conversation. Target across all KPIs → go global. Strong → go global *and* expand UA budget.

## What to instrument

- Full retention curve (D1–D30 cohort)
- Full conversion funnel (install → tutorial → D1 → first store visit → first IAP)
- Per-segment ARPU (whale / dolphin / minnow / free)
- Crash rate, ANR rate, session length
- Ad fill rate, eCPM (if rails include ads)
- Subscription conversion / churn (if rails include sub)
- IAP funnel per SKU (view → consider → purchase → repeat)
- Design's failure-quit theory events ("at level 5 boss, % who quit")

## Rapid iteration

Soft launch is *iterative*, not *single-shot*. Expect weekly balance, IAP, UX changes during window. Coordinate with:

- **`game-balancer`** — in-game economy / progression / difficulty re-tunes
- **`iap-manager`** — catalog re-pricing, bundle adjustments, A/B price tests
- **`ux-design`** — store-side UX, paywall visibility, onboarding tweaks
- **`game-marketer`** — store-page A/B (icon, screenshots, description), ad-creative iteration

## Acquisition channel test

Soft launch also finds which UA channels work:

- Run multiple ad networks in parallel (Meta, Google Ads, Unity, AppLovin, IronSource, TikTok)
- Optimize for ROAS / IAP-event signal where network supports it
- Capture per-channel CPI, retention, ARPU, ROAS at D7 / D30
- Identify channels producing *whale-shaped installs*

Soft-launch channel mix becomes global launch UA plan.

## Ad-creative test

UA performance depends on creative as much as game quality. Run creative testing in soft launch:

- Multiple creative concepts (gameplay, story, juice, hook variants)
- Multiple ad formats (playable, video, interactive, banner)
- Creative refresh cadence (creative typically peaks within 1–2 weeks)
- Capture per-creative CPI and downstream retention

Hand creative learnings to `game-marketer`.

## Comms during soft launch

Soft-launch-geo players know they're early. They talk online. Manage expectations:

- **Don't oversell** — "soft launch" framing is honest
- **Be present in community** (Discord, Reddit, Apple/Google reviews) — heard early players become advocates
- **Acknowledge known issues** — silence reads as "they don't care"
- **Roll out balance changes with comms** — coordinate patch notes with `game-marketer`

## Ending soft launch

Soft launch ends, output:

- **Decision** — go global / re-tune and re-soft / kill
- **Updated KPI floors** for live ops (calibrated to soft-launch reality)
- **Updated acquisition plan** for global UA ramp
- **Updated catalog** (with `iap-manager`)
- **Updated balance** (with `game-balancer`)
- **Updated forecast** (with `finance-ops`)

## Web3 soft launch notes

Rails include web3:

- **Closed beta with allowlists** — common web3 soft-launch shape
- **Token economy needs separate validation** — monitor token velocity, sink saturation, secondary market depth
- **NFT mint dynamics matter** — primary mint sell-through speed, secondary market activation
- **Web2 fallback path validation** — can non-wallet players actually play? Their KPIs healthy?

Web3 soft launches often need *longer* duration than web2 — token / market dynamics take weeks to stabilize.
