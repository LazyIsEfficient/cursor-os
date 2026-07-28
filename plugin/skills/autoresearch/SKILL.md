---
name: autoresearch
description: Run Karpathy-style autoresearch optimization on any content. Generates 50+ variants, scores with 5-expert simulated panel, evolves winners across rounds, outputs optimized version + full experiment log. Use when optimizing landing pages, email sequences, ad copy, headlines, form pages, CTA text, or conversion-focused content. Triggers on "optimize this page", "run autoresearch", "score these variants", "A/B test this copy".
---

# Autoresearch Skill

Karpathy-style optimization loops for any conversion-focused content. No traffic needed. Simulated expert panel. Minutes, not weeks.

> **The sequence:** Run autoresearch FIRST to hit 85+ simulated score. Then deploy. Then validate with real traffic.

## What You'll Produce

Every run outputs 3 files:

| File | Purpose |
|------|---------|
| `{name}-optimized.{ext}` | Winning optimized content |
| `data/{name}-experiments.json` | Full experiment log — all variants + all scores |
| `data/{name}-optimization-report.md` | Human-readable summary with winner rationale |

## Core rules

1. Intake: parse content type from file extension (HTML → landing/form page; markdown → email/ad copy). List all optimizable elements; confirm with user before starting.
2. Score every variant against 5-expert panel in single batched API call per round — never one call per variant.
3. Run up to 3 rounds per element; stop early when top variant hits minimum score threshold (default: 80).
4. Cross-breed only after each element has own winner — premature cross-breeding creates incoherent combinations.
5. Write 3 output files: optimized content, experiments JSON, optimization report.
6. Report back: winning score, biggest score jump, top 2 runner-ups, file paths, next step.

## User Options

| Option | Default | Description |
|--------|---------|-------------|
| `elements` | all | Which elements to optimize |
| `variants_per_round` | 10 | Variants per round |
| `min_score` | 80 | Stop when score hit |
| `rounds` | 3 | Max rounds before stopping |
| `auto_apply` | false | Overwrite source file with winners |
| `content_type` | auto-detect | Force content type if auto-detect wrong |

## Quality Gates

- **< 70:** Don't ship. Something fundamental broken.
- **70-79:** Marginal. One more round targeting lowest-scoring dimension.
- **80-84:** Good. Shippable. Validate with real traffic.
- **85-89:** Strong. Ship with confidence.
- **90+:** Rare. Ship immediately.

## Anti-Patterns

- Never call API once per variant. Always batch. 10-variant round = 1 call.
- Don't over-optimize one dimension — 95 clarity + 45 trust = misleading overall score.
- Don't run more than 5 rounds. Not hitting 80 after 3 = strategic problem, not tactical.

## References

- [references/round-structure.md](references/round-structure.md) — round-by-round procedure and 5-expert panel definitions
- [references/content-types.md](references/content-types.md) — elements and score dimensions per content type (landing pages, email, ads, forms)
- [references/execution-protocol.md](references/execution-protocol.md) — 6-step execution protocol with JSON schema

## Related skills

- [content-ops](../content-ops/SKILL.md) — quality scoring gate; run after autoresearch optimization
- [conversion-ops](../conversion-ops/SKILL.md) — audits a LIVE landing-page URL across CRO dimensions; use it instead when scoring a live page rather than optimizing copy variants pre-launch
