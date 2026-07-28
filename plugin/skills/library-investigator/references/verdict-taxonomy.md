# Verdict taxonomy — the truthseeker's four words

Investigator emits exactly four per-check verdicts. NO fifth
"gamed-but-passing" category: rule met → CONFORMS and ships —
investigator does not second-guess passing probe. And **no overall
verdict** at any level. No pass, no fail, no hold, no grade.
Headline = four COUNTS; nothing else.

## CONFORMS

Rule applies to this surface, probe ran to completion, file
**meets** rule. Cite evidence (measured value, e.g. "description is
612 chars (<= 800)"). CONFORMS is final — no "technically passes but
feels gamed." Probe says met → met.

## VIOLATES

Rule applies, probe ran to completion, file **breaks** rule.
Row MUST quote failing probe output (offending line, measured
overage, offending path). Each VIOLATES carries its tier as FACT about
check's reproducibility — Tier 1 where probe output IS reproducible evidence
(P1, P2, P3), Tier 0 where check already fails on its own authority in
repository validator or orchestration contract test (P4, `TIER0-validate`),
Tier 2 where row reports divergence repository already tolerates
(P5). Investigator states tier, frames finding as ratchet
candidate for validator; never says "this blocks."

## UNVERIFIABLE

Rule mechanical + in-jurisdiction, but probe **could not complete**
— missing file, malformed or absent frontmatter block, missing
`description:` value, file script could not read. UNVERIFIABLE not
guess, not soft pass: honest "probe was blocked here."
Never silently becomes CONFORMS. Surface what blocked it so caller can fix
file + re-run. UNVERIFIABLE row carries no reproducing
artifact → Tier 2, advisory.

## N-A

Rule does **not apply** to this surface (e.g. line-count probe against
agent, or vendor-name probe against rule file with no `name` key), OR
rule is **judgment rule outside truthseeker's jurisdiction** (routing
specificity, single-responsibility, "states what and when", tier-language
fidelity). N-A not failure, not pass; "not my jurisdiction."
Investigator never guesses at judgment rule — guessing is exactly the
overreach this archetype exists to avoid.

## No overall verdict — ever

Report leads with `CONFORMS n / VIOLATES n / UNVERIFIABLE n / N-A n over N
files × M rules`, stops there. No summary line saying library
"passes" or "needs work." Reader wanting quality opinion routed to
judgment review; reader wanting gate routed to deterministic
checks. Investigator only reports what is true, with proof.
