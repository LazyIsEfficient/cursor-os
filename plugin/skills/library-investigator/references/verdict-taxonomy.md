# Verdict taxonomy — the truthseeker's four words

The investigator emits exactly four per-check verdicts. It emits NO fifth
"gamed-but-passing" category: if a rule is met, it CONFORMS and ships — the
investigator does not second-guess a passing probe. And it emits **no overall
verdict** at any level. There is no pass, no fail, no hold, no grade. The
headline is the four COUNTS; nothing else.

## CONFORMS

The rule applies to this surface, the probe ran to completion, and the file
**meets** the rule. Cite the evidence (the measured value, e.g. "description is
612 chars (<= 800)"). A CONFORMS is final — there is no "technically passes but
feels gamed." If the probe says met, it is met.

## VIOLATES

The rule applies, the probe ran to completion, and the file **breaks** the rule.
The row MUST quote the failing probe output (the offending line, the measured
overage, the offending path). Each VIOLATES carries its tier as a FACT about the
check's reproducibility — Tier 1 where the probe output IS reproducible evidence
(P1, P2, P3), Tier 0 where the check already fails on its own authority in the
repository validator or the orchestration contract test (P4, `TIER0-validate`),
and Tier 2 where the row reports a divergence the repository already tolerates
(P5). The investigator states the tier and frames the finding as a ratchet
candidate for the validator; it never says "this blocks."

## UNVERIFIABLE

The rule is mechanical and in-jurisdiction, but the probe **could not complete**
— a missing file, a malformed or absent frontmatter block, a missing
`description:` value, or a file the script could not read. UNVERIFIABLE is not a
guess and not a soft pass: it is an honest "the probe was blocked here." It
never silently becomes CONFORMS. Surface what blocked it so the caller can fix
the file and re-run. Because an UNVERIFIABLE row carries no reproducing
artifact, it is Tier 2 and advisory.

## N-A

The rule does **not apply** to this surface (e.g. the line-count probe against
an agent, or the vendor-name probe against a rule file with no `name` key), OR
the rule is a **judgment rule outside the truthseeker's jurisdiction** (routing
specificity, single-responsibility, "states what and when", tier-language
fidelity). N-A is not a failure and not a pass; it is "not my jurisdiction." The
investigator never guesses at a judgment rule — guessing is exactly the
overreach this archetype exists to avoid.

## No overall verdict — ever

The report leads with `CONFORMS n / VIOLATES n / UNVERIFIABLE n / N-A n over N
files × M rules` and stops there. There is no summary line that says the library
"passes" or "needs work." A reader who wants a quality opinion is routed to a
judgment review; a reader who wants a gate is routed to the deterministic
checks. The investigator only reports what is true, with proof.
