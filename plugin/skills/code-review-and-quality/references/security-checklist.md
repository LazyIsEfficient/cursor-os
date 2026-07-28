# Security Review Checklist

Use during code review to catch common security issues.

## Input Validation
- [ ] All user-supplied input validated and sanitised before use
- [ ] No raw SQL string concatenation (use parameterised queries)
- [ ] No eval / exec on user input

## Authentication & Authorisation
- [ ] Endpoints enforce authentication where required
- [ ] Authorisation checks server-side, not only client-side
- [ ] Sensitive operations require re-authentication

## Secrets & Credentials
- [ ] No secrets, tokens, or credentials committed to source
- [ ] Environment variables used for all config varying by environment
- [ ] `.env` files gitignored

## Dependencies
- [ ] No dependencies with known critical CVEs (run `npm audit` / `cargo audit` / equivalent)
- [ ] Dependency versions pinned or bounded

## Output Encoding
- [ ] HTML output escaped to prevent XSS
- [ ] JSON responses set correct `Content-Type`

## Error Handling
- [ ] Error messages do not leak stack traces or internal paths to client
- [ ] Logging does not capture PII or secrets
