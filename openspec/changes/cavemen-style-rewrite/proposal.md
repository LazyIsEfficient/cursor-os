## Why

Plugin skills and references carry filler prose, hedging, and pleasantries.
Token cost per loaded skill is high; NORTH_STAR is token discipline. A durable
style contract plus a full-library rewrite cuts context spend on every future
session.

## What Changes

- New style contract `plugin/references/caveman-style.md`: telegraphic prose
  rules plus a MUST-preserve list (frontmatter `name`/`description`, normative
  directives, code blocks, exact paths, numbered protocol steps, all
  information content).
- Concision directive added to load-first surfaces: `AGENTS.md` (new, repo
  root) and `plugin/rules/communication.mdc` body prepend.
- All 46 skills under `plugin/skills/` (SKILL.md plus references/, assets/,
  readme files) rewritten in caveman style across 4 waves.
- `plugin/commands/skill-new.md` requires new skills follow
  `plugin/references/caveman-style.md`.
- Rewrite preserves frontmatter wording exactly — routing depends on it.

## Capabilities

### New Capabilities
- `skill-style`: skill files and references written in telegraphic caveman
  style per `plugin/references/caveman-style.md`, with normative force and
  information content preserved.

### Modified Capabilities

## Impact

- `plugin/references/caveman-style.md` (new), `AGENTS.md` (new)
- `plugin/rules/communication.mdc`, `plugin/commands/skill-new.md`
- `plugin/skills/**` — 46 skills + references/assets rewritten (4 waves)
- `plugin/.cursor-plugin/inventory.json` regenerated each wave
- `CHANGELOG.md`; `npm test` + `node scripts/validate.mjs` green per wave
