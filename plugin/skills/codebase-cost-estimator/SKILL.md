---
name: codebase-cost-estimator
description: "Estimate the full development cost of an existing codebase from lines of code, architectural complexity, and team-composition overhead. Use for 'how much would this cost to build', 'what did this codebase cost', development-cost or build-cost estimates, calendar-time estimates, and Claude/AI ROI on a delivered codebase. Estimates by measured LOC and complexity, not by ticket volume."
---

# Codebase Cost Estimator

Estimate what codebase cost (or would cost) to build. Estimate driven by
**measured lines of code + complexity** — not ticket count, story points, feature lists.
Always present range with explicit assumptions; never single number.

## Inputs

- Checked-out codebase (local path or repo) you can run `git`, `cloc`/`tokei`, file counts against.
- Optional: project README/status for version + scope context.
- Optional: git history, for AI-ROI step (commit timestamps).

## Process

1. **Measure the codebase.** Count LOC by language; separate production code, tests, docs.
   Prefer real counter over guessing:
   ```bash
   # whichever is installed; both break LOC down by language
   tokei .        # or: cloc --vcs=git .
   ```
   Record per-language LOC, test LOC, doc LOC, total. Note complexity drivers: advanced
   frameworks, system-level/GPU/native code, third-party integrations. Map directly to
   productivity bands in `references/rates.md`.

2. **Convert LOC to raw developer-hours.** Per code category, divide LOC by
   lines-per-hour band in `references/rates.md` (e.g. simple CRUD/UI 30–50 LOC/hr; GPU/shader
   10–20 LOC/hr; comprehensive tests 25–40 LOC/hr). Sum to raw coding-hours subtotal. Keep
   per-category breakdown — audit trail for estimate.

3. **Apply overhead multipliers.** Raw coding time ≠ total engineering time. Add
   multipliers from `references/rates.md` for architecture & design, debugging, review &
   refactoring, documentation, integration & testing, learning curve. Total overhead
   typically 1.9x–2.25x raw coding hours. Yields **total estimated engineering hours**.

4. **Research current market rates.** Web-search hourly rates for relevant tech stack +
   seniority **for current year** — do not use stale figures. Build low / median / high
   rate table; state rationale for recommended rate (stack, specialization, region).

5. **Convert to calendar time.** Raw hours ≠ wall-clock delivery. Apply
   organizational-overhead efficiency factors in `references/org-overhead.md`
   (`Calendar Weeks = Raw Dev Hours ÷ (40 × Efficiency Factor)`); show calendar time across
   company types (lean startup → enterprise) — solo founder + bureaucracy ship
   same code on very different timelines.

6. **Layer in full-team cost.** Engineering not whole bill. Apply supporting-role
   ratios + team multipliers in `references/team-cost.md` (PM, UX/UI, eng management, QA,
   program management, tech writing, DevOps) → role-by-role breakdown across company
   stages, plus full-team total.

7. **Assemble the estimate.** Use structure in `assets/output-template.md`: codebase
   metrics, dev hours, calendar time, market rates, engineering cost (low/median/high), full-team
   cost, grand-total summary, confidence level, assumptions.

8. **AI / Claude ROI (optional).** Codebase built with AI assistance → follow
   `references/claude-roi.md` to estimate Claude's actual active hours (git-commit clustering
   preferred; file timestamps or `LOC ÷ 350` as fallbacks); compute value per Claude hour,
   speed multiplier vs human developer, cost ROI.

## Key principles

- **Estimate from measured LOC and complexity — never from ticket volume or story points.**
- Always show ranges (low / median / high). Single number is lie about precision.
- State confidence level + every load-bearing assumption.
- Use current-year market rates; flag search date.
- Present professionally — output should stand up in front of client or stakeholder.

## References

- `references/rates.md` — lines-per-hour productivity bands + overhead multipliers
- `references/org-overhead.md` — efficiency factors + calendar-time formula
- `references/team-cost.md` — supporting-role ratios + full-team multipliers
- `assets/output-template.md` — stakeholder-ready estimate template
- `references/claude-roi.md` — AI/Claude ROI calculation method
