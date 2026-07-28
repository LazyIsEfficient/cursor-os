# Postmortems

Postmortem is practice of turning incident into permanent organizational learning. Done well, same incident never happens twice. Done badly, postmortems are theater: document gets written, nobody reads it, same outage happens again in three months under different alert.

Single most important thing about postmortems: **they are blameless, or they are useless.** First time you point finger at person, you stop collecting truth. Can have blame, or can have learning. Pick one.

## What a Postmortem Is For

In priority order:

1. **Generate action items that ship.** Permanent reductions in chance of incident happening again.
2. **Spread knowledge.** Other teams learn what broke, what tried, what worked, without living through it.
3. **Surface contributing factors** not obvious during incident — process gaps, missing instrumentation, misaligned incentives.
4. **Accountability without blame.** Owners named for action items; those owners responsible for *fixing forward*, not for "what they did wrong."

Postmortem not for:

- Punishing responder.
- Performing thoroughness for audit.
- Producing document nobody will read.
- Closing ticket so team can move on.

If writing one for any of those reasons, producing waste.

## When to Write One

Required:

- Any **SEV 1** or **SEV 2** incident.
- Any incident where **error budget significantly burned**.
- Any incident with **customer-visible data loss or corruption**, regardless of severity.
- Any **near-miss** that, if one variable slightly different, would have been SEV 1.

Optional but encouraged:

- A **surprising success** — system handled something better than expected. Find out why, codify it.
- A **recurring SEV 3** happened more than twice. First occurrence unlucky; third is pattern.

Not required:

- Single-customer SEV 4s with obvious causes and no broader implication.
- Fully-known incidents whose action items already in flight from previous postmortem.

## Blameless Culture, Concretely

"Blameless" easy to *claim*, hard to *practice*. Test:

> Could a junior engineer admit they made the change that caused the incident, in writing, in this document, and expect to be treated as source of information rather than source of fault?

If answer no, postmortem not blameless.

### Concrete rules

- **Use passive or descriptive voice for actions, active voice for systems.**
  - ❌ "Glenn deployed v1.42, which broke checkout."
  - ✅ "Version 1.42 was deployed at 13:00 UTC. The deploy passed CI but introduced a regression in payment processing that was not caught by the existing tests."
- **NEVER include the word "should have".** Say "existing process did not require X; we will change process to require X."
- **Frame human error as system problem.** "Responder unaware migration had to run before deploy." → "Deploy process did not enforce migration ordering."
- **Praise, don't blame.** "On-call mitigated incident in 12 minutes by rolling back; speed of response prevented further impact."
- **Separate postmortem document from conversation.** People may be defensive in writing; talk through harder parts in person before drafting.
- **Senior people set the tone.** If most senior person in room willing to admit they might have made mistake, everyone else relaxes.

### What blame looks like (avoid)

- "The engineer should have noticed."
- "If only X had double-checked."
- "It was a careless mistake."
- "This was preventable if Y had followed the process."

### What contributing factors look like (use)

- "Migration safety check disabled in staging environment, so failure mode not exercised before production."
- "Runbook for this alert not updated since architecture change six months earlier."
- "Dashboard that would have shown underlying queue depth was on different team's Grafana instance and not linked from alert."
- "Deploy pipeline ran migration after application rolled out, leading to window where new code expected column that did not yet exist."

Notice: every contributing factor names a *thing in system* that can be changed.

## The Five-Whys (Carefully)

Five-whys technique useful for surfacing contributing factors, but only with discipline:

- **Each "why" should target system or process, not person.**
  - ❌ "Why did the engineer deploy without testing?" → "Because they were rushed."
  - ✅ "Why did the deploy proceed without the test passing?" → "Because CI flag disabled in this branch."
- **Stop when you have found fixable contributing factor**, not at five exactly. Sometimes found at three.
- **Branch when multiple causes.** Real incidents usually have several contributing factors, not single chain.

## Structure of a Postmortem

Useful postmortem has following sections. (See [assets/postmortem-template.md](../assets/postmortem-template.md) for fillable version.)

### 1. Summary (one paragraph)

Non-technical reader should understand what broke, who affected, how resolved. Three or four sentences.

### 2. Impact

- Which users affected?
- How many?
- For how long?
- Quantified if possible: "approximately 2,400 checkouts failed between 14:17 and 14:38, an estimated $14k in lost gross revenue."
- SLO impact: "consumed 65% of monthly error budget for checkout availability."

### 3. Timeline

Bulleted list with timestamps in UTC. Pull from incident channel where possible.

```
14:17 UTC — Deploy of payments-svc v1.42 to production completes.
14:19 UTC — Burn-rate alert fires (5m window, rate 22x).
14:21 UTC — On-call (Glenn) acknowledges page; opens incident channel.
14:22 UTC — IC declares SEV 2; comms posts internal status update.
14:25 UTC — Initial hypothesis: dependency outage. Investigation starts in parallel with mitigation.
14:32 UTC — Hypothesis updated: deploy correlation suspected; rollback initiated.
14:36 UTC — Rollback complete.
14:38 UTC — Error rate returns to normal. Mitigation confirmed.
14:40 UTC — Mitigation declared in channel and on status page.
15:10 UTC — Underlying cause identified (see Root Cause section).
```

### 4. Root Cause / Contributing Factors

**Resist urge to name single root cause.** Real incidents usually have multiple contributing factors combining to produce failure. List them.

For each factor:

- What it was.
- Why it was there.
- What would have prevented it from contributing.

Example:

> **Contributing factor 1: Migration ordering not enforced by deploy pipeline.** Deploy pipeline runs application rollout in parallel with database migrations, no dependency between them. Version 1.42 added new column reference; migration to add column had not yet completed when v1.42 began serving traffic. Enforcing migration-before-rollout in pipeline would have prevented window of inconsistency.
>
> **Contributing factor 2: Test gap.** Test suite for payments-svc mocks database schema rather than running against real migration. Missing column therefore not detected by CI. Running integration tests against freshly migrated test database would have caught this.
>
> **Contributing factor 3: Alert lag.** Error rate alert fired 2 minutes after symptom began. Within budget for SEV 2, but faster (1m short window) alert would have shaved time off mitigation.

### 5. What Went Well

Section mandatory. Postmortems that *only* enumerate failures train teams to expect blame. Name things that worked:

- "Burn-rate alert fired within 2 minutes of symptom; previous configuration would have taken 15 minutes."
- "On-call's first action was to open runbook, which contained rollback command they ended up using."
- "Communication cadence clear; customer success team had information needed without asking."
- "Rollback clean and reversible; v1.41 had no database state migrations applied since."

### 6. What Could Have Gone Better

Honest counterpart to "what went well." Things that delayed mitigation, made incident harder to diagnose, made response stressful.

- "Dashboard for payments-svc not linked from alert; responder spent ~3 minutes finding it."
- "No clear escalation path documented; responder hesitated before paging secondary."
- "Customer-facing status page updated 12 minutes after public-facing incident channel; customers had already noticed."

These items often become action items.

### 7. Action Items

Most important section. Action items must be:

- **Specific.** "Add migration ordering enforcement to deploy pipeline" — not "improve deploy safety."
- **Owned.** Named individual or team. "TBD" same as "never."
- **Tracked.** Ticket reference. Action item exists in team backlog, not just postmortem document.
- **Prioritized.** Each item gets priority (P0/P1/P2). P0 means "before next normal sprint"; P1 means "this quarter"; P2 means "on backlog with intent to ship."
- **Bounded.** 6-month epic not action item. Break down.

Example:

| # | Action item | Owner | Priority | Ticket |
|---|---|---|---|---|
| 1 | Add migration-before-rollout enforcement to deploy pipeline | platform team | P0 | INFRA-2031 |
| 2 | Update payments-svc tests to run against real migrated DB | payments team | P1 | PAY-1842 |
| 3 | Link payments-svc dashboard from alert template | SRE | P0 | SRE-512 |
| 4 | Tighten burn-rate alert short window from 5m to 1m | SRE | P1 | SRE-513 |
| 5 | Document escalation path for payments-svc rotation | payments team | P0 | PAY-1843 |
| 6 | Add automatic status page update on incident-channel creation for SEV 1/2 | comms team | P2 | COMMS-44 |

### 8. Lessons Learned

Short prose section for things that do not fit cleanly as action items but worth remembering:

- "Mocks of database schema in tests can produce false confidence; integration tests against real migrated DB worth runtime cost."
- "Burn-rate alerts work; speed of detection here justified effort to set up."
- "Incident comms cadence good but public side lags internal side by ~10 minutes — worth automating."

## The Postmortem Review

Draft is not postmortem. Document must be **reviewed in meeting** with team, IC, on-call, and ideally representative from affected stakeholder group (product, customer success).

### What review meeting is for

- **Sanity-check timeline and contributing factors.** Often someone in room has context writer missed.
- **Pressure-test action items.** Specific enough? Owned? Realistic?
- **Spread learning.** People not in incident learn from those who were.
- **Catch blame leakage.** Reader from outside immediate team may notice phrasing writer did not.

### What review meeting is *not* for

- Litigating who is at fault.
- Re-opening decisions made during incident.
- Adding speculative action items team has no intent to ship.

### Cadence

SEV 1 review dedicated meeting; usually within five business days. SEV 2 reviews can be combined into weekly "ops review" where multiple postmortems walked through.

## Action Item Follow-Through

Single biggest failure mode of postmortem programs: **action items do not ship**. Filed, forgotten, same incident happens again.

### What works

- **Action items are tickets in team's normal backlog**, not in separate postmortem tool nobody looks at.
- **A standing review** (monthly fine) walks through all open postmortem action items and re-prioritizes any that have not moved.
- **P0 action items block** team's next sprint. No new feature work until they ship.
- **Team's reliability investment percentage** explicitly funds postmortem follow-through. Not "if there's time" — *if there is not time, work is wrong shape*.
- **Stalled action items become incidents themselves.** After 90 days unmoved, SRE lead escalates.

### What does not work

- Action items in wiki nobody owns.
- Action items assigned to "the team" instead of individual.
- Action items depending on someone else's roadmap with no commitment from that team.
- "Improve testing" as action item.

## Postmortems for Near-Misses

Near-miss is incident that almost happened but did not, because of luck or because someone caught it. These are gold:

- Cost low (no actual user pain).
- Lesson same as real incident.
- People less defensive, so discussion honest.

Treat near-misses as full postmortems. Action items usually cheap and high-impact: "we got lucky here, let us not get lucky next time."

## Anti-Patterns

- **The blame postmortem.** Names person or team as cause. Produces fear, hides truth, recurs.
- **The sanitized postmortem.** Written defensively for audience of executives or auditors. Real lessons in private document team uses instead.
- **The single-root-cause postmortem.** Lists exactly one cause. Real incidents have several; you missed some.
- **The action-item-free postmortem.** "We talked about it." Nothing changes. Same incident in two months.
- **The postmortem nobody reads.** Filed, never opened. Reading and *citing* postmortems in design discussions is how lessons travel.
- **Postmortem gatekeeping.** "We didn't write postmortem because cause was obvious." If it had been obvious *before* incident, incident would not have happened. Write it.
- **The "unowned" action item.** "Eventually we'll fix this." Eventually means never.
- **The boilerplate postmortem.** Same template fields filled by reflex with no real content. Worse than no postmortem because crowds out real work.
- **Postmortems that never reference each other.** Three separate incidents have same contributing factor; nobody notices because postmortems live in isolation. Build index. Search them.

## Related

- [incident-response.md](incident-response.md) — data postmortem draws from
- [alerting-and-paging.md](alerting-and-paging.md) — alert improvements common postmortem action items
- [runbooks.md](runbooks.md) — runbook improvements also common
- [toil-and-automation.md](toil-and-automation.md) — recurring incidents become automation work
- `team-lead` — action items become tickets
- [assets/postmortem-template.md](../assets/postmortem-template.md) — fillable template
