// Tests for scripts/probe-cli-telemetry.mjs.
//
// IMPORTANT: every sample and CLI double in this file is SYNTHETIC. The
// `synthetic-stream-json-*.ndjson` fixtures are illustrative of the stream-json
// line format only. They are NOT captured Cursor CLI output and they are not
// evidence for or against any telemetry claim. Only an operator running this
// probe against a real authenticated CLI can produce evidence.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

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
const lines = readFileSync(${JSON.stringify(samplePath)}, "utf8").split("\\n").filter(Boolean);
const emitted = mode === "no-terminal-result"
  ? lines.filter((line) => !line.includes('"type":"result"'))
  : lines;
process.stdout.write(emitted.join("\\n") + "\\n");
if (mode === "nonzero") process.exit(7);
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

test("analyzeStreamJson never copies model output into the artifact", () => {
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
