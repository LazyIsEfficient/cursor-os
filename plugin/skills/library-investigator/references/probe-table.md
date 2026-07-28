# Probe table — the contract

One row per rule. Investigator probes ONLY mechanically-checkable rules
(top section). Defers structural rules to repository validator (Tier 0),
judgment rules to human or reviewer-agent review (N-A). Probe is exact —
`scripts/library-probe.sh` implements precisely these checks; if script and
this table disagree, table is spec, script is bug.

Tier on each row is FACT about check's reproducibility (per
`evidence-review-tiers` rule), not judgment, not gate. Every VIOLATES is
candidate to ratchet *down* into repository validator.

## Surface keys

- **skills** = `plugin/skills/*/SKILL.md`
- **agents** = `plugin/agents/*.md`
- **rules** = `plugin/rules/*.mdc`
- **md-fm** = YAML-ish frontmatter block of any of the above

Note: this repository's frontmatter parser is line-based, not YAML parser:
one `key: value` per physical line, no empty values, no duplicate keys, no
multi-line or block-scalar values. Probe assuming real YAML will be wrong
about this repository.

## Mechanically-probeable rules — investigator owns

| Rule ID | Applies-to | Exact probe | Conforms-iff | Verdict-when-fails | Tier | Owner |
|---|---|---|---|---|---|---|
| P1-description-length | md-fm (skills, agents, rules) | extract the `description:` value, measure its length | description length is 800 chars or fewer | VIOLATES | 1 | investigator |
| P2-vendor-name | skills, agents | `fm_value name`, then match against `claude\|anthropic\|codex\|openai` case-insensitively | the name embeds no vendor name | VIOLATES | 1 | investigator |
| P3-frontmatter-brackets | md-fm | read the block between the first two `---` delimiters, then match `[<>]` | no `<` or `>` anywhere in the frontmatter block | VIOLATES | 1 | investigator |
| P4-skill-line-count | skills only | `wc -l < SKILL.md` | `SKILL.md` is 99 physical lines or fewer | VIOLATES | 0 | reported, owned by Tier 0 |
| P5-root-runnable | skills only | `find <skill-dir> -maxdepth 1 -type f \( -name '*.sh' -o -name '*.py' -o -name '*.js' -o -name '*.mjs' \)` | no runnable at the skill ROOT (runnables live under `scripts/`) | VIOLATES | 2 | investigator |

### Notes on the probes

- **P1** is local readability cap, not validator rule. Nothing in
  repository validator bounds description length, so drift here invisible to
  Tier 0 — exactly why investigator measures it.
- **P3** scans frontmatter block only, never body — angle brackets in
  body prose legal. Repository forbids multi-line frontmatter
  values outright → surviving `<` or `>` always real content, never YAML
  block-scalar indicator. Probe still strips trailing indicator
  defensively so malformed file reports injected text rather than
  indicator.
- **P4** duplicates Tier 0 assertion on purpose. Orchestration contract
  test already fails build above 99 lines; investigator reports
  measured count so skill creeping toward cap visible before it breaks.
  Counts physical lines of `SKILL.md` only — `references/` + `assets/`
  uncapped.
- **P5** flags runnable sitting directly in skill folder. Files under
  `scripts/`, `references/`, or `assets/` correctly placed, never
  flagged.

## Tier 0 rules — defer to the repository validator

Investigator does NOT re-implement these. Script runs `npm run validate`,
reports its exit as single `TIER0-validate` row. Nonzero exit =
deterministic VIOLATES against whichever of these validator names.

| Rule | Applies-to | Probe | Tier | Owner |
|---|---|---|---|---|
| frontmatter allow-list | skills, agents, rules | validator (skills permit exactly `name` and `description`) | 0 | defer |
| kebab-case component id | all surfaces | validator (id derived from the plugin-relative path) | 0 | defer |
| name matches path | skills, agents | validator (frontmatter `name` equals directory or file name) | 0 | defer |
| link resolution | all markdown | validator (every relative link target exists inside `plugin/`) | 0 | defer |
| `kind:id` uniqueness | all surfaces | validator (no two components share a kind and id) | 0 | defer |
| readonly declaration | agents | validator (an agent promising no mutation declares `readonly: true`) | 0 | defer |
| SKILL.md under 100 lines | skills | orchestration contract test | 0 | defer |

## Judgment rules — N-A

Not mechanically probeable. Investigator emits `N-A`, never
guesses.

| Rule | Applies-to | Why N-A |
|---|---|---|
| routing specificity | md-fm | whether a description routes correctly is a judgment about meaning |
| states what and when | md-fm | a description can be short, well-formed, and still uninformative |
| single-responsibility | skills, agents | "one role, one concern" is a design judgment |
| concrete use cases | skills | whether examples are load-bearing is a judgment |
| tier-language fidelity | skills, agents | whether prose *means* the same thing as the `evidence-review-tiers` rule is semantic, not mechanical |

## Per-surface applicability summary

- **skills**: P1, P2, P3, P4, P5 (mechanical) + Tier 0 + judgment N-A.
- **agents**: P1, P2, P3 (mechanical) + Tier 0 + judgment N-A. P4 + P5
  skills-only.
- **rules**: P1, P3 (mechanical) + Tier 0. Rule files carry `alwaysApply` +
  `description` but no `name` key → P2 N-A there.
