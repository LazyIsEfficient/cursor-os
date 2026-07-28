# Price testing

A/B price testing = highest-leverage live-ops activity, only with statistical discipline. Underpowered or biased tests produce false-positive winners hurting revenue on rollout.

## When to price-test

- New SKU price unanchored to comps; right price genuinely unknown
- Live SKU underperforming, price suspected cause
- Strategic question — "would lowering this convert enough to offset?"

## When not to price-test

- Too few weekly buyers for statistical power in reasonable time
- Platform policy change imminent (test invalidated)
- Live game with vocal community — price changes leak, trigger comms storms; coordinate with [game-marketer](../../game-marketer/SKILL.md) first
- Multiple SKUs changing simultaneously — can't isolate impact

## Test design

### Variants

- **Control + 2 variants** standard. More variants split sample size, slow test.
- **Variants bracket the control** — typically lower price (A) and higher price (B). Lopsided tests (control + 2 lower) miss upside case.
- **Variants need psychologically meaningful gaps** — $4.99 vs $5.99 is *not* meaningful; $4.99 vs $7.99 is.

### Sample size and power

Power analysis. Revenue tests:

- **Effect size:** minimum detectable effect (MDE) you care about — typically 5–10% on revenue
- **Power:** 0.80 standard
- **Significance:** p < 0.05 (two-tailed for unknowns; one-tailed only with genuine directional hypothesis)
- **Sample size:** computes from above; usually 5,000–50,000 users per variant

Practical: top-SKU tests (high install volume) finish in 2–4 weeks. Niche-SKU tests may take 8+ weeks or be impractical.

### Bucketing

- **Persistent user-id-based hash** — same user always sees same variant
- **No re-bucketing on app update** (contaminates test)
- **Cohort-isolated** — new installs only; existing users excluded (otherwise variant mixes "what they saw last time" with new)
- **No overlap** with other active tests on same SKU

### Primary metric

- **Revenue per cohort install at D30** = primary for most price tests (captures conversion + per-purchase + retention)
- Don't use "conversion rate" alone — higher-converting lower-priced variant can lose on revenue
- Don't use "ARPPU" alone — variant might convert different user mixes

### Guardrail metrics

Must not regress significantly:

- **Retention D7 / D30** — price change shouldn't break retention
- **Repeat-purchase rate** — first purchase up, no second = no win
- **Refund rate** — higher refunds = trust signal
- **Review score** — players detect price tests via community discussion
- **Per-segment impact** — variant winning on average but killing whale conversion is bad

## Running the test

### Pre-launch

- **Sandbox-test** variant configuration (price changes via server-driven config, no client release)
- **QA verify** price-display flow shows right variant
- **Telemetry verify** — events tagged with `variant_label`
- **Comms align** — internal team knows test is running

### Live

- **Mid-checkpoint at ~50% of planned sample** — sanity check, not decision. Don't peek with intent to stop early.
- **Pre-registered decision criteria** — written before test starts, don't move
- **No early stopping** unless catastrophically bad (>30% revenue drop with significance)
- **Hold the duration** — even if early data looks like clear winner. Early-stopped tests biased high.

### Post-test

- **Decision call by date X** — variant wins if primary metric > control + MDE with p < 0.05, no guardrail regression
- **Roll out winner** to 100% of cohort; existing-user pricing handled separately
- **Document result** in price-test playbook
- **Update the model** — spreadsheet's assumed price → conversion → revenue reflects result

## Statistical pitfalls

- **Multiple comparisons** — 10 price tests at once, 1 hits p < 0.05: expected by chance, not real. Bonferroni-correct or pre-register hypotheses.
- **Peeking** — checking before planned end, stopping when variant "looks good" inflates false positives.
- **Underpowered tests** — test unable to detect real 5% effect produces "no significant difference" results that *don't mean* prices equivalent.
- **Cohort drift** — testing during unusual user-mix window (holiday, sale, post-update spike) contaminates result.
- **Selection bias** — testing only a slice (e.g. iOS only), rolling winner to all users assumes generalization. Often doesn't hold.

## Coordinate with `growth-engine`

Statistical rigor: hand test design to `growth-engine`. They run experiment framework with proper:
- Bootstrap CI / Mann-Whitney U analysis
- Pre-registered hypotheses
- No-peeking discipline
- Multiple-comparison correction

IAP manager *picks SKU and variants*; `growth-engine` *runs experiment*.

## Output

Per price test:
- Filled `price-test-plan-template.md`
- Pre-registered hypothesis and decision criteria
- Sample size calculation
- Telemetry contract
- Post-test write-up + playbook entry
- Updated model (spreadsheet reflects winning price's predicted impact)
