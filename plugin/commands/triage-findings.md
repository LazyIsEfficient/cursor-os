---
name: triage-findings
description: Sort a set of review findings into Tier 0, Tier 1, and Tier 2, then route blockers to fix-now and advisory findings to the findings ledger. Paste or reference the findings to triage; otherwise triage the findings returned by the most recent review gate.
---

# Triage findings

Take the findings in hand and assign each one a tier, then route it. Judgment
does not become a gate; only evidence does.

## 1. Verify each claim against the repository

A finding is a claim, not a diff. Open the cited `file:line` and confirm the
code says what the finding says. Re-run any cited deterministic check yourself
and record its command, exit status, and output. If the repository contradicts
the claim, state the discrepancy and discard the finding — do not triage it.

## 2. Assign a tier

- **Tier 0 — deterministic.** An already-failing deterministic check: test,
  build, linter, or validator. Requires the command or check, pinned input where
  relevant, exit status, and output.
- **Tier 1 — judgment with deterministic evidence.** An attached artifact
  reproduces the failure: a reproducible failing test, a deterministic command,
  a scanner result or proof-of-concept, or an explicit counterexample with
  pinned inputs. An explicit counterexample is Tier 1 evidence, never Tier 0 —
  reviewer judgment selected the claim it reproduces.
- **Tier 2 — subjective judgment.** Style, taste, hardening suggestions, and
  unevidenced concerns.

**Demotion rule, applied without exception:** a Tier 1 claim WITHOUT an attached
reproducing artifact is Tier 2, not Tier 1. Confidence, severity, and seniority
are not evidence. Relabel it and route it as Tier 2.

Tier and severity are independent. A critical-severity finding with no artifact
is still Tier 2 — but a critical-security failure that does carry evidence is
non-compensable and cannot be offset by speed, aggregate quality, or passing
unrelated checks.

## 3. Route

- **Tier 0 and Tier 1 — fix now.** These block ship-ready. Address each one,
  then re-run the deterministic check that proves it resolved. Prefer a failing
  test before the behavior change.
- **Tier 2 — findings ledger, advisory.** Emit one JSON object per finding using
  the entry contract in [findings-ledger](../skills/findings-ledger/SKILL.md),
  with `fingerprint`, `path`, `claim`,
  `tier` of 2, `source`, `run_id`, `status`, and `evidence` of null. Normalize
  the path and claim before deriving the stable fingerprint. Mark a fingerprint
  `RECURRING` only when it appears across at least two distinct `run_id` values;
  repetition within a single review does not count. Persist ledger entries only
  when writing is authorized.

Never mark a Tier 2 finding blocking, and never let one hold up ship-ready.

## 4. Report

State the tier counts, what was demoted and why, which blockers were fixed with
the check that proves it, and which entries went to the ledger. Ship-ready
requires no unresolved Tier 0 or evidence-backed Tier 1 finding.
