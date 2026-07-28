# CI/CD Security — Automated Review

Run security-focused automated code review on every PR as CI job. Reference
captures review methodology, vulnerability categories worth scanning, supply-chain
checks — independent of any specific review tool.

## Security review methodology

Security review on PR proceeds in three phases:

1. **Repository context**: Identify existing security frameworks, patterns, sanitization
2. **Comparative analysis**: Compare new code against established security patterns
3. **Vulnerability assessment**: Trace user input through to sensitive operations

Trigger job on `pull_request` (`opened`, `synchronize`, `reopened`,
`ready_for_review`) with least-privilege permissions (`contents: read`,
`pull-requests: write`).

## Vulnerability categories to scan

- **Input validation**: SQL/command/XXE/template/NoSQL injection, path traversal
- **Auth & authorization**: Auth bypass, privilege escalation, JWT issues (weak signing, alg confusion, no expiry), IDOR
- **Crypto & secrets**: Hardcoded keys/passwords/tokens, weak crypto, improper key storage, weak RNG (`Math.random()`)
- **Injection & code execution**: RCE via deserialization, YAML deserialization, eval/dynamic code, XSS (reflected/stored/DOM-based)
- **Data exposure**: Sensitive data in logs, PII violations, API data leakage, debug exposure in production
- **Business logic & financial**: Race conditions, TOCTOU, transaction replay, double-spending
- **Config & supply chain**: Insecure defaults, missing security headers (CSP, HSTS), permissive CORS, vulnerable dependencies
- **Web3 critical**: Private keys/mnemonics in client-bundle code → block the change

**Output**: Structured markdown with File/Line/Severity/Category/Description/Exploit Scenario/Fix Recommendation.

## Deliberate out-of-scope (reduce false positives)

- UUIDs assumed unguessable
- Environment variables and CLI flags trusted
- Tabnabbing, XS-Leaks, prototype pollution (unless extreme confidence)
- React/Angular XSS unless unsafe methods (`dangerouslySetInnerHTML`, `bypassSecurityTrustHtml`)
- Client-side auth checks (server responsible)
- Logging non-PII data

## Smart contract review

Smart contract repos warrant dedicated review enforcing:

1. **SECURITY FIRST** — flag vulnerabilities immediately
2. Reentrancy attacks, access control, integer overflow/underflow
3. Unchecked external calls, unbounded loops
4. Timestamp dependence, hardcoded addresses
5. Unsafe delegate calls, front-running vulnerabilities

## Supply chain check

Run dependency audit on PR and push to main/staging, blocking on
high-severity advisories:

```bash
pnpm audit --audit-level=high
```

Back with custom blocking check for known-vulnerable packages audit tool misses.
