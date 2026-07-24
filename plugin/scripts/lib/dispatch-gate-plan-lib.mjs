/**
 * Runtime twin of scripts/lib/gate-plan-lib.sh — classify changed paths into
 * required reviewer Tasks. Keep in sync with gate-plan-lib.sh path classes
 * (plugin/skills|agents library; plugin/commands|rules|references sensitive).
 */

export function dispatchPlanReset() {
  return {
    isCodeChange: false,
    isSensitive: false,
    isLibrary: false,
    hasDataModel: false,
    skipDocsOnly: true,
    wave1: [],
    wave2: [],
  };
}

export function dispatchPlanNormalizeChanged(raw = "") {
  if (raw.includes("\n")) {
    return raw;
  }
  if (raw.includes(" ")) {
    return raw.split(" ").join("\n");
  }
  return raw;
}

export function dispatchPlanClassifyPaths(changedRaw) {
  const plan = dispatchPlanReset();
  const changed = dispatchPlanNormalizeChanged(changedRaw);

  for (const line of changed.split("\n")) {
    const f = line.trim();
    if (!f) continue;

    // Keep churn/skip + sensitive lists in sync with scripts/lib/gate-plan-lib.sh.
    if (f.startsWith("plugin/skills/") || f.startsWith("plugin/agents/")) {
      plan.isLibrary = true;
    }

    if (
      f === "scripts/local-install.mjs" ||
      f === "scripts/validate.mjs" ||
      f === "scripts/lib/repository-validator.mjs" ||
      f === "scripts/gate-plan.sh" ||
      f === "scripts/check-pr-ship-gates.sh" ||
      f === "scripts/lib/gate-plan-lib.sh" ||
      f.startsWith("plugin/hooks/") ||
      f.startsWith("plugin/rules/") ||
      f.startsWith("plugin/commands/") ||
      f.startsWith("plugin/references/") ||
      f === "SECURITY.md" ||
      f === "scripts/release.mjs" ||
      f.startsWith(".github/workflows/") ||
      f === ".cursor/dispatch-gate.json" ||
      f === "plugin/.cursor/dispatch-gate.json" ||
      f.startsWith("scripts/lib/dispatch-gate") ||
      f.startsWith("plugin/scripts/lib/dispatch-gate") ||
      f.startsWith("plugin/scripts/dispatch-gate") ||
      f.startsWith("scripts/dispatch-gate")
    ) {
      plan.isSensitive = true;
    }

    if (f === "DATA_MODEL.md") {
      plan.isCodeChange = true;
      plan.hasDataModel = true;
      continue;
    }

    // Docs / session churn — never reclassify as code (match gate-plan-lib.sh).
    if (
      f.endsWith(".md") ||
      f.endsWith(".mdc") ||
      f === "LICENSE" ||
      f === "NOTICE" ||
      f.startsWith("docs/") ||
      f.startsWith(".claude/memory/") ||
      f.startsWith(".claude/ledger/") ||
      f === ".cursor/dispatch-ledger.json"
    ) {
      continue;
    }

    // Note: eval/metrics/runs/** is NOT skipped — bash treats it as code; keep JS aligned.
    plan.isCodeChange = true;
  }

  if (plan.isCodeChange || plan.isLibrary || plan.isSensitive) {
    plan.skipDocsOnly = false;
  }

  return plan;
}

export function dispatchPlanBuildWaves(plan) {
  const wave1 = [];
  const wave2 = [];

  if (plan.skipDocsOnly) {
    return { ...plan, wave1, wave2 };
  }

  if (plan.isCodeChange || plan.isLibrary) {
    wave1.push("code-reviewer");
  }
  if (plan.isCodeChange || plan.isLibrary || plan.isSensitive) {
    wave1.push("security-reviewer");
    wave1.push("data-model-documenter");
  }
  if (plan.isLibrary) {
    wave1.push("library-reviewer");
  }
  if (plan.hasDataModel) {
    wave2.push("data-model-verifier");
  }

  return { ...plan, wave1, wave2 };
}

export function dispatchPlanRun(changedRaw) {
  return dispatchPlanBuildWaves(dispatchPlanClassifyPaths(changedRaw));
}

export function dispatchPlanMissingReviews(plan, completedCsv = "") {
  const completed = new Set(
    String(completedCsv)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const required = [...plan.wave1, ...plan.wave2];
  return required.filter((agent) => !completed.has(agent));
}
