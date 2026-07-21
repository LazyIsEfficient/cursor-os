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
// Instead the whole eligibility block is pinned: every gate status, its evidence
// string, and the ineligibility reason list. Any drift in the scoring pipeline over the
// real 24-trial corpus fails CI, in either direction.
const PLUGIN_LIFECYCLE = {
  status: "fail",
  evidence: "plugin lifecycle evidence is produced by npm run plugin:lifecycle:verify, not by the deterministic corpus smoke",
};

const EXPECTED_ELIGIBILITY = {
  policy: "correctness-first",
  eligible: false,
  gates: {
    pluginLifecycle: PLUGIN_LIFECYCLE,
    criticalSecurity: {
      status: "fail",
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
  assert.deepEqual(
    Object.keys(actual.gates),
    Object.keys(expected.gates),
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
