# The Five-Axis Review

Every review evaluates code across these dimensions:

## 1. Correctness

Does code do what it claims?

- Matches spec or task requirements?
- Edge cases handled (null, empty, boundary values)?
- Error paths handled (not just happy path)?
- Passes all tests? Tests actually testing right things?
- Off-by-one errors, race conditions, state inconsistencies?

## 2. Readability & Simplicity

Can another engineer (or agent) understand code without author explaining?

- Names descriptive, consistent with project conventions? (No `temp`, `data`, `result` without context)
- Control flow straightforward (avoid nested ternaries, deep callbacks)?
- Code organized logically (related code grouped, clear module boundaries)?
- Any "clever" tricks that should be simplified?
- **Could this be done in fewer lines?** (1000 lines where 100 suffice is failure)
- **Are abstractions earning their complexity?** (Don't generalize until third use case)
- Would comments clarify non-obvious intent? (Don't comment obvious code.)
- Dead code artifacts: no-op variables (`_unused`), backwards-compat shims, `// removed` comments?

## 3. Architecture

Does change fit system design?

- Follows existing patterns or introduces new one? If new, justified?
- Maintains clean module boundaries?
- Code duplication that should be shared?
- Dependencies flowing right direction (no circular dependencies)?
- Abstraction level appropriate (not over-engineered, not too coupled)?

## 4. Security

For detailed security guidance, see `security-engineering` skill. Does change introduce vulnerabilities?

- User input validated and sanitized?
- Secrets kept out of code, logs, version control?
- Authentication/authorization checked where needed?
- SQL queries parameterized (no string concatenation)?
- Outputs encoded to prevent XSS?
- Dependencies from trusted sources with no known vulnerabilities?
- Data from external sources (APIs, logs, user content, config files) treated as untrusted?
- External data flows validated at system boundaries before use in logic or rendering?

## 5. Performance

For detailed profiling and optimization, route to [`engineer`](../../../agents/engineer.md) agent. Does change introduce performance problems?

- N+1 query patterns?
- Unbounded loops or unconstrained data fetching?
- Synchronous operations that should be async?
- Unnecessary re-renders in UI components?
- Missing pagination on list endpoints?
- Large objects created in hot paths?
