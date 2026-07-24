#!/usr/bin/env bash
# Pre-commit hook: scan staged files for PII / sensitive data.
#
# Install:
#   cp plugin/skills/security/scripts/pre-commit-hook.sh .git/hooks/pre-commit
#   chmod +x .git/hooks/pre-commit
#
# Bypass (emergency only):
#   git commit --no-verify

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
SANITIZER="$REPO_ROOT/plugin/skills/security/scripts/sanitizer.py"
if [ ! -f "$SANITIZER" ]; then
    SANITIZER="${HOME}/.cursor/plugins/local/cursor-harness/skills/security/scripts/sanitizer.py"
fi

if [ ! -f "$SANITIZER" ]; then
    echo "⚠️  Sanitizer not found under plugin/skills/security/scripts/ — blocking commit until sanitizer is restored."
    exit 1
fi

FOUND_PII=0
FOUND_ERROR=0
TEMP_REPORT=$(mktemp)
trap 'rm -f "$TEMP_REPORT"' EXIT

while IFS= read -r -d '' FILE; do
    FULL_PATH="$REPO_ROOT/$FILE"

    # Only check supported extensions
    case "$FILE" in
        *.py|*.md|*.txt|*.json|*.yaml|*.yml|*.env)
            ;;
        *)
            continue
            ;;
    esac

    if [ ! -f "$FULL_PATH" ]; then
        continue
    fi

    set +e
    OUTPUT=$(python3 "$SANITIZER" --scan --file "$FULL_PATH" --quiet 2>&1)
    EXIT_CODE=$?
    set -e

    if [ "$EXIT_CODE" -eq 0 ]; then
        continue
    fi

    if [ "$EXIT_CODE" -eq 1 ]; then
        # Exit 1 = PII / sensitive data found
        echo "$FILE: $OUTPUT" >> "$TEMP_REPORT"
        FOUND_PII=1
    else
        # Crash / usage / missing file (exit 2+) — fail closed
        echo "$FILE: sanitizer failed (exit $EXIT_CODE): $OUTPUT" >> "$TEMP_REPORT"
        FOUND_ERROR=1
    fi
done < <(git diff -z --cached --name-only --diff-filter=ACM)

if [ "$FOUND_PII" -eq 1 ] || [ "$FOUND_ERROR" -eq 1 ]; then
    echo ""
    if [ "$FOUND_PII" -eq 1 ]; then
        echo "🚫 COMMIT BLOCKED — PII / sensitive data detected in staged files:"
    else
        echo "🚫 COMMIT BLOCKED — sanitizer failed while scanning staged files:"
    fi
    echo ""
    cat "$TEMP_REPORT"
    echo ""
    echo "To fix:"
    echo "  1. Run: python3 plugin/skills/security/scripts/sanitizer.py --scan --dir . --recursive"
    echo "  2. Review findings and redact manually, or run with --sanitize"
    echo "  3. Stage the fixed files and commit again"
    echo ""
    echo "To bypass (emergency): git commit --no-verify"
    exit 1
fi

exit 0
