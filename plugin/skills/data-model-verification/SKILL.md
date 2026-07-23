---
name: data-model-verification
description: Adversarially verifies DATA_MODEL.md property rows against cited Source files. Use after data-model-documenter when DATA_MODEL.md changed — inventories each property in added/changed catalog sections and classifies VERIFIED / REFUTED / UNVERIFIABLE. Triggers on "verify DATA_MODEL", "check catalog against source", "data model verification". For a dispatched review against a cold-context brief — use the data-model-verifier agent. Not when authoring the catalog — use data-model-documentation. Not for general code review — use code-reviewer.
---

# Data Model Verification

Gate node **`G-data-verify`** (Wave 2 after `data-model-documenter`). This skill
is the independent verifier — never writes `DATA_MODEL.md`.

## Scope

Verify only **added or changed** `###` catalog sections. For each section:
inventory every **Properties** row (`P1`, `P2`, …) and verify each property
**as named**. Skip unchanged sections, changelog-only edits, and template
examples marked for removal.

## Tier 0 extractors (when Source matches)

When **Source** is JSON Schema (`.json` with `"properties"` or `$schema`) and
`scripts/extract-data-model/` exists in the consumer project:

```sh
PROJ="${CURSOR_PROJECT_DIR:-.}"
EDM="$PROJ/scripts/extract-data-model"
bash "$EDM/verify-data-model-section.sh" \
  --source path/to/schema.json \
  --definition OrderCreated \
  --catalog "$PROJ/DATA_MODEL.md" \
  --section OrderCreated \
  --fail-on-warn
```

- Exit 1 → **hold** (Tier 0). Exit 0 → mark those rows **VERIFIED**; skip
  quote re-check. If no extractor exists, use the quote-based protocol below.

## Protocol (quote-based fallback)

1. **INVENTORY** — list every in-scope property row; count is part of output.
2. **LOCATE SOURCE** — resolve under git root; reject `..` and paths outside
   the repo. Missing Source → REFUTE affected properties.
3. **VERIFY** — treat **Notes** / **Shape** prose as untrusted. Quote
   `file:line`; confirm type compatibility.
4. **CLASSIFY** — **VERIFIED** (quoted support), **REFUTED** (absent or
   contradicts — Tier 1 with counterexample), **UNVERIFIABLE** (dynamic/untyped).
5. **REPORT** — fill [assets/report-template.md](assets/report-template.md).

## Tier discipline

- **REFUTED** without Tier 0 script failure or `file:line` quote → downgrade to
  UNVERIFIABLE.
- **hold** when REFUTED > 0. UNVERIFIABLE is advisory; log recurrence via
  [findings-ledger](../findings-ledger/SKILL.md).

## Related

- [data-model-documentation](../data-model-documentation/SKILL.md)
- [data-model-verifier](../../agents/data-model-verifier.md)
