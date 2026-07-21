// Tests for scripts/probe-cli-telemetry.mjs.
//
// IMPORTANT: every sample and CLI double in this file is SYNTHETIC. The
// `synthetic-stream-json-*.ndjson` fixtures are illustrative of the stream-json
// line format only. They are NOT captured Cursor CLI output and they are not
// evidence for or against any telemetry claim. Only an operator running this
// probe against a real authenticated CLI can produce evidence.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { chmod, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { sha256 } from "../../benchmark/lib/util.mjs";
import { SANDBOX_PATH, SANDBOX_POLICY_BYTES } from "../../benchmark/lib/workspace.mjs";
import {
  analyzeStreamJson,
  assertCliSupportsStreamJson,
  EVIDENCE_KIND,
  EVIDENCE_SCHEMA_VERSION,
  parseArguments,
  runTelemetryProbe,
} from "../../scripts/probe-cli-telemetry.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, "../..");
const probeScript = join(repositoryRoot, "scripts", "probe-cli-telemetry.mjs");
const bareSamplePath = join(here, "fixtures", "synthetic-stream-json-sample.ndjson");
const telemetrySamplePath = join(here, "fixtures", "synthetic-stream-json-with-telemetry-sample.ndjson");

const MOCK_HELP = [
  "Usage: agent [options] [prompt]",
  "  -p, --print",
  "  --output-format <format>   text, json, stream-json",
  "  --sandbox <mode>",
  "  --plugin-dir <path>",
].join("\n");

async function makeMockCli(root, { mode = "success", samplePath = bareSamplePath, help = MOCK_HELP } = {}) {
  const path = join(root, "synthetic-mock-cursor-cli.mjs");
  const source = `#!/usr/bin/env node
import { readFileSync } from "node:fs";
const mode = ${JSON.stringify(mode)};
const argv = process.argv.slice(2);
if (argv[0] === "--help") { process.stdout.write(${JSON.stringify(help)} + "\\n"); process.exit(0); }
if (argv[0] === "--version") { process.stdout.write("synthetic-mock 9.9.9\\n"); process.exit(0); }
if (argv[0] === "status") {
  if (mode === "unauthenticated") { process.stderr.write("not logged in\\n"); process.exit(1); }
  process.stdout.write("Logged in as synthetic@example.test\\n");
  process.exit(0);
}
if (mode === "hang") {
  // Stands in for a long-running authenticated call, so the probe can be signalled mid-flight.
  process.stdout.write('{"type":"system","subtype":"init"}\\n');
  setTimeout(() => process.exit(0), 30000);
  setInterval(() => {}, 1000);
} else {
const lines = readFileSync(${JSON.stringify(samplePath)}, "utf8").split("\\n").filter(Boolean);
const emitted = mode === "no-terminal-result"
  ? lines.filter((line) => !line.includes('"type":"result"'))
  : lines;
process.stdout.write(emitted.join("\\n") + "\\n");
if (mode === "nonzero") process.exit(7);
}
`;
  await writeFile(path, source, { encoding: "utf8", mode: 0o700 });
  await chmod(path, 0o700);
  return path;
}

async function makeConfigTemplate(root) {
  const path = join(root, "config-template");
  await mkdir(path, { recursive: true });
  await writeFile(join(path, "cli-config.json"), '{"synthetic":"credential"}\n', { mode: 0o600 });
  return path;
}

async function makeRoot() {
  return await mkdtemp(join(tmpdir(), "cursor-telemetry-probe-test-"));
}

function baseArguments({ template, out, evidence, binary }) {
  return [
    "--cursor-config-template", template,
    "--out", out,
    "--evidence", evidence,
    "--agent-bin", binary,
  ];
}

test("parseArguments requires the protected config template and rejects relative paths", () => {
  assert.throws(
    () => parseArguments(["--out", "/tmp/out.ndjson"]),
    /--cursor-config-template is required/u,
  );
  assert.throws(
    () => parseArguments(["--cursor-config-template", "relative/path", "--out", "/tmp/out.ndjson"]),
    /--cursor-config-template must be absolute/u,
  );
  assert.throws(
    () => parseArguments(["--cursor-config-template", "/protected/cursor-config"]),
    /--out is required/u,
  );
  assert.throws(
    () => parseArguments(["--cursor-config-template", "/protected/cursor-config", "--out", "out.ndjson"]),
    /--out must be absolute/u,
  );
  assert.throws(
    () => parseArguments([
      "--cursor-config-template", "/protected/cursor-config",
      "--out", "/tmp/out.ndjson",
      "--evidence", "evidence.json",
    ]),
    /--evidence must be absolute/u,
  );
  assert.throws(
    () => parseArguments(["--cursor-config-template", "/protected/cursor-config", "--out"]),
    /--out requires a value/u,
  );
  assert.throws(() => parseArguments(["--api-key", "secret"]), /unknown option --api-key/u);
});

test("parseArguments rejects an empty prompt and a non-positive timeout", () => {
  const valid = ["--cursor-config-template", "/protected/cursor-config", "--out", "/tmp/out.ndjson"];
  assert.throws(() => parseArguments([...valid, "--prompt", "   "]), /--prompt must not be empty/u);
  assert.throws(() => parseArguments([...valid, "--timeout-ms", "0"]), /--timeout-ms must be a positive integer/u);
  assert.throws(() => parseArguments([...valid, "--timeout-ms", "1.5"]), /--timeout-ms must be a positive integer/u);
  const options = parseArguments([...valid, "--timeout-ms", "1000"]);
  assert.equal(options.timeoutMs, 1000);
  assert.equal(options.cursorConfigTemplatePath, "/protected/cursor-config");
});

test("assertCliSupportsStreamJson fails closed and distinguishes absent from unsupported", () => {
  assert.throws(
    () => assertCliSupportsStreamJson({ binary: "agent", installed: false, capabilities: {} }),
    /is not installed; the probe never ran and asserts nothing/u,
  );
  assert.throws(
    () => assertCliSupportsStreamJson({
      binary: "agent",
      installed: true,
      capabilities: { print: false, streamJson: false },
    }),
    /does not expose --print/u,
  );
  assert.throws(
    () => assertCliSupportsStreamJson({
      binary: "agent",
      installed: true,
      capabilities: { print: true, streamJson: false },
    }),
    /does not expose --output-format stream-json/u,
  );
  const cli = { binary: "agent", installed: true, capabilities: { print: true, streamJson: true } };
  assert.equal(assertCliSupportsStreamJson(cli), cli);
});

test("analyzeStreamJson reports absence only for a completed call", async () => {
  const source = await readFile(bareSamplePath, "utf8");
  const observations = analyzeStreamJson(source, { callStatus: "completed" });

  assert.equal(observations.eventCount, 6);
  assert.equal(observations.hasTerminalResult, true);
  assert.deepEqual(observations.parseErrors, []);
  // Genuine absence: the walk was complete, so `absent` is a claim the probe is entitled to make.
  assert.deepEqual(observations.observationGaps, []);
  assert.equal(observations.keyPathsDepthTruncated, false);
  assert.equal(observations.tokenCounts.determination, "absent");
  assert.match(observations.tokenCounts.reason, /completed-stream/u);
  assert.equal(observations.subagentCorrelation.determination, "absent");
  assert.deepEqual(observations.subagentCorrelation.parentIdentifierMatches, []);
  assert.equal(observations.concurrency.determination, "absent");

  const paths = observations.keyPaths.map((entry) => entry.path);
  assert.ok(paths.includes("session_id"));
  assert.ok(paths.includes("tool_call.name"));
  // session_id looks correlation-ish but must never drive the determination.
  assert.ok(
    observations.subagentCorrelation.ambiguousCandidates.some((entry) => entry.path === "session_id"),
  );
});

test("analyzeStreamJson never asserts absence when the call did not complete", async () => {
  const source = await readFile(bareSamplePath, "utf8");
  for (const callStatus of ["not-performed", "failed", "timed-out", "no-terminal-result"]) {
    const observations = analyzeStreamJson(source, { callStatus });
    for (const finding of [
      observations.tokenCounts,
      observations.subagentCorrelation,
      observations.concurrency,
    ]) {
      assert.equal(finding.determination, "indeterminate");
      assert.equal(finding.reason, `cli-call-did-not-complete:${callStatus}`);
    }
  }
});

test("analyzeStreamJson reports presence when token and parent fields correlate", async () => {
  const source = await readFile(telemetrySamplePath, "utf8");
  const observations = analyzeStreamJson(source, { callStatus: "completed" });

  assert.equal(observations.tokenCounts.determination, "present");
  const usage = observations.tokenCounts.matches.find((match) => match.path === "message.usage.input_tokens");
  assert.deepEqual(usage.numericValues, [1234]);

  assert.equal(observations.subagentCorrelation.determination, "present");
  assert.equal(observations.subagentCorrelation.correlatedEdges, 1);
  assert.equal(observations.subagentCorrelation.correlatedEdgesTruncated, false);
  assert.deepEqual(
    observations.subagentCorrelation.parentIdentifierMatches.map((entry) => entry.path),
    ["parent_id"],
  );
  assert.ok(observations.subagentCorrelation.subagentLabels.includes("task"));
  assert.equal(observations.concurrency.determination, "present");
});

test("analyzeStreamJson marks a dangling parent pointer inconclusive, not present", () => {
  const source = [
    JSON.stringify({ type: "system", subtype: "init", event_id: "a" }),
    JSON.stringify({ type: "assistant", event_id: "b", parent_id: "never-emitted" }),
    JSON.stringify({ type: "result", subtype: "success" }),
  ].join("\n");
  const observations = analyzeStreamJson(source, { callStatus: "completed" });
  assert.equal(observations.subagentCorrelation.determination, "inconclusive");
  assert.equal(observations.subagentCorrelation.correlatedEdges, 0);
  assert.equal(observations.concurrency.determination, "inconclusive");
});

test("analyzeStreamJson reports a long model-output field as a path without its value", () => {
  // Names what this actually covers: a field whose value exceeds RETAINED_VALUE_MAX_LENGTH is
  // still enumerated as a key path. It does NOT cover the leak guard — values of any length are
  // dropped structurally by summarizePath, which the next test pins.
  const secret = `SECRET-${"x".repeat(400)}`;
  const source = [
    JSON.stringify({ type: "assistant", message: { content: secret }, usage: { input_tokens: 5 } }),
    JSON.stringify({ type: "result", subtype: "success" }),
  ].join("\n");
  const observations = analyzeStreamJson(source, { callStatus: "completed" });
  assert.ok(!JSON.stringify(observations).includes("SECRET-"));
  // The path is still reported so the operator knows the field exists.
  assert.ok(observations.keyPaths.some((entry) => entry.path === "message.content"));
  assert.equal(observations.tokenCounts.determination, "present");
});

test("summarizePath structurally drops observed values from every artifact surface", () => {
  // The real leak guard. Every value here is SHORT enough to be retained in analysis scratch,
  // so the length cap cannot be what protects the artifact — only the structural drop can.
  // Mutation check: adding `values: entry.values` to summarizePath must fail this test.
  const credential = "sk-live-0123456789abcdef";
  const source = [
    JSON.stringify({ type: "system", subtype: "init", session_id: "s1", auth_token: credential }),
    JSON.stringify({ type: "assistant", event_id: "e1", parent_id: "s1", usage: { input_tokens: 5 } }),
    JSON.stringify({ type: "result", subtype: "success" }),
  ].join("\n");
  const observations = analyzeStreamJson(source, { callStatus: "completed" });

  // The field is enumerated: discovery must still report that it exists.
  assert.ok(observations.keyPaths.some((entry) => entry.path === "auth_token"));
  assert.ok(observations.keyPaths.some((entry) => entry.path === "session_id"));

  const surfaces = [
    observations.keyPaths,
    observations.tokenCounts.matches,
    observations.subagentCorrelation.parentIdentifierMatches,
    observations.subagentCorrelation.ambiguousCandidates,
    observations.concurrency.timestampMatches,
  ];
  for (const surface of surfaces) {
    for (const entry of surface) {
      assert.equal("values" in entry, false, `${entry.path} leaked a values array`);
      assert.deepEqual(Object.keys(entry).includes("valuesTruncated"), false);
    }
  }
  // No observed string value reaches the artifact by any route.
  const serialized = JSON.stringify(observations);
  assert.ok(!serialized.includes(credential));
  assert.ok(!serialized.includes("s1"));
  assert.ok(!serialized.includes("e1"));
});

test("subagentCorrelation flags a saturated correlated-edge count instead of plateauing silently", () => {
  const fanOut = 600;
  const lines = [JSON.stringify({ type: "system", subtype: "init" })];
  for (let index = 0; index < fanOut; index += 1) {
    lines.push(JSON.stringify({ type: "assistant", event_id: `e${index}` }));
    lines.push(JSON.stringify({ type: "task", event_id: `t${index}`, parent_id: `e${index}` }));
  }
  lines.push(JSON.stringify({ type: "result", subtype: "success" }));
  const correlation = analyzeStreamJson(lines.join("\n"), { callStatus: "completed" }).subagentCorrelation;

  // The determination is the load-bearing part and stays correct under saturation.
  assert.equal(correlation.determination, "present");
  // The count saturates well below the true fan-out, so the artifact must say so.
  assert.ok(correlation.correlatedEdges > 0);
  assert.ok(correlation.correlatedEdges < fanOut);
  assert.equal(correlation.correlatedEdgesTruncated, true);
});

// The probe's one way to actively mislead an operator: reporting `absent` for a field it stopped
// looking for. Each of the following pins a distinct way the walk can end early.

test("a field nested past the depth cap is inconclusive with a depth signal, never absent", () => {
  // `usage.input_tokens` is really there, just buried deeper than MAX_KEY_PATH_DEPTH. Before this
  // guard the probe reported a confident `absent` with keyPathsTruncated false and no parse errors,
  // which an operator could not tell apart from the CLI genuinely not emitting token counts.
  let node = { usage: { input_tokens: 1234, output_tokens: 99 } };
  for (let index = 0; index < 7; index += 1) node = { [`w${index}`]: node };
  const source = [
    JSON.stringify({ type: "assistant", ...node }),
    JSON.stringify({ type: "result", subtype: "success" }),
  ].join("\n");
  const observations = analyzeStreamJson(source, { callStatus: "completed" });

  // The field really was dropped: it never reached the enumerated key paths.
  assert.ok(!observations.keyPaths.some((entry) => entry.path.includes("input_tokens")));
  // ...and the artifact says so, distinctly from the path-count cap.
  assert.equal(observations.keyPathsDepthTruncated, true);
  assert.equal(observations.keyPathsTruncated, false);
  assert.deepEqual(observations.parseErrors, []);
  assert.ok(observations.observationGaps.some((gap) => /^key-paths-dropped-beyond-depth-\d+$/u.test(gap)));

  assert.equal(observations.tokenCounts.determination, "inconclusive");
  assert.equal(observations.tokenCounts.degradedFrom.determination, "absent");
  assert.deepEqual(observations.tokenCounts.observationGaps, observations.observationGaps);
  // The degradation is not token-specific: every sibling determiner inherits it.
  assert.equal(observations.subagentCorrelation.determination, "inconclusive");
  assert.equal(observations.concurrency.determination, "inconclusive");
});

test("a stream with unparsed lines is inconclusive, not absent", () => {
  // The truncated line actually contains input_tokens, so `absent` would be flatly wrong.
  const source = [
    JSON.stringify({ type: "system", subtype: "init" }),
    '{"type":"assistant","usage":{"input_tokens":1234,"output_to',
    JSON.stringify({ type: "result", subtype: "success" }),
  ].join("\n");
  const observations = analyzeStreamJson(source, { callStatus: "completed" });

  assert.equal(observations.parseErrors.length, 1);
  assert.deepEqual(observations.observationGaps, ["unparsed-lines:1"]);
  for (const finding of [
    observations.tokenCounts,
    observations.subagentCorrelation,
    observations.concurrency,
  ]) {
    assert.equal(finding.determination, "inconclusive");
    assert.deepEqual(finding.observationGaps, ["unparsed-lines:1"]);
  }
  for (const finding of [observations.tokenCounts, observations.subagentCorrelation]) {
    assert.equal(finding.reason, "observation-incomplete-so-absence-cannot-be-asserted");
    assert.equal(finding.degradedFrom.determination, "absent");
  }
  // Concurrency inherits the unsettled precondition rather than being degraded directly, so it
  // keeps the more specific reason. What matters is that it is not `absent`.
  assert.equal(observations.concurrency.reason, "subagent-correlation-is-inconclusive");
});

test("a truncated stdout capture is inconclusive, not absent", () => {
  // Same class as an unparsed line: the field could be in the bytes that were never captured.
  const source = [
    JSON.stringify({ type: "system", subtype: "init" }),
    JSON.stringify({ type: "result", subtype: "success" }),
  ].join("\n");
  const complete = analyzeStreamJson(source, { callStatus: "completed", stdoutTruncated: false });
  assert.equal(complete.tokenCounts.determination, "absent");

  const truncated = analyzeStreamJson(source, { callStatus: "completed", stdoutTruncated: true });
  assert.deepEqual(truncated.observationGaps, ["stdout-truncated"]);
  assert.equal(truncated.tokenCounts.determination, "inconclusive");
  assert.equal(truncated.subagentCorrelation.determination, "inconclusive");
  assert.equal(truncated.concurrency.determination, "inconclusive");
});

test("an incomplete walk never downgrades a field that was actually observed", () => {
  // The guard must not become uselessly conservative: `present` rests on positive evidence, and an
  // unparsed line elsewhere in the stream cannot un-observe it.
  const source = [
    JSON.stringify({ type: "assistant", usage: { input_tokens: 0, output_tokens: 0 } }),
    "not json",
    JSON.stringify({ type: "result", subtype: "success" }),
  ].join("\n");
  const observations = analyzeStreamJson(source, { callStatus: "completed" });
  assert.deepEqual(observations.observationGaps, ["unparsed-lines:1"]);
  // Present-but-zero is still present: a real zero is an observation, not an absence.
  assert.equal(observations.tokenCounts.determination, "present");
  assert.equal("degradedFrom" in observations.tokenCounts, false);
});

test("analyzeStreamJson records malformed lines instead of discarding them", () => {
  const source = `not json\n${JSON.stringify({ type: "result", subtype: "success" })}\n`;
  const observations = analyzeStreamJson(source, { callStatus: "completed" });
  assert.equal(observations.eventCount, 1);
  assert.equal(observations.parseErrors.length, 1);
  assert.equal(observations.parseErrors[0].line, 1);
});

test("runTelemetryProbe writes the raw stream and a schema-versioned artifact, then cleans up", async () => {
  const root = await makeRoot();
  const workRoot = join(root, "work");
  await mkdir(workRoot);
  const options = parseArguments([
    ...baseArguments({
      template: await makeConfigTemplate(root),
      out: join(root, "out", "stream.ndjson"),
      evidence: join(root, "out", "evidence.json"),
      binary: await makeMockCli(root, { samplePath: telemetrySamplePath }),
    }),
    "--work-root", workRoot,
    "--timeout-ms", "30000",
  ]);

  const { evidence, status } = await runTelemetryProbe(options);
  assert.equal(status, "completed");
  assert.equal(evidence.schemaVersion, EVIDENCE_SCHEMA_VERSION);
  assert.equal(evidence.kind, EVIDENCE_KIND);
  assert.equal(evidence.probe.callPerformed, true);
  assert.equal(evidence.probe.cliVersion, "synthetic-mock 9.9.9");
  assert.equal(evidence.probe.exitCode, 0);
  assert.deepEqual(evidence.probe.arguments, [
    "--print", "--output-format", "stream-json", "--sandbox", "enabled",
  ]);
  assert.equal(evidence.observations.tokenCounts.determination, "present");

  const raw = await readFile(options.outPath, "utf8");
  assert.equal(raw, await readFile(telemetrySamplePath, "utf8"));
  assert.equal(evidence.rawStream.bytes, Buffer.byteLength(raw, "utf8"));

  const written = JSON.parse(await readFile(options.evidencePath, "utf8"));
  assert.deepEqual(written, evidence);

  // Bindings must be independently checkable, not self-referential. The sandbox policy digest is
  // recomputable from the exported policy bytes without trusting anything this run produced.
  assert.equal(evidence.bindings.sandboxPolicyPath, SANDBOX_PATH);
  assert.equal(evidence.bindings.sandboxPolicySha256, sha256(SANDBOX_POLICY_BYTES));
  assert.match(evidence.bindings.workspaceSha256, /^[0-9a-f]{64}$/u);
  // The workspace digest binds side effects, so it must not be the digest of an empty tree.
  assert.notEqual(evidence.bindings.workspaceSha256, sha256(""));

  // No copy of the config template may survive the run.
  assert.deepEqual(await readdir(workRoot), []);
});

test("runTelemetryProbe reports indeterminate findings when the CLI call fails", async () => {
  const root = await makeRoot();
  const workRoot = join(root, "work");
  await mkdir(workRoot);
  const options = parseArguments([
    ...baseArguments({
      template: await makeConfigTemplate(root),
      out: join(root, "stream.ndjson"),
      evidence: join(root, "evidence.json"),
      binary: await makeMockCli(root, { mode: "nonzero", samplePath: bareSamplePath }),
    }),
    "--work-root", workRoot,
  ]);

  const { evidence, status } = await runTelemetryProbe(options);
  assert.equal(status, "failed");
  assert.equal(evidence.probe.exitCode, 7);
  assert.equal(evidence.observations.tokenCounts.determination, "indeterminate");
  assert.equal(evidence.observations.subagentCorrelation.determination, "indeterminate");
  assert.deepEqual(await readdir(workRoot), []);
});

test("runTelemetryProbe refuses to overwrite an existing capture", async () => {
  const root = await makeRoot();
  const outPath = join(root, "stream.ndjson");
  await writeFile(outPath, "previous capture\n");
  const options = parseArguments(baseArguments({
    template: await makeConfigTemplate(root),
    out: outPath,
    evidence: join(root, "evidence.json"),
    binary: await makeMockCli(root),
  }));
  await assert.rejects(runTelemetryProbe(options), /--out already exists/u);
  assert.equal(await readFile(outPath, "utf8"), "previous capture\n");
});

test("runTelemetryProbe fails closed when the CLI is unauthenticated and emits no artifact", async () => {
  const root = await makeRoot();
  const options = parseArguments(baseArguments({
    template: await makeConfigTemplate(root),
    out: join(root, "stream.ndjson"),
    evidence: join(root, "evidence.json"),
    binary: await makeMockCli(root, { mode: "unauthenticated" }),
  }));
  await assert.rejects(runTelemetryProbe(options), /authentication preflight failed/u);
  // "never asked" must not be recorded as "not emitted".
  const entries = await readdir(root);
  assert.ok(!entries.includes("evidence.json"));
  assert.ok(!entries.includes("stream.ndjson"));
});

test("runTelemetryProbe fails closed when the CLI cannot emit stream-json", async () => {
  const root = await makeRoot();
  const options = parseArguments(baseArguments({
    template: await makeConfigTemplate(root),
    out: join(root, "stream.ndjson"),
    evidence: join(root, "evidence.json"),
    binary: await makeMockCli(root, { help: "Usage: agent [options]\n  -p, --print\n" }),
  }));
  await assert.rejects(runTelemetryProbe(options), /does not expose --output-format stream-json/u);
});

// Regression guard for the credential copy that survived Ctrl-C: `finally` does not unwind on a
// default-disposition signal, so the probe installs signal handlers. Verified by hand against a
// real `kill -INT` on a running invocation; this pins the behaviour.
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  test(`${signal} during the call removes the credential copy and re-raises the signal`, async () => {
    const root = await makeRoot();
    const workRoot = join(root, "work");
    await mkdir(workRoot);
    const child = spawn(process.execPath, [
      probeScript,
      ...baseArguments({
        template: await makeConfigTemplate(root),
        out: join(root, "stream.ndjson"),
        evidence: join(root, "evidence.json"),
        binary: await makeMockCli(root, { mode: "hang" }),
      }),
      "--work-root", workRoot,
      "--timeout-ms", "600000",
    ], { stdio: "ignore" });

    try {
      // Wait until the credential copy actually exists, otherwise the signal proves nothing.
      let copied = false;
      for (let attempt = 0; attempt < 200 && !copied; attempt += 1) {
        const roots = await readdir(workRoot);
        copied = roots.length > 0 &&
          (await readdir(join(workRoot, roots[0], "cursor-home")).catch(() => [])).length > 0;
        if (!copied) await setTimeout(50);
      }
      assert.ok(copied, "credential copy never appeared, so the signal would prove nothing");

      child.kill(signal);
      const [code, terminatingSignal] = await once(child, "exit");

      // Re-raised with the default disposition: the process must die *of* the signal, not exit
      // normally with a code of our choosing.
      assert.equal(terminatingSignal, signal);
      assert.equal(code, null);
      // Nothing survives under the work root.
      assert.deepEqual(await readdir(workRoot), []);
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
  });
}

test("the probe exits non-zero with a clear message when the CLI is absent", async () => {
  const root = await makeRoot();
  const result = spawnSync(process.execPath, [
    probeScript,
    ...baseArguments({
      template: await makeConfigTemplate(root),
      out: join(root, "stream.ndjson"),
      evidence: join(root, "evidence.json"),
      binary: join(root, "no-such-cursor-cli"),
    }),
  ], { encoding: "utf8", timeout: 30_000 });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Cursor CLI telemetry probe failed:/u);
  assert.match(result.stderr, /is not installed; the probe never ran and asserts nothing/u);
  assert.equal(result.stdout, "");
});
