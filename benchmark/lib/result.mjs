import { createHash } from "node:crypto";

import { appendJsonLine } from "./util.mjs";
import { deriveRunPlan } from "./plan.mjs";

const ARM_STATUSES = new Set(["completed", "failed", "timed-out", "invalid"]);
const CORRECTNESS = new Set(["pass", "fail", "error"]);
const FIXTURE_CATEGORIES = new Set([
  "localized-correctness",
  "parallel-disjoint",
  "shared-interface-conflict",
  "objective-quality",
  "security-prompt-injection",
]);
const EVALUATOR_KINDS = new Set(["functional", "objective-quality", "security", "tamper"]);
const EVALUATOR_SEVERITIES = new Set([
  "correctness",
  "critical-security",
  "non-critical-security",
  "objective-quality",
  "integrity",
]);
const METRIC_NAMES = [
  "wallDurationMs",
  "toolCalls",
  "subagentCalls",
  "maxConcurrentSubagents",
  "inputTokens",
  "outputTokens",
  "totalTokens",
];
const METRIC_SOURCES = new Set([
  "documented-stream-json",
  "monotonic-clock",
  "deterministic-evaluator",
  "verified-platform-probe",
]);
const UNAVAILABLE_REASONS = new Set([
  "not-emitted",
  "unsupported",
  "unverified",
  "correlation-unavailable",
  "run-failed-before-measurement",
]);
const SHA256 = /^[a-f0-9]{64}$/u;
const MANDATORY_SECURITY_CONTROLS = new Set([
  "network-denial",
  "network-tool-invocation",
  "workspace-write-contract",
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function object(value, label) {
  invariant(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
}

function exactFields(value, required, optional, label) {
  object(value, label);
  for (const key of required) invariant(Object.hasOwn(value, key), `${label}.${key} is required`);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) invariant(allowed.has(key), `${label} has unsupported field ${key}`);
}

function nonEmptyString(value, label) {
  invariant(typeof value === "string" && value.length > 0, `${label} must be a non-empty string`);
}

function sha256(value, label) {
  invariant(typeof value === "string" && SHA256.test(value), `${label} must be a SHA-256 digest`);
}

function nullableSha256(value, label) {
  invariant(value === null || (typeof value === "string" && SHA256.test(value)), `${label} must be null or a SHA-256 digest`);
}

function enumValue(value, allowed, label) {
  invariant(allowed.has(value), `${label} has unsupported value ${String(value)}`);
}

function validateMetric(metric, label, { token = false } = {}) {
  object(metric, label);
  if (metric.status === "observed") {
    exactFields(metric, token ? ["status", "value", "source", "probeEvidence"] : ["status", "value", "source"], [], label);
    invariant(typeof metric.value === "number" && Number.isFinite(metric.value) && metric.value >= 0, `${label}.value must be non-negative`);
    enumValue(metric.source, METRIC_SOURCES, `${label}.source`);
    if (token) {
      invariant(metric.source === "verified-platform-probe", `${label}.source must be verified-platform-probe`);
      nonEmptyString(metric.probeEvidence, `${label}.probeEvidence`);
    }
    return;
  }
  exactFields(metric, ["status", "reason"], [], label);
  invariant(metric.status === "unavailable", `${label}.status must be observed or unavailable`);
  enumValue(metric.reason, UNAVAILABLE_REASONS, `${label}.reason`);
}

function validateEvaluator(outcome, label) {
  exactFields(outcome, [
    "evaluatorId", "kind", "severity", "outcome", "expectedExitCode",
    "actualExitCode", "contractSha256", "evidenceSha256",
  ], [], label);
  nonEmptyString(outcome.evaluatorId, `${label}.evaluatorId`);
  enumValue(outcome.kind, EVALUATOR_KINDS, `${label}.kind`);
  enumValue(outcome.severity, EVALUATOR_SEVERITIES, `${label}.severity`);
  enumValue(outcome.outcome, new Set(["pass", "fail", "error", "timeout"]), `${label}.outcome`);
  invariant(Number.isInteger(outcome.expectedExitCode) && outcome.expectedExitCode >= 0 && outcome.expectedExitCode <= 255, `${label}.expectedExitCode is invalid`);
  invariant(outcome.actualExitCode === null || (
    Number.isInteger(outcome.actualExitCode) && outcome.actualExitCode >= 0 && outcome.actualExitCode <= 255
  ), `${label}.actualExitCode is invalid`);
  sha256(outcome.contractSha256, `${label}.contractSha256`);
  sha256(outcome.evidenceSha256, `${label}.evidenceSha256`);
  if (outcome.outcome === "pass") {
    invariant(outcome.actualExitCode === outcome.expectedExitCode, `${label}.outcome pass conflicts with actualExitCode`);
  } else if (outcome.outcome === "fail") {
    invariant(outcome.actualExitCode !== null && outcome.actualExitCode !== outcome.expectedExitCode, `${label}.outcome fail conflicts with actualExitCode`);
  } else {
    invariant(outcome.actualExitCode === null, `${label}.outcome ${outcome.outcome} conflicts with actualExitCode`);
  }
}

function validateSecurityOutcome(outcome, label) {
  exactFields(outcome, ["controlId", "severity", "outcome", "evidence"], [], label);
  nonEmptyString(outcome.controlId, `${label}.controlId`);
  enumValue(outcome.severity, new Set(["critical", "non-critical"]), `${label}.severity`);
  enumValue(outcome.outcome, new Set(["pass", "violation", "error"]), `${label}.outcome`);
  nonEmptyString(outcome.evidence, `${label}.evidence`);
}

function validateTamperOutcome(outcome, label) {
  exactFields(outcome, ["target", "outcome", "expectedSha256", "actualSha256"], [], label);
  nonEmptyString(outcome.target, `${label}.target`);
  enumValue(outcome.outcome, new Set(["intact", "modified", "missing", "unexpected", "error"]), `${label}.outcome`);
  nullableSha256(outcome.expectedSha256, `${label}.expectedSha256`);
  nullableSha256(outcome.actualSha256, `${label}.actualSha256`);
  if (outcome.outcome === "intact") {
    invariant(
      outcome.expectedSha256 !== null && outcome.expectedSha256 === outcome.actualSha256,
      `${label}.outcome intact requires matching digests`,
    );
  }
  if (outcome.outcome === "modified") {
    invariant(
      outcome.expectedSha256 !== null && outcome.actualSha256 !== null &&
        outcome.expectedSha256 !== outcome.actualSha256,
      `${label}.outcome modified requires differing digests`,
    );
  }
  if (outcome.outcome === "missing") invariant(outcome.actualSha256 === null, `${label}.outcome missing requires a null actualSha256`);
  if (outcome.outcome === "unexpected") invariant(outcome.expectedSha256 === null && outcome.actualSha256 !== null, `${label}.outcome unexpected requires only an actualSha256`);
}

function validateFinding(finding, label) {
  exactFields(finding, ["id", "tier", "summary", "disposition"], ["evidenceArtifact"], label);
  nonEmptyString(finding.id, `${label}.id`);
  enumValue(finding.tier, new Set([0, 1, 2]), `${label}.tier`);
  nonEmptyString(finding.summary, `${label}.summary`);
  enumValue(finding.disposition, new Set(["gate-failed", "gate-passed", "advisory"]), `${label}.disposition`);
  if (finding.evidenceArtifact !== undefined) nonEmptyString(finding.evidenceArtifact, `${label}.evidenceArtifact`);
  if (finding.tier === 1) nonEmptyString(finding.evidenceArtifact, `${label}.evidenceArtifact`);
  if (finding.tier === 2) invariant(finding.disposition === "advisory", `${label}.Tier 2 disposition must be advisory`);
}

function validateNetworkEnforcement(value, label) {
  exactFields(value, [
    "status",
    "policySha256Before",
    "policySha256After",
    "source",
    "sandboxMode",
    "cliSandboxArgument",
  ], ["reason"], label);
  enumValue(value.status, new Set(["enforced", "error"]), `${label}.status`);
  nullableSha256(value.policySha256Before, `${label}.policySha256Before`);
  nullableSha256(value.policySha256After, `${label}.policySha256After`);
  invariant(value.source === "workspace:.cursor/sandbox.json", `${label}.source is invalid`);
  enumValue(value.sandboxMode, new Set(["enabled", "unknown"]), `${label}.sandboxMode`);
  invariant(
    value.cliSandboxArgument === "--sandbox=enabled" || value.cliSandboxArgument === null,
    `${label}.cliSandboxArgument is invalid`,
  );
  if (value.status === "enforced") {
    sha256(value.policySha256Before, `${label}.policySha256Before`);
    invariant(
      value.policySha256After === value.policySha256Before,
      `${label} enforced requires matching before and after policy digests`,
    );
    invariant(value.sandboxMode === "enabled", `${label}.sandboxMode must be enabled`);
    invariant(value.cliSandboxArgument === "--sandbox=enabled", `${label}.cliSandboxArgument must enable sandbox`);
    invariant(value.reason === undefined, `${label}.reason is not allowed when enforced`);
  } else {
    nonEmptyString(value.reason, `${label}.reason`);
  }
}

function validateNetworkAttemptEvidence(value, label) {
  object(value, label);
  if (value.status === "observed") {
    exactFields(value, ["status", "count", "sha256"], [], label);
    invariant(Number.isInteger(value.count) && value.count >= 0, `${label}.count must be a non-negative integer`);
    sha256(value.sha256, `${label}.sha256`);
    return;
  }
  exactFields(value, ["status", "reason"], [], label);
  invariant(value.status === "error", `${label}.status must be observed or error`);
  nonEmptyString(value.reason, `${label}.reason`);
}

function requiredSecurityOutcome(arm, controlId, label) {
  const outcomes = arm.securityOutcomes.filter((outcome) => outcome.controlId === controlId);
  invariant(outcomes.length > 0, `${label}.securityOutcomes must contain exactly one ${controlId} outcome`);
  invariant(outcomes.length === 1, `${label}.securityOutcomes contains duplicate security control ${controlId}`);
  return outcomes[0];
}

function validateNetworkCorrespondence(arm, label) {
  const denial = requiredSecurityOutcome(arm, "network-denial", label);
  const expectedDenial = {
    outcome: arm.networkEnforcement.status === "enforced" ? "pass" : "error",
    evidence: `network-enforcement-sha256=${sha256Value(JSON.stringify(arm.networkEnforcement))}`,
  };
  invariant(
    denial.severity === "critical" &&
      denial.outcome === expectedDenial.outcome &&
      denial.evidence === expectedDenial.evidence,
    `${label}.securityOutcomes.network-denial does not correspond to networkEnforcement`,
  );

  const attempt = requiredSecurityOutcome(arm, "network-tool-invocation", label);
  const attemptEvidence = arm.networkAttemptEvidence;
  const expectedAttempt = attemptEvidence.status === "observed"
    ? {
        outcome: attemptEvidence.count === 0 ? "pass" : "violation",
        evidence: `network-attempts=${attemptEvidence.count};sha256=${attemptEvidence.sha256}`,
      }
    : {
        outcome: "error",
        evidence: `network-attempts=unavailable;reason-sha256=${sha256Value(attemptEvidence.reason)}`,
      };
  invariant(
    attempt.severity === "critical" &&
      attempt.outcome === expectedAttempt.outcome &&
      attempt.evidence === expectedAttempt.evidence,
    `${label}.securityOutcomes.network-tool-invocation does not correspond to networkAttemptEvidence`,
  );
}

function derivedCorrectness(arm) {
  if (arm.status !== "completed") return "error";
  const checks = arm.evaluators.filter((outcome) => outcome.severity === "correctness");
  if (checks.length === 0 || checks.some((outcome) => ["error", "timeout"].includes(outcome.outcome))) return "error";
  return checks.every((outcome) => outcome.outcome === "pass") ? "pass" : "fail";
}

function validateArm(arm, label) {
  exactFields(arm, [
    "trialId", "status", "correctness", "evaluators", "securityOutcomes",
    "tamperOutcomes", "metrics", "findings", "networkEnforcement",
    "networkAttemptEvidence", "adapter",
  ], [], label);
  nonEmptyString(arm.trialId, `${label}.trialId`);
  enumValue(arm.status, ARM_STATUSES, `${label}.status`);
  enumValue(arm.correctness, CORRECTNESS, `${label}.correctness`);
  invariant(Array.isArray(arm.evaluators) && arm.evaluators.length > 0, `${label}.evaluators must not be empty`);
  arm.evaluators.forEach((outcome, index) => validateEvaluator(outcome, `${label}.evaluators[${index}]`));
  invariant(Array.isArray(arm.securityOutcomes) && arm.securityOutcomes.length > 0, `${label}.securityOutcomes must not be empty`);
  arm.securityOutcomes.forEach((outcome, index) => validateSecurityOutcome(outcome, `${label}.securityOutcomes[${index}]`));
  invariant(Array.isArray(arm.tamperOutcomes) && arm.tamperOutcomes.length > 0, `${label}.tamperOutcomes must not be empty`);
  arm.tamperOutcomes.forEach((outcome, index) => validateTamperOutcome(outcome, `${label}.tamperOutcomes[${index}]`));
  exactFields(arm.metrics, METRIC_NAMES, [], `${label}.metrics`);
  METRIC_NAMES.forEach((name) => validateMetric(arm.metrics[name], `${label}.metrics.${name}`, {
    token: ["inputTokens", "outputTokens", "totalTokens"].includes(name),
  }));
  invariant(Array.isArray(arm.findings), `${label}.findings must be an array`);
  arm.findings.forEach((finding, index) => validateFinding(finding, `${label}.findings[${index}]`));
  validateNetworkEnforcement(arm.networkEnforcement, `${label}.networkEnforcement`);
  validateNetworkAttemptEvidence(arm.networkAttemptEvidence, `${label}.networkAttemptEvidence`);
  validateNetworkCorrespondence(arm, label);
  exactFields(arm.adapter, ["kind", "limitations"], [], `${label}.adapter`);
  nonEmptyString(arm.adapter.kind, `${label}.adapter.kind`);
  invariant(Array.isArray(arm.adapter.limitations), `${label}.adapter.limitations must be an array`);
  arm.adapter.limitations.forEach((limitation, index) => {
    const limitationLabel = `${label}.adapter.limitations[${index}]`;
    exactFields(limitation, ["capability", "reason"], [], limitationLabel);
    nonEmptyString(limitation.capability, `${limitationLabel}.capability`);
    nonEmptyString(limitation.reason, `${limitationLabel}.reason`);
  });

  invariant(arm.correctness === derivedCorrectness(arm), `${label}.correctness does not match evaluator outcomes or status`);
  if (arm.status === "completed") {
    invariant(
      arm.evaluators.every((outcome) => !["error", "timeout"].includes(outcome.outcome)) &&
        arm.tamperOutcomes.every((outcome) => outcome.outcome === "intact"),
      `${label}.status completed conflicts with evaluator or tamper outcomes`,
    );
  }
  if (arm.tamperOutcomes.some((outcome) => outcome.outcome !== "intact")) {
    invariant(arm.status === "invalid", `${label}.status must be invalid after tamper failure`);
  }
}

function validateArmAgainstFixture(arm, fixtureEntry, label) {
  const expectedEvaluators = fixtureEntry.manifest.evaluators;
  const expectedById = new Map(expectedEvaluators.map((evaluator) => [evaluator.id, evaluator]));
  const actualById = new Map();
  for (const outcome of arm.evaluators) {
    invariant(
      !actualById.has(outcome.evaluatorId),
      `${label}.evaluators contains duplicate evaluatorId ${outcome.evaluatorId}`,
    );
    actualById.set(outcome.evaluatorId, outcome);
  }
  invariant(
    actualById.size === expectedById.size &&
      [...expectedById.keys()].every((id) => actualById.has(id)),
    `${label} evaluator set does not match the fixture contract`,
  );
  for (const evaluator of expectedEvaluators) {
    const outcome = actualById.get(evaluator.id);
    for (const field of ["kind", "severity", "expectedExitCode"]) {
      invariant(
        outcome[field] === evaluator[field],
        `${label}.evaluators.${evaluator.id}.${field} does not match the fixture evaluator contract`,
      );
    }
    invariant(
      outcome.contractSha256 === sha256Value(JSON.stringify(evaluator)),
      `${label}.evaluators.${evaluator.id}.contractSha256 does not match the fixture evaluator contract`,
    );
  }

  const expectedSecurity = new Map([...MANDATORY_SECURITY_CONTROLS].map((controlId) => [
    controlId,
    { severity: "critical" },
  ]));
  for (const evaluator of expectedEvaluators) {
    if (!["critical-security", "non-critical-security"].includes(evaluator.severity)) continue;
    invariant(
      !expectedSecurity.has(evaluator.id),
      `fixture evaluator ${evaluator.id} collides with a mandatory security control`,
    );
    expectedSecurity.set(evaluator.id, {
      severity: evaluator.severity === "critical-security" ? "critical" : "non-critical",
      evaluator: actualById.get(evaluator.id),
    });
  }
  const securityById = new Map();
  for (const outcome of arm.securityOutcomes) {
    invariant(
      !securityById.has(outcome.controlId),
      `${label}.securityOutcomes contains duplicate security control ${outcome.controlId}`,
    );
    securityById.set(outcome.controlId, outcome);
  }
  invariant(
    securityById.size === expectedSecurity.size &&
      [...expectedSecurity.keys()].every((id) => securityById.has(id)),
    `${label} security control set does not match the fixture contract`,
  );
  for (const [controlId, expected] of expectedSecurity) {
    const outcome = securityById.get(controlId);
    invariant(
      outcome.severity === expected.severity,
      `${label}.securityOutcomes.${controlId}.severity does not match the fixture contract`,
    );
    if (!expected.evaluator) continue;
    const evaluatorOutcome = expected.evaluator;
    const mappedOutcome = evaluatorOutcome.outcome === "pass"
      ? "pass"
      : (evaluatorOutcome.outcome === "fail" ? "violation" : "error");
    invariant(
      outcome.outcome === mappedOutcome &&
        outcome.evidence === `${controlId}:${evaluatorOutcome.evidenceSha256}`,
      `${label}.securityOutcomes.${controlId} does not correspond to evaluator evidence`,
    );
  }

  const tamperByTarget = new Map();
  for (const outcome of arm.tamperOutcomes) {
    invariant(
      !tamperByTarget.has(outcome.target),
      `${label}.tamperOutcomes contains duplicate tamper target ${outcome.target}`,
    );
    tamperByTarget.set(outcome.target, outcome);
  }
  const requiredIntegrity = fixtureEntry.integrityEvidence;
  invariant(
    requiredIntegrity instanceof Map &&
      requiredIntegrity.size > 0 &&
      [...requiredIntegrity.keys()].every((target) => tamperByTarget.has(target)),
    `${label} tamper target set does not match the fixture integrity contract`,
  );
  for (const [target, expectedSha256] of requiredIntegrity) {
    invariant(
      tamperByTarget.get(target).expectedSha256 === expectedSha256,
      `${label}.tamperOutcomes.${target}.expectedSha256 does not match fixture integrity evidence`,
    );
  }
}

function sha256Value(value) {
  return createHash("sha256").update(value).digest("hex");
}

function speedState(harnessOff, harnessOn) {
  const offDuration = observedDuration(harnessOff);
  const onDuration = observedDuration(harnessOn);
  const matchedCorrect =
    harnessOff.status === "completed" &&
    harnessOn.status === "completed" &&
    harnessOff.correctness === "pass" &&
    harnessOn.correctness === "pass" &&
    offDuration !== null &&
    onDuration !== null &&
    offDuration > 0 &&
    onDuration > 0;
  return {
    matchedCorrect,
    speedComparison: matchedCorrect
      ? {
          status: "matched-correct",
          harnessOffDurationMs: offDuration,
          harnessOnDurationMs: onDuration,
          speedupRatio: offDuration / onDuration,
        }
      : {
          status: "not-comparable",
          reason: unavailableReason(harnessOff, harnessOn),
        },
  };
}

function observedDuration(arm) {
  return arm.metrics.wallDurationMs.status === "observed" ? arm.metrics.wallDurationMs.value : null;
}

function unavailableReason(harnessOff, harnessOn) {
  if (harnessOff.status !== "completed" || harnessOn.status !== "completed") return "invalid-trial";
  if (harnessOff.correctness !== "pass" && harnessOn.correctness !== "pass") return "both-incorrect";
  if (harnessOff.correctness !== "pass") return "harness-off-incorrect";
  if (harnessOn.correctness !== "pass") return "harness-on-incorrect";
  return "duration-unavailable";
}

export function buildPairResult({
  inputDigest,
  runId,
  pairId,
  fixtureId,
  fixtureCategory,
  armOrder,
  harnessOff,
  harnessOn,
}) {
  const { matchedCorrect, speedComparison } = speedState(harnessOff, harnessOn);
  return {
    schemaVersion: "1.0.0",
    inputDigest,
    runId,
    pairId,
    fixtureId,
    fixtureCategory,
    armOrder,
    harnessOff,
    harnessOn,
    matchedCorrect,
    speedComparison,
  };
}

export function validatePairResult(result, label = "result record") {
  exactFields(result, [
    "schemaVersion", "inputDigest", "runId", "pairId", "fixtureId", "fixtureCategory",
    "armOrder", "harnessOff", "harnessOn", "matchedCorrect", "speedComparison",
  ], [], label);
  invariant(result.schemaVersion === "1.0.0", `${label}.schemaVersion must be 1.0.0`);
  sha256(result.inputDigest, `${label}.inputDigest`);
  nonEmptyString(result.runId, `${label}.runId`);
  nonEmptyString(result.pairId, `${label}.pairId`);
  invariant(/^[a-z0-9][a-z0-9-]*$/u.test(result.fixtureId), `${label}.fixtureId is invalid`);
  enumValue(result.fixtureCategory, FIXTURE_CATEGORIES, `${label}.fixtureCategory`);
  enumValue(result.armOrder, new Set(["off-then-on", "on-then-off"]), `${label}.armOrder`);
  validateArm(result.harnessOff, `${label}.harnessOff`);
  validateArm(result.harnessOn, `${label}.harnessOn`);
  invariant(typeof result.matchedCorrect === "boolean", `${label}.matchedCorrect must be boolean`);
  const expected = speedState(result.harnessOff, result.harnessOn);
  invariant(result.matchedCorrect === expected.matchedCorrect, `${label}.matchedCorrect is inconsistent`);
  invariant(
    JSON.stringify(result.speedComparison) === JSON.stringify(expected.speedComparison),
    `${label}.speedComparison is inconsistent`,
  );
  return result;
}

export function validateResultRecords(records, { loadedManifest, runId } = {}) {
  invariant(Array.isArray(records), "result records must be an array");
  invariant(records.length > 0, "result records must not be empty");
  const pairIds = new Set();
  let commonRunId = runId;
  let commonInputDigest;
  for (const [index, result] of records.entries()) {
    validatePairResult(result, `result record ${index + 1}`);
    commonRunId ??= result.runId;
    commonInputDigest ??= result.inputDigest;
    invariant(result.runId === commonRunId, `result record ${index + 1}.runId does not match expected run`);
    if (loadedManifest) {
      invariant(
        result.inputDigest === loadedManifest.inputDigest,
        `result record ${index + 1}.inputDigest does not match the loaded benchmark input`,
      );
    }
    invariant(
      result.inputDigest === commonInputDigest,
      `result record ${index + 1}.inputDigest does not match the common benchmark input`,
    );
    invariant(!pairIds.has(result.pairId), `result record ${index + 1} has duplicate pairId ${result.pairId}`);
    pairIds.add(result.pairId);
  }

  if (loadedManifest) {
    sha256(loadedManifest.inputDigest, "loadedManifest.inputDigest");
    invariant(typeof commonRunId === "string" && commonRunId.length > 0, "result records cannot establish a run identity");
    const expectedPlan = deriveRunPlan(loadedManifest, { runId: commonRunId });
    const expectedById = new Map(expectedPlan.pairs.map((pair) => [pair.pairId, pair]));
    invariant(
      records.length === expectedById.size &&
        records.every((result) => expectedById.has(result.pairId)),
      "result records must contain the exact expected pair set",
    );
    for (const [index, result] of records.entries()) {
      const label = `result record ${index + 1}`;
      const expected = expectedById.get(result.pairId);
      invariant(expected, `${label}.pairId does not belong to the expected run plan`);
      invariant(result.fixtureId === expected.fixtureId, `${label}.fixtureId does not match the run plan`);
      invariant(result.fixtureCategory === expected.fixtureEntry.manifest.category, `${label}.fixtureCategory does not match the run plan`);
      invariant(result.armOrder === expected.armOrder, `${label}.armOrder does not match the run plan`);
      invariant(result.harnessOff.trialId === expected.trials["harness-off"].trialId, `${label}.harnessOff.trialId does not match the run plan`);
      invariant(result.harnessOn.trialId === expected.trials["harness-on"].trialId, `${label}.harnessOn.trialId does not match the run plan`);
      validateArmAgainstFixture(result.harnessOff, expected.fixtureEntry, `${label}.harnessOff`);
      validateArmAgainstFixture(result.harnessOn, expected.fixtureEntry, `${label}.harnessOn`);
    }
  }
  return records;
}

export async function appendResultRecord(path, result, { loadedManifest } = {}) {
  validatePairResult(result);
  if (loadedManifest) {
    invariant(
      result.inputDigest === loadedManifest.inputDigest,
      "result record.inputDigest does not match the loaded benchmark input",
    );
  }
  await appendJsonLine(path, result);
}
