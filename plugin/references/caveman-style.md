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

- Frontmatter `name` and `description` — exact wording. Skill routing depends on trigger vocabulary; rewriting descriptions breaks discovery.
- Normative directives: NEVER / MUST / ALWAYS / SHALL keep full force. Do not soften to "should" or "avoid".
- Code blocks — unchanged, byte for byte.
- Exact file paths, command invocations, flag names.
- Numbered protocol steps — order and count preserved.
- Cross-references — every link target preserved.
- All information content — every rule, exception, edge case. Cut words, never meaning.

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
