#!/usr/bin/env bash
# Mechanical probe over the plugin component surfaces.
# Emits one "STATUS<TAB>TIER<TAB>RULE<TAB>FILE<TAB>DETAIL" row per (file, rule).
# Casts no judgment and emits no overall verdict. Exit status is always 0 unless
# the repository root is unusable; row counts are the output, not the exit code.
set -uo pipefail

ROOT="${1:-.}"
PLUGIN="$ROOT/plugin"
DESC_MAX=800
SKILL_MAX_LINES=99

if [ ! -d "$PLUGIN" ]; then
  printf 'UNVERIFIABLE\t-\tsetup\t%s\tno plugin/ directory under repository root\n' "$ROOT"
  exit 2
fi

row() { printf '%s\t%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" "$5"; }

# Frontmatter block: lines strictly between the first two --- delimiters.
fm_block() {
  awk 'NR==1 && $0!="---" {exit} NR==1 {next} $0=="---" {exit} {print}' "$1"
}

fm_value() {
  fm_block "$1" | awk -v k="$2" 'index($0, k ":")==1 {sub("^" k " *: *", ""); print; exit}'
}

# P1 — description length cap. Not enforced by the repository validator.
probe_description() {
  local file="$1" desc
  desc="$(fm_value "$file" description)"
  if [ -z "$desc" ]; then
    row UNVERIFIABLE 1 P1-description-length "$file" "no description value in frontmatter"
    return
  fi
  local len=${#desc}
  if [ "$len" -le "$DESC_MAX" ]; then
    row CONFORMS 1 P1-description-length "$file" "description is $len chars (<= $DESC_MAX)"
  else
    row VIOLATES 1 P1-description-length "$file" "description is $len chars (> $DESC_MAX)"
  fi
}

# P2 — component name must not carry a vendor name.
probe_vendor_name() {
  local file="$1" name
  name="$(fm_value "$file" name)"
  if [ -z "$name" ]; then
    row "N-A" 1 P2-vendor-name "$file" "surface has no name key"
    return
  fi
  if printf '%s' "$name" | grep -qiE 'claude|anthropic|codex|openai'; then
    row VIOLATES 1 P2-vendor-name "$file" "name '$name' embeds a vendor name"
  else
    row CONFORMS 1 P2-vendor-name "$file" "name '$name' carries no vendor name"
  fi
}

# P3 — angle brackets in frontmatter are an injection surface the validator
# does not scan. Body prose is out of scope.
probe_angle_brackets() {
  local file="$1" hit
  hit="$(fm_block "$file" | sed 's/^\([A-Za-z_][A-Za-z0-9_-]*\) *: *[|>][0-9+-]*$/\1:/' | grep -n '[<>]' | head -1)"
  if [ -n "$hit" ]; then
    row VIOLATES 1 P3-frontmatter-brackets "$file" "frontmatter line contains < or >: $hit"
  else
    row CONFORMS 1 P3-frontmatter-brackets "$file" "no angle brackets in frontmatter"
  fi
}

# P4 — SKILL.md physical line count. Tier 0 asserts < 100 in the orchestration
# contract test; this row reports the measured value so drift is visible early.
probe_skill_lines() {
  local file="$1" lines
  lines="$(wc -l < "$file" | tr -d ' ')"
  if [ "$lines" -le "$SKILL_MAX_LINES" ]; then
    row CONFORMS 0 P4-skill-line-count "$file" "$lines lines (<= $SKILL_MAX_LINES)"
  else
    row VIOLATES 0 P4-skill-line-count "$file" "$lines lines (> $SKILL_MAX_LINES)"
  fi
}

# P5 — runnables belong under scripts/, never at the skill root.
probe_root_runnable() {
  local dir="$1" found
  found="$(find "$dir" -maxdepth 1 -type f \( -name '*.sh' -o -name '*.py' -o -name '*.js' -o -name '*.mjs' \) | sort | tr '\n' ' ')"
  if [ -n "$found" ]; then
    row VIOLATES 2 P5-root-runnable "$dir" "runnable at skill root: $found"
  else
    row CONFORMS 2 P5-root-runnable "$dir" "no runnable at skill root"
  fi
}

for skill in "$PLUGIN"/skills/*/SKILL.md; do
  [ -f "$skill" ] || continue
  probe_description "$skill"
  probe_vendor_name "$skill"
  probe_angle_brackets "$skill"
  probe_skill_lines "$skill"
  probe_root_runnable "$(dirname "$skill")"
done

for agent in "$PLUGIN"/agents/*.md; do
  [ -f "$agent" ] || continue
  probe_description "$agent"
  probe_vendor_name "$agent"
  probe_angle_brackets "$agent"
done

for rule in "$PLUGIN"/rules/*.mdc; do
  [ -f "$rule" ] || continue
  probe_description "$rule"
  probe_angle_brackets "$rule"
done

# Tier 0 line — defer to the repository validator rather than re-implementing it.
if command -v npm >/dev/null 2>&1; then
  if (cd "$ROOT" && npm run --silent validate >/dev/null 2>&1); then
    row CONFORMS 0 TIER0-validate "$ROOT" "npm run validate exited 0"
  else
    row VIOLATES 0 TIER0-validate "$ROOT" "npm run validate exited nonzero; run it directly for the named failure"
  fi
else
  row UNVERIFIABLE 0 TIER0-validate "$ROOT" "npm not on PATH"
fi
