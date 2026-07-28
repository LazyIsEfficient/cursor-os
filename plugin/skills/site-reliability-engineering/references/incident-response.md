# Incident Response

Incident in progress when something wrong in production *and someone paged about it*. Job from that moment until customer stops feeling pain: **mitigate fast, communicate clearly, resist urge to chase root cause before bleeding stops**.

Two most common failures during incident:

1. **Diagnosing before mitigating.** "I want to understand it before I touch it." Meanwhile users keep failing.
2. **Communicating poorly.** Internal stakeholders, customers, next responder all need to know what is happening; if you do not tell them, they interrupt or escalate over you.

Both are habits, both trainable.

## Roles

For anything bigger than SEV 3, separate work into roles. Even single responder can wear multiple hats — but should *know* which hat wearing at each moment.

### Incident Commander (IC)

Owns incident start to finish. **Does not fix anything themselves.** Job is coordinate.

- Decides severity and escalates if changes.
- Assigns roles.
- Makes mitigate-vs-investigate calls.
- Decides when incident mitigated and when resolved.
- Hands off to next IC at shift end if incident long-running.

If no designated IC, *first responder is IC by default* until explicitly hands off.

### Operations / Subject Matter Expert (Ops)

Person actually executing mitigation: rolling back, draining traffic, scaling up, restarting, applying runbook step.

Multiple ops people fine for big incidents, but IC must coordinate so they do not conflict.

### Communications Lead

Owns external and internal status updates. Talks to customer-facing teams, posts to status page, updates incident channel. **IC and ops people should not write comms** — too busy.

For SEV 3 and below, IC can absorb role. For SEV 1, dedicated person.

### Scribe

Writes down what is happening, real time, with timestamps. Transcript is basis for postmortem and any compliance reporting.

Bot in incident channel often handles this — every message timestamped automatically. Otherwise designate human.

## Severity (Decided Up Front, Adjusted as You Learn)

See [alerting-and-paging.md](alerting-and-paging.md#severity-tiers) for full scale. Two rules during incident:

1. **Start at highest plausible severity.** Easier to downgrade than upgrade. If dashboard shows 30% errors and unsure how big "30%" really is, treat as SEV 1 until known.
2. **Severity decided by impact, not visibility.** Scary-looking metric nobody outside engineering can see is not SEV 1; undetected data corruption affecting one user is not SEV 4 if data critical.

## The First Five Minutes

When page lands, do these things, roughly in order, regardless of severity:

1. **Acknowledge the page.** Stops escalation; tells system someone is on it.
2. **Open the linked dashboard.** Confirm alert real (not monitoring artifact).
3. **Confirm severity** by checking actual user impact, not just metric.
4. **Open or join the incident channel.** Many teams auto-create one per incident; if not, make one with known naming convention (`#inc-2026-04-07-checkout-5xx`).
5. **Post an initial status update**:
   ```
   :rotating_light: SEV2 incident opened
   Service: checkout-api
   Symptom: ~5% error rate, ~6 minutes
   IC: <yourself>
   Status: investigating
   Next update: in 10 minutes
   ```
6. **Open the runbook** linked in alert.

Until step 6, you have not started fixing anything. That is correct. Setup fast and pays for itself many times over.

## Mitigate First, Diagnose Second

> **Stop the bleeding before you understand it.**

Instinct of every engineer with curiosity: figure out *why* broken before changing anything. Wrong instinct in production.

Right sequence:

1. **Is there a known mitigation that works without understanding cause?** Examples:
   - Rollback the last deploy.
   - Drain the affected region; route to healthy one.
   - Scale up to absorb load.
   - Restart the misbehaving process.
   - Disable the broken feature flag.
   - Failover to the secondary.

   If yes, do it. *Then* diagnose with pressure off.

2. **Is the mitigation reversible?** If yes, do it even if unsure it will help.

3. **Is the mitigation worse than the symptom?** Rare, but real — e.g. rollback might trigger database migration worse than bug. Use judgment, but bias toward action.

4. **Diagnosing is for after mitigation, or in parallel by second person.** IC should be making sure mitigation happening, not staring at logs.

### Examples of "mitigate first" in practice

| Symptom | Mitigation (try first) | Diagnose (after) |
|---|---|---|
| 5xx rate spike right after deploy | Rollback | What changed in deploy |
| One region failing, others healthy | Drain that region | What is wrong with region |
| Latency spike correlated with load | Scale up + rate limit | Why this scale broke |
| One pod misbehaving | Restart it | Why it got stuck |
| Database CPU pegged | Kill long-running queries; failover to replica | Which query / which feature |
| Single user reporting failure | Investigate; do not reach for mitigation | (probably SEV 3) |
| Dependency returning errors | Cache last-known-good response, fail open or closed depending on call | Talk to dependency's team |

## Communication Cadence

Every SEV 1 or SEV 2 incident needs **regular status updates**, even if update is "no change." Cadence is part of contract with rest of org.

| Severity | Update frequency |
|---|---|
| SEV 1 | Every 15–30 minutes, plus on every state change |
| SEV 2 | Every 30–60 minutes |
| SEV 3 | At opening, on resolution |

Each update has same shape:

```
:rotating_light: SEV2 — Checkout API elevated errors
Status: mitigated; observing
Impact: ~3% of checkouts failed between 14:17 and 14:38 UTC.
Mitigation: Rolled back payments-svc to v1.41 at 14:36.
Current state: Error rate normal for the last 6 minutes.
Next steps: Monitoring for 30 minutes; investigating root cause in parallel.
Next update: 15:15 UTC.
IC: Glenn
```

Three things this format gives:

- **Stakeholders can ignore rest of channel** and still stay informed.
- **Next IC can pick up** by reading most recent update.
- **Postmortem timeline** writes itself from these updates.

For SEV 1, also update **public status page** on same cadence. Acknowledging incident publicly uncomfortable but alternative — customers finding out from each other — much worse for trust.

## "Mitigated" vs "Resolved"

Different; conflating is one of most common failure modes.

- **Mitigated**: user pain stopped. Symptom no longer occurring. Incident no longer SEV 1/2 from user perspective.
- **Resolved**: underlying problem fixed. Mitigation no longer needed; system back to normal operating mode.

Rollback is mitigation. Actual bug still in code; next deploy containing it reintroduces incident. Rollback does not *resolve* anything — buys time.

IC declares mitigation explicitly:

```
:white_check_mark: INCIDENT MITIGATED at 14:38 UTC.
Symptom no longer occurring. Service is operating normally.
Underlying cause not yet fixed; rollback is in place.
Postmortem: Glenn will own. Action items to follow.
This channel will remain open for 30 minutes for additional observations.
```

Incident *resolved* later, often in separate ticket, when underlying fix shipped through normal release.

## When to Call for Help

Call for more help **earlier than feels comfortable**. Cost of pulling someone in unnecessarily tiny; cost of struggling solo through SEV 1 because did not want to wake anyone enormous.

Specific triggers:

- Incident going for **15 minutes with no clear mitigation path**.
- **Not the right SME** for what is broken.
- **Tired or stressed** and judgment starting to slip.
- **Blast radius growing** and cannot keep up with comms while ops-ing.
- Approaching **end of shift** and incident not done.

Escalation path should be in runbook. If not, IC's job to find someone — by phone if necessary.

## Handing Off an Incident

Long incidents (more than a few hours) span shifts. Handoff is most error-prone moment in incident. Do carefully:

1. **Designate new IC explicitly.** Old IC says "Alex is now IC, effective now." New IC ack'd.
2. **Walk through current state.** Old IC briefs new IC on:
   - What is broken, plain English.
   - What has been tried.
   - What is currently mitigating it.
   - What is currently being investigated.
   - What has not been tried yet.
3. **Update the channel.** "IC handoff complete. Alex is now IC."
4. **Old IC stays available for ~15 minutes** to answer questions, then explicitly disconnects.

Do not hand off mid-action. Finish action in progress, then hand off cleanly.

## Customer Communication

For SEV 1 and SEV 2 incidents touching external users, customer needs to hear from you. Three rules:

1. **Acknowledge fast, even with limited information.** Silence worse than uncertainty.
2. **Be specific about what is affected.** Customers cannot act on "we're seeing some issues."
3. **Do not promise a timeline you cannot keep.** "We're investigating; next update in 30 minutes" is honest. "Should be fixed in 10 minutes" is hostage to fortune.

Good first public update:

> We are investigating reports of failed payments on our Checkout API affecting some customers in the EU region. Our team is engaged. We will update at 14:45 UTC.

That is it. No speculation, no causes, no apologies that sound like deflections. Next update will be more informative.

## After Mitigation

Incident not *over*; mitigated. IC checklist for cooldown:

- [ ] Confirm mitigation holding (watch metrics 15–30 minutes).
- [ ] Update channel and status page that mitigation in place.
- [ ] Note root cause investigation continues separately.
- [ ] Schedule postmortem (within 5 business days; sooner for SEV 1).
- [ ] Assign postmortem owner.
- [ ] Tag incident channel with `mitigated`.
- [ ] Send team home; on-call resumes normal duties or hands off.

IC then writes **incident summary** while fresh: short paragraph for postmortem template capturing what happened, when, how mitigated, impact. See [postmortems.md](postmortems.md).

## Anti-Patterns

- **Diagnose-first.** Spending 40 minutes reading logs while error rate stays at 30%.
- **Lone wolf.** Never asks for help, fixes everything personally, burns out. Or worse — gets it wrong because nobody checking work.
- **Silent operator.** Doing fixes without telling channel. Other responders try same things in parallel; comms team no idea what to tell customers.
- **Premature all-clear.** Declaring mitigation before metric actually recovered. Incident "comes back" five minutes later, much louder.
- **No IC.** Several people fixing in parallel, no coordination, conflicting actions. Inevitable when team has not agreed on IC role.
- **The IC who fixes things.** IC tries to debug *and* coordinate *and* communicate. All three suffer; incident drags.
- **"It's resolved"** when really mitigated. Fix never lands; incident reoccurs in two weeks under new alert noise.
- **Postmortem skipped because "we know what happened."** Then action items never ship and same incident happens again.
- **Skipping severity escalation** because "we don't want to scare leadership." Leadership being scared is the *point* — they fund reliability work.
- **Customer communication delayed** until full picture. By then customers tweeting about outage.

## Related

- [alerting-and-paging.md](alerting-and-paging.md) — what wakes you up in first place
- [postmortems.md](postmortems.md) — what happens after dust settles
- [runbooks.md](runbooks.md) — document you open in step 6 above
- [on-call.md](on-call.md) — rotation that makes this sustainable
- [security-engineering](../../security-engineering/SKILL.md) — security incidents follow same playbook with extra care around comms and chain-of-custody
- [assets/incident-template.md](../assets/incident-template.md) — fillable template for use during live incident
