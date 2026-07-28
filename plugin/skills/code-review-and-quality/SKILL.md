---
name: code-review-and-quality
description: Method and standards for multi-axis code review — correctness, readability, architecture, security, performance; review axes, finding tiers, ship-ready bar. Loaded inline when reviewing a diff, before merge, after a feature or bug fix, evaluating code from another agent, or refactoring. Triggers on "review my PR", "review this diff", "code review", "is this ready to merge". For dispatched read-only review in isolated context against cold-context brief, after local verification, in parallel with security review — use code-reviewer agent. Not for cross-stack security audit — use security-engineering (dispatched counterpart: security-reviewer agent).
---

# Code Review and Quality

## Overview

Multi-dimensional code review with quality gates. Every change reviewed before merge — no exceptions. Five axes: correctness, readability, architecture, security, performance.

**The approval standard:** Approve change when it definitely improves overall code health, even if not perfect. Perfect code doesn't exist — goal is continuous improvement. Don't block change because it isn't exactly how you would have written it.

## Universal Rules

1. **Review every change before merge.** No exceptions. "It's small" is not an exemption.
2. **Review tests first.** Tests reveal intent and coverage before you read a line of implementation.
3. **Tier every finding, then label it.** Tier decides whether finding gates (see Tier discipline below); Critical / Nit / Optional / FYI prefix is readability aid layered on top, never gate of its own.
4. **Approve improvements, not perfection.** Change improves overall code health → approve.
5. **Don't rubber-stamp.** "LGTM" without evidence of review helps no one. Quantify problems when possible.
6. **Split large changes.** Ask author to split anything over ~300 lines rather than reviewing one massive changeset.
7. **Require cleanup before merge.** Don't accept "I'll fix it later" — later never comes.
8. **Treat dependency additions as changes.** Every new dependency needs justification: size, maintenance status, license, known vulnerabilities.
9. **Quote before flagging.** Every finding must include specific lines supporting it. "This function looks risky" without quote is opinion, not finding. Can't quote evidence → don't have finding yet.

## Red Flags

- PRs merged without any review
- Review that only checks if tests pass (ignoring other axes)
- "LGTM" without evidence of actual review
- Security-sensitive changes without security-focused review
- Large PRs "too big to review properly" (split them)
- No regression tests with bug fix PRs
- Review comments without severity labels
- Accepting "I'll fix it later"

## Verification

After review complete:

- [ ] All Tier 0 and evidence-backed Tier 1 findings resolved
- [ ] Every finding backed by specific quoted passage from actual code
- [ ] No findings generated from assumed code structure — only from what was read
- [ ] Tests pass
- [ ] Build succeeds
- [ ] Verification story documented (what changed, how verified)

## Tier discipline

Tier definitions live in `evidence-review-tiers` rule — authoritative. Stochastic judgment proposes; deterministic verification disposes.

- **Tier 0:** already-failing deterministic check — test, build, linter, validator. Block on own authority; cite instead of re-finding what they catch.
- **Tier 1 (may gate, evidence attached):** correctness and security findings demonstrated by failing test, failing command, or explicit counterexample. Artifact is the gate; review only chose which artifact to produce. Missing regression test is Tier 1 — evidence is absent test. Explicit counterexample is Tier 1, never Tier 0.
- **Tier 2 (advisory, never gates):** readability, architecture taste, "could be simpler", unevidenced performance concerns. Severity labels on unevidenced findings are *proposals to the operator*, not gates — log to [findings-ledger](../findings-ledger/SKILL.md) rather than writing blocking language.

Dispatch this review as readonly [code-reviewer](../../agents/code-reviewer.md) Task with cold-context brief. Pair with [security-reviewer](../../agents/security-reviewer.md) when diff touches auth, secrets, input validation, or crypto.

## References

- [references/review-axes.md](references/review-axes.md) — Five-axis review checklist: correctness, readability, architecture, security, performance
- [references/review-process.md](references/review-process.md) — Step-by-step process, change sizing, descriptions, multi-model pattern, dead code hygiene, disagreements, honesty, dependency discipline, full review checklist
- [references/security-checklist.md](references/security-checklist.md) — Detailed security review guidance
- [references/performance-checklist.md](references/performance-checklist.md) — Performance review checks

## Related skills

- [adversarial-claims-reviewer](../adversarial-claims-reviewer/SKILL.md) — applies same adversarial discipline to formal and technical claims in documents rather than source code
- [findings-ledger](../findings-ledger/SKILL.md) — where this skill's Tier 2 (unevidenced) findings get recorded and tallied for recurrence
