# Anti-Patterns

Catch-all of smells not fitting cleanly into other reference files.

## Evidence and grounding smells

> Two failure modes behind most false-positive findings. Check first.

- **Finding not grounded in current file** — finding quotes line not in file as written, or paraphrases "how this skill probably reads" from memory. Every finding must quote exact text at cited `file:line`; can't quote from live file → not a finding. Re-read file before asserting what it says.
- **Collision claimed without checking other side** — reporting A collides with B after reading only A. Routing findings two-sided: read B's `when_to_use`/"not when" too. Reciprocal tiebreaker on both sides = overlap already resolved. See [description-and-routing.md](description-and-routing.md) → Verifying a collision.

## Naming

- **Agent + skill share name** — cosmetic, not blocking, but confuses when referring to "X" in conversation. Disambiguate consistently (always say "the X agent" vs "the X skill"), or rename one.
- **Plural names** (`reviewers`, `tests`) — singular is convention.
- **Verb-only names** (`reviewing`, `testing`) — domain-named or role-named is convention (`code-review-and-quality`, `code-reviewer`).
- **PascalCase, snake_case, or spaced names** — only `lowercase-hyphenated` valid.

## Description drift

- **Frontmatter description doesn't match SKILL.md body** — frontmatter promises X, body delivers Y. Loader routes on description; agent acts from body. Mismatch = silent misroute.
- **Description references skills that no longer exist** — dangling refs. Run `grep <skill-name>` against library when renaming or removing skill.
- **Description includes `etc.` or `and more`** — vague hedge; signals author didn't finish thinking about scope.
- **Description out of sync with related-skills section** — description names two siblings, related-skills section names three different siblings. Pick one source of truth.

## Bloat

- **`SKILL.md` exceeds ~100 lines** — long content belongs in `references/`. Loader pays for every line on match; long SKILL.md degrades all matches that load it.
- **Long code blocks in `SKILL.md`** — link to `references/` instead. Short snippets (5–10 lines) for universal-rules section fine; longer = reference material.
- **Massive keyword list in description** — 15+ keywords dilutes signal. Pick 5–10 loader will actually see.
- **Multiple paragraphs of role framing** — "You are a senior X who has spent years..." → one short paragraph max.
- **Universal Rules section with 20+ bullets** — split into "must" (top 5–7) + reference for rest.

## Misplaced content

- **Templates in `references/`** — anything agent *fills out and copies* (ADRs, RFCs, briefs, review templates) goes in `assets/`. References are read-only domain knowledge.
- **Scripts in `references/`** — runnables go in `scripts/`.
- **Project-specific paths in SKILL.md body** — references should be portable. `apps/foo/services/bar.ts` won't transfer to other repos. Use generic identifiers (`apps/<service>/...`) or actual fictional examples.
- **Company names or proprietary terms in SKILL.md** — descriptions especially must be portable across repos. Concrete code examples in `references/` may use realistic identifiers, but frame as examples, not only valid pattern.

## Tool allowlist smells

- **Read-only agent has Edit/Write** — blocking contradiction.
- **Intake agent has Agent tool** — allows nested delegation; breaks intake convergence.
- **Build agent has restrictive allowlist** — usually cripples it for marginal benefit.
- **Allowlist names tool that doesn't exist** — silent ignore in some loaders; verify against current Claude Code tool list.
- **Tools listed in random order** — convention: read tools first, then write tools, then specialty (`AskUserQuestion`, `Agent`, MCP tools).

## Role smells

- **Orchestrator-only agent** — delegates everything, no value of its own. Give it real work or remove; don't ship pure pass-through.
- **Generic catch-all agent** ("the engineer agent does everything") — at some breadth, agent is just parent agent without context-isolation reason. Delegating to it is overhead.
- **Two reviewers with overlapping scope** — clarify which fires when, or merge.
- **`Use proactively` without precise trigger** — fires every turn, becomes noise, gets ignored.
- **Agent without clear deliverable** — verdict, document, code change, brief. Role doesn't end with named output → probably a skill instead.

## Cross-reference smells

- **Asymmetric refs** — A says "see B" but B doesn't mention A. Add reverse ref or remove forward one.
- **Orphaned skill** — zero inbound references. Either meta-skill (document as such) or renamed/superseded.
- **Stale refs to renamed skills** — `grep` old name across library when renaming.
- **Cross-references in narrative form** — "you might also want..." instead of conventional `For X see Y`. Consistency helps loader.
- **Missing cross-references when adjacent skills exist** — every skill should name at least one neighbor. Truly standalone skills rare.

## Frontmatter smells

- **`name` doesn't match folder/file** — silent misroute by loader.
- **First-person description** ("I am...", "I help with...") — third-person is convention.
- **Description without "Use when..."** — loader has only WHAT, no WHEN.
- **No trailing cross-reference** — leaves loader no fallback for adjacent matches.
- **Description over 1024 chars** — some loaders enforce hard.
- **YAML frontmatter not closed properly** (`---` missing either side) — silent skip by some loaders.

## Universal-rules smells

- **Rules aspirational, not actionable** ("be thoughtful about X") — replace with concrete check ("X must include Y because Z").
- **Rules contradicting each other** — usually sign two skills got merged. Surface + resolve.
- **Rules without "why"** — rules reading like edicts decay into folklore. Even one sentence rationale ("because past incident Y showed Z") helps future contributors judge edge cases.

## Library-wide smells (only visible across files)

- **No skill claims domain that obviously matters** — e.g., observability work but no `observability` skill. Either hiding inside another skill (note that), or real gap.
- **Two skills both claim same domain from different angles** — usually one should subsume other, or they need clearly drawn boundaries in descriptions. First confirm neither *already* draws that boundary: if both descriptions carry reciprocal "not when" deflecting to other, domains already split, no finding (see [description-and-routing.md](description-and-routing.md) → Verifying a collision).
- **README index doesn't match directory** — skills exist on disk but not in README table (or vice versa). Run `ls .claude/skills/` against README's skill list.
