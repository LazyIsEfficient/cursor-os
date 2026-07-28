---
name: outbound-engine
description: Design, analyze, and optimize cold outbound email campaigns on Instantly. Handles end-to-end ICP definition, expert panel scoring (recursive to 90+), sequence copywriting, infrastructure audit, capacity planning, and an implementation/strategy doc for human review. Use when asked to build cold outbound sequences, optimize cold email, audit an outbound motion, write sales sequences, or design cold email campaigns. Supports "start from scratch" and "optimize existing" modes. Execution skill — it produces copy, math, and a doc; it does not auto-send. Requires Instantly for audit/send features.
---

# Outbound Engine

End-to-end cold outbound: ICP definition, expert panel copy scoring (recursive to 90+), infrastructure audit, capacity planning, implementation doc. Skill **produces strategy doc + ready-to-load copy for human review** — does not send. See `references/workflow.md` for full procedure.

## Core Rules

1. Determine mode first (existing Instantly account with API key, or starting from scratch) before any other step.
2. Run three-phase workflow: Discovery & Audit → Expert Panel Recursive Scoring → Deliverables.
3. Expert panel scoring target 90/100 — non-negotiable. Iterate until reached.
4. Show every scoring round in final doc — iteration trail is part of value.
5. **Never send or push to platform autonomously.** Output is doc for human review. Writes/sends only after explicit human approval — see Sending gate below.
6. Use capacity math to set realistic volume + pipeline projections.

## Operating Modes

**Optimize existing** — live account to learn from. First questions: (1) Do you have Instantly API key? (2) Which campaigns underperform, on what metric? (3) Historical data to pull? With API key, run `scripts/instantly-audit.py` to pull campaigns, account inventory, warmup scores before touching copy.

**Start from scratch** — no campaigns yet. First questions: (1) Who is ICP (titles, industries, company size)? (2) What do you sell, one jargon-free sentence, primary offer (audit, trial, demo, call)? (3) What proof points real + linkable? Use `assets/icp-template.md` to collect ICP before writing copy.

## The Three Phases (summary)

1. **Discovery & Audit** — Determine mode. Audit mode → run Instantly audit; flag any account warmup score <80 or <14 days as NOT ready. Define ICP, capture business context (offer, real URLs, proof points), confirm expert-panel roster. Detail `references/workflow.md`; ICP fields `assets/icp-template.md`.
2. **Expert Panel Recursive Scoring** — Draft sequence, score with 10-expert panel (`references/expert-panel.md`), each scoring through own lens. Each round emits per-panelist score table, aggregate, top weaknesses, edits made, revised copy. Score honestly — no padding to 90. Below 90 → fix top 3 weaknesses, run another round. At ≥90 → finalize. Copy must follow `references/copy-rules.md` (+ `references/instantly-rules.md` for Instantly variable/deliverability rules).
3. **Deliverables** — Produce strategy doc: brutal-truth analysis, ICP summary, infrastructure status, every scoring round, final copy for every step, implementation plan, capacity math, weekly metric targets, STOP/START lists. Full doc structure `references/workflow.md`.

## What the 90/100 Gate Means

90 is operational gate, not vibe. Aggregate average across all panelists hit 90 in single round, no score padded. Below 90 → copy not done: identify lowest-scoring lenses, address those specific weaknesses, re-run. Recursive trail: each round names concrete weakness + edit that fixed it; ship trail, not just final copy.

## Sending Gate (resolves Rule 5)

`scripts/cold-outbound-sender.py` + write paths in `scripts/instantly-audit.py` exist but **gated**. Default deliverable = strategy doc. Do not invoke sender or perform any platform write autonomously. Invoke `cold-outbound-sender.py` only when human explicitly confirmed strategy doc reviewed + approved AND explicitly asks to send. Always run `--dry-run` first, show result before live send. Never treat "build the campaign" as authorization to send.

## Scope Note

Core skill = three-phase design workflow above. Three scripts ship in this directory but sit **outside** that workflow — do not run unprompted: `scripts/lead-pipeline.py` (Apollo→LeadMagic→Instantly sourcing), `scripts/competitive-monitor.py` (competitor tracking), `scripts/cross-signal-detector.py` (multi-source signal detection). Use only on explicit, specific request for that function.

## Reference Files

| File | Purpose |
|------|---------|
| `references/workflow.md` | Full three-phase workflow with scoring criteria + doc structure |
| `references/capacity-math.md` | Capacity formula, weekly metrics targets, add-on recommendations |
| `references/instantly-rules.md` | Instantly variable syntax, sequence structure, deliverability rules |
| `references/expert-panel.md` | Default 10-expert roster with scoring lenses |
| `references/copy-rules.md` | Email copy rules (first sentence, CTA, stats framing) |
| `assets/icp-template.md` | ICP data collection template |
| `scripts/instantly-audit.py` | Pulls campaigns, accounts, warmup scores via Instantly v2 API (write paths gated) |
| `scripts/cold-outbound-sender.py` | Sends approved emails — gated; human approval required (see Sending Gate) |

## Related skills

- [content-ops](../content-ops/SKILL.md) — expert-panel quality gate; recursive 90+ scoring of sequence copy is a content-ops review pass
- [marketing-shaper](../marketing-shaper/SKILL.md) — produces scoped outbound brief (ICP, goal, structure) this skill executes from
