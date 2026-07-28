# Capacity and Load Management

Architect plans capacity at design time (see `system-architect`). This file covers what happens *at runtime*: how to scale, how to shed load, how to degrade gracefully, how to keep system from cascading into total failure when something breaks.

Defining property of well-managed system under load: **gets slower or smaller before falling over**, and gets back up cleanly after load passes.

## The Two Failure Modes

Every overload incident is one of two things:

1. **System cannot keep up.** Demand exceeds capacity; queues fill, latency spirals, eventually nothing succeeds. Cure is more capacity or less demand.
2. **System *almost* keeps up but gets into bad state from which cannot recover.** "Death spiral": single slow component causes timeouts upstream, causes retries, causes more load, makes slow component slower. Cure is breaking feedback loop.

Most production overloads start as type 1, become type 2 if not addressed quickly. Death spiral is dangerous one.

## Autoscaling — The Limits

Autoscaling is first answer most teams reach for, right answer in many cases. But has well-known limits:

### Where autoscaling works

- **Stateless services** with quick startup times.
- **Predictable scale-up signals** (CPU, request queue depth, latency).
- **Capacity that can grow horizontally** without coordination (no shard rebalancing required).
- **Backed by infrastructure that can actually provide more capacity** (cloud, not bare metal).

### Where autoscaling fails

- **Slow startup.** Service taking 5 minutes to be ready cannot autoscale fast enough for real surge — by time new instance ready, surge over (or existing instances already collapsed).
- **Bad scaling signal.** CPU poor proxy for load on I/O-bound services. Request queue depth or latency usually better.
- **Downstream bottleneck.** Scaling API up does not help if database is bottleneck. Scale API to ten times size, now database even more overloaded.
- **Correlated scale-up across many services.** Traffic spike causes ten services to scale up same time, all hammering same database during warmup. Cure becomes new failure.
- **Cost runaway.** Misconfigured autoscaler responding to runaway loop by adding instances happily produces $50k/day cloud bill. Always set max replicas.

### Rules for autoscaling that does not bite back

- **Always set max replicas.** Cost ceiling non-negotiable.
- **Set scale-up thresholds aggressively** (scale up at 60% utilization, not 90%) so have time before system overwhelmed.
- **Set scale-down thresholds conservatively** (do not scale down for at least 10 minutes after scaling up) so no oscillation.
- **Pre-warm before predictable surges.** If traffic spikes at 9am, scale up at 8:55, not 9:01.
- **Test warmup path.** New instance taking 90 seconds to be ready is *not* "responsive" autoscaling — measure warmup explicitly, account for it.

## Load Shedding

When demand exceeds capacity and cannot scale fast enough (or should not), right answer: **serve fewer requests, deliberately**, while keeping ones served fast and successful.

Opposite — accepting every request, slowly failing all — is death spiral.

### Shedding strategies, in order of preference

1. **Reject at the edge.** Return 429 ("Too Many Requests") or 503 with `Retry-After` at load balancer or API gateway, before request consumes backend resources. Cheapest possible failure.
2. **Reject by priority.** Drop low-priority traffic first. Read-only health checks for monitoring should NEVER fail; user reads fall before user writes; bot traffic falls before human traffic.
3. **Reject by cost.** Drop requests consuming most resources (large search queries, expensive joins) before cheap ones.
4. **Degrade features.** Serve stripped-down response — recommendations skipped, related items skipped, fewer paginated rows. Page works; just shows less.
5. **Queue with a deadline.** If request willing to wait, make it wait, with maximum queue time. Past that, reject. NEVER queue indefinitely.

### Hard rules

- **Fail fast, not slow.** 429 in 5ms better than 200 in 30 seconds. Slow success starves capacity.
- **Health checks bypass shedding.** If monitoring being shed, flying blind during incident.
- **Tell client to retry with backoff.** `Retry-After` header client respects is difference between recovery and stampede.
- **Do not shed silently.** Emit metrics for what shed, by class. Shedding rate is itself an SLI.

## Queue Depth as a Vital Sign

Queues are most underused leading indicator in production. By time CPU high or latency spiked, queue already filling for a while.

- **Every async pipeline has a queue.** Brokers, work queues, request queues inside services, even OS socket accept queue. Each has depth.
- **Alert on queue depth growing**, not absolute depth. Consistently 200-message queue fine; queue tripled in last 5 minutes is warning shot before outage.
- **Alert on *age* of oldest item in queue.** Sometimes more useful than depth; tells how stale freshest delivered work is.
- **Bound queues.** Unbounded queue is unbounded latency. When bound hit, shed (preferably) or backpressure to producer.

## Backpressure

Backpressure is practice of *propagating* "I cannot handle more" signal *upstream* so producer slows down instead of overwhelming.

Simplest backpressure: fixed-size connection pool. When pool exhausted, next request waits (or fails fast). Caller learns saturated, retries with backoff or fails up its own chain.

### Implementations

- **Bounded thread pools** rejecting when full instead of queuing forever.
- **Bounded HTTP connection pools** with explicit `maxConnections` and `failFast` policy.
- **Rate limiting at producer**, not just consumer — token buckets, sliding windows.
- **HTTP 429 / 503 responses** with `Retry-After` (simplest cross-service backpressure protocol).
- **gRPC `RESOURCE_EXHAUSTED`** with retry hints.
- **Reactive streams** in JVM/JS land, with explicit demand signals.

Goal same in all: **upstream knows when to slow down**, not because of clever heuristic but because downstream told it.

## Graceful Degradation

Degraded system much better than down system. Degradation is practice of choosing, ahead of time, *what to give up* when system under stress.

### Examples

| Component | Healthy mode | Degraded mode |
|---|---|---|
| Recommendations | Personalized recommendations | Top-10 globally popular |
| Search | Real-time search index | Cached search results, slightly stale |
| Pricing | Live currency conversion | Last-known conversion rate |
| Profile page | Full profile + activity feed | Profile only; activity feed omitted |
| Checkout | Full payment options | Card-only; alternative methods disabled |
| Image processing | Original + 4 thumbnail sizes | Original only; thumbnails generated lazily |

Choice of "what to give up" not made during incident — designed in advance, with explicit code paths and feature flags. During incident, SRE flips flag.

### Hard rules

- **Decide degradation paths in design, not in production.** Architect picks; SRE operates.
- **Test degraded path.** Run gameday turning it on, confirm system actually works in that mode. Untested degradation is decoration.
- **Make degradation visible to users when appropriate.** Small "limited functionality" banner honest, prevents support volume.
- **Have clear restore path.** Going back to full operation single command, tested.

## Circuit Breakers and Bulkheads

*Design-time* patterns documented in `system-architect`. At runtime, SRE owns:

- **Tuning thresholds.** Trip rate, half-open trial frequency, recovery window. Need adjustment based on real production data.
- **Monitoring breakers.** Open breaker is signal — if breaker *always* open, dependency broken or threshold wrong.
- **Acting on tripped breakers.** Tripped breaker not fix — signal something wrong with dependency. Investigate, either fix dependency or accept and document degraded mode.
- **Bulkhead sizing.** Connection pools, thread pools, queue limits per dependency.

## Retry Storms

Retries most common cause of cascading failures. Simple "retry on error" policy across multiple services creates feedback loop:

1. Service A briefly slow.
2. Callers retry, doubling load.
3. Service A now slower because of retry traffic.
4. More retries.
5. Total collapse.

### Hard rules for retries

- **Exponential backoff with jitter.** Constant backoff produces synchronized retry storms; jitter spreads out.
- **Bounded retries.** Three usually enough. Above that, not retrying — hammering.
- **Retry budgets.** Maximum percentage of requests that may be retries. Above that, retries dropped. (Envoy and other modern proxies support.)
- **Do not retry idempotent-only operations.** Retrying non-idempotent POST is how duplicate orders created.
- **Respect `Retry-After`.** 429 with 30-second hint and retrying in 1 second is misbehavior.
- **Circuit-break the retries themselves.** When dependency clearly down, *stop* retrying, fail fast.

General pattern: **retries should be exception, not policy**. Most successful operations succeed first try. If seeing high retry rate, dependency broken, not slow — fix it.

## Cost vs. Capacity

Useful framing: **provision for load you can predict; absorb spikes with degradation, not capacity.**

- Capacity for steady-state load + reasonable headroom (~30%) → cheap and reliable.
- Capacity for worst-case spike → expensive, rarely needed.
- Mechanisms to *handle* spike (autoscaling + load shedding + degradation) → right place to invest.

Team responding to every overload incident by buying more capacity eventually has enormous cloud bill *and* still knocked over by next surprise. Team investing in load management runs cheaper and more reliably.

## Anti-Patterns

- **"Just add more capacity."** Sometimes right; usually tax on budget not fixing underlying fragility.
- **No max replicas.** Misconfigured autoscaler producing $30k cloud bill in 12 hours.
- **Unbounded queues.** Latency spiral every time consumer hiccups.
- **Retry without backoff.** Self-DoS at scale.
- **Health checks behind same shedding logic as user requests.** Stop seeing system trying to manage.
- **Degradation paths never tested.** Do not work when needed; production traffic finds bugs.
- **Autoscaling on CPU for I/O-bound services.** Wrong signal; service falls over while CPU sits at 30%.
- **Death spiral nobody saw coming because queue-depth alerts did not exist.** Add them.
- **Capacity provisioned for absolute peak.** Cheap during peak, very expensive every other minute of year.
- **Manual scaling as only mitigation strategy.** Works until spike faster than on-call reaction time.
- **Restart-as-mitigation for memory leaks** nobody fixes. Pod restart becomes load-bearing.

## Related

- `system-architect` — design-time sizing math
- `system-architect` — circuit breakers, bulkheads, timeouts as design patterns
- [slis-slos-error-budgets.md](slis-slos-error-budgets.md) — capacity SLIs and headroom budgets
- [chaos-and-resilience.md](chaos-and-resilience.md) — exercising degradation paths before needed
- [incident-response.md](incident-response.md) — what to do when load management fails
- [typescript-data-engineering/references/message-brokers.md](../../typescript-data-engineering/references/message-brokers.md) — broker-specific backpressure patterns
- [typescript-data-engineering/references/caching.md](../../typescript-data-engineering/references/caching.md) — caching as load-shedding tool
