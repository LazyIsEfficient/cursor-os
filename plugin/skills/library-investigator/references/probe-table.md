# Probe table — the contract

One row per rule. The investigator probes ONLY the mechanically-checkable rules
(top section). It defers structural rules to the repository validator (Tier 0)
and judgment rules to human or reviewer-agent review (N-A). The probe is exact —
`scripts/library-probe.sh` implements precisely these checks; if the script and
this table disagree, the table is the spec and the script is the bug.

The tier on each row is a FACT about the check's reproducibility (per the
`evidence-review-tiers` rule), not a judgment and not a gate. Every VIOLATES is a
candidate to ratchet *down* into the repository validator.

## Surface keys

- **skills** = `plugin/skills/*/SKILL.md`
- **agents** = `plugin/agents/*.md`
- **rules** = `plugin/rules/*.mdc`
- **md-fm** = the YAML-ish frontmatter block of any of the above

Note that this repository's frontmatter parser is line-based, not a YAML parser:
one `key: value` per physical line, no empty values, no duplicate keys, and no
multi-line or block-scalar values. A probe that assumes real YAML will be wrong
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

- **P1** is a local readability cap, not a validator rule. Nothing in the
  repository validator bounds description length, so drift here is invisible to
  Tier 0 — which is exactly why the investigator measures it.
- **P3** scans the frontmatter block only, never the body — angle brackets in
  body prose are legal. Because this repository forbids multi-line frontmatter
  values outright, a surviving `<` or `>` is always real content, never a YAML
  block-scalar indicator. The probe still strips a trailing indicator
  defensively so that a malformed file reports the injected text rather than the
  indicator.
- **P4** duplicates a Tier 0 assertion on purpose. The orchestration contract
  test already fails the build above 99 lines; the investigator reports the
  measured count so a skill creeping toward the cap is visible before it breaks.
  Counts physical lines of `SKILL.md` only — `references/` and `assets/` are
  uncapped.
- **P5** flags a runnable sitting directly in the skill folder. Files under
  `scripts/`, `references/`, or `assets/` are correctly placed and never
  flagged.

## Tier 0 rules — defer to the repository validator

The investigator does NOT re-implement these. The script runs `npm run validate`
and reports its exit as a single `TIER0-validate` row. A nonzero exit is a
deterministic VIOLATES against whichever of these the validator names.

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

These are not mechanically probeable. The investigator emits `N-A` and never
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
- **agents**: P1, P2, P3 (mechanical) + Tier 0 + judgment N-A. P4 and P5 are
  skills-only.
- **rules**: P1, P3 (mechanical) + Tier 0. Rule files carry `alwaysApply` and
  `description` but no `name` key, so P2 is N-A there.
