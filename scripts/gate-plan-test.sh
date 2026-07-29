#!/usr/bin/env bash
# gate-plan-test.sh — fixture tests for gate-plan.sh / gate-plan-lib.sh
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLAN="$REPO/scripts/gate-plan.sh"

pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; exit 1; }

assert_contains() {
  local haystack="$1" needle="$2" msg="$3"
  if [[ "$haystack" != *"$needle"* ]]; then
    fail "$msg (missing: $needle)"
  fi
}

assert_not_contains() {
  local haystack="$1" needle="$2" msg="$3"
  if [[ "$haystack" == *"$needle"* ]]; then
    fail "$msg (unexpected: $needle)"
  fi
}

out="$(SHIP_GATES_CHANGED_FILES="README.md" bash "$PLAN")"
if printf '%s' "$out" | grep -q 'skip_docs_only=true'; then
  pass "docs-only skip"
else
  fail "docs-only skip"
fi

out="$(SHIP_GATES_CHANGED_FILES="openspec/changes/foo/proposal.md openspec/changes/foo/.openspec.yaml" bash "$PLAN")"
if printf '%s' "$out" | grep -q 'skip_docs_only=true'; then
  pass "openspec docs-only skip"
else
  fail "openspec docs-only skip"
fi

# Dispatch briefs are sensitive (compiled into Task prompts): gates, no code-reviewer.
out="$(SHIP_GATES_CHANGED_FILES="openspec/changes/foo/dispatch/T-parser.md" bash "$PLAN")"
assert_contains "$out" "skip_docs_only=false" "openspec dispatch brief gates"
assert_contains "$out" "security-reviewer" "openspec dispatch security-reviewer"
assert_contains "$out" "data-model-documenter" "openspec dispatch documenter"
assert_not_contains "$out" "wave_1=code-reviewer" "openspec dispatch no code-reviewer"

# A bare openspec/changes/dispatch/*.md (no change-id segment) is NOT a brief:
# `*` requires a segment, so it falls through to openspec docs-only. The JS
# twin regex /^openspec\/changes\/.+\/dispatch\// keeps the same parity.
out="$(SHIP_GATES_CHANGED_FILES="openspec/changes/dispatch/foo.md" bash "$PLAN")"
if printf '%s' "$out" | grep -q 'skip_docs_only=true'; then
  pass "openspec bare dispatch path is docs-only"
else
  fail "openspec bare dispatch path is docs-only"
fi

# Main specs are sensitive (archive PRs mutate the source of truth).
out="$(SHIP_GATES_CHANGED_FILES="openspec/specs/planning/spec.md" bash "$PLAN")"
assert_contains "$out" "skip_docs_only=false" "openspec main spec gates"
assert_contains "$out" "security-reviewer" "openspec main spec security-reviewer"
assert_not_contains "$out" "wave_1=code-reviewer" "openspec main spec no code-reviewer"

# Fail closed: non-docs file types under openspec/ are code changes, not docs.
out="$(SHIP_GATES_CHANGED_FILES="openspec/hooks/evil.sh" bash "$PLAN")"
assert_contains "$out" "skip_docs_only=false" "openspec non-docs is a code change"
assert_contains "$out" "code-reviewer" "openspec non-docs wave_1"

out="$(SHIP_GATES_CHANGED_FILES="openspec/config.yaml" bash "$PLAN")"
assert_contains "$out" "skip_docs_only=false" "openspec config.yaml is a code change"

out="$(SHIP_GATES_CHANGED_FILES="scripts/validate.mjs" bash "$PLAN")"
assert_contains "$out" "code-reviewer" "validate.mjs wave_1"
assert_contains "$out" "security-reviewer" "validate.mjs wave_1"
assert_contains "$out" "data-model-documenter" "validate.mjs wave_1"
assert_not_contains "$out" "library-reviewer" "validate.mjs no library"
assert_not_contains "$out" "data-model-verifier" "validate.mjs no verifier"

out="$(SHIP_GATES_CHANGED_FILES="plugin/skills/foo/SKILL.md" bash "$PLAN")"
assert_contains "$out" "library-reviewer" "library path"

out="$(SHIP_GATES_CHANGED_FILES="DATA_MODEL.md" bash "$PLAN")"
assert_contains "$out" "data-model-verifier" "DATA_MODEL wave_2"
assert_contains "$out" "wave_2=data-model-verifier" "DATA_MODEL wave_2 line"
assert_contains "$out" "code-reviewer" "DATA_MODEL wave_1 code-reviewer"
assert_contains "$out" "security-reviewer" "DATA_MODEL wave_1 security"
assert_contains "$out" "data-model-documenter" "DATA_MODEL wave_1 documenter"

out="$(SHIP_GATES_CHANGED_FILES="scripts/validate.mjs DATA_MODEL.md" bash "$PLAN")"
assert_contains "$out" "skip_docs_only=false" "space-separated multi-file"
assert_contains "$out" "data-model-verifier" "space-separated verifier"

out="$(SHIP_GATES_CHANGED_FILES="SECURITY.md" bash "$PLAN")"
assert_not_contains "$out" "wave_1=code-reviewer" "SECURITY sensitive-only no code-reviewer"
assert_contains "$out" "security-reviewer" "SECURITY security-reviewer"
assert_contains "$out" "data-model-documenter" "SECURITY documenter"

out="$(SHIP_GATES_CHANGED_FILES="plugin/rules/orchestrator-first.mdc" bash "$PLAN")"
assert_contains "$out" "skip_docs_only=false" "plugin rules not docs-only"
assert_contains "$out" "security-reviewer" "plugin rules security-reviewer"
assert_contains "$out" "data-model-documenter" "plugin rules documenter"
assert_not_contains "$out" "wave_1=code-reviewer" "plugin rules sensitive-only no code-reviewer"

out="$(SHIP_GATES_CHANGED_FILES="plugin/agents/engineer.md" bash "$PLAN")"
assert_contains "$out" "library-reviewer" "plugin agents library path"

cbs="$(SHIP_GATES_CHANGED_FILES="scripts/validate.mjs" bash "$PLAN" --checkboxes | tr '\n' ' ')"
assert_contains "$cbs" "code-reviewer" "checkboxes validate"
assert_not_contains "$cbs" "data-model-verifier" "checkboxes validate no verifier"

cbs="$(SHIP_GATES_CHANGED_FILES="DATA_MODEL.md" bash "$PLAN" --checkboxes | tr '\n' ' ')"
assert_contains "$cbs" "data-model-verifier" "checkboxes DATA_MODEL verifier"

skip="$(SHIP_GATES_CHANGED_FILES="README.md" bash "$PLAN" --skip-docs-only)"
if [[ "$skip" == "true" ]]; then
  pass "skip-docs-only flag"
else
  fail "skip-docs-only flag"
fi

json="$(SHIP_GATES_CHANGED_FILES="DATA_MODEL.md" bash "$PLAN" --json)"
if printf '%s' "$json" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['has_data_model'] and 'data-model-verifier' in d['wave_2']"; then
  pass "json output"
else
  fail "json output"
fi

echo "gate-plan-test: OK"
