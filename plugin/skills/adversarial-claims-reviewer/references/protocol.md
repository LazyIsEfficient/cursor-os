# Adversarial claims review — full protocol

Long-form version of seven-step protocol in [SKILL.md](../SKILL.md), with
motivating case study + per-step guidance.

## The motivating failure

(This case and the diagnostic example in Step 5 are deliberately uncited — treat
narratives as illustrative, not checkable historical claims. Mathematical
content, which is what matters, independently proven by
[scripts/verify_claim_example.py](../scripts/verify_claim_example.py).)

A paper's central equation was labeled:

> "the commutator C[f] = ∂²(Af) − A(∂²f)"

but the formula actually written and computed throughout was a different quantity:

> ∂²(Af) − ∂²f

The first (genuine commutator with Gaussian smoothing A) is identically zero —
differentiation commutes with convolution. The second (smoothed-minus-raw curvature)
generically nonzero. Paper's appendix then symbolically "verified" a
NEIGHBORING true statement — single-mode commutator vanishes — while
body asserted conclusions about false labeling. Polished LaTeX hid unchecked
core. Every step below exists to make that failure impossible to miss.
[scripts/verify_claim_example.py](../scripts/verify_claim_example.py) proves the two
quantities differ.

## Step 1 — INVENTORY

Enumerate **every** displayed equation, quantitative claim (numbers, bounds, rates,
percentages, benchmark figures), named theorem-use ("by Plancherel", "by the
central limit theorem"). Assign stable IDs: C1, C2, …

- No skipping. "Obviously true" claims get IDs too — conflations hide there.
- Include claims made only in captions, footnotes, appendices.
- Total count is part of report headline. Reviewer who inventories 6 claims
  in a 30-equation paper has not reviewed the paper.

## Step 2 — RESTATE

For each ID, write single precise, self-contained proposition: every symbol defined,
every quantifier explicit, domain stated.

**Critical rule: verify the proposition AS NAMED IN THE TEXT.** Never a paraphrase,
simplification, or adjacent claim. Two distinct checks when text names an object:

1. Is the formula given actually that named object? ("Is ∂²(Af) − ∂²f the commutator?" — no.)
2. Does the asserted property hold for the formula as written?

Restatement that quietly fixes paper's error ("they obviously meant…") is itself
review failure: you verified paper author wished they had written.

## Step 3 — VERIFY

Prefer deterministic means, in this order:

1. **Symbolic computation** (SymPy): prove identities, expand both sides, simplify
   difference to zero.
2. **Numerical spot-checks** at multiple **fixed** parameter values (never random —
   failure must be reproducible). Three or more points across different regimes.
3. **Known identities** — cite identity by name, show substitution.
4. **Dimensional analysis** — units must balance on every displayed equation.

Default to **one-shot commands** that **exit nonzero on failure**: pass program
inline (`uv run --with sympy python -c '...'`) so verification produces quotable
command + no artifact. Exit codes: 0 = all checks pass, 1 = claim refuted, 2 =
setup error (distinct from refutation). See
[scripts/verify_claim_example.py](../scripts/verify_claim_example.py) for pattern.

Writing verifier to disk — including scratch paths such as `/tmp` — is a mutation,
available **only when caller has explicitly authorized writes**. The
`adversarial-claims-reviewer` agent runs `readonly: true`, never has that
authorization: verifies with one-shot commands, quotes them in report. When
skill invoked directly in write-authorized thread, persist reusable
verifiers into relevant `scripts/` directory so they compose with CI.

## Step 4 — CLASSIFY

| Verdict | Meaning | Requirement |
|---|---|---|
| VERIFIED | Reproduced by script, identity, or independent computation | Cite the evidence / script path |
| REFUTED | Shown false as stated | Counterexample or failing script |
| UNVERIFIABLE | Could not be checked with available means | Say exactly what blocked verification |
| VACUOUS | True but trivial, dressed as a result | Show the trivial reduction |

Report headline = four counts. **A document's status equals its
UNVERIFIABLE + REFUTED count**, regardless of polish. UNVERIFIABLE counts against
document: claim that cannot be checked is liability, not benefit of doubt.

## Step 5 — REGIME SANITY

For every formula + diagnostic, evaluate in at least one regime where correct
answer independently known; check **sign, direction, and magnitude**.

Motivating example (uncited — illustrative): a "calculus
breakdown" diagnostic that turned out **maximal in flat space and minimal at
the horizon** — exactly backwards from physics it claimed to measure. Formula
internally consistent; only regime check exposed it measured opposite
of its label.

Standard regimes: limits (0, ∞, identity operator), flat/trivial cases, known exact
solutions, degenerate parameters, symmetry points.

## Step 6 — SELF-CONSISTENCY SWEEP

Cross-check document against itself:

- Do appendices verify the **same statements** body asserts — or neighboring ones?
- Do conclusions cite results actually established earlier (by ID), or merely gestured at?
- Symbols used consistently between sections? Silent redefinition is a finding.
- Do stated numbers match tables/plots they summarize?

Flag every mismatch explicitly. Motivating paper would have been caught here alone:
appendix verified single-mode commutation while body asserted properties of
formula that was not the commutator.

## Step 7 — REPORT

Fill [assets/report-template.md](../assets/report-template.md). Ordering mandatory:

1. The four counts (the headline).
2. Single most damaging finding, stated first + plainly.
3. Inventory table with per-claim verdicts, one-line justifications, script paths.
4. "What would need to be true" for each REFUTED claim — exact propositions that
   would have to hold for claim to be rescued, so author knows repair cost.
5. Regime-sanity + self-consistency findings.
6. Optional second-opinion section: verdicts from independent model,
   disagreements surfaced side by side — never averaged.

## Stance reminders

- Assume at least one fatal flaw exists; review is the hunt for it.
- Formatting, citation density, LaTeX polish are non-evidence.
- Rigor-signaling phrases ("it is easy to see", "standard results imply") mandate
  verification of decorated step.
- No softened language: "may warrant a closer look" forbidden where "is false" is true.
