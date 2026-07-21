import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { runBenchmark } from "./lib/engine.mjs";
import { readBenchmarkManifest } from "./lib/manifest.mjs";
import { aggregateReport } from "./lib/report.mjs";
import { unavailable } from "./lib/util.mjs";

const manifestPath = resolve("benchmark/smoke-24.v1.json");

// The corpus smoke agent is a no-op mock: it edits nothing and sandboxes nothing. It
// therefore cannot satisfy `criticalSecurity` or `correctnessEligibilityFloor`, and
// `pluginLifecycle` evidence is produced by `npm run plugin:lifecycle:verify` rather
// than by this run. Asserting `eligible === true` here is unreachable without teaching
// the mock the fixture solutions, which would score the mock instead of the pipeline.
// Instead the derived part of the eligibility block is pinned: the status and evidence
// string of all five pipeline-computed gates, plus the ineligibility reason list. Any
// drift in the scoring pipeline over the real 24-trial corpus fails CI, in either
// direction.
//
// COVERAGE BOUNDARY: `pluginLifecycle` is the sixth gate and is deliberately NOT in the
// per-gate loop below. `benchmark/lib/report.mjs` assigns the caller-supplied value
// verbatim, so asserting it against the same constant we passed in would compare an
// object to itself and prove nothing. Its real enforcement is the
// `npm run plugin:lifecycle:verify` CI step, which runs before this one. What this file
// still enforces about it is derived and therefore has teeth: its identifier must appear
// in the gate key set, and its resulting "fail" status must appear in
// `ineligibilityReasons` (computed by report.mjs from gate statuses, not supplied here).
const PLUGIN_LIFECYCLE = {
  status: "fail",
  evidence: "plugin lifecycle evidence is produced by npm run plugin:lifecycle:verify, not by the deterministic corpus smoke",
};

// Every gate identifier report.mjs must emit, including the caller-supplied
// `pluginLifecycle`. Compared order-independently so that reordering the gate object in
// report.mjs — a zero-behaviour-change edit — does not break CI, while a rename or a
// dropped gate still does.
const EXPECTED_GATE_IDENTIFIERS = [
  "pluginLifecycle",
  "criticalSecurity",
  "harnessOnCorrectnessNonRegression",
  "noFixtureRegression",
  "correctnessEligibilityFloor",
  "telemetryAndEvaluatorIntegrity",
];

const EXPECTED_ELIGIBILITY = {
  policy: "correctness-first",
  eligible: false,
  // Five derived gates. `pluginLifecycle` is excluded on purpose — see COVERAGE BOUNDARY.
  gates: {
    criticalSecurity: {
      status: "fail",
      // 24 trials x 2 mandatory network controls (network-denial + network-tool-invocation
      // both `error`: the mock makes no model calls but does not sandbox evaluator
      // networking) = 48, plus 2 fixture-level critical-security evaluator violations = 50.
      // A change in the trailing digits means a control regressed; a jump by a multiple of
      // 2 per added trial means the corpus grew.
      evidence: "50 critical control failures",
    },
    harnessOnCorrectnessNonRegression: {
      status: "pass",
      evidence: "harness-off=2; harness-on=2",
    },
    noFixtureRegression: {
      status: "pass",
      evidence: "no off-pass/on-fail pairs",
    },
    correctnessEligibilityFloor: {
      status: "fail",
      evidence: "harness-on-correct=2/12 (minimum 10); harness-on-passing-fixtures=2/12 (minimum 10)",
    },
    telemetryAndEvaluatorIntegrity: {
      status: "pass",
      evidence: "all protected digests intact and trials terminal",
    },
  },
  ineligibilityReasons: ["pluginLifecycle", "criticalSecurity", "correctnessEligibilityFloor"],
};

function assertEligibility(actual, expected) {
  // Sorted on both sides: we are detecting renamed/added/dropped gates, not key order.
  assert.deepEqual(
    Object.keys(actual.gates).sort(),
    [...EXPECTED_GATE_IDENTIFIERS].sort(),
    "eligibility gate identifiers drifted from benchmark/lib/report.mjs; update the pinned expectation deliberately",
  );
  for (const [name, want] of Object.entries(expected.gates)) {
    const got = actual.gates[name];
    assert.equal(
      got.status,
      want.status,
      `gate ${name}: expected status ${want.status}, observed ${got.status} (evidence: ${got.evidence})`,
    );
    assert.equal(
      got.evidence,
      want.evidence,
      `gate ${name}: status is ${got.status} but its evidence changed\n  expected: ${want.evidence}\n  observed: ${got.evidence}`,
    );
  }
  // NOT sorted, unlike the key set above: report.mjs derives this list by filtering the
  // gate object in insertion order, so the order is itself part of the contract. This is
  // also the only place `pluginLifecycle` is checked, and it is checked against a derived
  // value rather than the constant we passed in.
  assert.deepEqual(
    actual.ineligibilityReasons,
    expected.ineligibilityReasons,
    `ineligibility reasons changed\n  expected: ${expected.ineligibilityReasons.join(",")}\n  observed: ${actual.ineligibilityReasons.join(",")}`,
  );
  assert.equal(actual.policy, expected.policy, "eligibility policy changed");
  assert.equal(
    actual.eligible,
    expected.eligible,
    `overall eligibility changed to ${actual.eligible}`,
  );
}

const outputRoot = await mkdtemp(join(tmpdir(), "cursor-harness-corpus-smoke-"));
const metric = (value, source) => ({ status: "observed", value, source });
const adapter = {
  adapterKind: "deterministic-corpus-mock",
  async run(context) {
    await context.captureWorkspaceBaseline();
    return {
      adapterKind: "deterministic-corpus-mock",
      status: "completed",
      exitCode: 0,
      metrics: {
        wallDurationMs: metric(1, "monotonic-clock"),
        toolCalls: metric(0, "documented-stream-json"),
        subagentCalls: unavailable("correlation-unavailable"),
        maxConcurrentSubagents: unavailable("correlation-unavailable"),
        inputTokens: unavailable("not-emitted"),
        outputTokens: unavailable("not-emitted"),
        totalTokens: unavailable("not-emitted"),
      },
      findings: [],
      capabilityLimitations: [{
        capability: "network-denial",
        reason: "The deterministic mock makes no model calls but does not sandbox evaluator networking.",
      }],
    };
  },
};

try {
  const loadedManifest = await readBenchmarkManifest(manifestPath);
  const result = await runBenchmark({
    loadedManifest,
    agentAdapter: adapter,
    runId: "deterministic-corpus-smoke",
    outputRoot,
  });
  assert.equal(loadedManifest.fixtures.length, 12);
  assert.equal(result.results.length, 12);
  assert.equal(result.results.length * 2, 24);
  for (const pair of result.results) {
    for (const arm of [pair.harnessOff, pair.harnessOn]) {
      assert.ok(arm.evaluators.length > 0);
      assert.ok(arm.securityOutcomes.some(
        (outcome) => outcome.controlId === "network-denial" && outcome.outcome === "error",
      ));
      assert.ok(arm.securityOutcomes.some(
        (outcome) => outcome.controlId === "workspace-write-contract" && outcome.outcome === "pass",
      ));
    }
  }

  const report = aggregateReport({
    benchmarkId: loadedManifest.manifest.benchmarkId,
    profile: loadedManifest.manifest.profile,
    inputDigest: loadedManifest.inputDigest,
    plannedPairs: loadedManifest.fixtures.length * loadedManifest.manifest.repetitions,
    pairs: result.results,
    plannedFixtures: loadedManifest.fixtures.map(({ manifest: fixture }) => ({
      fixtureId: fixture.fixtureId,
      category: fixture.category,
    })),
    repetitions: loadedManifest.manifest.repetitions,
    loadedManifest,
    pluginLifecycle: PLUGIN_LIFECYCLE,
  });
  assertEligibility(report.eligibility, EXPECTED_ELIGIBILITY);
  assert.equal(report.speed.claim, "not-proven");
  assert.equal(report.speed.reason, "benchmark-ineligible");

  process.stdout.write(`${JSON.stringify({
    profile: loadedManifest.manifest.profile,
    fixtures: loadedManifest.fixtures.length,
    pairs: result.results.length,
    trials: result.results.length * 2,
    externalModelCalls: 0,
    eligible: report.eligibility.eligible,
    gates: Object.fromEntries(
      Object.entries(report.eligibility.gates).map(([name, value]) => [name, value.status]),
    ),
  })}\n`);
} finally {
  await rm(outputRoot, { recursive: true, force: true });
}
