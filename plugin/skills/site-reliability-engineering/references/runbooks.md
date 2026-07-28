# Runbooks

Runbook is document on-call opens at 3am. Purpose: make next 30 minutes survivable — confirm what is happening, take right action, escalate if needed, leave system better than before.

Runbook is **not** manual, design doc, or architectural overview. It is *production response document*. Treat anything not directly helping stressed responder act as noise — and delete it.

## The Hard Rule

> **Every alert that pages a human links to a runbook. No runbook → no alert.**

Non-negotiable. Cost of authoring runbook much smaller than cost of one responder fumbling through diagnosis at 3am. If tempted to add alert without runbook, *delete alert until runbook exists.*

## Anatomy of a Useful Runbook

Every runbook has same six sections, same order. Consistency matters: responder knows where to find each thing without thinking.

### 1. Header

- **Service:** which service runbook for
- **Alert(s):** names of alerts linking here
- **Severity:** severity these alerts fire at
- **Owning team:** who maintains runbook (accountable when stale)
- **Last verified:** date human last actually walked through it (not "last edited" — that is a lie people game)

### 2. Symptom

Plain-English description of what alert *means in user terms*. One paragraph.

> "The Checkout API is returning 5xx errors at a rate that will exhaust our error budget within an hour if it continues. Customers attempting to complete a purchase will see an error message and their cart will not be processed."

Notice: about *user*, not metric. Metric details belong in dashboards.

### 3. Verify the Alert Is Real

Short list of checks confirming alert not false positive. Two or three items, each link or one-line command.

- Open dashboard: <link>
- Confirm error rate visible in last 5 minutes: should be > 1%
- If error rate < 0.1%, alert is false positive. Silence and ticket: <silence link>

Step takes 60 seconds and saves responder from chasing phantom incident.

### 4. Immediate Mitigation

Single most important section. **What does responder do *first*, before understanding anything?**

- Bullet list of mitigation actions, in order of "try first."
- Each action specific enough to execute without further research: command, link to runbook button, or specific UI path.
- Each action notes **blast radius** and **reversibility**.

```
1. Check the deploy log for any release in the last 30 minutes.
   - If yes: roll back via `make rollback SERVICE=checkout-api`. Reversible. Takes ~3 minutes.

2. If no recent deploy, check upstream dependency health: <dashboard link>.
   - If a dependency is unhealthy, check that team's status page. If the dependency owner is unaware, page them: <escalation link>.

3. If neither: scale up the service to 2x current replicas via `make scale SERVICE=checkout-api COUNT=20`.
   - Reversible. Takes ~90s. Costs ~$X/hour.

4. If still failing: drain the affected region and route traffic to standby region. <link to drain command>
   - Higher blast radius. Use only after steps 1-3.
```

Responder should execute step 1 within 60 seconds of opening runbook. If cannot, runbook wrong.

### 5. Diagnosis (After Mitigation)

How to investigate *once bleeding stopped*. Section longer, less time-critical:

- Where to look in logs / traces / metrics.
- Common causes and their fingerprints.
- Useful queries (PromQL, BigQuery, log search) responder can copy-paste.
- Decision tree for common branching paths.

```
## Diagnosis after mitigation

### Confirm what the rollback (or other action) actually fixed
- Watch the error rate for 10 minutes after mitigation. It should drop to baseline within 60 seconds.
- If it doesn't, mitigation may not have been the right one — return to mitigation steps.

### Common causes
1. **Recent deploy with a regression** — most common. Compare last good and current versions: `git diff <good>..<bad> -- src/`
2. **Dependency failure** — check upstream service status and our retry/circuit-breaker metrics: <dashboard>
3. **Resource exhaustion** — check connection pool saturation, queue depth, memory: <dashboard>
4. **Database lock contention** — check pg_stat_activity: <query link>
5. **Configuration drift** — recent secrets/config change: <audit log link>

### Useful queries
- Error breakdown by endpoint: `sum by (route) (rate(http_requests_total{status=~"5..", job="checkout"}[5m]))`
- Slow requests: `histogram_quantile(0.99, sum by (le) (rate(http_request_duration_seconds_bucket{job="checkout"}[5m])))`
```

### 6. Escalation

Who to call when runbook not enough.

- **Primary escalation** (on-call's secondary or team lead): <link or phone>
- **Subject matter experts** for this service: <names + how to reach>
- **Dependency teams** in case cause upstream: <list of dependency teams>
- **Status page owner** for SEV 1 communications: <link>

Section exists so responder does not make judgment call about who to wake up. Runbook tells them.

## What Belongs in a Runbook (and What Doesn't)

| Belongs | Doesn't belong |
|---|---|
| Exact command to run | History of why service was built |
| Direct links to dashboards | List of every dashboard team has |
| Escalation phone number / chat handle | Complete org chart |
| Common causes with concrete diagnostic queries | Theoretical taxonomy of failure modes |
| What to tell customers (for customer-impact alerts) | Full content of marketing FAQ |
| When to wake team lead | Debate about whether team lead should be on call |

Test for any runbook content: **does this help responder act in next 10 minutes?** If yes, keep. If no, move to design doc, architecture doc, or wiki.

## Keeping Runbooks Alive

Runbooks rot. System changes; runbook lags; eventually wrong, and responder following it makes things worse. Three practices prevent:

### 1. Verify after every incident that used runbook

After any incident where responder opened runbook, IC notes (in postmortem) whether runbook helped, was wrong, or missing steps. Runbook owner has 5 business days to update.

### 2. Schedule a "runbook walkthrough" exercise

Once per quarter (or per major architecture change), pick runbook and have someone *walk through it on non-production environment*. Run commands, click links, confirm dashboards exist. Anything broken fixed in same session.

One thing that catches link rot, command-flag drift, dashboard renames, stale URLs before they bite real responder.

### 3. Track "last verified" honestly

Header field is `Last verified: 2026-04-07`, not "Last edited." Tweak typo, verified date does not change. Walk through end to end, it does.

Monthly report lists every runbook whose `Last verified` date more than 90 days old. Owning team responsible for re-verifying.

## When to Write a New Runbook

Required:

- Whenever new alert added that pages humans.
- After any **incident with no runbook** — postmortem creates one as action item.
- After any **incident where existing runbook was wrong** — postmortem fixes it.

Optional but good:

- For complex *operations* team does manually, even if not alert-driven (database failover, secret rotation, region drain). Operational runbooks; prevent toil-induced mistakes.

## When to Delete a Runbook

Runbook deleted if:

- Alert it serves deleted.
- Service it serves retired.
- "Last verified" date more than a year old and nobody knows what it does.
- Runbook tells responder to "wait and see if self-resolves" (in which case, delete *alert* too — not actionable).

Short, accurate runbook beats long, stale one every time.

## Runbook Hygiene Rules

- **One alert ⇒ one runbook.** Do not share runbook across alerts with meaningfully different responses. If two alerts deserve same response, merge alerts.
- **Linked from alert text itself.** Not "see wiki." Not "find in Confluence." Clickable link in page payload opening runbook.
- **Versioned.** Runbook lives in source control next to code it describes. Reviewable in PRs. Changes have history.
- **Searchable.** Indexed; responder finds by service name, alert name, or symptom.
- **Idempotent commands.** Mitigation commands safe to run twice. Responder *will* run twice when stressed.

## A Worked Example

```markdown
# Runbook: Checkout API — Elevated Error Rate

**Service:** checkout-api
**Alert(s):** CheckoutAPIErrorRateBurnRateFast, CheckoutAPIErrorRateBurnRateSlow
**Severity:** SEV 2 (fast burn) / SEV 3 (slow burn)
**Owning team:** payments
**Last verified:** 2026-03-22

## Symptom

The Checkout API is returning 5xx errors faster than our SLO budget allows.
Customers trying to complete a purchase will see an error and their cart
will not be processed.

## Verify the Alert Is Real

1. Open the dashboard: https://grafana.example.com/d/checkout-api
2. Confirm 5xx rate > 1% over the last 5 minutes
3. If rate < 0.1%, this is a false positive. Silence: https://alerts.example.com/silence/checkoutapi

## Immediate Mitigation

1. **Check for a recent deploy** (last 30 min): https://deploys.example.com/checkout-api
   - If yes: `make rollback SERVICE=checkout-api`. Takes ~3 min, reversible.
   - Confirm error rate drops within 60s after rollback completes.

2. **Check upstream dependencies:** https://grafana.example.com/d/checkout-deps
   - If `payment-gateway` shows red, page that team: https://pages.example.com/team/gateway
   - If `inventory-service` shows red, page that team: https://pages.example.com/team/inventory

3. **Scale up** if no clear cause:
   - `make scale SERVICE=checkout-api COUNT=20`
   - Doubles capacity. Reversible. Costs ~$8/hour at this scale.

4. **Drain affected region:**
   - Only if steps 1–3 don't work and impact is region-correlated.
   - `make drain REGION=us-east-1 SERVICE=checkout-api`
   - Higher blast radius; consult IC before executing.

## Diagnosis After Mitigation

### Confirm mitigation held
- Watch error rate for 10 minutes after the action.
- If it doesn't drop to baseline, return to mitigation steps.

### Common causes
1. **Recent deploy regression** (most common) — diff the deploys, look for changes in `src/payment/`.
2. **Payment gateway outage** — check vendor status: https://status.payment-gateway.com
3. **Database connection pool exhaustion** — check `pgbouncer_pools`: <dashboard>
4. **Inventory service slow** — check upstream p99: <dashboard>

### Useful queries
- Error rate by endpoint: `sum by (route) (rate(http_requests_total{status=~"5..", job="checkout"}[5m]))`
- Top failing routes: `topk(5, sum by (route) (rate(http_requests_total{status=~"5..", job="checkout"}[5m])))`

## Escalation

- **Primary escalation:** payments team secondary on-call → https://pages.example.com/payments-secondary
- **SMEs:** Glenn (deploy/infra), Alex (payment logic), Sam (database)
- **For SEV 1:** contact the engineering manager + post on #incidents-leadership
- **Status page:** https://status.example.com/admin (post if customer-facing for > 5 minutes)
```

## Anti-Patterns

- **Wiki-as-runbook.** Pages of background, no clear action steps. Responder reads 10 minutes and still does not know what to do.
- **Linkfarm runbook.** Just list of dashboards with no guidance. "Look at these and figure it out."
- **Stale runbook.** Commands no longer work, dashboards renamed, escalation paths to people who left company.
- **The "see code" runbook.** "If alert fires, look at source code." Useless under stress.
- **The runbook that requires a runbook.** Steps assume context responder does not have. Test by giving runbook to someone unfamiliar with service.
- **No `Last verified` field.** Or worse: `Last verified` field nobody updates honestly.
- **Escalation that says "ask the team."** Which team? Whose phone? Be specific.
- **Speculation in runbook.** "It might be database, or possibly cache, or maybe..." Diagnostic decision tree, not list of guesses.
- **Mitigation steps that are not reversible** without warning. Responder needs blast radius before executing.
- **"Wait 15 minutes; usually self-resolves."** Then alert not actionable. Delete alert.

## Related

- [alerting-and-paging.md](alerting-and-paging.md) — every alert links to runbook
- [incident-response.md](incident-response.md) — runbook opened in step 6 of first five minutes
- [postmortems.md](postmortems.md) — runbook improvements common action items
- [toil-and-automation.md](toil-and-automation.md) — runbook step 1 done twice → runbook step 1 becomes script
- [assets/runbook-template.md](../assets/runbook-template.md) — fillable runbook template
