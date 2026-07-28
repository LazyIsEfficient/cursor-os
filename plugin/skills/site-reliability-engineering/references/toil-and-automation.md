# Toil and Automation

Toil is operational work consuming engineering time without producing lasting value. Left unmanaged, grows until team has no time for anything else; slow tax turning high-velocity team into maintenance team.

Most important thing about toil: must be **measured and capped**, not "felt." Team handling toil "as it comes up" eventually does nothing else.

## The Definition (Google SRE)

Toil is operational work with *all* following characteristics:

- **Manual** — human doing it.
- **Repetitive** — same shape, again and again.
- **Automatable** — script or tool could do instead.
- **Tactical** — driven by interrupt, not plan.
- **No enduring value** — when done, system exactly where it was.
- **Scales linearly with system** — twice as much system, twice as much toil.

Definition precise on purpose. Things merely *annoying* not toil; things *seeming* automatable but only running once a year not toil; things producing value (refactoring, design work) not toil even if repetitive within themselves.

### Examples of toil

- Manually approving routine deploys.
- Running database snapshot before every release because script broken.
- Restarting stuck worker every few days.
- Rotating expired certificates by hand.
- Resizing disk filling predictably every two weeks.
- Acking same noisy alert over and over, silencing 4 hours.
- Manually adding user to group when joining team.
- Triaging incoming bug tickets, routing to teams.
- Walking through 12-step checklist for "release" that should be button.

### Examples that are *not* toil

- **Postmortems.** Repetitive, but produce enduring value (lessons, action items).
- **On-call response to novel incidents.** Tactical and manual, but each different problem.
- **Code review.** Repetitive in cadence, but value is the catch.
- **Refactoring.** Manual and repetitive *within* refactor, but result permanent.
- **Design discussions.** Manual but produce decisions, not just state changes.
- **Painful manual things done twice a year.** Annoying, but automation cost almost certainly exceeds toil cost.

If unsure: ask "if I never do this task again, is system in worse state?" If yes, not toil. If no, is toil.

## Why Toil Is Dangerous

Three reasons toil more harmful than looks:

1. **Crowds out engineering work.** Every hour on toil is hour not spent building reliability, paying down debt, shipping features. Team capacity to *improve* system shrinks.
2. **Scales with system.** Most toil grows linearly (or worse) with deployment size. As system grows, toil becomes dominant load on team.
3. **Produces burnout and attrition.** Engineers signed up to build, not babysit. Team becoming toil farm loses best people first — they have other options.

Team you do not notice overwhelmed by toil today is team losing three engineers in six months and you cannot figure out why.

## The 50% Rule

> **No SRE should spend more than 50% of their time on toil over a quarter.**

Google SRE workbook rule, useful default. Two reasons:

1. **Remaining 50% goes to engineering work reducing toil.** Without investment, toil only ever grows.
2. **Forcing function.** When cap breached, *team* has to push back — declare bankruptcy, escalate to leadership, drop projects, or ship automation. Without cap, conversation never happens.

50% number not magic; some teams target 30%, some allow 60% temporarily during launch. What matters: **a number exists, measured, triggers action when breached.**

## Measuring Toil

Two things that work:

### 1. Self-reporting

End of every on-call shift, on-call estimates how many hours of shift were toil. Logged in shared spreadsheet or dashboard.

Approximate but honest; trend matters more than precise number. Shift consistently reporting 80% toil is problem regardless of whether real number 75% or 85%.

### 2. Categorize incoming work

Tag every ticket `toil`, `engineering`, or `incident-response`. Run monthly report. Watch ratio.

Harder to game; gives per-team metric team lead can present to leadership.

## The Automation Backlog

Toil identified but not yet eliminated lives on **automation backlog**. Real backlog with real prioritization, not wish list.

Each item has:

- **What is being toiled on** (concrete terms).
- **How often it occurs** (and time per occurrence).
- **Estimated cost** to automate.
- **Estimated saving** per quarter, in engineer-hours.
- **Owner** for automation work.

Worked example:

| Toil | Frequency | Cost / occurrence | Quarterly cost | Cost to automate | Owner |
|---|---|---|---|---|---|
| Restart stuck `email-worker` pods | ~2x/week | 15 min | ~6h | ~2 days | Glenn |
| Rotate vendor API keys | quarterly | 4h | 4h | ~1 week | Alex |
| Triage incoming `bug` tickets | ~10/day | 3 min | ~32h | ~1 week (auto-routing) | Sam |
| Manually add new joiners to engineering groups | ~1/week | 20 min | ~4h | ~3 days | Infra |

"Quarterly cost" column sortable. **Automate highest-cost item first**, regardless of how interesting.

## What Counts as "Automated"

Three levels of automation, each better than last:

1. **Scripted.** Human runs script when needed. Cuts time, reduces error, but still requires human to notice trigger.
2. **Triggered.** Script runs automatically in response to event (cron, alert, deploy hook). Human intervenes only for exceptions.
3. **Self-healing.** System detects and corrects condition without producing work for human at all.

Aim for highest level toil justifies. Stuck-pod restarts happening weekly should be self-healing (Kubernetes liveness probes). Quarterly key rotations might just be triggered. One-off cleanups might just be scripted.

Cost ratio matters: **do not spend a week automating something costing an hour a year**. 50% rule about *aggregate* time, not every individual task.

## "Automate the Second Time, Not the First"

Useful heuristic: first time doing manual operation, **document in runbook**. Second time, have evidence recurring, runbook becomes spec for script. Third time, script should already exist.

Protects against premature automation:

- Things done once never recur, never need automation.
- Things done twice clearly recurring, worth investment.
- Runbook captures *steps*, hardest part of writing script.

## Toil-Reduction Sprints

When team over 50% cap, right response not "we'll fix it as we go." Fails because no time *between* toil to fix toil. Right response: **dedicated reliability sprint**:

- 1–2 weeks where team **commits to no new feature work**.
- Full team works through top items on automation backlog.
- Metric is "next quarter's toil percentage," not "tickets closed."

Reliability sprints unpopular with stakeholders. Error budget policy justifies them — see [slis-slos-error-budgets.md](slis-slos-error-budgets.md#error-budget-policy). When budget exhausted, next sprint is reliability work; that is agreement.

## Toil From Other People's Code

Some toil generated by other teams' work: service crashing weekly because of bug nobody owns, upstream API requiring manual reconciliation because not exposing right query, deploy script needing babysitting.

Right response is *not* absorb toil silently. It is to:

1. **Surface it.** Team generating toil should see cost. Quantify and report.
2. **Push work back.** "This taking 6 hours/week from our team; here is what we need from yours to fix it." File ticket on *their* backlog, not yours.
3. **Build temporary mitigations** making toil manageable until upstream fix lands — but make visibly temporary so nobody mistakes for permanent solution.

If upstream team will not or cannot fix, escalate. Toil permanently absorbed is management problem, not engineering one.

## Anti-Patterns

- **"Toil isn't real work."** It is real work. Just not work you should be doing.
- **No measurement.** "We feel like there's a lot of toil." You do not know until measured. Sometimes team stress from different cause; sometimes toil much worse than they think.
- **Hero toil-handling.** One engineer absorbs all toil because only one who knows how. Burns out, leaves, now nobody can do it. Spread deliberately.
- **The unending automation project.** "We're going to rewrite deploy system to eliminate this toil." Six months later, no progress, manual process keeps running. Bias toward small automations shipping quickly.
- **Automating before understanding.** Writing script to automate process never done by hand. Script encodes assumptions turning out wrong; toil reappears as debugging script.
- **Premature automation of one-offs.** Investing week to automate something running once a quarter. 50% rule is aggregate.
- **Treating on-call as toil-handling shift.** On-call is for *responding to incidents*, not clearing toil queue. Related but not same; conflating means on-call ships nothing and incidents do not get attention deserved.
- **Hiding toil from leadership.** If people deciding budget and headcount do not see toil percentage, they do not fund work to reduce it.
- **No automation backlog.** Toil identified, no plan to fix. Identification without action is just complaining.
- **Reliability sprints that get hijacked.** Dedicated sprint becomes "well, we have customer-promised feature, can you slip just this one in?" Whole sprint evaporates. Treat boundary as inviolable.

## Related

- [on-call.md](on-call.md) — high toil on-call rotations unsustainable
- [postmortems.md](postmortems.md) — recurring incidents are toil; postmortem action items eliminate them
- [runbooks.md](runbooks.md) — documented step → script → triggered automation
- [slis-slos-error-budgets.md](slis-slos-error-budgets.md) — error budget exhaustion justifies reliability sprints
- `software-design` — chronically high-toil services usually design smell; runbook treating symptom of bad code
- `team-lead` — toil reduction work fits naturally into team's planning cadence
