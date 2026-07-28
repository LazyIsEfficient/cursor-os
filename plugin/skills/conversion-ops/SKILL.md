---
name: conversion-ops
description: AI-powered conversion rate optimization: landing page audits, CRO scoring, survey segmentation, and lead magnet generation. Use when asked to audit a landing page, run a CRO analysis, segment survey responses, or generate lead magnets. For content quality scoring see content-ops.
---

# AI Conversion Ops

AI-powered conversion rate optimization: landing page audits, CRO scoring, survey segmentation, lead magnet generation.

## Tools

### CRO Audit (`scripts/cro_audit.py`)

Fetches landing page, scores across 8 conversion dimensions (0–100 each): Headline Clarity, CTA Visibility, Social Proof, Urgency, Trust Signals, Form Friction, Mobile Responsiveness, Page Speed Indicators.

Output: per-dimension scores, priority fixes ranked by impact, before/after suggestions, industry benchmark comparison, overall letter grade (A+–F).

See [references/cro-audit.md](references/cro-audit.md) for full CLI usage + supported industries.

### Survey-to-Lead-Magnet Engine (`scripts/survey_lead_magnet.py`)

Ingests survey CSV data, clusters respondents by pain point, generates lead magnet briefs per segment.

Output: pain point clusters with respondent counts, segments ranked by size + commercial potential, per-segment lead magnet brief (title, format, hook, content outline, CTA, viral/conversion scores), prioritized implementation roadmap.

See [references/survey-lead-magnet.md](references/survey-lead-magnet.md) for full CLI usage + CSV format details.

## Configuration and Workflow

No API keys required. Both tools local analysis only.

See [references/recommended-workflow.md](references/recommended-workflow.md) for environment variables, dependencies, recommended weekly/monthly cadence.

## Related skills

- [content-ops](../content-ops/SKILL.md) — quality scoring gate for content before conversion work begins
- [autoresearch](../autoresearch/SKILL.md) — generates + multi-round-optimizes conversion-copy variants this skill then audits + scores
