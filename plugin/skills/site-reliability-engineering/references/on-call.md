# On-Call

On-call is system, not list of names. Designed well, produces fast incident response and sustainable team. Designed badly, produces missed pages, burnout, quiet attrition. Single best predictor of "is this engineering org healthy" is whether on-call something engineers tolerate or actively dread.

This file is playbook for designing and running rotation respecting both **production** and **the people**.

## Primary Goals of an On-Call Rotation

In priority order:

1. **Pages get answered** — primary always, escalation always works, no silent failure.
2. **The team stays healthy** — sleep protected, work bounded, fairness enforced.
3. **Incident knowledge spreads** — every shift produces learning, not just heroics.
4. **The system gets better** — on-call's first job after page is make page not happen again.

If rotation produces fast pages but burns out team, failed. If team happy but pages not answered, failed. Both must hold.

## Rotation Patterns

### Single primary

One person on call at a time. Rotates by week (most common), day, or shift.

- **Use when**: small team (3–6 engineers), low page volume, single timezone.
- **Avoid when**: page volume exceeds ~2 per shift, team fewer than 4 people (no fair rotation possible), or team spans timezones.

### Primary + secondary

Primary handles pages; secondary takes over if primary does not ack within escalation window, and is escalation for hard incidents.

- **Use when**: any team where missing single page unacceptable.
- **Secondary is not backup pager**; exists to *prevent* missed pages and share load on multi-page incidents.

### Follow-the-sun

Rotation hands off between geographic regions every ~8 hours so nobody on call overnight.

- **Use when**: team has people in 2–3 well-distributed timezones.
- **Hard requirement**: explicit handoff at every shift change. See [handoff rituals](#handoff-rituals).
- **Trap**: does not work with two timezones eight hours apart — still six-hour overlap with no coverage. Need three regions or timezone gap small enough to absorb.

### Tier 1 / tier 2

Tier 1 (often dedicated ops or SRE team) handles initial triage; tier 2 (dev team) escalated to for hard problems.

- **Use when**: very large org, very high volume of routine alerts.
- **Trap**: insulates dev teams from consequences of their alerts and code, weakening incentive to fix root causes. Cap percentage of incidents tier 1 can resolve without escalation, or accept quality will rot.

## Sizing the Rotation

**Minimum:** 4 people. Below this, fairness breaks down — one person on vacation puts entire rotation on remaining members. 5–8 sweet spot.

**Page load:** if average pages per shift exceed ~2, rotation unsustainable. Fix is **always to reduce pages**, not add people. (Adding people without reducing pages is same problem distributed.)

**Sleep nights expected:** assume on-call loses sleep on roughly 1 in 3 shifts. If losing sleep more often, alerting broken; see [alerting-and-paging.md](alerting-and-paging.md).

## Handoff Rituals

Most error-prone moment in any rotation is handoff between shifts. Outgoing on-call has context incoming one needs:

- **Open incidents** and current state.
- **Recently mitigated** issues that might reignite.
- **Known degraded dependencies** and what to expect.
- **Planned maintenance** during upcoming shift.
- **Anything weird** that did not quite cross alert threshold but worth watching.

Handoff template (whether posted in chat channel or done synchronously):

```markdown
## On-Call Handoff — 2026-04-07 09:00 → 16:00

**Outgoing:** Glenn
**Incoming:** Alex

### Open incidents
- INC-2031: checkout 5xx spike, mitigated by rollback at 14:23. Postmortem owner: payments team.
- (none other)

### Watch list
- API gateway p99 trending up over the last 4 hours; not yet over SLO. Dashboard: <link>
- Cache fleet running on warmup after this morning's deploy; expect higher origin load until ~10:00.

### Recent changes
- Deploy of payments-svc v1.42 at 13:00. Observed clean.
- Pulumi update on prod cluster scheduled for 11:00 by infra team.

### Anything else
- Customer X is testing a load scenario from 10:00–12:00; expect ~5x normal traffic on /api/v1/search.

### Acknowledged?
- [ ] Incoming has read this and questions answered.
```

Incoming person **must explicitly acknowledge** handoff. Silent handoff is no handoff.

## Compensation

On-call is work. Compensate for it. Cultural mistakes here expensive:

- **Unpaid on-call burns team out and produces attrition.** Eventually people who can leave do leave.
- **"Voluntary" rotations skew toward same few volunteers** until they break.
- **Comp time, paid stipends, or hourly rates** all work; right one depends on local laws and norms. Pick *something* explicit and apply consistently.

Reasonable default in tech: stipend per week of primary on-call, doubled or tripled for being paged outside business hours, plus comp time for any night involving active incident response. Document it; do not make people negotiate.

## Sleep Protection

Sleep loss cumulative and expensive. Protect it:

- **Anyone paged after midnight gets next morning off.** Not optional. Their work next day worth less than their sleep.
- **No on-call shift longer than 12 hours of "active" coverage** when page volume high. Split it.
- **No on-call shift day before or after vacation.** Hand off cleanly.
- **Track lost-sleep incidents** as team metric. Leading indicator of attrition.
- **On-call should not be expected to do project work during shift** if page volume non-trivial. Trying both produces neither.

Team lead's job is enforce protections *for* team, not make them earn them.

## Onboarding to On-Call

Nobody goes on-call solo on first rotation. Standard onboarding sequence:

1. **Shadow** experienced on-call for full shift. Read every incident, ask questions.
2. **Reverse-shadow**: take pages with experienced on-call observing and ready to take over.
3. **First solo shift** paired with designated escalation buddy, *not* secondary.
4. After 2–3 solo shifts, new on-call fully integrated.

For engineer never done on-call before, week of reading runbooks and incident archives useful prep. So is tabletop exercise — see [chaos-and-resilience.md](chaos-and-resilience.md).

## What the On-Call Does (Beyond Answering Pages)

Productive on-call shift looks like:

- **Watching dashboards** during business hours, especially around deploys.
- **Triaging alert queue** — silencing noise, fixing pending.
- **Improving runbooks** — every page involving "wait, what does this mean?" produces runbook edit.
- **Writing or scheduling postmortems** for any incident hitting user pain.
- **Owning on-call backlog** — toil team agreed to chip away at during slow shifts.
- **Doing handoff well**.

Notice what not on list: shipping features. On-call is team's *operational* shield this week; feature work paused or background.

## Wellbeing Check-Ins

After every nontrivial incident, on-call's manager checks in. Two questions:

1. "How are you feeling about that one?"
2. "Is there anything you need?"

Not therapy; pattern recognition. Engineer answering "fine, nothing" three incidents in a row when clearly worn down is signaling — listen.

## Anti-Patterns

- **The hero rotation.** One person handles hard incidents because only one who knows system. Burns out, leaves, team now blind. Fix by deliberately rotating responsibility and writing things they know into runbooks.
- **No secondary, no backup.** Single missed ack becomes missed incident.
- **Punitive on-call.** Used as tool to make people "pay attention to quality" by inflicting pain. Produces attrition, not quality.
- **Silent rotation.** Engineers do not know who is on call this week. Fix by surfacing in team channel topic.
- **No pager test.** Engineers go on call without ever confirming pager works. First real page at 3am.
- **Manager-immune rotation.** Managers exempt. Team learns on-call something junior people do. Fix by including manager (in low-traffic seat if needed).
- **No compensation.** See above. Burnout, attrition, long-term reputation problem.
- **24/7 single-region rotation with 3 people.** Each person on call ⅓ of time, sleep destroyed in rotation. Either grow team or change page severity until follow-the-sun works or rotation shrinks.
- **"Everyone is always on call."** Ambient guilt for everyone, accountability for nobody.
- **Page volume hidden from leadership.** If people deciding budget do not see page-per-week graph, they do not fund work to reduce it.

## Related

- [alerting-and-paging.md](alerting-and-paging.md) — fewer/better pages most effective on-call improvement
- [incident-response.md](incident-response.md) — what to do once page acked
- [postmortems.md](postmortems.md) — turning incidents into permanent improvements
- [toil-and-automation.md](toil-and-automation.md) — recurring on-call work is toil; reduce it
- [runbooks.md](runbooks.md) — on-call's most-used document
