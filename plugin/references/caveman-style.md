# Caveman Style

Durable style contract for plugin skills and references. Telegraphic prose: maximum information per token.

## Rules

- Drop articles where unambiguous: "the", "a", "an" — omit when meaning survives.
- No filler: no "it's important to note", "in order to", "as mentioned above".
- No hedging: no "might want to", "consider", "generally". State rule or exception, not vibes.
- No pleasantries: no "let's", "simply", "just follow these easy steps".
- Imperative mood: "Run validator." not "You should run the validator."
- Bullets over sentences. One idea per bullet.
- Compress expression, NEVER delete rules. Information content MUST survive rewrite intact.

## MUST preserve

Compression never touches these. Violation = blocking error.

- Frontmatter `name` — exact wording.
- Normative directives: NEVER / MUST / ALWAYS / SHALL keep full force. Do not soften to "should" or "avoid".
- Exact file paths, command invocations, flag names.
- Test-enforced phrases — orchestration/validator tests assert exact wording (e.g. "graph is acyclic", "requires a reproducible"). If compression breaks a test, restore the phrase; tests are the contract.
- Numbered protocol steps — order and count preserved.
- Cross-references — every link target preserved.
- All information content — every rule, exception, edge case. Cut words, never meaning.

## Code blocks — minimal comments

Code itself NEVER changes: expressions, logic, strings, identifiers byte-identical. Comments are compressible:

- Strip comments that restate the code (`// increment counter` over `counter++`).
- Strip narrative/banner comments and obvious section dividers.
- KEEP comments explaining non-obvious behavior: why not what, invariants, gotchas, security boundaries, config-value meanings, license/attribution headers.
- When unsure, keep. A lost why-comment is information loss; a kept restatement is a few tokens.

## Frontmatter descriptions — compressible, triggers sacred

Descriptions MAY compress to caveman style. Routing matches trigger vocabulary — every trigger keyword (tool names, domain terms, slash commands, "Use when" scenarios, deflection pointers like "For X see Y") MUST survive verbatim. Cut connective prose only. Verify: every keyword in old description appears in new.

## Examples

Before:

> It is important to note that you should generally consider running the validator before you commit your changes, since this can help catch issues early in the process.

After:

> Run validator before commit. Catches issues early.

Before:

> When the agent is done, it will return a single message back to you. You will want to specify exactly what information the agent should return back in its final response to you.

After:

> Agent returns one final message. Specify exactly what information it must contain.

Before:

> NEVER dispatch the data-model-verifier in parallel with the data-model-documenter, because the author must come before the verifier in `plugin/references/gate-dag.md`.

After:

> NEVER dispatch data-model-verifier in parallel with data-model-documenter. Author before verifier — `plugin/references/gate-dag.md`.

(Normative force, exact path, ordering rule all preserved; only filler cut.)
