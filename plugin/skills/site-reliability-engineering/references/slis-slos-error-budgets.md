# SLIs, SLOs, and Error Budgets — In Production

Architect picks SLO *targets* (see `system-architect`). This file is about *operationalizing* them: measure, alert, report, use as contract with product team.

## Vocabulary, Precisely

| Term | Definition | Example |
|---|---|---|
| **SLI** (Service Level Indicator) | A *measurement* of some aspect of service behavior | "Fraction of HTTP requests returning 2xx/3xx within 500ms" |
| **SLO** (Service Level Objective) | A *target* for an SLI over a window | "99.9% of requests succeed within 500ms over rolling 28 days" |
| **SLA** (Service Level Agreement) | A *contract* with users with consequences (refunds, credits) when violated | "If we miss 99.5% in a month, customer gets 10% credit" |
| **Error Budget** | `1 - SLO` over the window — how much unreliability is *allowed* | At 99.9% over 28 days: 40 minutes 19 seconds of failure budget |

Most common confusion: **SLOs are not SLAs.** Always set internal SLO *tighter* than any external SLA — headroom to detect and respond before contract triggers.

## Picking SLIs That Matter

A good SLI:

1. **Reflects user experience.** "Did user get thing they asked for, in time?" — not "did server CPU stay below 80%."
2. **Is a ratio of "good events" over "valid events"**, expressed as percentage. Easy to reason about and combine across services.
3. **Has clear "good" and "valid" definitions** surviving code review.
4. **Comes from data already collected** — do not introduce new instrumentation just to satisfy SRE.

### The four golden signals (Google SRE)

For most user-facing services, start here:

- **Latency** — how long requests take (split successful vs failed; failed requests can be misleadingly fast).
- **Traffic** — how much demand service experiencing (RPS, concurrent users).
- **Errors** — fraction of requests that fail (explicitly errored, wrong content, too slow).
- **Saturation** — how "full" service is (queue depth, thread pool utilization, connection pool).

Latency and errors usually become SLIs. Traffic and saturation usually become *capacity signals* and dashboard/alert inputs, not SLOs themselves.

### RED and USE — alternatives for different lenses

- **RED** (Tom Wilkie) — *Rate, Errors, Duration*. For request-driven services. Effectively golden signals minus saturation.
- **USE** (Brendan Gregg) — *Utilization, Saturation, Errors*. For resources (CPU, disk, network).

Use RED for services, USE for resources underneath. Together: "is service working" and "is substrate healthy."

## Defining an SLO Concretely

A complete SLO statement contains six things:

1. **The SLI** (the ratio).
2. **The threshold** (99.9%).
3. **The window** (rolling 28 days).
4. **The user perspective** (which clients/endpoints included).
5. **The exclusions** (planned maintenance windows, requests with malformed input).
6. **The owner** (a team that responds when at risk).

Example:

> **Checkout API availability SLO**
> 99.9% of HTTP requests to `/api/v1/checkout/*` from clients other than synthetic monitoring system, excluding requests returning `400` due to client-side validation errors, will complete with 2xx response within 800ms, measured over rolling 28-day window. Owned by Payments team.

If you cannot write the statement in one paragraph, SLO not crisp enough yet.

## The Error Budget

`Error budget = 100% - SLO target`, expressed as time, requests, or both.

| SLO | Budget per 28 days (time) |
|---|---|
| 99% | ~6h 43m |
| 99.5% | ~3h 21m |
| 99.9% | ~40m |
| 99.95% | ~20m |
| 99.99% | ~4m |
| 99.999% | ~24s |

Two practical lessons:

- **Each "9" is roughly 10× more expensive.** Going from 99.9% to 99.99% same effort multiple as 99% to 99.9%. Do not add nines without a reason a CFO would accept.
- **Above 99.99% you cannot even *deploy*.** Most CI/CD pipelines take longer than 4 minutes; single bad deploy blows a month of budget. If genuinely need 4 nines or better, release strategy must account for it (canaries, automatic rollback under tens of seconds).

## Burn-Rate Alerting (the only alert pattern that actually works)

Naive alert ("if budget remaining < 0%") fires too late. Naive threshold alert ("error rate > 1%") too noisy. Right pattern: **multi-window, multi-burn-rate alerts**.

Idea: alert when error budget being burned *fast enough that, if current rate continued, budget exhausted before team could respond*.

### Burn rate

> `Burn rate = (current error rate) / (SLO error rate)`

Burn rate of 1.0 means using budget exactly as fast as SLO allows. Burn rate of 14.4 means burning entire 30-day budget in ~50 hours.

### Two-window alert (Google SRE workbook)

| Severity | Long window | Short window | Burn rate threshold | Budget consumed if not fixed |
|---|---|---|---|---|
| **Page** | 1 hour | 5 min | ≥ 14.4 | 2% of monthly budget per hour |
| **Page** | 6 hours | 30 min | ≥ 6 | ~5% per 6h |
| **Ticket** | 24 hours | 2 hours | ≥ 1 | "we are over our SLO budget pace, fix during business hours" |
| **Ticket** | 72 hours | 6 hours | ≥ 1 | slow burn that will eventually matter |

**Two windows** prevent false positives: long window confirms burn is sustained; short window ensures alert fires quickly when burn starts. Alert only fires if *both* above threshold.

### Example PromQL

```promql
# Page severity (fast burn)
(
  sum(rate(http_requests_total{job="checkout", status=~"5.."}[1h]))
  /
  sum(rate(http_requests_total{job="checkout"}[1h]))
) > (14.4 * 0.001)  # 0.001 = 1 - 0.999 SLO
AND
(
  sum(rate(http_requests_total{job="checkout", status=~"5.."}[5m]))
  /
  sum(rate(http_requests_total{job="checkout"}[5m]))
) > (14.4 * 0.001)
```

## Error Budget Policy

Error budget is a *contract*. Without explicit policy, budget is just metric on dashboard.

Useful policy is one paragraph everyone — engineering, product, leadership — signed off on, in writing, **before budget ever exhausted**:

> **Checkout API Error Budget Policy**
>
> When rolling 28-day error budget for Checkout API is between 100% and 25% remaining, normal release cadence applies. Between 25% and 0%, only changes that improve reliability or fix root cause are released; feature work pauses. When budget is exhausted, all non-reliability releases are halted and a dedicated reliability sprint begins until budget is restored to ≥ 50%. The Payments team lead and product manager for Checkout jointly approve any deviation from this policy.

Hard part is not writing policy. It is first time enforcing it against pressure to ship a feature. Policy is what protects you from that pressure.

## How Many SLOs?

Common mistake: SLO for every endpoint and every dependency. Tax of maintaining exceeds value.

**Defaults:**

- **One availability SLO and one latency SLO per user-facing service.** Not per endpoint.
- **Group endpoints by user journey**, not by URL. "Browse," "search," "checkout" — each a journey with own criticality.
- **Background/batch jobs have *freshness* SLOs**, not availability — "data no more than 30 minutes stale 99% of time."
- **Internal-only services may not need SLOs at all** — or have SLOs *consumed* by callers' SLOs.

If you find more than ~3 SLOs per service, you are modeling implementation, not user experience.

## Reporting

Error budget needs visibility, not just for SRE team but for product. Two artifacts:

1. **A real-time dashboard** showing remaining budget, burn rate over last hour/day/week, and recent incidents that consumed budget.
2. **A weekly or monthly review** in which SRE team and product walk through every SLO at risk and decide whether to invest in reliability work or accept risk. This conversation is where budget actually does its job.

## Anti-Patterns

- **SLO as vanity metric** — published on dashboard, never enforced. Worse than no SLO; gives false confidence.
- **Aspirational SLO** — set to number nobody believes, then ignored when missed. Set SLO to actual user expectation, not your hopes.
- **Per-endpoint SLO** — death by a thousand SLOs. Group by user journey.
- **Burn alerts on long window only** — alert hours late; budget gone by time it fires. Always pair long with short.
- **No exclusions for synthetic traffic** — synthetic monitor itself burns budget when it fires too aggressively.
- **SLA = SLO** — contractual SLA leaves no headroom for team to react before breached. Internal SLO must be tighter.
- **"We don't have an error budget policy yet"** — then you do not have an SLO. You have a graph.
- **Changing the SLO when it is missed.** SRE equivalent of moving goalposts. Right response: spend budget fixing cause or renegotiate with product, not lower bar.

## Related

- [alerting-and-paging.md](alerting-and-paging.md) — alert philosophy burn-rate alerts implement
- [incident-response.md](incident-response.md) — what happens when alert fires
- [postmortems.md](postmortems.md) — how SLO breaches feed back into reliability work
- `system-architect` — designing instrumentation that produces SLI data
- `system-architect` — sizing decisions that determine whether you can hit SLO
