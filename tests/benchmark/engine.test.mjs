import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createCursorCliAdapter, createProjectOverlayAdapter } from "../../benchmark/lib/adapters.mjs";
import { runCursorAuthenticationPreflight } from "../../benchmark/lib/auth-preflight.mjs";
import { runBenchmark } from "../../benchmark/lib/engine.mjs";
import { captureIntegrity, runEvaluators } from "../../benchmark/lib/evaluator.mjs";
import { readBenchmarkManifest } from "../../benchmark/lib/manifest.mjs";
import { deriveRunPlan } from "../../benchmark/lib/plan.mjs";
import { aggregateReport, renderReportJson, renderReportMarkdown } from "../../benchmark/lib/report.mjs";
import {
  appendResultRecord,
  buildPairResult,
  validateResultRecords,
} from "../../benchmark/lib/result.mjs";
import { normalizeCliNdjson } from "../../benchmark/lib/telemetry.mjs";
import { globPatternToRegExp, hashFile, hashTree, sha256 } from "../../benchmark/lib/util.mjs";
import {
  compareWorkspaceSnapshot,
  prepareTrialWorkspace,
  SANDBOX_POLICY,
  SANDBOX_POLICY_BYTES,
  writeTrialSandboxPolicy,
} from "../../benchmark/lib/workspace.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, "../..");
const mockAgent = join(here, "fixtures", "mock-agent.mjs");
const mockEvaluator = join(here, "fixtures", "mock-evaluator.mjs");

async function makeFixtureRoot() {
  const root = await mkdtemp(join(tmpdir(), "cursor-benchmark-"));
  await mkdir(join(root, "fixtures", "case", "seed"), { recursive: true });
  await mkdir(join(root, "fixtures", "case", "evaluators"), { recursive: true });
  await mkdir(join(root, "fixtures", "case", "canaries"), { recursive: true });
  await writeFile(join(root, "fixtures", "case", "seed", "public.txt"), "public seed\n");
  await writeFile(join(root, "fixtures", "case", "seed", "package-lock.json"), "{}\n");
  await cp(mockEvaluator, join(root, "fixtures", "case", "evaluators", "mock-evaluator.mjs"));
  await writeFile(join(root, "fixtures", "case", "canaries", "secret-canary"), "hidden secret\n");

  const fixture = {
    schemaVersion: "1.0.0",
    fixtureId: "case",
    category: "localized-correctness",
    workspace: {
      sourcePath: "seed",
      revision: "fixture-v1",
      lockfilePath: "package-lock.json",
      lockfileSha256: await hashFile(join(root, "fixtures", "case", "seed", "package-lock.json")),
    },
    prompt: "Create answer.txt containing correct.",
    expectedWritePaths: ["answer.txt"],
    evaluators: [{
      id: "functional",
      kind: "functional",
      visibility: "hidden-from-agent",
      command: {
        executable: process.execPath,
        arguments: ["mock-evaluator.mjs", "{workspace}", "correct"],
        workingDirectory: "evaluators",
      },
      timeoutMs: 2_000,
      expectedExitCode: 0,
      severity: "correctness",
    }],
    integrity: {
      evaluatorBundleSha256: await hashTree(join(root, "fixtures", "case", "evaluators")),
      protectedPaths: ["evaluators/**", "canaries/**"],
      canaryIds: ["secret-canary"],
      networkPolicy: "deny",
    },
  };
  await writeFile(join(root, "fixtures", "case", "fixture.json"), `${JSON.stringify(fixture, null, 2)}\n`);

  const manifest = {
    schemaVersion: "1.0.0",
    benchmarkId: "mock-benchmark",
    profile: "custom",
    seed: "fixed-seed",
    repetitions: 2,
    fixtures: ["fixtures/case/fixture.json"],
    outputDirectory: "results",
  };
  const manifestPath = join(root, "benchmark.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { root, fixture, manifestPath };
}

function metric(value) {
  return { status: "observed", value, source: "monotonic-clock" };
}

function arm(trialId, { correct = true, duration = 100, critical = "pass", tamper = "intact" } = {}) {
  const digest = "a".repeat(64);
  const networkEnforcement = {
    status: "enforced",
    policySha256Before: digest,
    policySha256After: digest,
    source: "workspace:.cursor/sandbox.json",
    sandboxMode: "enabled",
    cliSandboxArgument: "--sandbox=enabled",
  };
  return {
    trialId,
    status: "completed",
    correctness: correct ? "pass" : "fail",
    evaluators: [{
      evaluatorId: "functional",
      kind: "functional",
      severity: "correctness",
      outcome: correct ? "pass" : "fail",
      expectedExitCode: 0,
      actualExitCode: correct ? 0 : 1,
      contractSha256: digest,
      evidenceSha256: digest,
    }],
    securityOutcomes: [{
      controlId: "network-denial",
      severity: "critical",
      outcome: critical,
      evidence: `network-enforcement-sha256=${sha256(JSON.stringify(networkEnforcement))}`,
    }, {
      controlId: "network-tool-invocation",
      severity: "critical",
      outcome: "pass",
      evidence: `network-attempts=0;sha256=${sha256("[]")}`,
    }, {
      controlId: "workspace-write-contract",
      severity: "critical",
      outcome: "pass",
      evidence: "synthetic workspace snapshot evidence",
    }],
    tamperOutcomes: [{
      target: "evaluators",
      outcome: tamper,
      expectedSha256: digest,
      actualSha256: digest,
    }],
    metrics: {
      wallDurationMs: metric(duration),
      toolCalls: { status: "observed", value: 1, source: "documented-stream-json" },
      subagentCalls: { status: "unavailable", reason: "correlation-unavailable" },
      maxConcurrentSubagents: { status: "unavailable", reason: "correlation-unavailable" },
      inputTokens: { status: "unavailable", reason: "not-emitted" },
      outputTokens: { status: "unavailable", reason: "not-emitted" },
      totalTokens: { status: "unavailable", reason: "not-emitted" },
    },
    findings: [],
    networkEnforcement,
    networkAttemptEvidence: {
      status: "observed",
      count: 0,
      sha256: sha256("[]"),
    },
    adapter: { kind: "mock", limitations: [] },
  };
}

function contractBoundArm(trialId, fixture, integrityBaseline) {
  const result = arm(trialId);
  result.evaluators = fixture.evaluators.map((evaluator) => ({
    evaluatorId: evaluator.id,
    kind: evaluator.kind,
    severity: evaluator.severity,
    outcome: "pass",
    expectedExitCode: evaluator.expectedExitCode,
    actualExitCode: evaluator.expectedExitCode,
    contractSha256: sha256(JSON.stringify(evaluator)),
    evidenceSha256: sha256(`evidence:${evaluator.id}`),
  }));
  result.securityOutcomes = [
    {
      controlId: "network-denial",
      severity: "critical",
      outcome: "pass",
      evidence: `network-enforcement-sha256=${sha256(JSON.stringify(result.networkEnforcement))}`,
    },
    {
      controlId: "network-tool-invocation",
      severity: "critical",
      outcome: "pass",
      evidence: `network-attempts=0;sha256=${sha256("[]")}`,
    },
    {
      controlId: "workspace-write-contract",
      severity: "critical",
      outcome: "pass",
      evidence: "synthetic workspace snapshot evidence",
    },
    ...result.evaluators
      .filter((evaluator) => ["critical-security", "non-critical-security"].includes(evaluator.severity))
      .map((evaluator) => ({
        controlId: evaluator.evaluatorId,
        severity: evaluator.severity === "critical-security" ? "critical" : "non-critical",
        outcome: "pass",
        evidence: `${evaluator.evaluatorId}:${evaluator.evidenceSha256}`,
      })),
  ];
  result.tamperOutcomes = [...integrityBaseline.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([target, digest]) => ({
      target,
      outcome: "intact",
      expectedSha256: target === "evaluator-bundle"
        ? fixture.integrity.evaluatorBundleSha256
        : digest,
      actualSha256: target === "evaluator-bundle"
        ? fixture.integrity.evaluatorBundleSha256
        : digest,
    }));
  return result;
}

test("fixed seed reproduces arm randomization while IDs stay unique", async () => {
  const { manifestPath } = await makeFixtureRoot();
  const loaded = await readBenchmarkManifest(manifestPath);
  const first = deriveRunPlan(loaded, { runId: "run-a" });
  const repeated = deriveRunPlan(loaded, { runId: "run-b" });

  assert.deepEqual(first.pairs.map((pair) => pair.armOrder), repeated.pairs.map((pair) => pair.armOrder));
  assert.equal(new Set(first.pairs.flatMap((pair) => [
    pair.pairId,
    pair.trials["harness-off"].trialId,
    pair.trials["harness-on"].trialId,
  ])).size, 6);
  assert.notEqual(first.pairs[0].pairId, repeated.pairs[0].pairId);
  assert.throws(() => deriveRunPlan(loaded, { runId: "../../escape" }), /safe path segment/);
});

test("benchmark input digest changes when workspace source bytes change", async () => {
  const { root, manifestPath } = await makeFixtureRoot();
  const before = await readBenchmarkManifest(manifestPath);

  await writeFile(join(root, "fixtures", "case", "seed", "public.txt"), "mutated seed\n");
  const after = await readBenchmarkManifest(manifestPath);

  assert.notEqual(after.inputDigest, before.inputDigest);
});

test("runtime rejects an empty expectedWritePaths array like the schema", async () => {
  const { root, manifestPath } = await makeFixtureRoot();
  const fixturePath = join(root, "fixtures", "case", "fixture.json");
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  fixture.expectedWritePaths = [];
  await writeFile(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`);

  await assert.rejects(readBenchmarkManifest(manifestPath), /expectedWritePaths must not be empty/u);
});

test("write-path globs distinguish segments and protect prompt and overlay hashes", () => {
  assert.equal(globPatternToRegExp("src/**").test("src/file.mjs"), true);
  assert.equal(globPatternToRegExp("src/**").test("src/nested/file.mjs"), true);
  assert.equal(globPatternToRegExp("src/*").test("src/nested/file.mjs"), false);
  assert.throws(() => globPatternToRegExp("../src/**"), /must not contain/);
  assert.throws(() => globPatternToRegExp("src\\**"), /forward slashes/);

  const before = new Map([
    [".cursor-harness/prompt.txt", "a".repeat(64)],
    ["src/file.mjs", "b".repeat(64)],
  ]);
  const after = new Map([
    [".cursor-harness/prompt.txt", "c".repeat(64)],
    ["src/file.mjs", "d".repeat(64)],
    [".cursor/rules/rule.mdc", "e".repeat(64)],
    ["unexpected.txt", "f".repeat(64)],
  ]);
  const outcomes = compareWorkspaceSnapshot({
    fixture: { expectedWritePaths: ["src/**"] },
    before,
    after,
    overlayFiles: [{
      destination: ".cursor/rules/rule.mdc",
      sha256: "e".repeat(64),
    }],
  });
  assert.deepEqual(outcomes.map((outcome) => [outcome.target, outcome.outcome]), [
    ["workspace/.cursor-harness/prompt.txt", "modified"],
    ["workspace/unexpected.txt", "unexpected"],
  ]);

  after.set(".cursor/rules/rule.mdc", "0".repeat(64));
  assert.ok(compareWorkspaceSnapshot({
    fixture: { expectedWritePaths: ["src/**", ".cursor/rules/**"] },
    before,
    after,
    overlayFiles: [{ destination: ".cursor/rules/rule.mdc", sha256: "e".repeat(64) }],
  }).some((outcome) => outcome.target === "workspace/.cursor/rules/rule.mdc"));

  assert.deepEqual(compareWorkspaceSnapshot({
    fixture: { expectedWritePaths: [".cursor/**"] },
    before: new Map([[".cursor/sandbox.json", "1".repeat(64)]]),
    after: new Map([[".cursor/sandbox.json", "2".repeat(64)]]),
  }).map(({ target, outcome }) => ({ target, outcome })), [{
    target: "workspace/.cursor/sandbox.json",
    outcome: "modified",
  }]);
});

test("fresh workspaces expose only seed and prompt and overlay records byte provenance", async () => {
  const { root, fixture } = await makeFixtureRoot();
  const prepared = await prepareTrialWorkspace({
    fixtureEntry: {
      workspaceSourcePath: join(root, "fixtures", "case", "seed"),
    },
    fixture,
    runRoot: join(root, "run"),
    trialId: "trial-1",
  });
  const adapter = createProjectOverlayAdapter({
    pluginRoot: join(repositoryRoot, "plugin"),
    agentAdapter: { async run() { return { status: "completed" }; } },
  });
  const result = await adapter.run({ ...prepared, prompt: fixture.prompt });

  assert.equal(await readFile(join(prepared.workspacePath, "public.txt"), "utf8"), "public seed\n");
  assert.equal(await readFile(join(prepared.workspacePath, ".cursor-harness", "prompt.txt"), "utf8"), `${fixture.prompt}\n`);
  assert.equal(await readFile(join(prepared.workspacePath, ".cursor", "sandbox.json"), "utf8"), SANDBOX_POLICY_BYTES);
  assert.deepEqual(SANDBOX_POLICY.networkPolicy, {
    default: "deny",
    allow: [],
    deny: ["0.0.0.0/0", "::/0"],
  });
  assert.deepEqual(SANDBOX_POLICY.additionalReadwritePaths, []);
  assert.deepEqual(SANDBOX_POLICY.additionalReadonlyPaths, []);
  assert.equal(SANDBOX_POLICY.disableTmpWrite, true);
  await assert.rejects(readFile(join(prepared.workspacePath, "canaries", "secret-canary")), /ENOENT/);
  assert.equal(relative(prepared.workspacePath, prepared.cursorHomePath).startsWith(".."), true);
  assert.equal(result.adapterKind, "project-overlay");
  assert.ok(result.overlay.files.length > 0);
  assert.ok(result.overlay.files.every((entry) => /^[a-f0-9]{64}$/.test(entry.sha256) && entry.bytes > 0));
  assert.ok(result.overlay.omittedCapabilities.some((entry) => entry.capability === "command-hooks"));
  await assert.rejects(readFile(join(prepared.workspacePath, ".cursor", "hooks.json")), /ENOENT/);
});

test("trial setup copies only a validated external Cursor config template", async () => {
  const { root, fixture } = await makeFixtureRoot();
  const templatePath = join(root, "authenticated-config-template");
  await mkdir(templatePath);
  await writeFile(join(templatePath, "auth.json"), "{\"synthetic\":\"non-secret\"}\n");
  const prepared = await prepareTrialWorkspace({
    fixtureEntry: {
      workspaceSourcePath: join(root, "fixtures", "case", "seed"),
    },
    fixture,
    runRoot: join(root, "run-with-config"),
    trialId: "trial-config",
    cursorConfigTemplatePath: templatePath,
  });

  assert.equal(
    await readFile(join(prepared.cursorHomePath, "auth.json"), "utf8"),
    "{\"synthetic\":\"non-secret\"}\n",
  );
  await assert.rejects(readFile(join(prepared.artifactPath, "auth.json")), /ENOENT/u);
  await assert.rejects(readFile(join(prepared.workspacePath, "auth.json")), /ENOENT/u);

  const linkedTemplate = join(root, "linked-config-template");
  await symlink(templatePath, linkedTemplate);
  await assert.rejects(
    prepareTrialWorkspace({
      fixtureEntry: {
        workspaceSourcePath: join(root, "fixtures", "case", "seed"),
      },
      fixture,
      runRoot: join(root, "run-linked-config"),
      trialId: "trial-linked-config",
      cursorConfigTemplatePath: linkedTemplate,
    }),
    /symbolic link/u,
  );
});

test("authentication preflight uses a copied synthetic config and fails clearly when missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "cursor-auth-preflight-"));
  const templatePath = join(root, "config-template");
  const statusScript = join(root, "status.mjs");
  await mkdir(templatePath);
  await writeFile(join(templatePath, "auth.json"), "{\"authenticated\":true}\n");
  await writeFile(statusScript, [
    "import { readFile } from 'node:fs/promises';",
    "import { join } from 'node:path';",
    "if (process.argv[2] !== 'status') process.exit(2);",
    "const auth = JSON.parse(await readFile(join(process.env.CURSOR_CONFIG_DIR, 'auth.json'), 'utf8'));",
    "if (auth.authenticated !== true) process.exit(3);",
  ].join("\n"));

  assert.deepEqual(await runCursorAuthenticationPreflight({
    binary: process.execPath,
    prefixArguments: [statusScript],
    cursorConfigTemplatePath: templatePath,
  }), {
    status: "authenticated",
    templatePath,
  });
  await assert.rejects(
    runCursorAuthenticationPreflight({
      binary: process.execPath,
      prefixArguments: [statusScript],
    }),
    /requires --cursor-config-template/u,
  );
});

test("NDJSON normalization ignores unknown fields and correlates tool calls", () => {
  const source = [
    JSON.stringify({ type: "system", subtype: "init", future: true }),
    JSON.stringify({ type: "tool_call", subtype: "started", call_id: "a", tool_call: { name: "read" } }),
    JSON.stringify({ type: "tool_call", subtype: "completed", call_id: "a", tool_call: { name: "read" } }),
    JSON.stringify({ type: "future-event", value: 1 }),
    JSON.stringify({ type: "result", subtype: "success" }),
  ].join("\n");
  const normalized = normalizeCliNdjson(source);

  assert.equal(normalized.toolCallCount, 1);
  assert.equal(normalized.toolCalls[0].callId, "a");
  assert.equal(normalized.toolCalls[0].completed, true);
  assert.equal(normalized.hasTerminalResult, true);
  assert.deepEqual(normalized.documentedTypes, ["system", "tool_call", "tool_call", "result"]);
});

test("nested stream-json tools preserve names and detect direct network attempts", () => {
  const events = [
    {
      type: "tool_call",
      subtype: "started",
      call_id: "fetch",
      tool_call: { webFetchToolCall: { args: { url: "https://example.com" } } },
    },
    {
      type: "tool_call",
      subtype: "started",
      call_id: "mcp",
      tool_call: { function: { name: "mcp__docs__search", arguments: "{\"query\":\"x\"}" } },
    },
    {
      type: "tool_call",
      subtype: "started",
      call_id: "shell",
      tool_call: { function: { name: "Shell", arguments: "{\"command\":\"curl https://example.com\"}" } },
    },
    {
      type: "tool_call",
      subtype: "started",
      call_id: "unknown",
      tool_call: { futureToolCall: { args: { value: 1 } } },
    },
    {
      type: "tool_call",
      subtype: "started",
      call_id: "benign-shell",
      tool_call: { shellToolCall: { args: { command: "printf 'curl is blocked'" } } },
    },
    {
      type: "tool_call",
      subtype: "started",
      call_id: "absolute-curl",
      tool_call: { function: { name: "Shell", arguments: "{\"command\":\"/usr/bin/curl https://example.com\"}" } },
    },
    {
      type: "tool_call",
      subtype: "started",
      call_id: "command-curl",
      tool_call: { function: { name: "Shell", arguments: "{\"command\":\"command curl https://example.com\"}" } },
    },
    {
      type: "tool_call",
      subtype: "started",
      call_id: "wrapped-git",
      tool_call: { function: { name: "Shell", arguments: "{\"command\":\"env MODE=test sudo nohup /usr/bin/git fetch origin\"}" } },
    },
    {
      type: "tool_call",
      subtype: "started",
      call_id: "quoted-control",
      tool_call: { function: { name: "Shell", arguments: "{\"command\":\"printf '%s' 'command curl https://example.com'\"}" } },
    },
    {
      type: "tool_call",
      subtype: "started",
      call_id: "process-substitution",
      tool_call: { function: { name: "Shell", arguments: "{\"command\":\"cat <(curl https://example.com)\"}" } },
    },
    {
      type: "tool_call",
      subtype: "started",
      call_id: "nested-process-substitution",
      tool_call: {
        function: {
          name: "Shell",
          arguments: "{\"command\":\"diff <(printf ok) >(env MODE=test command /usr/bin/bash -c 'cat <(command /usr/bin/curl https://example.com)')\"}",
        },
      },
    },
    {
      type: "tool_call",
      subtype: "started",
      call_id: "benign-process-substitution",
      tool_call: { function: { name: "Shell", arguments: "{\"command\":\"cat <(printf '%s\\\\n' ok)\"}" } },
    },
    {
      type: "tool_call",
      subtype: "started",
      call_id: "inert-process-substitution",
      tool_call: { function: { name: "Shell", arguments: "{\"command\":\"printf '%s' 'cat <(curl https://example.com)'\"}" } },
    },
    { type: "result", subtype: "success" },
  ];
  const normalized = normalizeCliNdjson(events.map(JSON.stringify).join("\n"));
  assert.deepEqual(normalized.toolCalls.map(({ callId, toolName }) => [callId, toolName]), [
    ["absolute-curl", "Shell"],
    ["benign-process-substitution", "Shell"],
    ["benign-shell", "shellToolCall"],
    ["command-curl", "Shell"],
    ["fetch", "webFetchToolCall"],
    ["inert-process-substitution", "Shell"],
    ["mcp", "mcp__docs__search"],
    ["nested-process-substitution", "Shell"],
    ["process-substitution", "Shell"],
    ["quoted-control", "Shell"],
    ["shell", "Shell"],
    ["unknown", "futureToolCall"],
    ["wrapped-git", "Shell"],
  ]);
  assert.deepEqual(normalized.networkAttempts.map(({ callId, kind }) => [callId, kind]), [
    ["absolute-curl", "shell-network-client"],
    ["command-curl", "shell-network-client"],
    ["fetch", "direct-network-tool"],
    ["mcp", "direct-network-tool"],
    ["nested-process-substitution", "shell-network-client"],
    ["process-substitution", "shell-network-client"],
    ["shell", "shell-network-client"],
    ["wrapped-git", "shell-network-client"],
  ]);
});

test("malformed executable process substitution fails closed", () => {
  const source = JSON.stringify({
    type: "tool_call",
    subtype: "started",
    call_id: "malformed-process-substitution",
    tool_call: { function: { name: "Shell", arguments: "{\"command\":\"cat <(curl https://example.com\"}" } },
  });

  assert.deepEqual(normalizeCliNdjson(source).networkAttempts, [{
    callId: "malformed-process-substitution",
    toolName: "Shell",
    kind: "malformed-shell-syntax",
    client: "unknown",
  }]);
});

test("Cursor CLI adapter captures streams and invalidates timeout, nonzero, and missing results", async () => {
  const root = await mkdtemp(join(tmpdir(), "cursor-adapter-"));
  const makeContext = async (name, mode) => {
    const workspacePath = join(root, name, "workspace");
    const cursorHomePath = join(root, name, "cursor-home");
    const artifactPath = join(root, name, "artifacts");
    await Promise.all([
      mkdir(workspacePath, { recursive: true }),
      mkdir(cursorHomePath, { recursive: true }),
      mkdir(artifactPath, { recursive: true }),
    ]);
    const sandboxPolicy = await writeTrialSandboxPolicy(workspacePath);
    return {
      workspacePath,
      cursorHomePath,
      artifactPath,
      prompt: "mock prompt",
      sandboxPolicy,
      environment: {
        CURSOR_HARNESS_MOCK_AGENT_MODE: mode,
        CURSOR_HARNESS_MOCK_CAPTURE_PATH: join(artifactPath, "invocation.json"),
        CURSOR_API_KEY: "must-not-be-inherited",
        AWS_SECRET_ACCESS_KEY: "must-not-be-inherited",
      },
      captureWorkspaceBaseline: async () => {},
    };
  };
  const adapter = createCursorCliAdapter({
    binary: process.execPath,
    prefixArguments: [mockAgent],
    capabilities: { print: true, streamJson: true, pluginDir: false, sandbox: true },
    timeoutMs: 100,
  });

  const success = await adapter.run(await makeContext("success", "success"));
  assert.equal(success.status, "completed");
  assert.equal(success.metrics.toolCalls.value, 1);
  assert.deepEqual(success.metrics.maxConcurrentSubagents, {
    status: "unavailable",
    reason: "correlation-unavailable",
  });
  assert.match(await readFile(success.artifacts.stdout, "utf8"), /"type":"result"/);
  assert.equal(
    await readFile(success.artifacts.ndjson, "utf8"),
    await readFile(success.artifacts.stdout, "utf8"),
  );
  assert.match(await readFile(success.artifacts.stderr, "utf8"), /mock-agent-stderr/);
  const invocation = JSON.parse(await readFile(join(root, "success", "artifacts", "invocation.json"), "utf8"));
  assert.deepEqual(invocation.argv.slice(0, 6), [
    "--print",
    "--output-format",
    "stream-json",
    "--sandbox",
    "enabled",
    "mock prompt",
  ]);
  assert.equal(invocation.cursorConfigDir, join(root, "success", "cursor-home"));
  assert.equal(invocation.cursorConfigHome, null);
  assert.deepEqual(invocation.inheritedSensitiveEnvironment, []);
  assert.equal(success.networkEnforcement.status, "enforced");
  assert.equal(
    success.networkEnforcement.policySha256Before,
    success.networkEnforcement.policySha256After,
  );
  assert.equal(success.capabilityLimitations.some(({ capability }) => capability === "network-denial"), false);

  assert.equal((await adapter.run(await makeContext("timeout", "timeout"))).status, "timed-out");
  assert.equal((await adapter.run(await makeContext("nonzero", "nonzero"))).status, "failed");
  assert.equal((await adapter.run(await makeContext("missing", "missing-result"))).status, "invalid");
  const mutatedPolicy = await adapter.run(await makeContext("mutated-policy", "mutate-policy"));
  assert.equal(mutatedPolicy.networkEnforcement.status, "error");
  const missingPolicy = await makeContext("missing-policy", "success");
  await rm(missingPolicy.sandboxPolicy.path);
  await assert.rejects(adapter.run(missingPolicy), /exact per-trial Cursor sandbox policy/);
  await assert.rejects(
    adapter.run({ ...await makeContext("plugin", "success"), livePluginRoot: join(root, "plugin") }),
    /--plugin-dir/,
  );
});

test("evaluator evidence detects protected canary tampering", async () => {
  const { root, fixture } = await makeFixtureRoot();
  const fixtureDirectory = join(root, "fixtures", "case");
  const workspacePath = join(root, "workspace");
  const artifacts = join(root, "artifacts");
  await mkdir(workspacePath);
  await mkdir(artifacts);
  await writeFile(join(workspacePath, "answer.txt"), "correct\n");
  const before = await captureIntegrity({ fixture, fixtureDirectory });
  await writeFile(join(fixtureDirectory, "canaries", "secret-canary"), "tampered\n");
  const result = await runEvaluators({
    fixture,
    fixtureDirectory,
    workspacePath,
    artifactPath: artifacts,
    beforeIntegrity: before,
  });

  assert.equal(result.evaluators[0].outcome, "pass");
  assert.ok(result.tamperOutcomes.some((outcome) => outcome.target.includes("secret-canary") && outcome.outcome === "modified"));
  assert.ok(result.evaluators.every((outcome) => /^[a-f0-9]{64}$/.test(outcome.evidenceSha256)));
  assert.ok(result.securityOutcomes.some(
    (outcome) => outcome.controlId === "network-denial" && outcome.outcome === "error",
  ));

  const enforced = await runEvaluators({
    fixture,
    fixtureDirectory,
    workspacePath,
    artifactPath: artifacts,
    networkEnforcement: {
      status: "enforced",
      policySha256Before: "a".repeat(64),
      policySha256After: "a".repeat(64),
      source: "workspace:.cursor/sandbox.json",
      sandboxMode: "enabled",
      cliSandboxArgument: "--sandbox=enabled",
    },
    networkAttempts: [{ callId: "fetch-1", toolName: "webFetchToolCall", kind: "direct-network-tool" }],
  });
  assert.ok(enforced.securityOutcomes.some(
    (outcome) => outcome.controlId === "network-denial" && outcome.outcome === "pass",
  ));
  assert.ok(enforced.securityOutcomes.some(
    (outcome) => outcome.controlId === "network-tool-invocation" && outcome.outcome === "violation",
  ));
});

test("evaluator bundle is verified before any evaluator process can run", async () => {
  const { root, fixture } = await makeFixtureRoot();
  const fixtureDirectory = join(root, "fixtures", "case");
  const workspacePath = join(root, "preverification-workspace");
  const artifactPath = join(root, "preverification-artifacts");
  const markerPath = join(artifactPath, "forbidden-marker");
  await Promise.all([mkdir(workspacePath), mkdir(artifactPath)]);
  const beforeIntegrity = await captureIntegrity({ fixture, fixtureDirectory });
  await writeFile(
    join(fixtureDirectory, "evaluators", "mock-evaluator.mjs"),
    "import { writeFileSync } from 'node:fs'; writeFileSync(process.argv[2], 'spawned');\n",
  );
  fixture.evaluators[0].command.arguments = ["mock-evaluator.mjs", markerPath];

  await assert.rejects(
    runEvaluators({
      fixture,
      fixtureDirectory,
      workspacePath,
      artifactPath,
      beforeIntegrity,
    }),
    /evaluator bundle digest mismatch before execution/u,
  );
  await assert.rejects(readFile(markerPath), /ENOENT/u);
});

test("pre-execution evaluator digest mismatch emits reportable invalid records bound to input", async () => {
  const { root, manifestPath } = await makeFixtureRoot();
  const fixturePath = join(root, "fixtures", "case", "fixture.json");
  const fixtureContract = JSON.parse(await readFile(fixturePath, "utf8"));
  fixtureContract.evaluators.push({
    ...structuredClone(fixtureContract.evaluators[0]),
    id: "security-check",
    kind: "security",
    severity: "critical-security",
  });
  await writeFile(fixturePath, `${JSON.stringify(fixtureContract, null, 2)}\n`);
  const loaded = await readBenchmarkManifest(manifestPath);
  const evaluatorPath = join(root, "fixtures", "case", "evaluators", "mock-evaluator.mjs");
  const originalEvaluator = await readFile(evaluatorPath, "utf8");
  await writeFile(evaluatorPath, `${originalEvaluator}\n// pre-execution mutation\n`);
  const digest = "a".repeat(64);
  const adapter = {
    adapterKind: "integrity-preflight-mock",
    async run({ captureWorkspaceBaseline }) {
      await captureWorkspaceBaseline();
      return {
        status: "completed",
        exitCode: 0,
        metrics: {
          wallDurationMs: metric(1),
          toolCalls: { status: "observed", value: 0, source: "documented-stream-json" },
          subagentCalls: { status: "unavailable", reason: "correlation-unavailable" },
          maxConcurrentSubagents: { status: "unavailable", reason: "correlation-unavailable" },
          inputTokens: { status: "unavailable", reason: "not-emitted" },
          outputTokens: { status: "unavailable", reason: "not-emitted" },
          totalTokens: { status: "unavailable", reason: "not-emitted" },
        },
        networkEnforcement: {
          status: "enforced",
          policySha256Before: digest,
          policySha256After: digest,
          source: "workspace:.cursor/sandbox.json",
          sandboxMode: "enabled",
          cliSandboxArgument: "--sandbox=enabled",
        },
        networkAttempts: [],
        findings: [],
      };
    },
  };
  const execution = await runBenchmark({
    loadedManifest: loaded,
    agentAdapter: adapter,
    runId: "preflight-digest-run",
    outputRoot: join(root, "preflight-digest-output"),
  });

  validateResultRecords(execution.results, {
    loadedManifest: loaded,
    runId: "preflight-digest-run",
  });
  for (const armResult of execution.results.flatMap((pair) => [pair.harnessOff, pair.harnessOn])) {
    assert.equal(armResult.status, "invalid");
    assert.equal(armResult.correctness, "error");
    assert.deepEqual(
      new Set(armResult.tamperOutcomes.map(({ target }) => target)),
      new Set(loaded.fixtures[0].integrityEvidence.keys()),
    );
    assert.deepEqual(
      new Set(armResult.securityOutcomes.map(({ controlId }) => controlId)),
      new Set([
        "network-denial",
        "network-tool-invocation",
        "workspace-write-contract",
        "security-check",
      ]),
    );
    assert.ok(armResult.securityOutcomes.every(({ outcome }) => outcome === "error"));
    for (const outcome of armResult.tamperOutcomes) {
      assert.equal(outcome.outcome, "error");
      assert.equal(
        outcome.expectedSha256,
        loaded.fixtures[0].integrityEvidence.get(outcome.target),
      );
    }
  }

  await writeFile(evaluatorPath, originalEvaluator);
  const lifecyclePath = join(root, "plugin-lifecycle.json");
  await writeFile(lifecyclePath, `${JSON.stringify({
    schemaVersion: "1.0.0",
    command: "npm run plugin:lifecycle:verify",
    temporaryCursorRoot: true,
    pluginSourceSha256: "d".repeat(64),
    lifecycleStatuses: ["installed", "unchanged", "repaired", "uninstalled"],
    removalVerified: true,
  }, null, 2)}\n`);
  const reportPrefix = join(root, "preflight-digest-report");
  const accepted = spawnSync(process.execPath, [
    join(repositoryRoot, "benchmark/report.mjs"),
    manifestPath,
    execution.recordPath,
    "--generated-at",
    "2026-07-20T15:00:00.000Z",
    "--output-prefix",
    reportPrefix,
    "--plugin-lifecycle-evidence-file",
    lifecyclePath,
  ], { cwd: repositoryRoot, encoding: "utf8" });
  assert.equal(accepted.status, 0, accepted.stderr);
  const report = JSON.parse(await readFile(`${reportPrefix}.json`, "utf8"));
  assert.equal(report.execution.invalidTrials, 4);
  assert.equal(report.eligibility.eligible, false);
  assert.deepEqual(report.eligibility.gates.pluginLifecycle, {
    status: "pass",
    evidence: `command=npm run plugin:lifecycle:verify;artifact=${lifecyclePath}`,
  });

  await writeFile(join(root, "fixtures", "case", "seed", "public.txt"), "different pinned corpus\n");
  const rejected = spawnSync(process.execPath, [
    join(repositoryRoot, "benchmark/report.mjs"),
    manifestPath,
    execution.recordPath,
    "--output-prefix",
    join(root, "foreign-input-report"),
    "--plugin-lifecycle-evidence-file",
    lifecyclePath,
  ], { cwd: repositoryRoot, encoding: "utf8" });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /inputDigest does not match the loaded benchmark input/u);
});

test("injected mock adapter runs isolated paired trials and appends records", async () => {
  const { root, manifestPath } = await makeFixtureRoot();
  const loaded = await readBenchmarkManifest(manifestPath);
  const adapter = {
    adapterKind: "mock",
    async run({ workspacePath, captureWorkspaceBaseline }) {
      await captureWorkspaceBaseline();
      await writeFile(join(workspacePath, "answer.txt"), "correct\n");
      return {
        status: "completed",
        exitCode: 0,
        metrics: {
          wallDurationMs: metric(20),
          toolCalls: { status: "observed", value: 1, source: "documented-stream-json" },
          subagentCalls: { status: "unavailable", reason: "correlation-unavailable" },
          maxConcurrentSubagents: { status: "unavailable", reason: "correlation-unavailable" },
          inputTokens: { status: "unavailable", reason: "not-emitted" },
          outputTokens: { status: "unavailable", reason: "not-emitted" },
          totalTokens: { status: "unavailable", reason: "not-emitted" },
        },
        findings: [],
      };
    },
  };
  const execution = await runBenchmark({
    loadedManifest: loaded,
    agentAdapter: adapter,
    runId: "integration-run",
    outputRoot: join(root, "output"),
  });

  assert.equal(execution.results.length, 2);
  assert.ok(execution.results.every((pair) => pair.matchedCorrect));
  assert.ok(execution.results.every((pair) => pair.inputDigest === loaded.inputDigest));
  const records = (await readFile(execution.recordPath, "utf8")).trim().split("\n").map(JSON.parse);
  assert.equal(records.length, 2);
  assert.equal(new Set(records.map((record) => record.pairId)).size, 2);
});

test("append and manifest-aware validation reject records from another benchmark input", async () => {
  const { root, manifestPath } = await makeFixtureRoot();
  const loaded = await readBenchmarkManifest(manifestPath);
  const plan = deriveRunPlan(loaded, { runId: "input-bound-run" });
  const integrityBaseline = await captureIntegrity({
    fixture: loaded.fixtures[0].manifest,
    fixtureDirectory: loaded.fixtures[0].fixtureDirectory,
  });
  const pair = plan.pairs[0];
  const result = buildPairResult({
    inputDigest: "f".repeat(64),
    runId: pair.runId,
    pairId: pair.pairId,
    fixtureId: pair.fixtureId,
    fixtureCategory: pair.fixtureEntry.manifest.category,
    armOrder: pair.armOrder,
    harnessOff: contractBoundArm(
      pair.trials["harness-off"].trialId,
      pair.fixtureEntry.manifest,
      integrityBaseline,
    ),
    harnessOn: contractBoundArm(
      pair.trials["harness-on"].trialId,
      pair.fixtureEntry.manifest,
      integrityBaseline,
    ),
  });

  assert.throws(
    () => validateResultRecords([result, {
      ...structuredClone(result),
      pairId: plan.pairs[1].pairId,
      armOrder: plan.pairs[1].armOrder,
      harnessOff: {
        ...structuredClone(result.harnessOff),
        trialId: plan.pairs[1].trials["harness-off"].trialId,
      },
      harnessOn: {
        ...structuredClone(result.harnessOn),
        trialId: plan.pairs[1].trials["harness-on"].trialId,
      },
    }], { loadedManifest: loaded, runId: "input-bound-run" }),
    /inputDigest does not match the loaded benchmark input/u,
  );
  await assert.rejects(
    appendResultRecord(join(root, "foreign.ndjson"), result, { loadedManifest: loaded }),
    /inputDigest does not match the loaded benchmark input/u,
  );
  await assert.rejects(readFile(join(root, "foreign.ndjson")), /ENOENT/u);
});

test("unexpected writes, deletions, and prompt mutation invalidate trials", async () => {
  const { root, manifestPath } = await makeFixtureRoot();
  const loaded = await readBenchmarkManifest(manifestPath);
  const adapter = {
    adapterKind: "tampering-mock",
    async run({ workspacePath, captureWorkspaceBaseline }) {
      await captureWorkspaceBaseline();
      await Promise.all([
        writeFile(join(workspacePath, "unexpected.txt"), "unexpected\n"),
        writeFile(join(workspacePath, ".cursor-harness", "prompt.txt"), "mutated\n"),
        rm(join(workspacePath, "public.txt")),
      ]);
      return {
        status: "failed",
        metrics: {
          wallDurationMs: metric(1),
          toolCalls: { status: "observed", value: 0, source: "documented-stream-json" },
          subagentCalls: { status: "unavailable", reason: "correlation-unavailable" },
          maxConcurrentSubagents: { status: "unavailable", reason: "correlation-unavailable" },
          inputTokens: { status: "unavailable", reason: "not-emitted" },
          outputTokens: { status: "unavailable", reason: "not-emitted" },
          totalTokens: { status: "unavailable", reason: "not-emitted" },
        },
        findings: [],
      };
    },
  };
  const result = await runBenchmark({
    loadedManifest: loaded,
    agentAdapter: adapter,
    runId: "tamper-run",
    outputRoot: join(root, "tamper-output"),
  });
  for (const armResult of result.results.flatMap((pair) => [pair.harnessOff, pair.harnessOn])) {
    assert.equal(armResult.status, "invalid");
    assert.equal(armResult.correctness, "error");
    assert.ok(armResult.securityOutcomes.some(
      (outcome) => outcome.controlId === "workspace-write-contract" && outcome.outcome === "violation",
    ));
    assert.ok(armResult.tamperOutcomes.some((outcome) => outcome.outcome === "unexpected"));
    assert.ok(armResult.tamperOutcomes.some((outcome) => outcome.outcome === "missing"));
    assert.ok(armResult.tamperOutcomes.some((outcome) => outcome.target.endsWith("/prompt.txt")));
  }
});

test("reports use matched-correct speed only, enforce gates, and render deterministically", () => {
  const pairs = Array.from({ length: 8 }, (_, index) => buildPairResult({
    inputDigest: "b".repeat(64),
    runId: "run",
    pairId: `pair-${index}`,
    fixtureId: `case-${index}`,
    fixtureCategory: "localized-correctness",
    armOrder: index % 2 ? "on-then-off" : "off-then-on",
    harnessOff: arm(`off-${index}`, { duration: 120 }),
    harnessOn: arm(`on-${index}`, { duration: 100 }),
  }));
  pairs.push(buildPairResult({
    inputDigest: "b".repeat(64),
    runId: "run",
    pairId: "incorrect-fast",
    fixtureId: "bad-case",
    fixtureCategory: "localized-correctness",
    armOrder: "off-then-on",
    harnessOff: arm("off-bad", { correct: false, duration: 10 }),
    harnessOn: arm("on-bad", { correct: false, duration: 1 }),
  }));
  for (const armResult of [
    pairs[0].harnessOff,
    pairs[0].harnessOn,
    pairs.at(-1).harnessOff,
    pairs.at(-1).harnessOn,
  ]) {
    armResult.evaluators.push({
      evaluatorId: "quality",
      kind: "objective-quality",
      severity: "objective-quality",
      outcome: "pass",
      expectedExitCode: 0,
      actualExitCode: 0,
      contractSha256: "a".repeat(64),
      evidenceSha256: "a".repeat(64),
    });
  }
  pairs[0].harnessOn.adapter.limitations.push({
    capability: "network-denial",
    reason: "This synthetic arm omitted sandbox evidence.",
  });
  pairs[0].speedComparison.speedupRatio = 999;

  assert.throws(() => aggregateReport({
    benchmarkId: "benchmark",
    profile: "custom",
    inputDigest: "b".repeat(64),
    generatedAt: "2026-07-20T15:00:00.000Z",
    plannedPairs: 9,
    pairs,
    pluginLifecycle: { status: "pass", evidence: "mock lifecycle" },
  }), /speedComparison is inconsistent/u);
  pairs[0].speedComparison.speedupRatio = 1.2;

  const report = aggregateReport({
    benchmarkId: "benchmark",
    profile: "custom",
    inputDigest: "b".repeat(64),
    generatedAt: "2026-07-20T15:00:00.000Z",
    plannedPairs: 9,
    pairs,
    pluginLifecycle: { status: "pass", evidence: "mock lifecycle" },
  });
  assert.equal(report.speed.claim, "improvement-proven");
  assert.equal(report.speed.matchedCorrectPairIds.includes("incorrect-fast"), false);
  assert.equal(report.speed.geometricMeanSpeedup, 1.2);
  assert.equal(report.eligibility.gates.correctnessEligibilityFloor.status, "pass");
  assert.ok(report.limitations.some(
    (limitation) => limitation.scope === "profile" && limitation.id === "custom",
  ));
  assert.ok(report.limitations.some(
    (limitation) => limitation.scope === "category" && limitation.id === "localized-correctness",
  ));
  assert.ok(report.limitations.some(
    (limitation) => limitation.scope === "adapter" && limitation.id === "mock:network-denial",
  ));
  assert.deepEqual(report.objectiveQuality, {
    passed: 2,
    failed: 0,
    errors: 0,
    passRate: 1,
    eligibleTrials: 2,
    excludedIncorrectTrials: 2,
    excludedInvalidTrials: 0,
    totalTrials: 4,
  });
  assert.deepEqual(renderReportJson(report), renderReportJson(structuredClone(report)));
  assert.equal(renderReportMarkdown(report), renderReportMarkdown(structuredClone(report)));
  const reordered = aggregateReport({
    benchmarkId: "benchmark",
    profile: "custom",
    inputDigest: "b".repeat(64),
    generatedAt: "2026-07-20T15:00:00.000Z",
    plannedPairs: 9,
    pairs: [...pairs].reverse(),
    pluginLifecycle: { status: "pass", evidence: "mock lifecycle" },
  });
  assert.equal(renderReportJson(report), renderReportJson(reordered));

  const networkAttemptControl = pairs[0].harnessOn.securityOutcomes
    .find(({ controlId }) => controlId === "network-tool-invocation");
  pairs[0].harnessOn.networkAttemptEvidence = {
    status: "observed",
    count: 1,
    sha256: "c".repeat(64),
  };
  networkAttemptControl.outcome = "violation";
  networkAttemptControl.evidence = `network-attempts=1;sha256=${"c".repeat(64)}`;
  const networkAttemptBlocked = aggregateReport({
    benchmarkId: "benchmark",
    profile: "custom",
    inputDigest: "b".repeat(64),
    generatedAt: "2026-07-20T15:00:00.000Z",
    plannedPairs: 9,
    pairs,
    pluginLifecycle: { status: "pass", evidence: "mock lifecycle" },
  });
  assert.equal(networkAttemptBlocked.eligibility.gates.criticalSecurity.status, "fail");
  assert.equal(networkAttemptBlocked.eligibility.eligible, false);
  pairs[0].harnessOn.networkAttemptEvidence = {
    status: "observed",
    count: 0,
    sha256: sha256("[]"),
  };
  networkAttemptControl.outcome = "pass";
  networkAttemptControl.evidence = `network-attempts=0;sha256=${sha256("[]")}`;

  pairs[0].harnessOn.networkEnforcement = {
    status: "error",
    policySha256Before: null,
    policySha256After: null,
    source: "workspace:.cursor/sandbox.json",
    sandboxMode: "unknown",
    cliSandboxArgument: null,
    reason: "no deterministic network sandbox",
  };
  pairs[0].harnessOn.securityOutcomes[0].outcome = "error";
  pairs[0].harnessOn.securityOutcomes[0].evidence =
    `network-enforcement-sha256=${sha256(JSON.stringify(pairs[0].harnessOn.networkEnforcement))}`;
  const ineligible = aggregateReport({
    benchmarkId: "benchmark",
    profile: "custom",
    inputDigest: "b".repeat(64),
    generatedAt: "2026-07-20T15:00:00.000Z",
    plannedPairs: 9,
    pairs,
    pluginLifecycle: { status: "pass", evidence: "mock lifecycle" },
  });
  assert.equal(ineligible.eligibility.eligible, false);
  assert.equal(ineligible.speed.claim, "not-proven");
  assert.equal(ineligible.speed.reason, "benchmark-ineligible");

  const incomplete = aggregateReport({
    benchmarkId: "benchmark",
    profile: "custom",
    inputDigest: "b".repeat(64),
    generatedAt: "2026-07-20T15:00:00.000Z",
    plannedPairs: 10,
    pairs: pairs.slice(1),
    pluginLifecycle: { status: "pass", evidence: "mock lifecycle" },
  });
  assert.equal(incomplete.execution.invalidPairs > 0, true);
  assert.equal(incomplete.eligibility.gates.telemetryAndEvaluatorIntegrity.status, "fail");
});

test("zero duration in either arm is duration-unavailable and never matched-correct", () => {
  for (const [offDuration, onDuration] of [[0, 100], [100, 0]]) {
    const pair = buildPairResult({
      inputDigest: "b".repeat(64),
      runId: "zero-duration-run",
      pairId: `zero-${offDuration}-${onDuration}`,
      fixtureId: "zero-duration",
      fixtureCategory: "localized-correctness",
      armOrder: "off-then-on",
      harnessOff: arm("off", { duration: offDuration }),
      harnessOn: arm("on", { duration: onDuration }),
    });
    assert.equal(pair.matchedCorrect, false);
    assert.deepEqual(pair.speedComparison, {
      status: "not-comparable",
      reason: "duration-unavailable",
    });
  }
});

test("report validation rejects forged records before aggregation", async () => {
  const { root, manifestPath } = await makeFixtureRoot();
  const loaded = await readBenchmarkManifest(manifestPath);
  const fixture = loaded.fixtures[0].manifest;
  fixture.evaluators.push({
    ...structuredClone(fixture.evaluators[0]),
    id: "security-check",
    kind: "security",
    severity: "critical-security",
  });
  const integrityBaseline = await captureIntegrity({
    fixture,
    fixtureDirectory: join(root, "fixtures", "case"),
  });
  const plan = deriveRunPlan(loaded, { runId: "guarded-run" });
  const valid = plan.pairs.map((pair) => buildPairResult({
    inputDigest: loaded.inputDigest,
    runId: pair.runId,
    pairId: pair.pairId,
    fixtureId: pair.fixtureId,
    fixtureCategory: pair.fixtureEntry.manifest.category,
    armOrder: pair.armOrder,
    harnessOff: contractBoundArm(pair.trials["harness-off"].trialId, fixture, integrityBaseline),
    harnessOn: contractBoundArm(pair.trials["harness-on"].trialId, fixture, integrityBaseline),
  }));
  assert.deepEqual(validateResultRecords(valid, { loadedManifest: loaded, runId: "guarded-run" }), valid);

  const mutations = [
    ["empty evaluator outcomes", (pair) => { pair.harnessOn.evaluators = []; }, /evaluators must not be empty/u],
    ["empty security outcomes", (pair) => { pair.harnessOn.securityOutcomes = []; }, /securityOutcomes must not be empty/u],
    ["empty tamper outcomes", (pair) => { pair.harnessOn.tamperOutcomes = []; }, /tamperOutcomes must not be empty/u],
    ["forged correctness", (pair) => {
      pair.harnessOn.evaluators[0].outcome = "fail";
      pair.harnessOn.evaluators[0].actualExitCode = 1;
    }, /correctness does not match evaluator outcomes/u],
    ["unplanned pair", (pair) => { pair.pairId = "guarded-run:case:99:pair"; }, /exact expected pair set/u],
    ["wrong fixture", (pair) => { pair.fixtureId = "other"; }, /fixtureId does not match the run plan/u],
    ["wrong category", (pair) => { pair.fixtureCategory = "objective-quality"; }, /fixtureCategory does not match the run plan/u],
    ["wrong arm order", (pair) => {
      pair.armOrder = pair.armOrder === "off-then-on" ? "on-then-off" : "off-then-on";
    }, /armOrder does not match the run plan/u],
    ["wrong run identity", (pair) => { pair.runId = "other-run"; }, /runId does not match expected run/u],
    ["wrong input digest", (pair) => { pair.inputDigest = "f".repeat(64); }, /inputDigest does not match the loaded benchmark input/u],
    ["wrong trial identity", (pair) => { pair.harnessOff.trialId = "other-trial"; }, /harnessOff.trialId does not match the run plan/u],
    ["forged evaluator contract digest", (pair) => {
      pair.harnessOn.evaluators[0].contractSha256 = "f".repeat(64);
    }, /contractSha256 does not match the fixture evaluator contract/u],
    ["forged evaluator kind", (pair) => {
      pair.harnessOn.evaluators[0].kind = "tamper";
    }, /kind does not match the fixture evaluator contract/u],
    ["missing expected evaluator", (pair) => {
      pair.harnessOn.evaluators.pop();
    }, /evaluator set does not match the fixture contract/u],
    ["duplicate evaluator", (pair) => {
      pair.harnessOn.evaluators.push(structuredClone(pair.harnessOn.evaluators[0]));
    }, /duplicate evaluatorId/u],
    ["missing mandatory security control", (pair) => {
      pair.harnessOn.securityOutcomes = pair.harnessOn.securityOutcomes
        .filter(({ controlId }) => controlId !== "workspace-write-contract");
    }, /security control set does not match the fixture contract/u],
    ["duplicate security control", (pair) => {
      pair.harnessOn.securityOutcomes.push(structuredClone(pair.harnessOn.securityOutcomes[0]));
    }, /duplicate security control/u],
    ["forged evaluator security outcome", (pair) => {
      const security = pair.harnessOn.securityOutcomes.find(({ controlId }) => controlId === "security-check");
      security.evidence = "forged evaluator evidence";
    }, /does not correspond to evaluator evidence/u],
    ["forged network enforcement outcome", (pair) => {
      const security = pair.harnessOn.securityOutcomes
        .find(({ controlId }) => controlId === "network-denial");
      security.outcome = "error";
    }, /network-denial does not correspond to networkEnforcement/u],
    ["forged network enforcement evidence", (pair) => {
      const security = pair.harnessOn.securityOutcomes
        .find(({ controlId }) => controlId === "network-denial");
      security.evidence = "network-enforcement-sha256=f".concat("f".repeat(63));
    }, /network-denial does not correspond to networkEnforcement/u],
    ["forged network attempt count", (pair) => {
      pair.harnessOn.networkAttemptEvidence.count = 1;
    }, /network-tool-invocation does not correspond to networkAttemptEvidence/u],
    ["forged network attempt outcome", (pair) => {
      const security = pair.harnessOn.securityOutcomes
        .find(({ controlId }) => controlId === "network-tool-invocation");
      security.outcome = "violation";
    }, /network-tool-invocation does not correspond to networkAttemptEvidence/u],
    ["missing required tamper target", (pair) => {
      pair.harnessOn.tamperOutcomes = pair.harnessOn.tamperOutcomes
        .filter(({ target }) => target !== "evaluator-bundle");
    }, /tamper target set does not match the fixture integrity contract/u],
    ["duplicate tamper target", (pair) => {
      pair.harnessOn.tamperOutcomes.push(structuredClone(pair.harnessOn.tamperOutcomes[0]));
    }, /duplicate tamper target/u],
    ["status mismatch", (pair) => { pair.harnessOn.status = "failed"; }, /correctness does not match.*status/u],
    ["matched flag mismatch", (pair) => { pair.matchedCorrect = false; }, /matchedCorrect is inconsistent/u],
    ["speed fields mismatch", (pair) => { pair.speedComparison.speedupRatio = 999; }, /speedComparison is inconsistent/u],
  ];
  for (const [label, mutate, pattern] of mutations) {
    const forged = structuredClone(valid);
    mutate(forged[0]);
    assert.throws(
      () => validateResultRecords(forged, { loadedManifest: loaded, runId: "guarded-run" }),
      pattern,
      label,
    );
  }

  assert.throws(
    () => validateResultRecords([valid[0], structuredClone(valid[0])], {
      loadedManifest: loaded,
      runId: "guarded-run",
    }),
    /duplicate pairId/u,
  );
  assert.throws(
    () => validateResultRecords([], { loadedManifest: loaded, runId: "guarded-run" }),
    /must not be empty/u,
  );
  assert.throws(
    () => validateResultRecords(valid.slice(0, 1), { loadedManifest: loaded, runId: "guarded-run" }),
    /must contain the exact expected pair set/u,
  );
});

test("exact forged 36-pair CLI record set is rejected before reporting", async () => {
  const loaded = await readBenchmarkManifest(join(repositoryRoot, "benchmark/release-72.v1.json"));
  const unavailable = { status: "unavailable", reason: "not-emitted" };
  const forgedArm = (trialId, duration) => ({
    trialId,
    status: "completed",
    correctness: "pass",
    evaluators: [],
    securityOutcomes: [],
    tamperOutcomes: [],
    metrics: {
      wallDurationMs: { status: "observed", value: duration, source: "monotonic-clock" },
      toolCalls: unavailable,
      subagentCalls: unavailable,
      maxConcurrentSubagents: unavailable,
      inputTokens: unavailable,
      outputTokens: unavailable,
      totalTokens: unavailable,
    },
    findings: [],
    adapter: { kind: "forged", limitations: [] },
  });
  const forged = loaded.fixtures.flatMap(({ manifest }) => Array.from({ length: 3 }, (_, index) => ({
    pairId: `fake-${manifest.fixtureId}-${index}`,
    fixtureId: manifest.fixtureId,
    fixtureCategory: manifest.category,
    harnessOff: forgedArm(`off-${manifest.fixtureId}-${index}`, 120),
    harnessOn: forgedArm(`on-${manifest.fixtureId}-${index}`, 100),
  })));
  assert.equal(forged.length, 36);
  assert.throws(() => aggregateReport({
    benchmarkId: loaded.manifest.benchmarkId,
    profile: "release-72",
    inputDigest: loaded.inputDigest,
    generatedAt: "2026-07-20T15:00:00.000Z",
    plannedPairs: 36,
    pairs: forged,
    plannedFixtures: loaded.fixtures.map(({ manifest }) => ({
      fixtureId: manifest.fixtureId,
      category: manifest.category,
    })),
    repetitions: 3,
    pluginLifecycle: { status: "pass", evidence: "forged lifecycle" },
  }), /result record/u);

  const temporaryRoot = await mkdtemp(join(tmpdir(), "forged-report-"));
  try {
    const records = join(temporaryRoot, "results.ndjson");
    await writeFile(records, `${forged.map(JSON.stringify).join("\n")}\n`);
    const child = spawnSync(process.execPath, [
      join(repositoryRoot, "benchmark/report.mjs"),
      join(repositoryRoot, "benchmark/release-72.v1.json"),
      records,
      "--generated-at",
      "2026-07-20T15:00:00.000Z",
      "--output-prefix",
      join(temporaryRoot, "report"),
      "--plugin-lifecycle",
      "pass",
      "--plugin-lifecycle-evidence",
      "claimed",
    ], { cwd: repositoryRoot, encoding: "utf8" });
    assert.equal(child.status, 1);
    assert.match(child.stderr, /result record 1.*schemaVersion/u);
    await assert.rejects(readFile(join(temporaryRoot, "report.json")), /ENOENT/u);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
