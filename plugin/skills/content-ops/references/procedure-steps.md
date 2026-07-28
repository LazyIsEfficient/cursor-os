# Expert Panel Procedure — Full Steps

## Step 1: Intake — Understand What's Being Scored

Collect or infer from context:

1. **Content/artifact** — thing(s) to score (paste, file path, or URL)
2. **Content type** — copy, sequence, landing page, strategy, title, chart, candidate eval, etc.
3. **Offer context** — what's sold/promoted? To whom? What domain/industry?
4. **Variants** — multiple versions to compare? (A/B/C)
5. **Source skill** — output from another skill? (e.g., cold-outbound-optimizer)
   If yes, note source for feedback-to-source routing in Step 6.

Context obvious from conversation → don't ask, proceed.

---

## Step 2: Auto-Assemble the Expert Panel

Build panel of **7–10 experts** tailored to content type + domain.

### Assembly rules

1. **Start with content-type experts.** Read `experts/` directory for pre-built panels matching
   content type. Exact match exists (e.g., `experts/linkedin.md` for LinkedIn post) →
   use it as base.

2. **Add domain/offer experts.** Based on offer context, add 1–3 experts who understand
   specific industry or domain. Examples:
   - Scoring bakery marketing → add Food & Beverage Marketing Expert
   - Scoring SaaS landing page → add SaaS Conversion Expert
   - Scoring recruiting outreach → add Agency Recruiter + Talent Market Expert
   - Scoring medical device copy → add Healthcare Compliance Expert

3. **Always include these two:**
   - **AI Writing Detector** — See `experts/humanizer.md`. Weight: 1.5x. Non-negotiable.
   - **Brand Voice Match** — Checks alignment with configured brand voice +
     known rejection patterns from `references/patterns.md` (if present).

4. **Check learned patterns.** If `references/patterns.md` exists, read it. Any patterns
   apply to this content type → brief panel on them. Dock points for known-bad patterns.

5. **Cap at 10 experts.** More than 10 → merge overlapping roles.

### Panel output format
List each expert with: Name, lens/focus, what they check.

---

## Step 3: Select Scoring Rubric

Choose rubric from `scoring-rubrics/`:

| Content type | Rubric file |
|---|---|
| Blog, social, email, newsletter, scripts | `scoring-rubrics/content-quality.md` |
| Strategy, recommendations, analysis | `scoring-rubrics/strategic-quality.md` |
| Landing pages, ads, CTAs | `scoring-rubrics/conversion-quality.md` |
| Charts, data viz, infographics | `scoring-rubrics/visual-quality.md` |
| Candidate evaluations | `scoring-rubrics/evaluation-quality.md` |
| Other | Synthesize rubric from two closest matches |

Read selected rubric file for detailed criteria + point allocation.

---

## Step 4: Score — Recursive Loop Until 90+

**Target: 90/100 across all experts. Non-negotiable. Max 3 rounds.**

### Each round produces:

```
## Round [N] — Score: [AVG]/100

| Expert | Score | Key Feedback |
|--------|-------|--------------|
| [Name] | [0-100] | [One-line rationale] |
| ... | ... | ... |

**Aggregate:** [weighted average — humanizer at 1.5x]
**Top 3 weaknesses:** [ranked]
**Changes made:** [specific edits addressing each weakness]
```

Then revised content/artifact.

### Rules

- Scores must be brutally honest. No padding to 90.
- Humanizer score weighted 1.5x in aggregate.
- Aggregate < 90 → identify top 3 weaknesses → revise → next round.
- Aggregate ≥ 90 → finalize, proceed to output.
- After 3 rounds, still < 90 → return best version with honest score + note on what's holding it back.
- Show ALL rounds in output — iteration trail is part of value.

### Variant comparison mode

Scoring multiple variants (A/B/C):
- Score each variant independently through full panel.
- After scoring, rank variants by aggregate score.
- Top variant < 90 → iterate on best one (don't iterate all).

---

## Step 5: Output Format

### Winner + Score (always at top)

```
## 🏆 Result: [SCORE]/100 — [PASS ✅ | NEEDS WORK ⚠️]

[Final content/artifact here]

**Iterations:** [N] rounds
**Panel:** [Expert names, comma-separated]
```

Variants: show winner first, then runner-up scores.

```
## 🏆 Winner: Variant [X] — [SCORE]/100

[Winning content]

### Runner-up scores
- Variant A: 87/100
- Variant B: 82/100
- Variant C: 91/100 ← Winner
```

### Feedback History (below result)

Show full scoring rounds.

```
---
<details>
<summary>📊 Scoring History (N rounds)</summary>

[All round tables from Step 4]

</details>
```

---

## Step 6: Feedback-to-Source (When Scoring Another Skill's Output)

Scored content came from another skill → generate **Source Improvement Brief**:

```
## 🔁 Feedback for [Source Skill]

### What scored low
- [Pattern]: [Specific example from this content]

### Suggested skill improvements
- [Concrete change to the source skill's process/rubric/prompt]

### Patterns to add to source skill
- [Any recurring weakness that should become a rule]
```

Brief can update source skill's SKILL.md or rubrics.

---

## Step 7: Memory — Learn from Approvals and Rejections

After user approves or rejects panel output:

### On approval (score ≥ 90, user accepts)
Note what worked. No action unless new positive pattern emerges.

### On rejection (user overrides panel or rejects 90+ content)
1. Ask why (or infer from context).
2. Add new pattern to `references/patterns.md` using this format:

```markdown
## [Pattern Name]
- **Type:** rejection | preference | override
- **Content types:** [which types this applies to]
- **Rule:** [What to always/never do]
- **Example:** [The specific instance that triggered this]
- **Date:** [YYYY-MM-DD]
- **Point dock:** [-N points when detected]
```

3. Confirm: "Added pattern: [one-line summary]. Panel will dock [N] points for this going forward."

### Pattern enforcement
Every scoring round, check `references/patterns.md` against content. Apply point docks
before expert scoring begins. Known-bad patterns penalized even if individual experts miss them.
