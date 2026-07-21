---
name: security-engineering
description: Method and standards for cross-stack security engineering — auditing vulnerabilities across infrastructure, smart contracts, CI/CD pipelines, and AI agent systems, plus auth, sessions, crypto, and validating user input at API and infrastructure boundaries. Loaded inline when hardening or auditing code yourself, and when a diff touches auth, sessions, crypto, smart contracts, CI/CD secrets, or any user-input-to-sensitive-sink path. Triggers on "vulnerability", "pentest", "OWASP", "access control", "injection", "CSRF", "JWT", "smart contract audit", "supply chain", "OIDC". For a dispatched read-only audit in an isolated context against a cold-context brief, run after local verification and in parallel with code review — use the security-reviewer agent. Not for general multi-axis code review method — use code-review-and-quality, whose dispatched counterpart is the code-reviewer agent.
---

# Security Engineering

Cross-stack security rules covering API security, infrastructure hardening, Web3 smart contracts, CI/CD review automation, and agentic AI risks. Aligned to OWASP Top 10:2025, ASVS 5.0, and OWASP Agentic Security Initiative 2026.

When reviewing code, think like a senior security researcher: trace user input through to sensitive operations, prefer fail-closed designs, and never trust the client.

## Universal Rules

- **Validate every input server-side** with Zod (or equivalent) at the API boundary.
- **Parameterize all queries** — Prisma/Drizzle, never string concatenation.
- **Authorize on every request** — deny by default, verify ownership.
- **Hash passwords with Argon2 or bcrypt** — never MD5/SHA1, never plaintext.
- **No hardcoded secrets** — env vars validated at startup, secrets in vault, `.env` in `.gitignore`.
- **TLS everywhere**, encryption at rest on all data stores.
- **Fail-closed** on auth/permission errors. Never expose stack traces to users.
- **Log security events** with sanitization — redact `authorization`, `cookie`, CSRF headers.
- **Least-privilege IAM** — scope to specific actions and resource ARNs, not `*`.
- **OIDC for CI/CD** — no long-lived credentials in GitHub.
- **Smart contracts**: ReentrancyGuard, SafeERC20, signed data must include `chainid + address(this) + deadline`, replay-prevention via `usedHashes`.

## Tier discipline

Tier definitions live in the `evidence-review-tiers` rule, which is authoritative. A critical-security failure is non-compensable: it cannot be offset by speed, aggregate quality, or passing unrelated checks.

- **Tier 0:** an already-failing deterministic check — a scanner, test, or validator that fails now.
- **Tier 1:** a security finding whose attached artifact, failing test, or explicit counterexample reproduces the vulnerability. Explicit counterexamples are Tier 1, not Tier 0. Without the artifact the finding is Tier 2.
- **Tier 2:** unevidenced hardening opinions. Log them to [findings-ledger](../findings-ledger/SKILL.md); never gate on them.

Dispatch as a readonly [security-reviewer](../../agents/security-reviewer.md) Task with a cold-context brief, in parallel with [code-reviewer](../../agents/code-reviewer.md).

## References

- [references/owasp-top-10.md](references/owasp-top-10.md) — OWASP Top 10:2025 quick reference table
- [references/cicd-security.md](references/cicd-security.md) — CI/CD security review methodology, scanned vulnerability categories, supply-chain check
- [references/api-security.md](references/api-security.md) — auth patterns, Zod validation, rate limiting, CORS, headers, log sanitization, error handling
- [references/infrastructure-security.md](references/infrastructure-security.md) — VPC isolation, Cloudflare Zero Trust, secrets management, encryption, IAM principles
- [references/web3-smart-contracts.md](references/web3-smart-contracts.md) — required patterns, signature verification, on-chain rate limits, audit findings, Slither
- [references/code-review-checklist.md](references/code-review-checklist.md) — full checklist by category (input, auth, access control, data, errors, Web3)
- [references/secure-code-patterns.md](references/secure-code-patterns.md) — SQLi, command injection, access control, fail-closed, password storage examples
- [references/agentic-ai-security.md](references/agentic-ai-security.md) — OWASP 2026 ASI01-10 + agent security checklist
- [references/asvs-5.md](references/asvs-5.md) — L1/L2/L3 requirements
- [references/language-specific.md](references/language-specific.md) — JS/TS, Solidity, Python, Go, Bash risks + deep analysis mindset

## Related skills

- [deployment-pipelines](../deployment-pipelines/SKILL.md) — pipeline hardening, OIDC, untrusted-input handling in CI
- [code-review-and-quality](../code-review-and-quality/SKILL.md) — the general multi-axis review this audit runs alongside
