# CRO Audit Tool (`scripts/cro_audit.py`)

Fetches landing page, scores across 8 conversion dimensions. No headless browser needed.

## Usage

```bash
# Single URL audit
python scripts/cro_audit.py --url https://example.com/landing-page

# Batch mode — multiple URLs
python scripts/cro_audit.py --urls https://example.com/page1 https://example.com/page2

# URLs from a file (one per line)
python scripts/cro_audit.py --file urls.txt

# Specify industry for benchmark comparison
python scripts/cro_audit.py --url https://example.com --industry saas

# JSON output
python scripts/cro_audit.py --url https://example.com --json

# Save report to file
python scripts/cro_audit.py --url https://example.com --output report.json
```

## Scoring Dimensions (each 0–100)

1. **Headline Clarity** — value prop obvious in <5 seconds?
2. **CTA Visibility** — CTAs prominent, contrasting, above fold?
3. **Social Proof** — testimonials, logos, case studies, numbers?
4. **Urgency** — scarcity, deadlines, limited offers?
5. **Trust Signals** — security badges, guarantees, privacy, certifications?
6. **Form Friction** — how many fields? form intimidating?
7. **Mobile Responsiveness** — viewport meta, responsive patterns, touch targets?
8. **Page Speed Indicators** — image optimization, script count, resource size?

**Overall CRO Score** = weighted average across all 8 dimensions.

## Output

- Per-dimension score with specific findings
- Priority fixes ranked by impact
- Before/after suggestions per issue
- Industry benchmark comparison
- Overall letter grade (A+ through F)

## Supported Industries

`saas`, `ecommerce`, `agency`, `finance`, `healthcare`, `education`, `b2b`, `general`
