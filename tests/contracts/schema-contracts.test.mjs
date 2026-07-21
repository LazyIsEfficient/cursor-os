import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { isDeepStrictEqual } from "node:util";

import { aggregateReport } from "../../benchmark/lib/report.mjs";
import { buildPairResult } from "../../benchmark/lib/result.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const root = join(testDirectory, "../..");
const schemaDirectory = join(root, "schemas");

async function loadSchema(name) {
  return JSON.parse(await readFile(join(schemaDirectory, name), "utf8"));
}

function resolvePointer(rootSchema, reference) {
  assert.match(reference, /^#(?:\/|$)/, `external $ref is not dependency-free: ${reference}`);
  return reference
    .slice(2)
    .split("/")
    .filter(Boolean)
    .reduce(
      (value, token) => value[token.replaceAll("~1", "/").replaceAll("~0", "~")],
      rootSchema,
    );
}

function validate(instance, schema, rootSchema = schema, path = "$") {
  const errors = [];
  const fail = (message) => errors.push(`${path}: ${message}`);

  if (schema === true) return errors;
  if (schema === false) return [`${path}: schema is false`];

  if (schema.$ref) {
    errors.push(...validate(instance, resolvePointer(rootSchema, schema.$ref), rootSchema, path));
  }

  if (schema.const !== undefined && !isDeepStrictEqual(instance, schema.const)) {
    fail(`must equal ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum && !schema.enum.some((value) => isDeepStrictEqual(instance, value))) {
    fail(`must be one of ${JSON.stringify(schema.enum)}`);
  }

  if (schema.type) {
    const validType =
      (schema.type === "object" && instance !== null && typeof instance === "object" && !Array.isArray(instance)) ||
      (schema.type === "array" && Array.isArray(instance)) ||
      (schema.type === "string" && typeof instance === "string") ||
      (schema.type === "number" && typeof instance === "number" && Number.isFinite(instance)) ||
      (schema.type === "integer" && Number.isInteger(instance)) ||
      (schema.type === "boolean" && typeof instance === "boolean") ||
      (schema.type === "null" && instance === null);
    if (!validType) fail(`must be ${schema.type}`);
  }

  if (typeof instance === "string") {
    if (schema.minLength !== undefined && instance.length < schema.minLength) fail("is too short");
    if (schema.pattern && !new RegExp(schema.pattern, "u").test(instance)) fail(`does not match ${schema.pattern}`);
    if (schema.format === "date-time" && Number.isNaN(Date.parse(instance))) fail("is not a date-time");
  }

  if (typeof instance === "number") {
    if (schema.minimum !== undefined && instance < schema.minimum) fail(`must be >= ${schema.minimum}`);
    if (schema.maximum !== undefined && instance > schema.maximum) fail(`must be <= ${schema.maximum}`);
    if (schema.exclusiveMinimum !== undefined && instance <= schema.exclusiveMinimum) {
      fail(`must be > ${schema.exclusiveMinimum}`);
    }
  }

  if (Array.isArray(instance)) {
    if (schema.minItems !== undefined && instance.length < schema.minItems) fail("has too few items");
    if (schema.maxItems !== undefined && instance.length > schema.maxItems) fail("has too many items");
    if (schema.uniqueItems) {
      const encoded = instance.map((value) => JSON.stringify(value));
      if (new Set(encoded).size !== encoded.length) fail("items must be unique");
    }
    const prefixLength = schema.prefixItems?.length ?? 0;
    schema.prefixItems?.forEach((itemSchema, index) => {
      if (index < instance.length) errors.push(...validate(instance[index], itemSchema, rootSchema, `${path}[${index}]`));
    });
    if (schema.items !== undefined) {
      for (let index = prefixLength; index < instance.length; index += 1) {
        errors.push(...validate(instance[index], schema.items, rootSchema, `${path}[${index}]`));
      }
    }
  }

  if (instance !== null && typeof instance === "object" && !Array.isArray(instance)) {
    for (const required of schema.required ?? []) {
      if (!Object.hasOwn(instance, required)) fail(`missing required property ${required}`);
    }
    for (const [key, value] of Object.entries(instance)) {
      if (schema.properties?.[key]) {
        errors.push(...validate(value, schema.properties[key], rootSchema, `${path}.${key}`));
      } else if (schema.additionalProperties === false) {
        fail(`additional property ${key}`);
      }
    }
  }

  for (const subSchema of schema.allOf ?? []) {
    errors.push(...validate(instance, subSchema, rootSchema, path));
  }
  if (schema.oneOf) {
    const matches = schema.oneOf.filter(
      (subSchema) => validate(instance, subSchema, rootSchema, path).length === 0,
    ).length;
    if (matches !== 1) fail(`must match exactly one oneOf branch; matched ${matches}`);
  }
  if (schema.if) {
    const branch = validate(instance, schema.if, rootSchema, path).length === 0 ? schema.then : schema.else;
    if (branch) errors.push(...validate(instance, branch, rootSchema, path));
  }

  return errors;
}

function expectValid(instance, schema) {
  assert.deepEqual(validate(instance, schema), []);
}

function expectInvalid(instance, schema) {
  assert.notDeepEqual(validate(instance, schema), []);
}

const hash = "a".repeat(64);
const unavailable = { status: "unavailable", reason: "not-emitted" };
const observed = (value, source = "documented-stream-json") => ({ status: "observed", value, source });

test("all schemas are standalone draft 2020-12 documents with resolvable local refs", async () => {
  const names = (await readdir(schemaDirectory)).filter((name) => name.endsWith(".schema.json")).sort();
  assert.deepEqual(names, [
    "benchmark-fixture-manifest.schema.json",
    "benchmark-manifest.schema.json",
    "benchmark-report.schema.json",
    "benchmark-result.schema.json",
    "normalized-telemetry-event.schema.json",
    "plugin-inventory.schema.json",
    "sanitized-artifact-export.schema.json",
  ]);

  const ids = new Set();
  for (const name of names) {
    const schema = await loadSchema(name);
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.ok(!ids.has(schema.$id), `duplicate $id ${schema.$id}`);
    ids.add(schema.$id);

    const visit = (value) => {
      if (Array.isArray(value)) return value.forEach(visit);
      if (value && typeof value === "object") {
        if (value.$ref) assert.ok(resolvePointer(schema, value.$ref), `unresolved ${value.$ref}`);
        Object.values(value).forEach(visit);
      }
    };
    visit(schema);
  }
});

test("plugin inventory records component hashes and explicit capability status", async () => {
  const schema = await loadSchema("plugin-inventory.schema.json");
  const inventory = {
    schemaVersion: "1.0.0",
    plugin: {
      id: "cursor-harness",
      name: "Cursor Harness",
      version: "1.0.0",
      manifestPath: "plugin/.cursor-plugin/plugin.json",
      manifestSha256: hash,
    },
    components: [{ id: "grounding", kind: "rule", path: "plugin/rules/grounding.mdc", sha256: hash }],
    platformCapabilities: [
      {
        capability: "token-usage",
        environment: "cli-local",
        status: "unavailable",
        evidence: "stream-json probe emitted no token fields",
      },
    ],
  };
  expectValid(inventory, schema);
  expectInvalid({ ...inventory, components: [{ ...inventory.components[0], path: "../escape" }] }, schema);
});

test("sanitized artifact export manifests bind allowlisted file bytes", async () => {
  const schema = await loadSchema("sanitized-artifact-export.schema.json");
  const manifest = {
    schemaVersion: "1.0.0",
    sourceRunId: "run-1",
    files: [{
      path: "results.ndjson",
      bytes: 42,
      sha256: hash,
    }, {
      path: "plugin-lifecycle.json",
      bytes: 128,
      sha256: hash,
    }],
  };
  expectValid(manifest, schema);
  expectInvalid({
    ...manifest,
    files: [{ ...manifest.files[0], path: "trials/trial/workspace/secret.txt" }],
  }, schema);
});

test("fixture manifests keep deterministic evaluators hidden and integrity protected", async () => {
  const schema = await loadSchema("benchmark-fixture-manifest.schema.json");
  const fixture = {
    schemaVersion: "1.0.0",
    fixtureId: "localized-null-check",
    category: "localized-correctness",
    workspace: {
      sourcePath: "workspace",
      revision: "fixture-v1",
      lockfilePath: "package-lock.json",
      lockfileSha256: hash,
    },
    prompt: "Fix the failing null-handling behavior.",
    expectedWritePaths: ["src/**", "tests/**"],
    evaluators: [
      {
        id: "functional",
        kind: "functional",
        visibility: "hidden-from-agent",
        command: { executable: "node", arguments: ["--test"], workingDirectory: "workspace" },
        timeoutMs: 30000,
        expectedExitCode: 0,
        severity: "correctness",
      },
    ],
    integrity: {
      evaluatorBundleSha256: hash,
      protectedPaths: ["evaluators/**"],
      canaryIds: ["secret-canary"],
      networkPolicy: "deny",
    },
  };
  expectValid(fixture, schema);
  expectInvalid(
    { ...fixture, evaluators: [{ ...fixture.evaluators[0], visibility: "visible-to-agent" }] },
    schema,
  );
});

test("versioned benchmark manifests schema-lock 24 and 72 trial profiles", async () => {
  const schema = await loadSchema("benchmark-manifest.schema.json");
  const smoke = JSON.parse(await readFile(join(root, "benchmark", "smoke-24.v1.json"), "utf8"));
  const release = JSON.parse(await readFile(join(root, "benchmark", "release-72.v1.json"), "utf8"));
  expectValid(smoke, schema);
  expectValid(release, schema);
  expectInvalid({ ...smoke, repetitions: 3 }, schema);
  expectInvalid({ ...release, fixtures: release.fixtures.slice(1) }, schema);
});

test("telemetry requires explicit token unavailability or probe-backed observation", async () => {
  const schema = await loadSchema("normalized-telemetry-event.schema.json");
  const event = {
    schemaVersion: "1.0.0",
    eventId: "event-1",
    runId: "run-1",
    trialId: "trial-1",
    fixtureId: "localized-null-check",
    arm: "harness-on",
    sequence: 7,
    occurredAt: "2026-07-20T15:00:00.000Z",
    event: {
      type: "metric",
      name: "total-tokens",
      unit: "tokens",
      measurement: unavailable,
    },
  };
  expectValid(event, schema);
  expectInvalid(
    {
      ...event,
      event: {
        ...event.event,
        measurement: observed(1200, "documented-stream-json"),
      },
    },
    schema,
  );
  expectValid(
    {
      ...event,
      event: {
        ...event.event,
        measurement: {
          status: "observed",
          value: 1200,
          source: "verified-platform-probe",
          probeEvidence: "capability-probe/token-usage.json",
        },
      },
    },
    schema,
  );
  expectValid(
    {
      ...event,
      event: {
        type: "metric",
        name: "max-concurrent-subagents",
        unit: "count",
        measurement: { status: "unavailable", reason: "correlation-unavailable" },
      },
    },
    schema,
  );
  expectValid({
    ...event,
    event: {
      type: "tamper-outcome",
      target: "workspace/unexpected.txt",
      outcome: "unexpected",
      expectedSha256: null,
      actualSha256: "a".repeat(64),
    },
  }, schema);
});

function arm(trialId) {
  const networkEnforcement = {
    status: "enforced",
    policySha256Before: hash,
    policySha256After: hash,
    source: "workspace:.cursor/sandbox.json",
    sandboxMode: "enabled",
    cliSandboxArgument: "--sandbox=enabled",
  };
  const networkEnforcementSha256 = createHash("sha256")
    .update(JSON.stringify(networkEnforcement))
    .digest("hex");
  return {
    trialId,
    status: "completed",
    correctness: "pass",
    evaluators: [
      {
        evaluatorId: "functional",
        kind: "functional",
        severity: "correctness",
        outcome: "pass",
        expectedExitCode: 0,
        actualExitCode: 0,
        contractSha256: hash,
        evidenceSha256: hash,
      },
    ],
    securityOutcomes: [{
      controlId: "network-denial",
      severity: "critical",
      outcome: "pass",
      evidence: `network-enforcement-sha256=${networkEnforcementSha256}`,
    }, {
      controlId: "network-tool-invocation",
      severity: "critical",
      outcome: "pass",
      evidence: `network-attempts=0;sha256=${hash}`,
    }, {
      controlId: "workspace-write-contract",
      severity: "critical",
      outcome: "pass",
      evidence: "workspace snapshot matched",
    }],
    tamperOutcomes: [
      { target: "evaluators", outcome: "intact", expectedSha256: hash, actualSha256: hash },
    ],
    metrics: {
      wallDurationMs: observed(1000, "monotonic-clock"),
      toolCalls: observed(4),
      subagentCalls: observed(1),
      maxConcurrentSubagents: { status: "unavailable", reason: "correlation-unavailable" },
      inputTokens: unavailable,
      outputTokens: unavailable,
      totalTokens: unavailable,
    },
    findings: [],
    networkEnforcement,
    networkAttemptEvidence: {
      status: "observed",
      count: 0,
      sha256: hash,
    },
    adapter: { kind: "mock", limitations: [] },
  };
}

test("paired results compare speed only when both arms are correct", async () => {
  const schema = await loadSchema("benchmark-result.schema.json");
  const result = {
    schemaVersion: "1.0.0",
    inputDigest: hash,
    runId: "run-1",
    pairId: "pair-1",
    fixtureId: "localized-null-check",
    fixtureCategory: "localized-correctness",
    armOrder: "on-then-off",
    harnessOff: arm("trial-off"),
    harnessOn: arm("trial-on"),
    matchedCorrect: true,
    speedComparison: {
      status: "matched-correct",
      harnessOffDurationMs: 1000,
      harnessOnDurationMs: 800,
      speedupRatio: 1.25,
    },
  };
  expectValid(result, schema);

  const incorrect = structuredClone(result);
  incorrect.harnessOn.correctness = "fail";
  expectInvalid(incorrect, schema);

  const tier2Gate = structuredClone(result);
  tier2Gate.harnessOn.findings.push({
    id: "style",
    tier: 2,
    summary: "Naming could be clearer.",
    disposition: "gate-failed",
  });
  expectInvalid(tier2Gate, schema);

  const unprovedSandbox = structuredClone(result);
  delete unprovedSandbox.harnessOn.networkEnforcement.policySha256After;
  expectInvalid(unprovedSandbox, schema);

  const mutatedSandbox = structuredClone(result);
  mutatedSandbox.harnessOn.networkEnforcement = {
    status: "error",
    policySha256Before: hash,
    policySha256After: null,
    source: "workspace:.cursor/sandbox.json",
    sandboxMode: "enabled",
    cliSandboxArgument: "--sandbox=enabled",
    reason: "sandbox policy changed during execution",
  };
  expectValid(mutatedSandbox, schema);

  const zeroOffDuration = structuredClone(result);
  zeroOffDuration.speedComparison.harnessOffDurationMs = 0;
  expectInvalid(zeroOffDuration, schema);
});

function eligibleReport() {
  const gate = { status: "pass", evidence: "evidence/result.json" };
  return {
    schemaVersion: "1.0.0",
    benchmarkId: "release-2026-07-20",
    generatedAt: "2026-07-20T15:00:00.000Z",
    profile: "release-72",
    inputDigest: hash,
    execution: {
      plannedPairs: 36,
      completedPairs: 36,
      invalidPairs: 0,
      plannedTrials: 72,
      completedTrials: 72,
      failedTrials: 0,
      timedOutTrials: 0,
      invalidTrials: 0,
      randomizedArmOrder: true,
    },
    eligibility: {
      policy: "correctness-first",
      eligible: true,
      gates: {
        pluginLifecycle: gate,
        criticalSecurity: gate,
        harnessOnCorrectnessNonRegression: gate,
        noFixtureRegression: gate,
        correctnessEligibilityFloor: gate,
        telemetryAndEvaluatorIntegrity: gate,
      },
      ineligibilityReasons: [],
    },
    correctness: {
      harnessOffCorrectTrials: 34,
      harnessOnCorrectTrials: 35,
      harnessOnRegressions: 0,
      minimumCorrectTrialRate: 0.8,
      minimumFixturePassRate: 0.8,
      minimumHarnessOnCorrectTrials: 29,
      minimumHarnessOnPassingFixtures: 1,
      harnessOnPassingFixtures: 1,
      fixturePasses: [{ fixtureId: "localized-null-check", harnessOff: true, harnessOn: true }],
    },
    speed: {
      claim: "improvement-proven",
      comparisonBasis: "matched-correct-only",
      matchedCorrectPairIds: Array.from({ length: 8 }, (_, index) => `pair-${index + 1}`),
      minimumMatchedPairs: 8,
      minimumGeometricMeanSpeedup: 1.1,
      geometricMeanSpeedup: 1.12,
    },
    objectiveQuality: {
      passed: 4,
      failed: 0,
      errors: 0,
      passRate: 1,
      eligibleTrials: 4,
      excludedIncorrectTrials: 0,
      excludedInvalidTrials: 0,
      totalTrials: 4,
    },
    nonCriticalSecurity: { passed: 4, failed: 0, errors: 0, passRate: 1 },
    resources: {
      wallDurationMs: { status: "observed", harnessOff: 20000, harnessOn: 18000, source: "monotonic-clock" },
      toolCalls: { status: "observed", harnessOff: 40, harnessOn: 38, source: "documented-stream-json" },
      subagentCalls: { status: "observed", harnessOff: 2, harnessOn: 8, source: "documented-stream-json" },
      maxConcurrentSubagents: { status: "unavailable", reason: "unverified" },
      inputTokens: unavailable,
      outputTokens: unavailable,
      totalTokens: unavailable,
    },
    limitations: [{
      scope: "profile",
      id: "release-72",
      status: "unavailable",
      reason: "Pinned corpus only.",
    }],
    tier2Findings: [
      { id: "naming", tier: 2, summary: "One report label may be clearer.", disposition: "advisory" },
    ],
    rankingOrder: [
      "correct-trials",
      "matched-correct-speedup",
      "objective-quality",
      "non-critical-security",
      "resource-use",
    ],
  };
}

test("reports enforce correctness/security eligibility and speed claim thresholds", async () => {
  const schema = await loadSchema("benchmark-report.schema.json");
  const report = eligibleReport();
  expectValid(report, schema);

  const failedCriticalGate = structuredClone(report);
  failedCriticalGate.eligibility.gates.criticalSecurity = {
    status: "fail",
    evidence: "evidence/critical-violation.json",
  };
  expectInvalid(failedCriticalGate, schema);

  const failedCorrectnessFloor = structuredClone(report);
  failedCorrectnessFloor.eligibility.gates.correctnessEligibilityFloor = {
    status: "fail",
    evidence: "only 9 of 12 fixtures passed",
  };
  expectInvalid(failedCorrectnessFloor, schema);

  const weakenedFloor = structuredClone(report);
  weakenedFloor.correctness.minimumFixturePassRate = 0.5;
  expectInvalid(weakenedFloor, schema);

  const insufficientPairs = structuredClone(report);
  insufficientPairs.speed.matchedCorrectPairIds = ["pair-1"];
  expectInvalid(insufficientPairs, schema);

  const inferredTokens = structuredClone(report);
  inferredTokens.resources.totalTokens = {
    status: "observed",
    harnessOff: 1000,
    harnessOn: 900,
    source: "documented-stream-json",
  };
  expectInvalid(inferredTokens, schema);
});

test("benchmark engine builders emit result and report schema contracts", async () => {
  const resultSchema = await loadSchema("benchmark-result.schema.json");
  const reportSchema = await loadSchema("benchmark-report.schema.json");
  const pairs = Array.from({ length: 8 }, (_, index) => buildPairResult({
    inputDigest: hash,
    runId: "generated-run",
    pairId: `generated-pair-${index}`,
    fixtureId: "localized-null-check",
    fixtureCategory: "localized-correctness",
    armOrder: index % 2 === 0 ? "off-then-on" : "on-then-off",
    harnessOff: arm(`generated-off-${index}`),
    harnessOn: arm(`generated-on-${index}`),
  }));
  pairs.forEach((pair) => expectValid(pair, resultSchema));
  const report = aggregateReport({
    benchmarkId: "generated-report",
    profile: "custom",
    inputDigest: hash,
    generatedAt: "2026-07-20T15:00:00.000Z",
    plannedPairs: pairs.length,
    pairs,
    pluginLifecycle: { status: "pass", evidence: "deterministic lifecycle evidence" },
  });
  expectValid(report, reportSchema);
});

test("evidence policy names all non-compensable and advisory rules", async () => {
  const policy = await readFile(join(root, "docs/evidence-policy.md"), "utf8");
  for (const phrase of [
    "Tier 0",
    "Tier 1",
    "Tier 2",
    "correctness-first",
    "Critical-security results are non-compensable",
    "matched-correct",
    "geometric-mean speedup",
    "advisory only",
    "must not be inferred",
  ]) {
    assert.match(policy, new RegExp(phrase, "i"));
  }
});
