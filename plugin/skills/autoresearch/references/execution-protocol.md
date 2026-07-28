# Step-by-Step Execution Protocol

## Step 1: Intake & Parse

Read source content. Identify content type automatically or confirm with user:
- HTML file → landing page or form page
- Markdown / plain text → email or ad copy
- Ambiguous → ask: "Is this a landing page, email sequence, ad copy, or form page?"

Extract all optimizable elements. List back to user:
```
Found 5 elements to optimize:
1. Hero headline: "We help B2B companies grow"
2. Subheadline: "Full-service digital marketing..."
3. CTA: "Get Started"
4. Problem statement: [excerpt]
5. Social proof: [excerpt]

Optimizing: all | Variants per round: 10 | Min score: 80
```

## Step 2: Get API Key

Check for Anthropic API key: `$ANTHROPIC_API_KEY` environment variable.

```bash
export ANTHROPIC_API_KEY="your-api-key-here"
```

## Step 3: Run Optimization Rounds

For each element, run round structure from `references/round-structure.md`.

**Critical API efficiency rule:** ALWAYS batch all variants into single prompt. Never call API once per variant. Round with 10 variants = 1 API call.

Model preference (in order):
1. `claude-sonnet-4-5` (preferred — fast + smart)
2. `claude-opus-4` (if highest quality needed)
3. Any claude-3.5+ model if above unavailable

## Step 4: Cross-Breed (Multi-Element)

After all elements have winners:
1. Assemble top winner from each element into complete unit
2. Generate 5 holistic variants naturally combining winning elements
3. Score complete units (not just individual parts)
4. Pick winner with highest holistic score

## Step 5: Write Output Files

```bash
mkdir -p data
# Write optimized content
# Write experiments JSON
# Write optimization report
```

**Experiments JSON structure:**
```json
{
  "run_id": "autoresearch-{name}-{timestamp}",
  "content_type": "landing_page",
  "source_file": "path/to/original",
  "min_score_threshold": 80,
  "rounds": [
    {
      "round": 1,
      "element": "hero_headline",
      "variants": [
        {
          "id": 1,
          "text": "...",
          "scores": {
            "cmo": 72,
            "skeptical_founder": 68,
            "cro": 75,
            "copywriter": 70,
            "founder": 65
          },
          "avg_score": 70
        }
      ],
      "top_3": [1, 4, 7],
      "winner_score": 82
    }
  ],
  "final_winner": {
    "hero_headline": "...",
    "subheadline": "...",
    "cta": "...",
    "holistic_score": 87
  }
}
```

## Step 6: Report Back

Summarize results to user:
- Final winning score
- Biggest score jump (which element improved most)
- Top 2 runner-up alternatives (in case winner doesn't feel right)
- Path to all 3 output files
- Clear next step
