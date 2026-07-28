# Live re-balancing

Re-tuning live game without burning trust. Live balance changes are *social* act, not just data act. Players attach to yesterday's game; re-tune ignoring this loses players regardless of correct math.

## When to re-tune

- **KPI breaks alert threshold** — D7 retention dropped 3pp, ARPDAU collapsed, conversion to first IAP halved
- **Meta degenerates** — pick rate concentration across roster, dominant strategy in PvP, dead content
- **Economy drifts** — currency velocities outside model's predicted band for >2 weeks
- **New content drop misfires** — wrong difficulty, wrong drop rates, wrong price point
- **Community signal telemetry confirms** — vocal complaint + telemetry corroboration = re-tune trigger; vocal complaint alone is not

## When NOT to re-tune

- **Noisy week** — holiday, competing game launch, server outage distort metrics. Wait for two weeks clean data.
- **Vocal minority complaint without telemetry support** — loudest players ≠ median.
- **Ongoing playtest of new feature** — re-tuning during experiment contaminates results.
- **Right after previous re-tune** — players need time to *feel* change before next lands.

## The re-tune plan

Any live balance change:

1. **Hypothesis.** What's wrong, what telemetry shows it, what change should do.
2. **Magnitude.** How much. Small changes reversible; large changes look panicked.
3. **Rollout.** A/B if population allows. Else % rollout (5% → 25% → 100%) over days.
4. **Rollback plan.** What signal triggers rollback; how fast.
5. **Comms plan.** Patch notes; *why*, not just *what*. Coordinate with [game-marketer](../../game-marketer/SKILL.md).
6. **Predicted impact** with confidence interval. From spreadsheet model.
7. **Re-validation cadence.** When you check change did what was intended.

## Touching monetized content

Special care:

- **NFT / paid premium content** — *cannot* be silently nerfed. Players paid for current behavior.
- **Battle pass contents** — players paid expecting current rates. Reduce rates only at season transitions, not mid-season.
- **Hard-currency exchange rates** — players bought currency expecting current purchasing power. "Stealth" devaluation detected within hours; trust takes months to recover.

Must change monetized content:
- **Compensation.** Refunds, in-game compensation, equivalent free content.
- **Disclosure ahead of time.** "In two weeks, X will change because Y."
- **Grandfather where possible.** Players who bought before change keep original.

## Touching the economy at scale

Inflation or deflation accumulated → large re-tunes tempting. Resist. Instead:

- **Sink injection** — limited-time content absorbing excess stock (rare cosmetics, named items, anniversary events)
- **Source events** — for deflation, time-limited bonus weekends
- **New tier** — extend curve with new prestige/season, recalibrate at new ceiling
- **Currency reset** — last resort; players hate it; coordinate with [game-marketer](../../game-marketer/SKILL.md) for narrative

## A/B testing balance

Population large enough to A/B (typically 10,000+ DAU):

- **Holdout group** — representative slice stays on old balance for comparison
- **Single change per A/B** — don't bundle multiple balance changes in one experiment
- **Duration** — long enough for weekly behavior cycles (2+ weeks for retention); not so long population notices difference
- **Metric** — define *primary* metric (thing change should move) and *guardrail* metrics (things that must not regress)
- **Pre-register success criterion** — change wins if metric X moves ≥Y with p<Z; otherwise loses. No moving goalposts.

Coordinate with `growth-engine` for experimental framework.

## Comms (with [game-marketer](../../game-marketer/SKILL.md))

Patch notes are content. Community reads them more carefully than your design doc. Rules:

- **Lead with *why*.** "We're nerfing X because the meta is dominated by it" beats "X: 15% damage reduction."
- **Acknowledge what you're breaking.** Nerfing fan-favorite → say so; players know either way.
- **Don't oversell.** Tentative changes sound tentative ("we'll be watching closely").
- **Don't be defensive.** Players critique. Listen; don't dunk on them.
- **Patch notes read aloud on streams and YouTube.** Write to be readable, not just informative.

## Updating the model

After every re-tune:

- Update spreadsheet to reflect change
- Update predicted KPIs per new model
- Update sensitivity table — re-tune may change which levers most sensitive
- Update telemetry contract — new metrics may be needed to validate new balance
- Update design intent next to variable — *why* this is new value

Re-tune shipped without model update = next balancer flies blind.

## Output

Per live re-tune:
- Change list with magnitudes and rationale
- Predicted impact + confidence
- Rollout plan + rollback plan
- Comms plan + patch notes draft (hand to [game-marketer](../../game-marketer/SKILL.md))
- Updated model
- Re-validation date and team owner
