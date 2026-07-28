# Retention → monetization

Most monetization KPIs downstream of retention. ARPDAU = ARPU × (1 - churn). LTV = integrated ARPDAU over payback horizon. Model fails when design doesn't produce assumed retention shape.

## The math

Simplified F2P:

- **DAU** = (newly installed - lapsed) × retention curve
- **ARPDAU** (avg revenue per daily active user) = total revenue / DAU
- **ARPU** (avg revenue per user, lifetime) = total revenue / total users
- **ARPPU** (avg revenue per *paying* user) = total revenue / paying users
- **LTV** ≈ ARPDAU × (1 / churn rate) — for exponential-decay retention curve
- **ROAS** = revenue / acquisition cost (at given time horizon)
- **Payback** = time at which ROAS = 1.0

1pp D7 retention drop compounds across curve. Model assuming D7=18% fails noticeably at D7=14%.

## Retention curve shapes

- **Exponential decay** — most common; constant daily churn. LTV = ARPDAU / churn.
- **Power-law decay** — common casual mobile; faster early decay, longer tail.
- **Stepped** — long flats with seasonal re-engagement spikes; common GaaS with strong content cadence.
- **Subscription S-curve** — initial churn spike (free trial → paid), then long low-monthly-churn tail.

Pick curve shape from same-category comp titles. Don't assume your game is exception until soft launch proves it.

## Daily / weekly / seasonal hooks

Each cadence layer reinforces retention at that horizon:

- **Daily** — login reward, daily quest, energy regen, daily event. Drives D1–D7.
- **Weekly** — weekly content, weekly bosses, weekly leaderboards. Drives D7–D30.
- **Seasonal** — battle pass, season story, ladder reset. Drives D30+.

No weekly hook → players gone by week 3. No seasonal hook → gone by month 2. Each hook layer earns its retention.

## Retention shape vs model fit

| Model | Required retention shape | What breaks if retention is shorter |
|---|---|---|
| Premium | Doesn't matter (one-time purchase) | Reviews / wishlists / discoverability |
| F2P + IAP | D30 ≥ 8% | LTV < CPI → unprofitable acquisition |
| Subscription | Monthly churn ≤ 10% | LTV math doesn't pencil; price must rise (drives further churn) |
| Ad-supported | DAU stable; sessions/day high | Ad eCPM × view count can't cover ops |
| Battle pass | D30 ≥ 8% AND 80% of pass-buyers complete | Pass conversion drops; players lose trust in passes |
| Web3 token | D30 ≥ 12% (token economy needs sustained demand) | Token sells; price collapses; retention drops further |

Design doesn't produce required retention shape → change design (back to `game-systems-designer`) or change model.

## Conversion funnel

Players don't appear as payers; they convert through funnel:

1. **Install** — acquisition
2. **First session complete** — onboarding
3. **D1 return** — early retention
4. **First store visit** — discovery of monetization
5. **First IAP / first ad view** — conversion
6. **Repeat purchase** — payer retention
7. **Whale conversion** — top-spender behavior emerges

Each step has typical drop-off. F2P benchmarks (rough; vary by category):

- Install → tutorial complete: 70–85%
- Tutorial → D1 return: 30–50%
- D1 return → D7 return: 35–50% (of those returning D1)
- D7 return → first IAP: 5–15%
- First IAP → second IAP: 30–50%

Soft-launch funnel data = highest-signal pre-global data. Hand to `iap-manager` for store-side optimization, `ux-design` for in-game UX.

## Cohort vs population

Cohort analysis (track installs from specific day across lifetime) = right retention measurement. Population analysis (DAU as % of MAU) = useful real-time signal, distorted by rolling input.

Monetization decisions: always cohort. Live-ops alerts: population fine.

## ARPU growth over time

Within cohort, ARPU grows over time (more players make first purchases, second purchases, etc.). Curves:

- **D7 ARPU** — first signal conversion happening
- **D30 ARPU** — early steady-state estimate
- **D90 ARPU** — cohort lifetime estimate (most LTV realized by D90 in F2P; longer for premium / web3)
- **D365 ARPU** — long-tail value; matters for live games

Forecast cohort LTV from D30 ARPU using assumed retention curve. Validate at D90, D365. Refine model.

## When the model says "ship" but the design says "no"

Math says model works (LTV > CPI wide margin) but design *requires* spending pressure team is uncomfortable with → pause. Profitable model design team won't defend post-launch = comms nightmare.

Examples:
- Pay-to-win F2P systems team didn't intend
- Aggressive paywalls UX team didn't want
- NFT economy audience wasn't asked about

Resolve through stakeholder alignment, not by overruling design.

## Output

For strategy doc:
- Required retention shape (D1 / D7 / D30 with curve type)
- Required ARPDAU floor
- Required conversion floor
- Required payback window
- Funnel-step assumptions
- ARPU growth curve assumption (D7 / D30 / D90)
