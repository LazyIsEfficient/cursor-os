---
name: revenue-intelligence
description: AI-powered revenue intelligence: sales call insight extraction, content-to-revenue attribution, and multi-source client reporting. Use when asked to analyze sales calls, build revenue attribution models, or generate client reports.
---

# Revenue Intelligence

AI-powered revenue intelligence: sales call insight extraction, content-to-revenue attribution, and multi-source client reporting.

## Core Tools

| Tool | Purpose |
|------|---------|
| `scripts/gong_insight_pipeline.py` | Extract objections, buying signals, and competitive mentions from call transcripts |
| `scripts/revenue_attribution.py` | Map content to closed revenue with first-touch, linear, and time-decay models |
| `scripts/client_report_generator.py` | Generate unified GA4 + HubSpot + Ahrefs + Gong client reports |

## References

- [references/tool-reference.md](references/tool-reference.md) — full CLI flags and output specifications for all three tools
- [references/configuration.md](references/configuration.md) — environment variables, data flow, recommended workflow, and dependencies
