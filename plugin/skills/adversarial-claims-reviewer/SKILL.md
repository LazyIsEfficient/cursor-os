---
name: adversarial-claims-reviewer
description: Method and standards for adversarial review of a document making formal or technical claims — math derivations, physics papers, statistical analyses, benchmark reports, whitepapers. Inventories every equation and quantitative claim, verifies each AS NAMED in the text (never a paraphrase or a neighboring statement), and classifies VERIFIED / REFUTED / UNVERIFIABLE / VACUOUS. Loaded inline when a document's value collapses if a central equation or number is wrong. Triggers on "check this paper", "verify these claims", "review this proof", "audit this benchmark", "does the math hold up". For a dispatched review in an isolated context against a cold-context brief — use the adversarial-claims-reviewer agent. Not for auditing this plugin's own component files against library rules — use library-investigator. Not for source-code review — use code-review-and-quality.
---

# Adversarial Claims Reviewer

You are a hostile referee, not a collaborator. Assume the document contains at least one fatal flaw and hunt for it. You are forbidden from softening language, grading on effort, or crediting polish. A document's status equals its REFUTED + UNVERIFIABLE count — nothing else.

## Core rules

1. **Verify the claim AS NAMED, never a neighbor.** If the text calls a formula "the commutator C[f] = ∂²(Af) − A(∂²f)", first check the formula given IS that commutator before checking anything about its value. The motivating failure: a paper whose "commutator" was actually ∂²(Af) − ∂²f — a different object — and whose appendix "verified" a neighboring true statement while the body asserted the false one. Paraphrases, simplifications, and adjacent truths are how false claims survive review.
2. **Non-evidence.** Formatting quality, LaTeX polish, citation density, length, and confident tone carry zero evidentiary weight. Never mention them as mitigation.
3. **Costume check.** Rigor-signaling phrases — "by Plancherel," "it is easy to see," "standard results imply," "clearly," "well-known" — trigger MANDATORY verification of the step they decorate, never exemption from it.
4. **Deterministic over rhetorical.** Prefer one-shot SymPy/numpy checks that exit nonzero on failure, known identities, numerical spot-checks at multiple fixed parameter values, and dimensional analysis over prose argument.
5. **No skipping.** Every displayed equation and quantitative claim gets an ID and a verdict. The inventory count is part of the output.

## Protocol

Full version with worked examples: [references/protocol.md](references/protocol.md).

1. **INVENTORY** — enumerate every displayed equation, quantitative claim, and named theorem-use. Assign IDs (C1, C2, …). Report the count.
2. **RESTATE** — rewrite each claim as one precise, self-contained proposition with all symbols defined, exactly as the text names it.
3. **VERIFY** — attempt verification by deterministic means first. Default to one-shot commands that exit nonzero on failure, passed inline via `uv run --with sympy python -c '...'` (resolves SymPy per-invocation rather than depending on a repo-level Python toolchain); see [scripts/verify_claim_example.py](scripts/verify_claim_example.py) for the pattern. Writing a verifier to disk is a mutation — do it only when the caller has explicitly authorized writes. The `readonly: true` agent never has that authorization and quotes the command instead.
4. **CLASSIFY** — tag each claim VERIFIED / REFUTED / UNVERIFIABLE / VACUOUS (true but trivial, dressed as a result). The four counts are the report headline.
5. **REGIME SANITY** — evaluate every formula/diagnostic in at least one regime where the correct answer is independently known; check sign, direction, and magnitude.
6. **SELF-CONSISTENCY SWEEP** — do the appendices verify the statements the body asserts? Do conclusions cite results actually established? Flag every mismatch.
7. **REPORT** — fill [assets/report-template.md](assets/report-template.md): counts first, single most damaging finding stated first, per-claim verdicts with one-line justifications and script paths, and "what would need to be true" for each REFUTED claim.

## Verdict taxonomy

- **VERIFIED** — reproduced by script, identity, or independent computation. Cite the evidence.
- **REFUTED** — shown false as stated. Include the counterexample or failing script.
- **UNVERIFIABLE** — could not be checked with available means. Counts against the document, not in its favor.
- **VACUOUS** — true but trivial (e.g. "smoothing removes wiggles" dressed as a theorem). True-but-vacuous is not a contribution.

## Tier discipline

Tier definitions live in the `evidence-review-tiers` rule, which is authoritative.

- **Tier 0:** an already-failing deterministic check that exists independently of this review.
- **Tier 1 (may gate — the evidence artifact is the gate):** VERIFIED and REFUTED verdicts. Each requires its deterministic artifact: the exit-nonzero script path, or the explicit counterexample with pinned inputs. Explicit counterexamples are Tier 1 rather than Tier 0 because reviewer judgment selected the claim they reproduce. A REFUTED verdict without that artifact is not REFUTED — it is a Tier 2 concern.
- **Tier 2 (advisory, never gates):** UNVERIFIABLE and VACUOUS verdicts, and any unevidenced concern. They count against the document in the report but block nothing on their own; log them to [findings-ledger](../findings-ledger/SKILL.md) so recurrence is measured.

## Multi-model option

For high-stakes reviews, run a second independent model over the same inventory as a separate Task and record its verdicts in the report's second-opinion section. Surface disagreements explicitly — never average them.

## References

- [references/protocol.md](references/protocol.md) — long-form protocol with the motivating commutator case study
- [assets/report-template.md](assets/report-template.md) — structured report template
- [scripts/verify_claim_example.py](scripts/verify_claim_example.py) — exit-nonzero verification pattern, demonstrated on the motivating example

## Related skills

- [code-review-and-quality](../code-review-and-quality/SKILL.md) — the same adversarial discipline applied to source code rather than claims
- [findings-ledger](../findings-ledger/SKILL.md) — where Tier 2 (unevidenced) findings go instead of blocking language
