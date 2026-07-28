# Chaos Engineering and Resilience Testing

Premise of chaos engineering simple and uncomfortable: **only way to know whether system handles failure is to cause one.** Every untested failure mode is future incident.

Mature form of practice is *not* "let's break things in production and see what happens." Disciplined experiment: hypothesis, contained blast radius, instrumentation to confirm or refute hypothesis, clear stop condition.

Central tension: chaos exercises produce most learning when closest to real production conditions, *and* produce most damage when system not ready. Get readiness right before turning on chaos.

## The Spectrum

Five levels of resilience testing, least invasive to most:

| Level | What it is | When to use |
|---|---|---|
| **Tabletop** | Walk through failure scenario in meeting | Always start here |
| **Gameday** | Simulate failure in controlled environment with on-call team | Before any real chaos |
| **Fault injection in staging** | Actually break things in non-production environment | Once gameday clean |
| **Fault injection in production, small blast radius** | Targeted, observed, with stop conditions | Once staging chaos routine |
| **Continuous chaos in production** | Automated, ambient, always running | Mature org with strong observability |

**Most teams should not run continuous production chaos.** Run tabletops and gamedays. Hierarchy exists for reason: each level requires more confidence in layers below.

## Tabletop Exercises

Tabletop is cheapest, safest, most underused form of resilience testing. Pick failure scenario, walk through in meeting, ask team how would respond.

### Format

1. **Pick a scenario.** "Region us-east-1 becomes completely unreachable for 2 hours starting 14:00 UTC." Or: "Payment processor stops returning successful responses but still accepts requests."
2. **Pick the participants.** On-call rotation, an SRE, ideally someone from dependent team or product.
3. **Walk through minute by minute.** Someone facilitates ("You get page at 14:02. What does it say?"). Team narrates what would do, what alerts would fire, what runbooks would open, what would communicate.
4. **Note every gap.** Things team cannot answer, runbooks not existing, dashboards not findable, escalation paths nobody knew. These are action items.
5. **Do not fix things in meeting.** Capture gaps; assign owners; schedule fixes; re-run tabletop later.

### What you learn

- Which alerts would fire and which would not.
- Whether runbooks for relevant alerts exist and accurate.
- Whether dashboard responder needs is findable.
- Whether escalation path clear.
- Whether team has shared mental model of system, or multiple inconsistent ones.
- Whether right *external* communication would happen on right cadence.

Tabletop costs an hour, finds problems otherwise discovered at 3am during real incident. Cheapest possible resilience investment.

## Gamedays

Gameday is step up: *actually staged* incident in controlled environment, with on-call team responding as if real.

### Setup

- **Pick target environment**: usually full staging environment or production cell drained of real traffic.
- **Pick a scenario.** Specific and bounded: "Inject 50% packet loss between API gateway and payments service for 20 minutes."
- **Define hypotheses up front.** "We expect: alerts X and Y to fire within 3 minutes; on-call to follow runbook Z; system to remain up via failover path."
- **Define stop conditions.** "If real customers affected, stop. If on-call stuck more than 15 minutes without path forward, stop. If anyone in room thinks something genuinely wrong, stop."
- **Brief the team.** Everyone knows it is gameday, but respond as if real. (Advanced gamedays can run *unannounced* — but only when team doing announced ones successfully for a while.)
- **Have an observer.** Someone not responding, just watching and taking notes for postmortem.

### Run the gameday

Exercise looks like real incident: pages fire, runbooks open, IC declares roles, comms happen. Observer watches for:

- Time from injection to first page.
- Time from page to first action.
- Time from first action to mitigation.
- Whether runbook correct.
- Whether diagnosis correct.
- Communication clarity.
- Anything responder said out loud revealing gap ("wait, where is dashboard for this?").

### Postmortem the gameday

Gameday produces real postmortem. Action items usually concrete: fix this runbook, add this dashboard, automate this manual step, change this alert threshold.

Team gets same lessons from real incident, without user impact.

## Fault Injection in Staging

Once gamedays routine, next level is *automated* fault injection in staging: tools like Chaos Mesh, Gremlin, AWS Fault Injection Simulator, or Litmus programmatically introducing failures.

### What to inject

In rough order of value-per-effort:

1. **Network latency** between services. Most production incidents look like "everything got slower"; can system tolerate real version?
2. **Network partition** — completely block traffic between two services. System falls over, or degrades gracefully?
3. **Pod / process kill** — kill random instance. Load balancer routes around? New instances start cleanly?
4. **Disk full** on node. System handles without corruption?
5. **Clock skew** between nodes. (Surprisingly common cause of subtle bugs.)
6. **Dependency outage** — kill database, cache, broker. Rest of system handles as designed?
7. **DNS failure** — block resolver. (Most services fail spectacularly here.)
8. **Slow disk** — add latency to disk operations. Surfaces buried timeout assumptions.

### Rules

- **Define experiment as hypothesis.** "When we inject 200ms latency on payments-service to db connection, we expect circuit breaker to trip within 30 seconds and service to return cached responses for next 5 minutes."
- **Have kill switch.** Single command stops experiment immediately. Test before starting experiment.
- **Run during business hours** first several times. Team awake and watching.
- **Start small** and expand blast radius gradually. First injection: one pod, 30 seconds. Tenth injection: entire service, 30 minutes.
- **Have observability ready before injecting.** If cannot tell what experiment doing to system, not learning anything; just damaging things.

## Production Chaos

Production chaos most controversial form of resilience testing, most valuable when done right. Reason: **staging never fully reproduces production**, so some failure modes only exist in production. Chaos in production finds them.

### Prerequisites

Before running any chaos in production:

1. **Mature observability.** Can see what is happening real time, on every service involved.
2. **Tested mitigation paths.** Rollback, drain, scale-up — all known to work in non-chaos contexts.
3. **An incident response process team has practiced.** Not time to discover IC role not defined.
4. **Strong on-call rotation** — see [on-call.md](on-call.md).
5. **Stakeholder buy-in.** Product, customer success, leadership know production chaos happening, agreed to blast radius limits.
6. **Insurance:** SLOs healthy, error budget well above zero, no major launches in flight.

If any missing, **not ready for production chaos**. Stay in staging.

### Rules

- **Smallest possible blast radius.** Single pod, single AZ, small percentage of users. NEVER whole fleet.
- **Defined stop conditions in advance.** "If error rate exceeds 0.5%, abort." Automated where possible.
- **A human watching.** Not script, not dashboard refresh — person whose job during experiment is abort if something looks wrong.
- **Daytime, weekday.** NEVER Friday afternoon. NEVER holiday weekend.
- **Communicated.** Relevant teams (on-call, comms, leadership) know running.
- **Reversible.** Can undo instantly.
- **Logged.** Every parameter, observation, action. Postmortem of chaos experiment as valuable as postmortem of real incident.

### What is worth running in production

- **Single-instance kills** to verify health checks and autoscaling.
- **Latency injection on single dependency** to verify circuit breakers and timeouts.
- **Region failover tests** (drain region, route to another, drain back).
- **Canary deploys** as form of gentle, continuous chaos — every release experiment with built-in rollback.

## Continuous / Ambient Chaos

Most mature form: tool like Chaos Monkey running continuously, randomly killing instances during business hours. Not experiment per kill; *baseline* forcing team to design every service to handle instance loss as non-event.

Works only when:

- Instance loss genuinely non-event for every service.
- Observability catches anything *not* non-event immediately.
- Team running gamedays and bounded chaos for at least a year with clean results.

Most teams never get here. Fine.

## When Chaos Is Malpractice

Chaos engineering not always appropriate. **Skip it (or postpone) when**:

- Do not have observability good enough to tell what happening when breaking things.
- On-call team not trained on incident response.
- Unaddressed action items from previous incidents.
- System has known reliability problems not fixed yet — chaos tells you "things are broken," which you already know.
- Major launch, regulatory deadline, or critical business event in flight.
- Error budget exhausted.
- Proposing chaos in production without first running in staging.
- Stakeholders have not agreed.

Point of chaos engineering is *find* unknown problems. If have known problems, fix first. Chaos is not therapy.

## Building a Resilience Practice

Practical roadmap for team starting from zero:

| Quarter | Activity |
|---|---|
| Q1 | Run tabletop exercise once a month. No real failures. Pure walkthrough. |
| Q2 | Run gameday in staging once per quarter. Bounded scenario, observed by SRE. |
| Q3 | Add automated fault injection in staging on recurring schedule. Minor incidents. |
| Q4 | Run single bounded production chaos experiment. One pod, one minute, full observation. |
| Year 2 | Expand production chaos to dependency failures and regional drills. |
| Year 3 | Continuous chaos in production for most critical services. |

Most value comes in first two quarters. Do not skip ahead.

## Anti-Patterns

- **Chaos for theater.** Run because someone read blog post; no hypothesis, no learning, no action items. Just damage.
- **Production chaos before staging chaos.** Skipping cheaper, safer practice, going straight for dramatic one.
- **No stop condition.** "Let's see what happens." What happens is unmitigated outage.
- **No observer.** Nobody watching experiment; team finds out about damage from alert queue.
- **Chaos targeting things already known broken.** Just causing incident you have been avoiding.
- **Friday chaos.** Or weekend chaos. Or holiday chaos. Team that has to clean up not there.
- **Chaos as substitute for fixing things.** "We injected failure and it worked!" No it did not — produced incident, which you mitigated. System still fragile.
- **Untested kill switch.** "Abort" command never actually verified. When needed, does not work.
- **No postmortem of chaos experiment.** Learn less than half of what would learn with postmortem.
- **Expanding blast radius too fast.** First experiment one pod 30 seconds; second experiment whole region an hour. Mature gradually.

## Related

- [incident-response.md](incident-response.md) — chaos exercises practice incident response
- [postmortems.md](postmortems.md) — gameday and chaos postmortems use same template as real incidents
- [capacity-and-load-management.md](capacity-and-load-management.md) — degradation paths discovered by chaos exercises
- `system-architect` — design-time patterns chaos verifies
- [on-call.md](on-call.md) — chaos exercises double as training for new on-call
