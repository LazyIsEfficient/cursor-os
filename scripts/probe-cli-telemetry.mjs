// Operator-run telemetry probe.
//
// This script captures ONE authenticated Cursor CLI call in stream-json mode and
// records which fields the CLI actually emits. It never extracts telemetry using
// guessed field names: it enumerates the observed key paths and reports presence,
// absence, or indeterminacy so that a human can decide what the benchmark may
// legitimately read.
//
// Contracts:
// https://cursor.com/docs/cli/reference/configuration
// https://cursor.com/docs/reference/sandbox

import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildCursorChildEnvironment } from "../benchmark/lib/adapters.mjs";
import { runCursorAuthenticationPreflight } from "../benchmark/lib/auth-preflight.mjs";
import { spawnCaptured } from "../benchmark/lib/process.mjs";
import { normalizeCliNdjson } from "../benchmark/lib/telemetry.mjs";
import { copyTree, sha256 } from "../benchmark/lib/util.mjs";
import { validateCursorConfigTemplate, writeTrialSandboxPolicy } from "../benchmark/lib/workspace.mjs";
import { probeCursorCli } from "./lib/platform-contract.mjs";

export const EVIDENCE_SCHEMA_VERSION = "1.0.0";
export const EVIDENCE_KIND = "cli-telemetry-probe-evidence";

export const DEFAULT_PROMPT =
  "Create a file named probe.txt containing the word probe, then list the files in this directory. " +
  "Delegate a one-sentence summary of what you found to a subagent.";

const DEFAULT_TIMEOUT_MS = 10 * 60_000;
const MAX_KEY_PATH_DEPTH = 8;
const MAX_KEY_PATHS = 2_000;
const MAX_RECORDED_VALUES = 200;
const MAX_REPORTED_VALUES = 8;
const IDENTIFIER_VALUE_MAX_LENGTH = 128;

// Broad on purpose. This is discovery, not extraction: a false positive is
// visible to the operator, a false negative silently hides a real field.
const TOKEN_PATH_PATTERN = /token|usage|cost/iu;
const PARENT_PATH_PATTERN = /parent|caller|origin|sub_?agent|delegat|spawn/iu;
const AMBIGUOUS_CORRELATION_PATTERN = /session|thread|trace|span|conversation|correlat/iu;
const IDENTIFIER_PATH_PATTERN = /(?:^|[._])id$|_id$|(?:^|[._])uuid$/iu;
const TIMESTAMP_PATH_PATTERN = /time|timestamp|_at$|epoch|elapsed|duration/iu;
const SUBAGENT_LABEL_PATTERN = /task|subagent|sub_agent|agent|delegate|spawn/iu;

function isPlainLeaf(value) {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function leafType(value) {
  return value === null ? "null" : typeof value;
}

/**
 * Walk one parsed event and record every leaf key path. Array indices collapse
 * to `[]` so that repeated elements share a single path.
 */
function collectLeafPaths(value, prefix, sink, depth = 0) {
  if (depth > MAX_KEY_PATH_DEPTH || sink.size >= MAX_KEY_PATHS) return;
  if (Array.isArray(value)) {
    for (const item of value) collectLeafPaths(item, `${prefix}[]`, sink, depth + 1);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      collectLeafPaths(child, prefix ? `${prefix}.${key}` : key, sink, depth + 1);
    }
    return;
  }
  if (!isPlainLeaf(value) || prefix === "") return;
  const existing = sink.get(prefix) ?? { path: prefix, count: 0, valueTypes: new Set(), values: [] };
  existing.count += 1;
  existing.valueTypes.add(leafType(value));
  // Long strings are model output. Retain only values that could plausibly be a
  // count or an identifier, so the artifact cannot accumulate response text.
  const retainable = typeof value === "number" ||
    (typeof value === "string" && value.length > 0 && value.length <= IDENTIFIER_VALUE_MAX_LENGTH);
  if (retainable && existing.values.length < MAX_RECORDED_VALUES) existing.values.push(value);
  sink.set(prefix, existing);
}

function parseEventLines(source) {
  const events = [];
  const parseErrors = [];
  for (const [index, line] of source.split(/\r?\n/u).entries()) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event && typeof event === "object") events.push({ line: index + 1, event });
    } catch (error) {
      parseErrors.push({ line: index + 1, error: error.message });
    }
  }
  return { events, parseErrors };
}

function numericValues(entry) {
  return entry.values.filter((value) => typeof value === "number" && Number.isFinite(value));
}

/**
 * Identifier-like string values are recorded as distinct counts, never as raw
 * values: an evidence artifact may be exported and identifiers can be linkable.
 */
function identifierValues(entry) {
  return entry.values.filter((value) => typeof value === "string");
}

function summarizePath(entry) {
  return {
    path: entry.path,
    count: entry.count,
    valueTypes: [...entry.valueTypes].sort(),
  };
}

function determineTokenCounts(paths, callStatus) {
  const matches = paths
    .filter((entry) => TOKEN_PATH_PATTERN.test(entry.path))
    .map((entry) => ({
      ...summarizePath(entry),
      numericValues: numericValues(entry).slice(0, MAX_REPORTED_VALUES),
    }));
  if (callStatus !== "completed") {
    return {
      determination: "indeterminate",
      reason: `cli-call-did-not-complete:${callStatus}`,
      matches,
    };
  }
  const numeric = matches.filter((match) => match.numericValues.length > 0);
  if (numeric.length > 0) {
    return {
      determination: "present",
      reason: "numeric-token-or-usage-field-observed",
      matches,
    };
  }
  if (matches.length > 0) {
    return {
      determination: "inconclusive",
      reason: "token-or-usage-named-field-observed-but-no-numeric-value",
      matches,
    };
  }
  return {
    determination: "absent",
    reason: "no-token-or-usage-named-field-observed-in-completed-stream",
    matches,
  };
}

/**
 * Correlation is only "present" when a parent-flavoured identifier field carries
 * a value that also appears as an identifier on a different event. A field that
 * merely looks like a parent pointer proves nothing.
 */
function determineSubagentCorrelation(events, paths, callStatus) {
  const identifierPaths = paths.filter((entry) => IDENTIFIER_PATH_PATTERN.test(entry.path));
  const parentPaths = identifierPaths.filter((entry) => PARENT_PATH_PATTERN.test(entry.path));
  const ambiguousPaths = identifierPaths.filter(
    (entry) => !PARENT_PATH_PATTERN.test(entry.path) && AMBIGUOUS_CORRELATION_PATTERN.test(entry.path),
  );
  const parentIdentifierMatches = parentPaths.map(summarizePath);
  const ambiguousCandidates = ambiguousPaths.map(summarizePath);
  const subagentLabels = [
    ...new Set(
      events
        .map(({ event }) => [event.type, event.subtype, event.name, event.tool_call?.name])
        .flat()
        .filter((label) => typeof label === "string" && SUBAGENT_LABEL_PATTERN.test(label)),
    ),
  ].sort();

  if (callStatus !== "completed") {
    return {
      determination: "indeterminate",
      reason: `cli-call-did-not-complete:${callStatus}`,
      parentIdentifierMatches,
      ambiguousCandidates,
      subagentLabels,
      correlatedEdges: 0,
    };
  }
  if (parentPaths.length === 0) {
    return {
      determination: "absent",
      reason: "no-parent-identifier-field-observed-in-completed-stream",
      parentIdentifierMatches,
      ambiguousCandidates,
      subagentLabels,
      correlatedEdges: 0,
    };
  }

  const parentValues = new Set(parentPaths.flatMap(identifierValues));
  const otherIdentifierValues = new Set(
    identifierPaths
      .filter((entry) => !PARENT_PATH_PATTERN.test(entry.path))
      .flatMap(identifierValues),
  );
  const correlatedEdges = [...parentValues].filter((value) => otherIdentifierValues.has(value)).length;
  if (correlatedEdges > 0) {
    return {
      determination: "present",
      reason: "parent-identifier-value-matches-an-identifier-on-another-event",
      parentIdentifierMatches,
      ambiguousCandidates,
      subagentLabels,
      correlatedEdges,
    };
  }
  return {
    determination: "inconclusive",
    reason: "parent-identifier-field-observed-but-no-value-resolves-to-another-event-identifier",
    parentIdentifierMatches,
    ambiguousCandidates,
    subagentLabels,
    correlatedEdges,
  };
}

/**
 * Concurrency requires correlation AND a per-event time base. Report the two
 * preconditions separately so a failure is attributable.
 */
function determineConcurrency(paths, correlation, callStatus) {
  const timestampMatches = paths
    .filter((entry) => TIMESTAMP_PATH_PATTERN.test(entry.path))
    .map(summarizePath);
  if (callStatus !== "completed") {
    return {
      determination: "indeterminate",
      reason: `cli-call-did-not-complete:${callStatus}`,
      timestampMatches,
      requiresCorrelation: true,
    };
  }
  if (correlation.determination !== "present") {
    return {
      determination: correlation.determination === "absent" ? "absent" : "inconclusive",
      reason: `subagent-correlation-is-${correlation.determination}`,
      timestampMatches,
      requiresCorrelation: true,
    };
  }
  if (timestampMatches.length === 0) {
    return {
      determination: "inconclusive",
      reason: "correlation-observed-but-no-timestamp-field-observed",
      timestampMatches,
      requiresCorrelation: true,
    };
  }
  return {
    determination: "present",
    reason: "correlation-and-timestamp-fields-both-observed",
    timestampMatches,
    requiresCorrelation: true,
  };
}

/**
 * Pure analysis of a captured stream-json stdout capture.
 *
 * @param {string} source raw stdout
 * @param {{callStatus: "completed"|"failed"|"timed-out"|"no-terminal-result"|"not-performed"}} options
 */
export function analyzeStreamJson(source, { callStatus }) {
  const { events, parseErrors } = parseEventLines(source);
  const sink = new Map();
  const eventTypeCounts = {};
  for (const { event } of events) {
    const type = typeof event.type === "string" ? event.type : "<untyped>";
    eventTypeCounts[type] = (eventTypeCounts[type] ?? 0) + 1;
    collectLeafPaths(event, "", sink);
  }
  const paths = [...sink.values()].sort((left, right) => left.path.localeCompare(right.path));
  const normalized = normalizeCliNdjson(source);
  const subagentCorrelation = determineSubagentCorrelation(events, paths, callStatus);
  return {
    eventCount: events.length,
    eventTypeCounts,
    parseErrors,
    keyPathsTruncated: sink.size >= MAX_KEY_PATHS,
    keyPaths: paths.map(summarizePath),
    documentedToolCallCount: normalized.toolCallCount,
    hasTerminalResult: normalized.hasTerminalResult,
    tokenCounts: determineTokenCounts(paths, callStatus),
    subagentCorrelation,
    concurrency: determineConcurrency(paths, subagentCorrelation, callStatus),
  };
}

export function parseArguments(argv) {
  const options = {
    binary: process.env.CURSOR_AGENT_BIN ?? "agent",
    prompt: DEFAULT_PROMPT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    workRoot: tmpdir(),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[++index];
    if (value === undefined) throw new Error(`${argument} requires a value`);
    if (argument === "--cursor-config-template") options.cursorConfigTemplatePath = value;
    else if (argument === "--out") options.outPath = value;
    else if (argument === "--evidence") options.evidencePath = value;
    else if (argument === "--agent-bin") options.binary = value;
    else if (argument === "--prompt") options.prompt = value;
    else if (argument === "--work-root") options.workRoot = value;
    else if (argument === "--timeout-ms") {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed <= 0) throw new Error("--timeout-ms must be a positive integer");
      options.timeoutMs = parsed;
    } else throw new Error(`unknown option ${argument}`);
  }
  if (!options.cursorConfigTemplatePath) {
    throw new Error("--cursor-config-template is required; authenticated runs never accept API keys");
  }
  if (!isAbsolute(options.cursorConfigTemplatePath)) {
    throw new Error("--cursor-config-template must be absolute");
  }
  if (!options.outPath) throw new Error("--out is required");
  if (!isAbsolute(options.outPath)) throw new Error("--out must be absolute");
  if (options.evidencePath !== undefined && !isAbsolute(options.evidencePath)) {
    throw new Error("--evidence must be absolute");
  }
  if (!isAbsolute(options.workRoot)) throw new Error("--work-root must be absolute");
  if (typeof options.prompt !== "string" || options.prompt.trim().length === 0) {
    throw new Error("--prompt must not be empty");
  }
  return options;
}

async function assertAbsent(path, label) {
  try {
    await access(path);
  } catch {
    return;
  }
  throw new Error(`${label} already exists and would be overwritten: ${path}`);
}

export function assertCliSupportsStreamJson(cli) {
  if (!cli.installed) {
    throw new Error(`Cursor CLI ${cli.binary} is not installed; the probe never ran and asserts nothing`);
  }
  if (cli.capabilities?.print !== true) {
    throw new Error(`Cursor CLI ${cli.binary} does not expose --print; the probe never ran and asserts nothing`);
  }
  if (cli.capabilities?.streamJson !== true) {
    throw new Error(
      `Cursor CLI ${cli.binary} does not expose --output-format stream-json; the probe never ran and asserts nothing`,
    );
  }
  return cli;
}

export function buildEvidence({ options, cli, template, call, observations }) {
  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    kind: EVIDENCE_KIND,
    generatedAt: new Date().toISOString(),
    probe: {
      binary: options.binary,
      cliVersion: cli.version ?? null,
      cliCapabilities: cli.capabilities,
      cursorConfigTemplatePath: template.path,
      arguments: call.arguments,
      prompt: options.prompt,
      promptSha256: sha256(options.prompt),
      callPerformed: true,
      status: call.status,
      exitCode: call.exitCode,
      signal: call.signal,
      timedOut: call.timedOut,
      durationMs: call.durationMs,
      stdoutTruncated: call.stdoutTruncated,
    },
    rawStream: {
      path: options.outPath,
      bytes: call.bytes,
      sha256: call.sha256,
    },
    observations,
    interpretation: {
      claims: [
        "token counts in CLI structured output",
        "subagent parentage and call counts",
        "concurrency telemetry",
      ],
      note:
        "This artifact records only what the observed CLI emitted for one prompt on one CLI version. " +
        "A determination of 'absent' applies to this capture, not to the CLI in general. " +
        "A determination of 'indeterminate' means the call did not complete and nothing may be concluded.",
    },
  };
}

export async function runTelemetryProbe(options) {
  const cli = assertCliSupportsStreamJson(probeCursorCli(options.binary));
  const template = await validateCursorConfigTemplate(options.cursorConfigTemplatePath);
  await assertAbsent(options.outPath, "--out");
  if (options.evidencePath !== undefined) await assertAbsent(options.evidencePath, "--evidence");
  await runCursorAuthenticationPreflight({
    binary: options.binary,
    cursorConfigTemplatePath: options.cursorConfigTemplatePath,
  });

  const probeRoot = await mkdtemp(join(options.workRoot, "cursor-telemetry-probe-"));
  try {
    const cursorHomePath = join(probeRoot, "cursor-home");
    const workspacePath = join(probeRoot, "workspace");
    await mkdir(cursorHomePath, { mode: 0o700 });
    await mkdir(workspacePath, { mode: 0o700 });
    await copyTree(template.realPath, cursorHomePath);
    await writeTrialSandboxPolicy(workspacePath);

    const argv = ["--print", "--output-format", "stream-json", "--sandbox", "enabled", options.prompt];
    await mkdir(dirname(options.outPath), { recursive: true });
    const result = await spawnCaptured({
      executable: options.binary,
      arguments: argv,
      cwd: workspacePath,
      env: buildCursorChildEnvironment({ cursorHomePath }),
      timeoutMs: options.timeoutMs,
      stdoutPath: join(probeRoot, "stdout.log"),
      stderrPath: join(probeRoot, "stderr.log"),
      stdoutMirrorPath: options.outPath,
    });

    let status = "completed";
    if (result.timedOut) status = "timed-out";
    else if (result.exitCode !== 0) status = "failed";
    else if (!normalizeCliNdjson(result.stdout).hasTerminalResult) status = "no-terminal-result";

    const observations = analyzeStreamJson(result.stdout, { callStatus: status });
    const evidence = buildEvidence({
      options,
      cli,
      template,
      call: {
        arguments: argv.slice(0, -1),
        status,
        exitCode: result.exitCode,
        signal: result.signal,
        timedOut: result.timedOut,
        durationMs: Math.round(result.durationMs),
        stdoutTruncated: result.stdoutTruncated,
        bytes: Buffer.byteLength(result.stdout, "utf8"),
        sha256: sha256(result.stdout),
      },
      observations,
    });
    if (options.evidencePath !== undefined) {
      await mkdir(dirname(options.evidencePath), { recursive: true });
      await writeFile(options.evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
    }
    return { evidence, status };
  } finally {
    await rm(probeRoot, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const { evidence, status } = await runTelemetryProbe(options);
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  if (status !== "completed") {
    process.stderr.write(
      `Cursor CLI telemetry probe call did not complete (${status}); every determination is indeterminate.\n`,
    );
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === resolve(fileURLToPath(import.meta.url))) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`Cursor CLI telemetry probe failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
