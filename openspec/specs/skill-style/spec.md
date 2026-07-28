# skill-style Specification

## Purpose
TBD - created by archiving change cavemen-style-rewrite. Update Purpose after archive.
## Requirements
### Requirement: Skill files use telegraphic caveman style
Skill files (`plugin/skills/**/SKILL.md`) and their reference, asset, and
readme files SHALL be written in telegraphic caveman style per
`plugin/references/caveman-style.md`: articles dropped where unambiguous, no
filler, no hedging, no pleasantries, imperative mood, bullets over sentences.
Rewrites SHALL compress expression only; they SHALL NOT delete rules,
exceptions, or edge cases.

#### Scenario: Filler prose rewritten
- **GIVEN** a skill file with filler prose
- **WHEN** validated against the style contract
- **THEN** filler, hedging, and pleasantries are removed while every rule survives

#### Scenario: Rewrite deletes a rule
- **GIVEN** a rewritten skill file missing a rule present in the original
- **WHEN** compared against the pre-rewrite version
- **THEN** the rewrite is rejected — information loss is a blocking defect

### Requirement: Style rewrite preserves routing and normative force
Rewrites SHALL preserve frontmatter `name` and `description` wording exactly,
normative directives (NEVER / MUST / ALWAYS / SHALL) at full force, code
blocks unchanged, exact file paths, numbered protocol steps in original order,
and every cross-reference target.

#### Scenario: Frontmatter altered
- **GIVEN** a rewritten skill whose frontmatter `description` wording differs from the original
- **WHEN** validated against the style contract
- **THEN** the rewrite is rejected — routing depends on exact trigger vocabulary

#### Scenario: Normative directive softened
- **GIVEN** a rewritten rule where NEVER/MUST/ALWAYS is softened to "should" or "avoid"
- **WHEN** validated against the style contract
- **THEN** the rewrite is rejected — normative force MUST be preserved

### Requirement: New skills follow the style contract
The `skill-new` command SHALL require newly authored skills to follow
`plugin/references/caveman-style.md` before shipping.

#### Scenario: Authoring a new skill
- **GIVEN** a new skill authored via `skill-new`
- **WHEN** its TODO sections are filled in
- **THEN** the final prose follows `plugin/references/caveman-style.md`

