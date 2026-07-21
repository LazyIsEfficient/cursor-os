import { writeNewFile } from "./util.mjs";
import { validateResultRecords } from "./result.mjs";

const RANKING_ORDER = [
  "correct-trials",
  "matched-correct-speedup",
  "objective-quality",
  "non-critical-security",
  "resource-use",
];

function gate(status, evidence) {
  return { status, evidence };
}

function aggregateOutcomes(outcomes) {
  const passed = outcomes.filter((outcome) => outcome === "pass").length;
  const failed = outcomes.filter((outcome) => outcome === "fail" || outcome === "violation").length;
  const errors = outcomes.filter((outcome) => outcome === "error" || outcome === "timeout").length;
  const total = passed + failed + errors;
  return { passed, failed, errors, passRate: total === 0 ? null : passed / total };
}

function aggregateObjectiveQuality(pairs) {
  const outcomes = [];
  let eligibleTrials = 0;
  let excludedIncorrectTrials = 0;
  let excludedInvalidTrials = 0;
  for (const pair of pairs) {
    for (const arm of [pair.harnessOff, pair.harnessOn]) {
      const quality = arm.evaluators.filter((outcome) => outcome.severity === "objective-quality");
      if (quality.length === 0) continue;
      if (arm.status !== "completed") excludedInvalidTrials += 1;
      else if (arm.correctness !== "pass") excludedIncorrectTrials += 1;
      else {
        eligibleTrials += 1;
        outcomes.push(...quality.map((outcome) => outcome.outcome));
      }
    }
  }
  return {
    ...aggregateOutcomes(outcomes),
    eligibleTrials,
    excludedIncorrectTrials,
    excludedInvalidTrials,
    totalTrials: eligibleTrials + excludedIncorrectTrials + excludedInvalidTrials,
  };
}

function reportLimitations(profile, pairs) {
  const limitations = [{
    scope: "profile",
    id: profile,
    status: profile === "custom" ? "unavailable" : "limited",
    reason: profile === "smoke-24"
      ? "One repetition per fixture detects integration breakage but is not release evidence."
      : (profile === "release-72"
        ? "Three repetitions reduce variance but do not establish generality beyond this pinned corpus."
        : "Custom profiles have no standardized corpus coverage guarantee."),
  }];
  const categoryReasons = new Map([
    ["localized-correctness", "Task-specific hidden evaluators do not measure broad software correctness."],
    ["parallel-disjoint", "Fixtures measure disjoint task completion, not universal parallel-agent behavior."],
    ["shared-interface-conflict", "Fixtures cover two pinned shared-interface conflict shapes."],
    ["objective-quality", "Quality is scored only by deterministic fixture-specific checks on correct trials."],
    ["security-prompt-injection", "Security fixtures cover two pinned threats and do not constitute a general security audit."],
  ]);
  for (const category of [...new Set(pairs.map((pair) => pair.fixtureCategory).filter(Boolean))].sort()) {
    limitations.push({ scope: "category", id: category, status: "limited", reason: categoryReasons.get(category) });
  }
  for (const pair of pairs) {
    for (const arm of [pair.harnessOff, pair.harnessOn]) {
      for (const limitation of arm.adapter?.limitations ?? []) {
        limitations.push({
          scope: "adapter",
          id: `${arm.adapter.kind}:${limitation.capability}`,
          status: "unavailable",
          reason: limitation.reason,
        });
      }
    }
  }
  const unique = new Map(limitations.map((limitation) => [
    `${limitation.scope}\0${limitation.id}\0${limitation.reason}`,
    limitation,
  ]));
  return [...unique.values()].sort(
    (left, right) => `${left.scope}:${left.id}`.localeCompare(`${right.scope}:${right.id}`),
  );
}

function aggregateMetric(pairs, name, source) {
  const off = pairs.map((pair) => pair.harnessOff.metrics[name]);
  const on = pairs.map((pair) => pair.harnessOn.metrics[name]);
  if (![...off, ...on].every((metric) => metric.status === "observed")) {
    return { status: "unavailable", reason: "insufficient-observations" };
  }
  return {
    status: "observed",
    harnessOff: off.reduce((sum, metric) => sum + metric.value, 0),
    harnessOn: on.reduce((sum, metric) => sum + metric.value, 0),
    source,
  };
}

function geometricMean(values) {
  if (values.length === 0) return null;
  return Number(Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length).toFixed(12));
}

export function aggregateReport({
  benchmarkId,
  profile,
  inputDigest,
  generatedAt = new Date().toISOString(),
  plannedPairs,
  pairs,
  pluginLifecycle,
  plannedFixtures,
  repetitions,
  loadedManifest,
}) {
  validateResultRecords(pairs, loadedManifest ? { loadedManifest } : undefined);
  if (typeof benchmarkId !== "string" || benchmarkId.length === 0) throw new Error("benchmarkId must be a non-empty string");
  if (!new Set(["smoke-24", "release-72", "custom"]).has(profile)) throw new Error("profile is unsupported");
  if (!/^[a-f0-9]{64}$/u.test(inputDigest)) throw new Error("inputDigest must be a SHA-256 digest");
  if (loadedManifest && inputDigest !== loadedManifest.inputDigest) {
    throw new Error("report inputDigest does not match the loaded benchmark input");
  }
  if (pairs.some((pair) => pair.inputDigest !== inputDigest)) {
    throw new Error("result record inputDigest does not match report inputDigest");
  }
  if (!Number.isInteger(plannedPairs) || plannedPairs < 1) throw new Error("plannedPairs must be a positive integer");
  if (!pluginLifecycle || !new Set(["pass", "fail"]).has(pluginLifecycle.status) ||
      typeof pluginLifecycle.evidence !== "string" || pluginLifecycle.evidence.length === 0) {
    throw new Error("pluginLifecycle must contain a pass/fail status and evidence");
  }
  if (plannedFixtures !== undefined) {
    if (!Array.isArray(plannedFixtures) || plannedFixtures.length === 0) throw new Error("plannedFixtures must not be empty");
    const fixtureIds = new Set();
    for (const fixture of plannedFixtures) {
      if (!fixture || typeof fixture.fixtureId !== "string" || fixture.fixtureId.length === 0 ||
          typeof fixture.category !== "string") throw new Error("plannedFixtures contains an invalid fixture");
      if (fixtureIds.has(fixture.fixtureId)) throw new Error(`plannedFixtures contains duplicate fixtureId ${fixture.fixtureId}`);
      fixtureIds.add(fixture.fixtureId);
    }
    for (const pair of pairs) {
      const fixture = plannedFixtures.find(({ fixtureId }) => fixtureId === pair.fixtureId);
      if (!fixture || fixture.category !== pair.fixtureCategory) {
        throw new Error(`result record ${pair.pairId} does not belong to plannedFixtures`);
      }
    }
  }
  const completedPairs = pairs.filter(
    (pair) => pair.harnessOff.status === "completed" && pair.harnessOn.status === "completed",
  ).length;
  const missingPairs = Math.max(0, plannedPairs - pairs.length);
  const unexpectedPairs = Math.max(0, pairs.length - plannedPairs);
  const invalidPairs = pairs.length - completedPairs + missingPairs + unexpectedPairs;
  const arms = pairs.flatMap((pair) => [pair.harnessOff, pair.harnessOn]);
  const missingTrials = missingPairs * 2;
  const trialStatusCount = (status) => arms.filter((arm) => arm.status === status).length;
  const offCorrect = pairs.filter((pair) => pair.harnessOff.correctness === "pass").length;
  const onCorrect = pairs.filter((pair) => pair.harnessOn.correctness === "pass").length;
  const regressions = pairs.filter(
    (pair) => pair.harnessOff.correctness === "pass" && pair.harnessOn.correctness !== "pass",
  );
  const criticalFailures = pairs.flatMap((pair) => [
    ...pair.harnessOff.securityOutcomes,
    ...pair.harnessOn.securityOutcomes,
  ]).filter((outcome) => outcome.severity === "critical" && outcome.outcome !== "pass");
  const tamperFailures = pairs.flatMap((pair) => [
    ...pair.harnessOff.tamperOutcomes,
    ...pair.harnessOn.tamperOutcomes,
  ]).filter((outcome) => outcome.outcome !== "intact");
  const fixtureContracts = plannedFixtures ?? [...new Map(pairs.map((pair) => [
    pair.fixtureId,
    { fixtureId: pair.fixtureId, category: pair.fixtureCategory },
  ])).values()];
  const expectedRepetitions = repetitions ?? Math.max(
    1,
    Math.floor(plannedPairs / Math.max(1, fixtureContracts.length)),
  );
  const fixturePasses = fixtureContracts.map(({ fixtureId }) => {
    const fixturePairs = pairs.filter((pair) => pair.fixtureId === fixtureId);
    return {
      fixtureId,
      harnessOff: fixturePairs.length === expectedRepetitions &&
        fixturePairs.every((pair) => pair.harnessOff.correctness === "pass"),
      harnessOn: fixturePairs.length === expectedRepetitions &&
        fixturePairs.every((pair) => pair.harnessOn.correctness === "pass"),
    };
  }).sort((left, right) => left.fixtureId.localeCompare(right.fixtureId));
  const minimumCorrectTrials = Math.ceil(plannedPairs * 0.8);
  const minimumFixturePasses = Math.ceil(fixtureContracts.length * 0.8);
  const harnessOnPassingFixtures = fixturePasses.filter((fixture) => fixture.harnessOn).length;

  const gates = {
    pluginLifecycle,
    criticalSecurity: gate(
      criticalFailures.length === 0 ? "pass" : "fail",
      criticalFailures.length === 0 ? "no critical control violations" : `${criticalFailures.length} critical control failures`,
    ),
    harnessOnCorrectnessNonRegression: gate(
      onCorrect >= offCorrect ? "pass" : "fail",
      `harness-off=${offCorrect}; harness-on=${onCorrect}`,
    ),
    noFixtureRegression: gate(
      regressions.length === 0 ? "pass" : "fail",
      regressions.length === 0 ? "no off-pass/on-fail pairs" : regressions.map((pair) => pair.pairId).join(","),
    ),
    correctnessEligibilityFloor: gate(
      onCorrect >= minimumCorrectTrials && harnessOnPassingFixtures >= minimumFixturePasses ? "pass" : "fail",
      `harness-on-correct=${onCorrect}/${plannedPairs} (minimum ${minimumCorrectTrials}); ` +
        `harness-on-passing-fixtures=${harnessOnPassingFixtures}/${fixtureContracts.length} (minimum ${minimumFixturePasses})`,
    ),
    telemetryAndEvaluatorIntegrity: gate(
      tamperFailures.length === 0 && invalidPairs === 0 ? "pass" : "fail",
      tamperFailures.length === 0 && invalidPairs === 0
        ? "all protected digests intact and trials terminal"
        : `tamper-failures=${tamperFailures.length}; invalid-pairs=${invalidPairs}`,
    ),
  };
  const ineligibilityReasons = Object.entries(gates)
    .filter(([, value]) => value.status === "fail")
    .map(([name]) => name);
  const eligible = ineligibilityReasons.length === 0;
  const matched = pairs.filter((pair) => {
    const offDuration = pair.harnessOff.metrics.wallDurationMs;
    const onDuration = pair.harnessOn.metrics.wallDurationMs;
    return pair.harnessOff.status === "completed" &&
      pair.harnessOn.status === "completed" &&
      pair.harnessOff.correctness === "pass" &&
      pair.harnessOn.correctness === "pass" &&
      offDuration.status === "observed" &&
      onDuration.status === "observed" &&
      offDuration.value > 0 &&
      onDuration.value > 0;
  });
  const mean = geometricMean(matched.map(
    (pair) => pair.harnessOff.metrics.wallDurationMs.value / pair.harnessOn.metrics.wallDurationMs.value,
  ));
  let speed;
  if (eligible && matched.length >= 8 && mean >= 1.1) {
    speed = {
      claim: "improvement-proven",
      comparisonBasis: "matched-correct-only",
      matchedCorrectPairIds: matched.map((pair) => pair.pairId).sort(),
      minimumMatchedPairs: 8,
      minimumGeometricMeanSpeedup: 1.1,
      geometricMeanSpeedup: mean,
    };
  } else {
    speed = {
      claim: "not-proven",
      comparisonBasis: "matched-correct-only",
      matchedCorrectPairIds: matched.map((pair) => pair.pairId).sort(),
      minimumMatchedPairs: 8,
      minimumGeometricMeanSpeedup: 1.1,
      geometricMeanSpeedup: mean,
      reason: !eligible
        ? "benchmark-ineligible"
        : (matched.length < 8 ? "insufficient-matched-pairs" : "threshold-not-met"),
    };
  }

  const nonCriticalSecurity = pairs.flatMap((pair) => [
    ...pair.harnessOff.securityOutcomes,
    ...pair.harnessOn.securityOutcomes,
  ]).filter((outcome) => outcome.severity === "non-critical").map((outcome) => outcome.outcome);

  return {
    schemaVersion: "1.0.0",
    benchmarkId,
    generatedAt,
    profile,
    inputDigest,
    execution: {
      plannedPairs,
      completedPairs,
      invalidPairs,
      plannedTrials: plannedPairs * 2,
      completedTrials: trialStatusCount("completed"),
      failedTrials: trialStatusCount("failed"),
      timedOutTrials: trialStatusCount("timed-out"),
      invalidTrials: trialStatusCount("invalid") + missingTrials + unexpectedPairs * 2,
      randomizedArmOrder: true,
    },
    eligibility: { policy: "correctness-first", eligible, gates, ineligibilityReasons },
    correctness: {
      harnessOffCorrectTrials: offCorrect,
      harnessOnCorrectTrials: onCorrect,
      harnessOnRegressions: regressions.length,
      minimumCorrectTrialRate: 0.8,
      minimumFixturePassRate: 0.8,
      minimumHarnessOnCorrectTrials: minimumCorrectTrials,
      minimumHarnessOnPassingFixtures: minimumFixturePasses,
      harnessOnPassingFixtures,
      fixturePasses,
    },
    speed,
    objectiveQuality: aggregateObjectiveQuality(pairs),
    nonCriticalSecurity: aggregateOutcomes(nonCriticalSecurity),
    resources: {
      wallDurationMs: aggregateMetric(pairs, "wallDurationMs", "monotonic-clock"),
      toolCalls: aggregateMetric(pairs, "toolCalls", "documented-stream-json"),
      subagentCalls: aggregateMetric(pairs, "subagentCalls", "documented-stream-json"),
      maxConcurrentSubagents: aggregateMetric(pairs, "maxConcurrentSubagents", "documented-stream-json"),
      inputTokens: { status: "unavailable", reason: "unverified" },
      outputTokens: { status: "unavailable", reason: "unverified" },
      totalTokens: { status: "unavailable", reason: "unverified" },
    },
    limitations: reportLimitations(profile, pairs),
    tier2Findings: pairs.flatMap((pair) => [
      ...pair.harnessOff.findings,
      ...pair.harnessOn.findings,
    ]).filter((finding) => finding.tier === 2).map((finding) => ({
      id: finding.id,
      tier: 2,
      summary: finding.summary,
      disposition: "advisory",
    })).sort((left, right) => `${left.id}:${left.summary}`.localeCompare(`${right.id}:${right.summary}`)),
    rankingOrder: RANKING_ORDER,
  };
}

export function renderReportJson(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function renderReportMarkdown(report) {
  const speed = report.speed.geometricMeanSpeedup === null
    ? "unavailable"
    : report.speed.geometricMeanSpeedup.toFixed(3);
  return [
    `# Benchmark report: ${report.benchmarkId}`,
    "",
    `Generated: ${report.generatedAt}`,
    `Eligibility: ${report.eligibility.eligible ? "eligible" : "ineligible"}`,
    `Speed claim: ${report.speed.claim} (${speed}x; ${report.speed.matchedCorrectPairIds.length} matched-correct pairs)`,
    "",
    "## Objective results",
    "",
    `1. Correct trials: off ${report.correctness.harnessOffCorrectTrials}, on ${report.correctness.harnessOnCorrectTrials}`,
    `2. Matched-correct speedup: ${speed}x`,
    `3. Objective quality pass rate: ${report.objectiveQuality.passRate ?? "unavailable"} ` +
      `(${report.objectiveQuality.eligibleTrials} correct trials scored; ` +
      `${report.objectiveQuality.excludedIncorrectTrials + report.objectiveQuality.excludedInvalidTrials} excluded)`,
    `4. Non-critical security pass rate: ${report.nonCriticalSecurity.passRate ?? "unavailable"}`,
    `5. Resource use: ${report.resources.wallDurationMs.status}`,
    "",
    "## Eligibility gates",
    "",
    ...Object.entries(report.eligibility.gates).map(([name, value]) => `- ${name}: ${value.status} — ${value.evidence}`),
    "",
    "## Limitations",
    "",
    ...report.limitations.map((limitation) => `- ${limitation.scope}/${limitation.id}: ${limitation.status} — ${limitation.reason}`),
    "",
    "## Tier 2 advisory findings",
    "",
    ...(report.tier2Findings.length === 0
      ? ["None."]
      : report.tier2Findings.map((finding) => `- ${finding.id}: ${finding.summary}`)),
    "",
  ].join("\n");
}

export async function writeReportFiles({ report, jsonPath, markdownPath }) {
  await Promise.all([
    writeNewFile(jsonPath, renderReportJson(report)),
    writeNewFile(markdownPath, renderReportMarkdown(report)),
  ]);
}
