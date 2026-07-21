import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { runBenchmark } from "./lib/engine.mjs";
import { readBenchmarkManifest } from "./lib/manifest.mjs";
import { unavailable } from "./lib/util.mjs";

const manifestPath = resolve("benchmark/smoke-24.v1.json");
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
  process.stdout.write(`${JSON.stringify({
    profile: loadedManifest.manifest.profile,
    fixtures: loadedManifest.fixtures.length,
    pairs: result.results.length,
    trials: result.results.length * 2,
    externalModelCalls: 0,
  })}\n`);
} finally {
  await rm(outputRoot, { recursive: true, force: true });
}
