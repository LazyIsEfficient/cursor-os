# Simulation and playtesting

Spreadsheet predicts economy *if* model captures system. Engine plays game *as built*. Players reveal what neither shows. All three needed.

## When each modality wins

- **Spreadsheet** — fast iteration on shape and rates; cheap to revise; models time horizons (months/years) team can't playtest. Wins for *predicting* economy and progression behavior.
- **Engine playtest** — what game actually does, with messy interactions spreadsheet abstracts. Wins for *validating* spreadsheet predictions, surfacing emergent behavior.
- **Player playtest** — what real players (not developers) feel and do. Wins for *fairness perception*, *engagement*, *frustration*, gap between *designed intent* and *understood intent*.

Spreadsheet-only team ships economy breaking under real play. Engine-playtest-only team ships changes "feeling right today," collapsing next month. Player-playtest-only team tunes for what playtesters say they want — rarely what they do.

## Simulating player profiles

Build small sim (spreadsheet macro, Python script, in-engine script) "playing" economy as player profile would:

- **Whale sim** — high paid spend, low patience for time gates, high content consumption rate
- **Dolphin sim** — moderate paid spend, moderate patience, mid content consumption
- **Minnow sim** — low paid spend (starter pack, season pass), patient on time gates
- **Free sim** — no paid spend; full reliance on time gates and ad rewards

Run each profile across planned content arc (e.g. 90 days). Capture:
- Currency velocities (in / out / net per day)
- Content gate hit times (when each profile reaches each chapter / tier)
- Stalling points (where profile runs out of progression)
- Whale / non-whale gap (does whale outpace content?)

## Monte Carlo for variance

Loot, drop tables, gacha, pity systems → run N=1000+ sim iterations per profile. Capture:
- **Mean time to rare drop** vs **median** vs **95th percentile**
- **Worst-case bad-luck duration** (player hitting long tail)
- **Pity activation rate** (% attempts hitting pity floor)

Drop table where *median* player gets rare in 50 attempts but *worst 5%* don't in 500 → vocal complaints from those players. Sim surfaces this; spreadsheet alone may not.

## Internal playtest

Goals:
- **Validate spreadsheet predictions.** Actual session length within ±25% of model? Actual XP/session within ±25%?
- **Surface broken interactions** model abstracts away. Combo X makes encounter Y trivial?
- **Check pacing felt.** Curve feels like chosen shape?

Cadence: **after every meaningful balance change.** Internal playtests cheap, fast.

Pitfall: **developer skill bias.** Developers play differently from real players (faster reflexes, deeper system understanding). Internal pacing data *optimistic*; assume real players 25–50% slower.

## External playtest (with target audience)

Goals:
- **Find gap** between design intent and player understanding. What player *thinks* they're doing vs. what system does?
- **Measure perceived fairness.** Spreadsheet says "fair" — do players agree?
- **Catch "feels grindy"** moments spreadsheet misses. 50-day median to endgame might *technically* fit model, *feel* awful in practice.

Cadence: **before every major content drop**, **before soft launch**, **before global launch**, at least once during prototype phase.

Formats:
- **Observed sessions** — playtester at desk, observed (in person, screen-share, recorded). High signal, low N.
- **Diary studies** — playtesters keep builds 1–2 weeks, daily journals. Best for retention / engagement signals.
- **Surveys + telemetry** — large-N, lower depth. Validate hypotheses, don't discover them.

Pair with `ux-research` for protocol design and synthesis.

## What playtest is *not* for

- **Confirming shipped balance.** Playtest is *exploratory* and *evaluative*, not ceremonial.
- **Settling design debates.** "Players like A more than B" in small playtest = weak signal; bring back to spreadsheet and design intent.
- **Replacing telemetry.** Playtest = depth; telemetry = breadth. Need both.

## Soft launch as largest playtest

Soft launch (release to 1–3 small markets before global) = highest-fidelity F2P playtest. Goals:

- **Validate model at scale.** Predicted ARPDAU realistic in real markets?
- **Find segment-specific issues.** Curve works for region X's player base?
- **Surface paywalls and quit moments** internal playtest missed.
- **Set KPI floor** for global launch (D1, D7, D30, ARPDAU, ROAS).

Coordinate with [game-monetization-strategist](../../game-monetization-strategist/SKILL.md) (KPI targets), `iap-manager` (catalog testing), [game-marketer](../../game-marketer/SKILL.md) (CPI and acquisition channels).

## Telemetry coverage

Every predicted metric needs corresponding event:

- `session_start`, `session_end(duration_s)`
- `currency_grant(currency, amount, source)`
- `currency_spend(currency, amount, sink)`
- `player_level_up(level, time_in_session, total_play_time)`
- `content_unlock(content_id, days_since_install)`
- `iap_purchase(sku, price, currency)`
- `iap_view(sku)` — for funnel
- `iap_dismiss(sku)` — for funnel
- `match_end(result, win_rate_so_far)` (for PvP balance)
- `loot_drop(table, rarity, attempts_since_last)` (for drop table balance)

Hand event list to `godot-engineer` (or other engine team) for instrumentation, [site-reliability-engineering](../../site-reliability-engineering/SKILL.md) for ingestion / alerting.

## Output

After playtest:
- **Validation table** — spreadsheet prediction vs observed reality, per metric
- **Surface bugs / unexpected dynamics** — combo X breaks Y; chapter 3 pacing stalls; profile Z out of currency at week 5
- **Re-tune list** — model changes and engine changes
- **Updated model** — spreadsheet *learns* from playtest, doesn't stay stale
