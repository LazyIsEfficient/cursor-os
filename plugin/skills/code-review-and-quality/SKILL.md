---
name: code-review-and-quality
description: Method and standards for multi-axis code review across correctness, readability, architecture, security, and performance — the review axes, finding tiers, and the ship-ready bar. Loaded inline when reviewing a diff yourself, before merging a change, after a feature or bug fix, when evaluating code produced by another agent, or when refactoring. Triggers on "review my PR", "review this diff", "code review", "is this ready to merge". For a dispatched read-only review in an isolated context against a cold-context brief, run after local verification and in parallel with security review — use the code-reviewer agent. Not for cross-stack security audit method — use security-engineering, whose dispatched counterpart is the security-reviewer agent.
---

# Code Review and Quality

## Overview

Multi-dimensional code review with quality gates. Every change gets reviewed before merge — no exceptions. Review covers five axes: correctness, readability, architecture, security, and performance.

**The approval standard:** Approve a change when it definitely improves overall code health, even if it isn't perfect. Perfect code doesn't exist — the goal is continuous improvement. Don't block a change because it isn't exactly how you would have written it.

## Universal Rules

1. **Review every change before merge.** No exceptions. "It's small" is not an exemption.
2. **Review tests first.** Tests reveal intent and coverage before you read a line of implementation.
3. **Tier every finding, then label it.** The tier decides whether a finding gates (see Tier discipline below); the Critical / Nit / Optional / FYI prefix is a readability aid layered on top, never a gate of its own.
4. **Approve improvements, not perfection.** If the change improves overall code health, approve it.
5. **Don't rubber-stamp.** "LGTM" without evidence of review helps no one. Quantify problems when possible.
6. **Split large changes.** Ask the author to split anything over ~300 lines rather than reviewing one massive changeset.
7. **Require cleanup before merge.** Don't accept "I'll fix it later" — later never comes.
8. **Treat dependency additions as changes.** Every new dependency needs justification: size, maintenance status, license, known vulnerabilities.
9. **Quote before flagging.** Every finding must include the specific lines that support it. "This function looks risky" without a quote is an opinion, not a finding. If you can't quote the evidence, you don't have a finding yet.

## Red Flags

- PRs merged without any review
- Review that only checks if tests pass (ignoring other axes)
- "LGTM" without evidence of actual review
- Security-sensitive changes without security-focused review
- Large PRs that are "too big to review properly" (split them)
- No regression tests with bug fix PRs
- Review comments without severity labels
- Accepting "I'll fix it later"

## Verification

After review is complete:

- [ ] All Tier 0 and evidence-backed Tier 1 findings are resolved
- [ ] Every finding is backed by a specific quoted passage from the actual code
- [ ] No findings were generated from assumed code structure — only from what was read
- [ ] Tests pass
- [ ] Build succeeds
- [ ] The verification story is documented (what changed, how it was verified)

## Tier discipline

Tier definitions live in the `evidence-review-tiers` rule, which is authoritative. Stochastic judgment proposes; deterministic verification disposes.

- **Tier 0:** an already-failing deterministic check — test, build, linter, validator. These block on their own authority; cite them instead of re-finding what they catch.
- **Tier 1 (may gate, evidence attached):** correctness and security findings demonstrated by a failing test, failing command, or explicit counterexample. The artifact is the gate; the review only chose which artifact to produce. A missing regression test is Tier 1 — the evidence is the absent test. An explicit counterexample is Tier 1, never Tier 0.
- **Tier 2 (advisory, never gates):** readability, architecture taste, "could be simpler", unevidenced performance concerns. Severity labels on unevidenced findings are *proposals to the operator*, not gates — log them to [findings-ledger](../findings-ledger/SKILL.md) rather than writing blocking language.

Dispatch this review as a readonly [code-reviewer](../../agents/code-reviewer.md) Task with a cold-context brief. Pair it with [security-reviewer](../../agents/security-reviewer.md) when the diff touches auth, secrets, input validation, or crypto.

## References

- [references/review-axes.md](references/review-axes.md) — Five-axis review checklist: correctness, readability, architecture, security, performance
- [references/review-process.md](references/review-process.md) — Step-by-step process, change sizing, descriptions, multi-model pattern, dead code hygiene, disagreements, honesty, dependency discipline, full review checklist
- [references/security-checklist.md](references/security-checklist.md) — Detailed security review guidance
- [references/performance-checklist.md](references/performance-checklist.md) — Performance review checks

## Related skills

- [adversarial-claims-reviewer](../adversarial-claims-reviewer/SKILL.md) — applies the same adversarial discipline to formal and technical claims in documents rather than source code
- [findings-ledger](../findings-ledger/SKILL.md) — where this skill's Tier 2 (unevidenced) findings get recorded and tallied for recurrence
