---
name: audit-library
description: Launch the sharded, adversarially-verified skill/agent library audit over plugin/skills and plugin/agents (whole library, or one named skill/agent). Pass an optional kebab-case skill or agent id to scope; empty args audit everything.
---

You are launching this plugin's skill/agent quality audit. It runs as a **sharded generate → default-reject verify → backstop** pipeline using Cursor `Task` (not Claude `Agent`, not Claude `Workflow`). One generation Task per skill/agent (clean context, reads the component's actual files + the `skill-library-review` rubric), then an independent default-reject verify Task before any finding is confirmed. This sharded+verified model exists because monolithic single-pass audits run ~10–15% false positives, concentrated in routing-collision findings; do not replace it with an ad-hoc single-agent review.

Not the same as the `library-reviewer` agent — that is an ad-hoc, read-only reviewer for a small set of files mid-edit. Not the same as `library-investigator` — that is the evidence-only mechanical probe (probe script + `npm run validate`) with **no quality verdict**. Reach for the agent when iterating on a few files; reach for this command for a full, low-false-positive judgment audit.

**RULESET.md:** This repository has no `RULESET.md` on disk and this command does **not** require one. Mechanical forensic checks use the existing [library-investigator](../skills/library-investigator/SKILL.md) contract (probe table + `library-probe.sh` + `npm run validate`). Do not copy or invent a RULESET to run this audit. Claude's `audit-skill-library` Workflow JS is also **not** ported — Cursor has no Workflow tool; the procedure below is the Cursor equivalent.

## Step 1 — determine scope

- `$ARGUMENTS` holds an optional skill or agent id.
- If `$1` is **non-empty**, scope the audit to that one component:
  1. Validate it is kebab-case (lowercase, hyphen-separated). If not, STOP.
  2. Resolve path: prefer `plugin/skills/$1/SKILL.md`; else `plugin/agents/$1.md`. If neither exists, STOP and ask which skill/agent to audit — do not guess.
  3. Audit only that one id.
- If `$ARGUMENTS` is **empty**, audit the whole library: every `plugin/skills/*/SKILL.md` **and** every `plugin/agents/*.md` (exclude nothing unless the user later asks to narrow).

Discover with Glob / Shell (`ls`), not memory.

## Step 2 — Generate (one Task per component)

Cap concurrent Tasks at ~3–5; wave the rest. For each component id in scope, dispatch a **foreground** Cursor `Task` with `subagent_type: "generalPurpose"`, `readonly: true`, and a cold-context brief:

```
You are auditing ONE plugin component: "<id>".

GROUNDING — read before you claim:
1. Read plugin/skills/<id>/SKILL.md OR plugin/agents/<id>.md in full (whichever exists).
2. Read every file under that skill's references/ and assets/ that SKILL.md links (agents: only the agent file unless it links plugin skills).
3. Read plugin/skills/skill-library-review/SKILL.md and its references/. Apply Universal Rules and Review order. Quote the LIVE line for every finding — if you cannot quote it from the current file, do not emit it.

For any routing-collision candidate, first run the rubric's Step-0 contention check: confirm the two components genuinely contend (shared trigger keyword or overlapping file-glob). If they contend, read BOTH descriptions / "not when" / cross-refs — if each already deflects to the other, the overlap is RESOLVED and is NOT a finding. Report a collision only when they truly overlap AND a reciprocal tiebreaker is missing on at least one side.

Return JSON only:
{ "findings": [ { "skill": "<slug the finding is ABOUT>", "category": "frontmatter|routing-collision|description-quality|tool-allowlist|cross-reference|library-shape|anti-pattern", "severity": "blocking|should-fix|nit", "title": "<one line>", "evidence": "<file:line plus exact quoted line(s)>" } ] }

Set "skill" to the component the finding is genuinely ABOUT (may differ from <id>). If clean, return { "findings": [] }. Invent nothing.
```

Stamp each returned finding with `_reviewedBy: <id>` yourself (the generator may omit it).

## Step 3 — Verify (default-reject, independent Task per finding)

For each non-empty candidate finding, dispatch a separate `Task` (`generalPurpose`, `readonly: true`) with an adversarial brief. Default to reject. A finding stands ONLY if the verifier independently re-reads the cited file and confirms:

1. The quoted evidence appears **verbatim** at the cited `file:line` in the current file. Missing quote → reject.
2. If `category` is `routing-collision`: re-run Step-0 contention + reciprocal "not when". Already resolved or non-competing shared keyword → reject.
3. **Backstop 1 (inline):** set `correctedSkill` to the true owning slug from title/evidence (meta-reviewers often mis-attribute).

Return `{ "isReal": boolean, "reason": string, "correctedSkill": string }`. Keep only `isReal: true` findings, overwriting `skill` with `correctedSkill` when present. If a verify Task errors/returns null, treat as reject (do not confirm).

## Step 4 — Backstops on the confirmed set

**Backstop 1 (batch re-attribution):** One `Task` over the full confirmed list — re-derive each finding's true `skill` from title + evidence only. Re-attribution must **preserve count**. If the returned count differs from the input count, discard the re-attribution and keep the pre-backstop verified set; log a warning with both counts.

**Backstop 2 (issue-body dedup):** One `Task` that runs `gh issue list --state open --limit 200 --json number,title,body` (if `gh` is unavailable, skip dedup, report that, and keep all confirmed findings). Drop any finding whose substance already appears in an open issue **body** (not title-only). Return surviving findings, `droppedAsDuplicate` (`{title, issueNumber}`), and `issuesFetched`.

## Step 5 — report

Report to the user:

- Confirmed findings (already verify-gated — do not re-litigate).
- Backstop 1: whether re-attribution preserved count (warn if it did not).
- Backstop 2: `issuesFetched` and how many candidates were dropped as duplicates (or that dedup was skipped).
- Do **NOT** file GitHub issues automatically. Present findings and let the user decide.

Keep Tier discipline: Tier 2 judgment is advisory ([evidence-review-tiers](../rules/evidence-review-tiers.mdc)); only Tier 0/1 with evidence gates.
