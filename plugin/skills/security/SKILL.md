---
name: security
description: "Scan and redact PII and sensitive data (emails, phone numbers, SSNs, API keys, IP addresses, credentials, amounts, company/person names) from repository files. Includes a pre-commit hook to block commits containing PII. Use when asked to audit code for sensitive data, sanitize files before publishing, or install PII detection hooks. For application security hardening see security-engineering."
---

# Security Sanitizer

Scans and redacts PII / sensitive data from files in this repo. Uses only Python standard library — no external dependencies.

## Tools

Resolve scripts project-first, then the local Cursor plugin install:

```sh
PROJ="${CURSOR_PROJECT_DIR:-.}"
SAN="$PROJ/plugin/skills/security/scripts/sanitizer.py"
[ -f "$SAN" ] || SAN="$HOME/.cursor/plugins/local/cursor-harness/skills/security/scripts/sanitizer.py"
```

| Script | Purpose | Key Command |
|--------|---------|-------------|
| `scripts/sanitizer.py` | Scan or redact PII in files | `python3 "$SAN" --scan --dir . --recursive` |
| `scripts/pre-commit-hook.sh` | Git hook to block commits with PII | `cp "$(dirname "$SAN")/pre-commit-hook.sh" .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit` |

## Configuration

Edit `scripts/sanitizer-config.json` beside this skill (same directory as `$SAN`) to customize blocklists, custom regex patterns, skip paths, and placeholder format.

## Exit Codes

`0` = clean, `1` = PII found (useful for CI).

## Related skills

- [security-engineering](../security-engineering/SKILL.md) — application security, OWASP, auth hardening, input validation, auth/session patterns for web applications
