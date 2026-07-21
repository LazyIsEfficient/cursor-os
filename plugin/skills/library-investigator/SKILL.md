---
name: library-investigator
description: Method and protocol for forensic audit of this plugin's own skill, agent, and rule surfaces — the fixed mechanical probe sequence over every component file against the mechanically-checkable rules, reporting CONFORMS / VIOLATES / UNVERIFIABLE / N-A counts with quoted evidence. Casts NO judgment and emits NO pass/fail verdict; counts are the headline. Loaded inline when the deliverable is a fact sheet of rule violations with proof, not a quality opinion. Triggers on "investigate the library", "find every violation", "forensic library audit", "evidence-only check". For a dispatched audit in an isolated context against a cold-context brief — use the library-investigator agent. Not for verifying equations or quantitative claims in a document — use adversarial-claims-reviewer. Not for reviewing a code diff or rendering a quality opinion — use code-review-and-quality.
---

# Library Investigator

You are a truthseeker, not a referee. You probe plugin component files against mechanically-checkable rules and report facts plus evidence. You never grade quality, never weigh routing, never emit pass / fail / hold or any overall verdict. The headline is COUNTS.

## Core rules

1. **No judgment.** Quality, routing, and single-responsibility are out of jurisdiction — they are `N-A`. Never guess at a judgment rule.
2. **No softening.** Well-written prose that breaks a rule is still VIOLATES. Polish is non-evidence.
3. **Costume check.** Self-describing phrases ("comprehensive", "follows best practices") trigger mandatory verification of the rule they imply.
4. **Probe, don't infer.** A claim of CONFORMS or VIOLATES rests on probe output, not on reading "how the file feels." When a probe cannot complete, the verdict is UNVERIFIABLE.

## Protocol

Fixed seven steps. Probe contract: [references/probe-table.md](references/probe-table.md).

1. **Inventory** — enumerate the files under audit across all three surfaces (skills, agents, rules). Report the count.
2. **Map** — for each file, list which rules apply to its surface (see the probe table's Applies-to column).
3. **Probe** — run `bash plugin/skills/library-investigator/scripts/library-probe.sh <REPO_ROOT>`. It emits one `STATUS<TAB>TIER<TAB>RULE<TAB>FILE<TAB>DETAIL` row per (file, rule) check, then runs `npm run validate` for the Tier 0 row.
4. **Classify** — tag each row CONFORMS / VIOLATES / UNVERIFIABLE / N-A per [references/verdict-taxonomy.md](references/verdict-taxonomy.md).
5. **Tier-tag** — label each VIOLATES with its tier as a FACT (a property of the check's reproducibility), framed as a ratchet candidate for the repository validator. Never say "this blocks."
6. **Self-consistency** — confirm every probed file appears in the output. Reconcile the row count against (files × applicable rules) rather than expecting an exact product. Flag any missing file as UNVERIFIABLE.
7. **Report** — fill [assets/investigation-report-template.md](assets/investigation-report-template.md): counts headline first, per-VIOLATES evidence rows, then the defer-list. No verdict line.

## Jurisdiction split

- **Mechanical (investigator owns):** P1 description length, P2 vendor names, P3 frontmatter angle brackets, P5 root runnables. Probed directly by the script.
- **Tier 0 (defer to the validator):** frontmatter field allow-lists, kebab-case ids, name-matches-path, relative-link resolution, `kind:id` uniqueness, and the sub-100-line `SKILL.md` assertion. The script runs `npm run validate` and reports its exit; do not re-implement these.
- **Judgment (N-A):** routing specificity, single-responsibility, whether a description "states what and when", and whether prose is well-aimed. Emit `N-A` and defer to a human or a [code-reviewer](../../agents/code-reviewer.md) Task.

## Output contract

Counts first: `CONFORMS n / VIOLATES n / UNVERIFIABLE n / N-A n over N files × M rules`. Then per-VIOLATES rows with the exact probe command and quoted failing output. Then the defer-list. Never an overall verdict.

## Tier discipline

Tier definitions live in the `evidence-review-tiers` rule, which is authoritative. Each VIOLATES states its tier as a fact about the check's reproducibility, not as a gate. A probe row is deterministic output, so a VIOLATES backed by quoted probe output is Tier 1 evidence at minimum; the `npm run validate` row is Tier 0 because that check already fails on its own authority. UNVERIFIABLE rows are Tier 2 — log them via [findings-ledger](../findings-ledger/SKILL.md) rather than escalating them.

## References

- [references/probe-table.md](references/probe-table.md) — the per-rule probe contract (rule, surface, exact probe, conforms-iff, verdict-when-fails, tier, owner)
- [references/verdict-taxonomy.md](references/verdict-taxonomy.md) — CONFORMS / VIOLATES / UNVERIFIABLE / N-A definitions; no overall verdict
- [assets/investigation-report-template.md](assets/investigation-report-template.md) — counts-first report template
- `scripts/library-probe.sh` — the mechanical probe across all three surfaces

## Related skills

- [code-review-and-quality](../code-review-and-quality/SKILL.md) — the judgment counterpart; routing, quality, and single-responsibility live there
- [adversarial-claims-reviewer](../adversarial-claims-reviewer/SKILL.md) — the same fixed-protocol evidence discipline applied to formal document claims
