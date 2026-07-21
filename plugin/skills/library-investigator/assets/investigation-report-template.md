# Library investigation — &lt;repo or scope&gt;

**Audited:** &lt;repo root / file set&gt; · **Investigator:** &lt;model/agent&gt; · **Date:** &lt;YYYY-MM-DD&gt;
**Cold context:** &lt;yes/no — was the investigator given only paths and the probe contract, with no intent?&gt;
**Probe:** `bash plugin/skills/library-investigator/scripts/library-probe.sh &lt;REPO_ROOT&gt;` (exit &lt;n&gt;)

## Headline (counts only — no verdict)

```
CONFORMS n / VIOLATES n / UNVERIFIABLE n / N-A n   over   N files × M rules
```

| CONFORMS | VIOLATES | UNVERIFIABLE | N-A |
|---:|---:|---:|---:|
| n | n | n | n |

Tier 0 `npm run validate`: &lt;exit 0 OK / exit n — first failing assertion&gt;.
No overall verdict is emitted. Counts are the headline.

## VIOLATES — facts with evidence

| Rule | File:line | Probe command run | Quoted failing output | Tier | What would clear it |
|---|---|---|---|---|---|
| P4-skill-line-count | path/SKILL.md | `wc -l < path/SKILL.md` | `132` | 0 | keep SKILL.md under 100 lines (move detail to references/) |
| P3-frontmatter-brackets | path/agent.md:3 | `fm_block \| grep -n '[<>]'` | `3:description: use &lt;tool&gt;…` | 1 | remove `<` and `>` from frontmatter |
| P1-description-length | path/SKILL.md | extract `description:`, measure length | `971` | 1 | description of 800 chars or fewer |
| P2-vendor-name | path/SKILL.md | `name` + vendor-token match | `claude-helper` | 1 | rename without the vendor token |
| P5-root-runnable | path/run.sh | `find -maxdepth 1 … run.sh` | runnable at root | 2 | move the runnable under `scripts/` |

Each row is a FACT. The tier is a property of the check (per the
`evidence-review-tiers` rule), framed as a ratchet candidate for the repository
validator — not a statement that the finding blocks.

## UNVERIFIABLE — probe could not complete

| Rule | File | Why the probe was blocked |
|---|---|---|
| P3-frontmatter-brackets | path/SKILL.md | no frontmatter block found |
| P1-description-length | path/agent.md | no description value found |

## Defer-list — out of jurisdiction

### N-A → judgment rules

- Routing specificity, single-responsibility, "states what and when", and
  tier-language fidelity — across &lt;n&gt; files. These need a quality verdict; the
  investigator does not guess them. Route them to a human or a readonly
  [`code-reviewer`](../../../agents/code-reviewer.md) Task.

### Tier 0 → the repository validator

- Frontmatter allow-lists, kebab-case ids, name-matches-path, link resolution,
  `kind:id` uniqueness, readonly declarations, and the sub-100-line assertion —
  reported above as the single `TIER0-validate` row. The validator is the
  authority; this report does not re-find its territory.

## Self-consistency

- Files probed: &lt;n&gt;. Files appearing in probe output: &lt;n&gt;. Gap: &lt;none / list&gt;.
- Count check: CONFORMS + VIOLATES + UNVERIFIABLE + N-A = &lt;sum&gt; vs files × applicable-rules = &lt;expected&gt;.
