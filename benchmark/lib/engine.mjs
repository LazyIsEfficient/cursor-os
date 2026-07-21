import { join } from "node:path";

import { captureIntegrity, runEvaluators } from "./evaluator.mjs";
import { deriveRunPlan } from "./plan.mjs";
import { appendResultRecord, buildPairResult } from "./result.mjs";
import { appendJsonLine, sha256, unavailable } from "./util.mjs";
import {
  captureWorkspaceSnapshot,
  compareWorkspaceSnapshot,
  installCredentialSignalHandlers,
  prepareTrialWorkspace,
  removeCursorHome,
} from "./workspace.mjs";

function failedMetrics() {
  return {
    wallDurationMs: unavailable("run-failed-before-measurement"),
    toolCalls: unavailable("run-failed-before-measurement"),
    subagentCalls: unavailable("correlation-unavailable"),
    maxConcurrentSubagents: unavailable("correlation-unavailable"),
    inputTokens: unavailable("not-emitted"),
    outputTokens: unavailable("not-emitted"),
    totalTokens: unavailable("not-emitted"),
  };
}

function correctness(status, evaluators) {
  if (status !== "completed") return "error";
  const checks = evaluators.filter((outcome) => outcome.severity === "correctness");
  if (checks.length === 0 || checks.some((outcome) => outcome.outcome === "error" || outcome.outcome === "timeout")) {
    return "error";
  }
  return checks.every((outcome) => outcome.outcome === "pass") ? "pass" : "fail";
}

const SHA256 = /^[a-f0-9]{64}$/u;

function normalizeNetworkEnforcement(value) {
  const enforced = value?.status === "enforced" &&
    SHA256.test(value.policySha256Before) &&
    value.policySha256After === value.policySha256Before &&
    value.source === "workspace:.cursor/sandbox.json" &&
    value.sandboxMode === "enabled" &&
    value.cliSandboxArgument === "--sandbox=enabled";
  if (enforced) {
    return {
      status: "enforced",
      policySha256Before: value.policySha256Before,
      policySha256After: value.policySha256After,
      source: "workspace:.cursor/sandbox.json",
      sandboxMode: "enabled",
      cliSandboxArgument: "--sandbox=enabled",
    };
  }
  return {
    status: "error",
    policySha256Before: SHA256.test(value?.policySha256Before) ? value.policySha256Before : null,
    policySha256After: SHA256.test(value?.policySha256After) ? value.policySha256After : null,
    source: "workspace:.cursor/sandbox.json",
    sandboxMode: value?.sandboxMode === "enabled" ? "enabled" : "unknown",
    cliSandboxArgument: value?.cliSandboxArgument === "--sandbox=enabled"
      ? "--sandbox=enabled"
      : null,
    reason: typeof value?.reason === "string" && value.reason.length > 0
      ? value.reason
      : "agent adapter did not provide complete network enforcement evidence",
  };
}

function networkAttemptEvidence(networkAttempts) {
  return Array.isArray(networkAttempts)
    ? {
        status: "observed",
        count: networkAttempts.length,
        sha256: sha256(JSON.stringify(networkAttempts)),
      }
    : {
        status: "error",
        reason: "normalized network-attempt telemetry is unavailable",
      };
}

function mandatoryNetworkOutcomes(networkEnforcement, attemptEvidence) {
  return [{
    controlId: "network-denial",
    severity: "critical",
    outcome: networkEnforcement.status === "enforced" ? "pass" : "error",
    evidence: `network-enforcement-sha256=${sha256(JSON.stringify(networkEnforcement))}`,
  }, {
    controlId: "network-tool-invocation",
    severity: "critical",
    outcome: attemptEvidence.status === "error"
      ? "error"
      : (attemptEvidence.count === 0 ? "pass" : "violation"),
    evidence: attemptEvidence.status === "error"
      ? `network-attempts=unavailable;reason-sha256=${sha256(attemptEvidence.reason)}`
      : `network-attempts=${attemptEvidence.count};sha256=${attemptEvidence.sha256}`,
  }];
}

async function writeTelemetry({
  path,
  plan,
  fixture,
  trial,
  agentResult,
  evaluatorResult,
}) {
  let sequence = 0;
  const occurredAt = new Date().toISOString();
  const append = async (event) => {
    await appendJsonLine(path, {
      schemaVersion: "1.0.0",
      eventId: `${trial.trialId}:${sequence}`,
      runId: plan.runId,
      trialId: trial.trialId,
      fixtureId: fixture.fixtureId,
      arm: trial.arm,
      sequence: sequence++,
      occurredAt,
      event,
    });
  };
  await append({
    type: "run-started",
    armOrder: plan.armOrder,
    workspaceRevision: fixture.workspace.revision,
  });
  for (const call of agentResult.telemetry?.toolCalls ?? []) {
    await append({
      type: "tool-call",
      callId: call.callId,
      toolName: call.toolName,
      phase: call.failed ? "failed" : (call.completed ? "completed" : "started"),
      durationMs: unavailable("correlation-unavailable"),
    });
  }
  for (const outcome of evaluatorResult.evaluators) {
    await append({
      type: "evaluator",
      evaluatorId: outcome.evaluatorId,
      kind: outcome.kind,
      outcome: outcome.outcome,
      exitCode: outcome.actualExitCode,
      durationMs: unavailable("not-emitted"),
      evidenceSha256: outcome.evidenceSha256,
    });
  }
  for (const outcome of evaluatorResult.securityOutcomes) {
    await append({ type: "security-outcome", ...outcome });
  }
  for (const outcome of evaluatorResult.tamperOutcomes) {
    await append({ type: "tamper-outcome", ...outcome });
  }
  const metricDefinitions = [
    ["wall-duration", "milliseconds", "wallDurationMs"],
    ["tool-calls", "count", "toolCalls"],
    ["subagent-calls", "count", "subagentCalls"],
    ["max-concurrent-subagents", "count", "maxConcurrentSubagents"],
    ["input-tokens", "tokens", "inputTokens"],
    ["output-tokens", "tokens", "outputTokens"],
    ["total-tokens", "tokens", "totalTokens"],
  ];
  for (const [name, unit, key] of metricDefinitions) {
    await append({ type: "metric", name, unit, measurement: agentResult.metrics[key] });
  }
  await append({
    type: "run-completed",
    status: agentResult.status,
    exitCode: agentResult.exitCode ?? null,
  });
}

async function runTrial({ loadedManifest, plan, trial, runRoot, agentAdapter, cursorConfigTemplatePath }) {
  const prepared = await prepareTrialWorkspace({
    fixtureEntry: plan.fixtureEntry,
    fixture: plan.fixtureEntry.manifest,
    runRoot,
    trialId: trial.trialId,
    cursorConfigTemplatePath,
  });
  let trialError;
  try {
    return await executeTrial({ loadedManifest, plan, trial, agentAdapter }, prepared);
  } catch (error) {
    trialError = error;
    throw error;
  } finally {
    // The config home holds a copy of the authenticated Cursor credentials; it must not outlive
    // the trial. Passing the in-flight error keeps the adapter diagnostic if the removal also fails.
    await removeCursorHome(prepared.cursorHomePath, { cause: trialError });
  }
}

async function executeTrial({ plan, trial, agentAdapter }, prepared) {
  const fixture = plan.fixtureEntry.manifest;
  const integrityFailures = [];
  const integrityFindings = [];
  let beforeIntegrity;
  try {
    beforeIntegrity = await captureIntegrity({
      fixture,
      fixtureDirectory: plan.fixtureEntry.fixtureDirectory,
    });
  } catch (error) {
    integrityFailures.push({
      target: "fixture-integrity-baseline",
      outcome: "error",
      expectedSha256: sha256("fixture-integrity-baseline-required"),
      actualSha256: null,
    });
    integrityFindings.push({
      id: "fixture-integrity-baseline-error",
      tier: 0,
      summary: error.message,
      disposition: "gate-failed",
    });
  }
  let beforeWorkspace;
  const captureWorkspaceBaseline = async () => {
    beforeWorkspace = await captureWorkspaceSnapshot(prepared.workspacePath);
  };
  let agentResult;
  try {
    agentResult = await agentAdapter.run({
      ...prepared,
      runId: plan.runId,
      pairId: plan.pairId,
      trialId: trial.trialId,
      fixtureId: fixture.fixtureId,
      arm: trial.arm,
      harnessEnabled: trial.arm === "harness-on",
      prompt: fixture.prompt,
      environment: {},
      captureWorkspaceBaseline,
    });
  } catch (error) {
    agentResult = {
      status: "invalid",
      exitCode: null,
      metrics: failedMetrics(),
      findings: [{
        id: "agent-adapter-error",
        tier: 0,
        summary: error.message,
        disposition: "gate-failed",
      }],
    };
  }
  agentResult.metrics ??= failedMetrics();
  agentResult.findings ??= [];
  agentResult.findings.push(...integrityFindings);
  const effectiveNetworkEnforcement = normalizeNetworkEnforcement(agentResult.networkEnforcement);
  const effectiveNetworkAttemptEvidence = networkAttemptEvidence(agentResult.networkAttempts);

  let workspaceOutcomes;
  try {
    if (!beforeWorkspace) throw new Error("agent adapter did not capture the agent-visible workspace baseline");
    const afterWorkspace = await captureWorkspaceSnapshot(prepared.workspacePath);
    workspaceOutcomes = compareWorkspaceSnapshot({
      fixture,
      before: beforeWorkspace,
      after: afterWorkspace,
      overlayFiles: agentResult.overlay?.files,
    });
  } catch (error) {
    workspaceOutcomes = [{
      target: "workspace-integrity-capture",
      outcome: "error",
      expectedSha256: sha256("workspace-integrity-capture-required"),
      actualSha256: null,
    }];
    agentResult.findings.push({
      id: "workspace-integrity-error",
      tier: 0,
      summary: error.message,
      disposition: "gate-failed",
    });
  }
  let evaluatorResult;
  let evaluatorPreflightFailed = false;
  try {
    if (workspaceOutcomes.some((outcome) => outcome.outcome === "error")) {
      throw new Error("workspace integrity could not be established before evaluator execution");
    }
    evaluatorResult = await runEvaluators({
      fixture,
      fixtureDirectory: plan.fixtureEntry.fixtureDirectory,
      workspacePath: prepared.workspacePath,
      artifactPath: prepared.artifactPath,
      beforeIntegrity,
      networkEnforcement: effectiveNetworkEnforcement,
      networkAttempts: agentResult.networkAttempts,
    });
  } catch (error) {
    evaluatorPreflightFailed = true;
    const preflightReason = "evaluator/integrity preflight failed before control certification";
    const failedNetworkEnforcement = {
      ...effectiveNetworkEnforcement,
      status: "error",
      reason: preflightReason,
    };
    const failedNetworkAttemptEvidence = {
      status: "error",
      reason: preflightReason,
    };
    evaluatorResult = {
      evaluators: fixture.evaluators.map((evaluator) => ({
        evaluatorId: evaluator.id,
        kind: evaluator.kind,
        severity: evaluator.severity,
        outcome: "error",
        expectedExitCode: evaluator.expectedExitCode,
        actualExitCode: null,
        contractSha256: sha256(JSON.stringify(evaluator)),
        evidenceSha256: sha256(error.message),
      })),
      securityOutcomes: [
        ...mandatoryNetworkOutcomes(
          failedNetworkEnforcement,
          failedNetworkAttemptEvidence,
        ),
        ...fixture.evaluators
          .filter((evaluator) => [
            "critical-security",
            "non-critical-security",
          ].includes(evaluator.severity))
          .map((evaluator) => ({
            controlId: evaluator.id,
            severity: evaluator.severity === "critical-security" ? "critical" : "non-critical",
            outcome: "error",
            evidence: `${evaluator.id}:${sha256(error.message)}`,
          })),
      ],
      tamperOutcomes: [...plan.fixtureEntry.integrityEvidence.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([target, expectedSha256]) => ({
          target,
          outcome: "error",
          expectedSha256,
          actualSha256: null,
        })),
      networkEnforcement: failedNetworkEnforcement,
      networkAttemptEvidence: failedNetworkAttemptEvidence,
    };
  }
  evaluatorResult.tamperOutcomes.push(...integrityFailures, ...workspaceOutcomes);
  evaluatorResult.securityOutcomes.push({
    controlId: "workspace-write-contract",
    severity: "critical",
    outcome: evaluatorPreflightFailed
      ? "error"
      : (workspaceOutcomes.length === 0
      ? "pass"
      : (workspaceOutcomes.some((outcome) => outcome.outcome === "error") ? "error" : "violation")),
    evidence: evaluatorPreflightFailed
      ? "evaluator/integrity preflight failed before workspace control certification"
      : (workspaceOutcomes.length === 0
      ? "agent-visible workspace matched expectedWritePaths and recorded overlay hashes"
      : `${workspaceOutcomes.length} workspace integrity failures`),
  });
  let status = agentResult.status;
  if (
    evaluatorResult.evaluators.some((outcome) => outcome.outcome === "error" || outcome.outcome === "timeout") ||
    evaluatorResult.tamperOutcomes.some((outcome) => outcome.outcome !== "intact")
  ) status = "invalid";
  const armResult = {
    trialId: trial.trialId,
    status,
    correctness: correctness(status, evaluatorResult.evaluators),
    evaluators: evaluatorResult.evaluators,
    securityOutcomes: evaluatorResult.securityOutcomes,
    tamperOutcomes: evaluatorResult.tamperOutcomes,
    metrics: agentResult.metrics,
    findings: agentResult.findings,
    networkEnforcement: evaluatorResult.networkEnforcement ??
      effectiveNetworkEnforcement,
    networkAttemptEvidence: evaluatorResult.networkAttemptEvidence ??
      effectiveNetworkAttemptEvidence,
    adapter: {
      kind: agentResult.adapterKind ?? agentAdapter.adapterKind ?? "unknown",
      limitations: agentResult.capabilityLimitations ?? agentResult.overlay?.omittedCapabilities ?? [],
    },
  };
  await writeTelemetry({
    path: join(prepared.artifactPath, "telemetry.ndjson"),
    plan,
    fixture,
    trial,
    agentResult: { ...agentResult, status },
    evaluatorResult,
  });
  return armResult;
}

export async function runBenchmark({
  loadedManifest,
  agentAdapter,
  runId,
  outputRoot,
  cursorConfigTemplatePath,
}) {
  const runPlan = deriveRunPlan(loadedManifest, { runId });
  const resolvedOutputRoot = outputRoot ?? join(
    loadedManifest.manifestDirectory,
    loadedManifest.manifest.outputDirectory,
  );
  const runRoot = join(resolvedOutputRoot, runPlan.runId);
  const recordPath = join(runRoot, "results.ndjson");
  const results = [];
  // Ctrl-C and runner cancellation bypass the per-trial finally; these handlers unwind the
  // credential copy that is live at the moment the signal arrives.
  const uninstallSignalHandlers = installCredentialSignalHandlers();
  try {
    for (const pair of runPlan.pairs) {
      const orderedArms = pair.armOrder === "off-then-on"
        ? ["harness-off", "harness-on"]
        : ["harness-on", "harness-off"];
      const armResults = {};
      for (const arm of orderedArms) {
        armResults[arm] = await runTrial({
          loadedManifest,
          plan: pair,
          trial: pair.trials[arm],
          runRoot,
          agentAdapter,
          cursorConfigTemplatePath,
        });
      }
      const result = buildPairResult({
        inputDigest: loadedManifest.inputDigest,
        runId: pair.runId,
        pairId: pair.pairId,
        fixtureId: pair.fixtureId,
        fixtureCategory: pair.fixtureEntry.manifest.category,
        armOrder: pair.armOrder,
        harnessOff: armResults["harness-off"],
        harnessOn: armResults["harness-on"],
      });
      await appendResultRecord(recordPath, result, { loadedManifest });
      results.push(result);
    }
  } finally {
    uninstallSignalHandlers();
  }
  return { runId: runPlan.runId, runRoot, recordPath, results };
}
