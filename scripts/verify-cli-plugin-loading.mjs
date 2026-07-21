// Operator-run authenticated probe: invokes the installed Cursor CLI with
// --plugin-dir in stream-json mode and asserts that the agents and rules named
// in plugin/.cursor-plugin/inventory.json appear in the event stream.
//
// Fails closed. A CLI that silently ignores --plugin-dir is the exact failure
// this script exists to catch, so an absent --plugin-dir capability is an error,
// never a pass.
import { rmSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { buildCursorChildEnvironment } from "../benchmark/lib/adapters.mjs";
import { runCursorAuthenticationPreflight } from "../benchmark/lib/auth-preflight.mjs";
import { spawnCaptured } from "../benchmark/lib/process.mjs";
import { copyTree, hashTree, sha256 } from "../benchmark/lib/util.mjs";
import { validateCursorConfigTemplate } from "../benchmark/lib/workspace.mjs";
import { probeCursorCli } from "./lib/platform-contract.mjs";

export const SCHEMA_VERSION = "1.0.0";
export const ARTIFACT_KIND = "cli-plugin-loading-evidence";
// The stream must name every agent and every rule; those are the two component
// kinds the issue requires as proof of live plugin loading.
export const REQUIRED_KINDS = ["agent", "rule"];
export const OBSERVED_KINDS = ["agent", "command", "rule", "skill"];
export const PROMPT = [
  "List the exact names of every custom agent and every rule currently available to you.",
  "Output one name per line and nothing else.",
  "Do not read, edit, or execute anything.",
].join(" ");

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const inventoryPath = join(repositoryRoot, "plugin/.cursor-plugin/inventory.json");
const defaultPluginDir = join(repositoryRoot, "plugin");
const DOCUMENTED_EVENT_TYPES = new Set(["system", "user", "assistant", "tool_call", "result"]);
// Only the model's own output counts as evidence.
//
// `user` echoes the prompt back, and `system` is worse: an init event that
// lists loaded config files names every plugin component as a filesystem path,
// which componentNamePattern matches because `/` and `.` are boundary
// characters. Including either makes this check self-satisfying — a CLI that
// prints a loaded-file listing at startup would "prove" loading with zero model
// participation, which is the exact false pass this script exists to prevent.
export const MATCHABLE_EVENT_TYPES = new Set(["assistant", "result"]);
const CREDENTIAL_ARGUMENT = /(?:api[_-]?key|token|secret|password|credential)/iu;

const USAGE = [
  "usage: npm run plugin:cli:verify -- --cursor-config-template <absolute path> [options]",
  "  --cursor-config-template <absolute path>  protected, pre-authenticated Cursor config template (required)",
  "  --agent-bin <name|path>                   Cursor CLI binary (default: agent)",
  "  --plugin-dir <absolute path>              plugin directory to load (default: <repo>/plugin)",
  "  --evidence <absolute path>                write the JSON evidence artifact here",
  "  --timeout-ms <integer>                    per-invocation timeout (default: 180000)",
  "",
  "API keys are never accepted through arguments or environment variables.",
].join("\n");

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

export function parseArguments(argv) {
  const options = { binary: "agent", pluginDir: defaultPluginDir, timeoutMs: 180_000 };
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    invariant(name.startsWith("--"), `${USAGE}\nunexpected argument ${name}`);
    invariant(
      !CREDENTIAL_ARGUMENT.test(name),
      `${name} is refused: authenticated runs require a protected config template, never a credential argument`,
    );
    const value = argv[index + 1];
    invariant(value !== undefined && !value.startsWith("--"), `${name} requires a value`);
    index += 1;
    if (name === "--cursor-config-template") {
      invariant(isAbsolute(value), "--cursor-config-template must be an absolute path");
      options.cursorConfigTemplatePath = value;
    } else if (name === "--agent-bin") {
      options.binary = value;
    } else if (name === "--plugin-dir") {
      invariant(isAbsolute(value), "--plugin-dir must be an absolute path");
      options.pluginDir = value;
    } else if (name === "--evidence") {
      invariant(isAbsolute(value), "--evidence must be an absolute path");
      options.evidencePath = value;
    } else if (name === "--timeout-ms") {
      const parsed = Number(value);
      invariant(Number.isInteger(parsed) && parsed > 0, "--timeout-ms must be a positive integer");
      options.timeoutMs = parsed;
    } else {
      throw new Error(`${USAGE}\nunknown option ${name}`);
    }
  }
  invariant(
    typeof options.cursorConfigTemplatePath === "string",
    `${USAGE}\n--cursor-config-template is required`,
  );
  return options;
}

// A bare substring test would let "rust-engineer" satisfy "engineer", which
// would report a component as loaded that the stream never named. Require the
// id to stand alone within the surrounding identifier characters.
export function componentNamePattern(id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  // `_` is an identifier character: without it here, "my_engineer" would satisfy
  // "engineer". No current inventory id collides, but the boundary should be
  // correct rather than incidentally safe.
  return new RegExp(`(?<![A-Za-z0-9_-])${escaped}(?![A-Za-z0-9_-])`, "u");
}

// Matching runs over decoded string values, not the re-serialized event. A
// re-serialized event escapes newlines, so a name printed on its own line would
// be preceded by a literal "n" and miss the boundary check above.
function collectStrings(value, sink) {
  if (typeof value === "string") sink.push(value);
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, sink);
  else if (value && typeof value === "object") for (const item of Object.values(value)) collectStrings(item, sink);
}

// Self-contained NDJSON scan. scripts/probe-cli-telemetry.mjs parses the same
// format independently; factoring the two together is deliberate follow-up work
// once both have landed.
export function matchComponentsInStream(ndjson, components) {
  const parseErrors = [];
  const matchableText = [];
  const eventTypes = [];
  let terminalResult = null;

  for (const [index, line] of ndjson.split(/\r?\n/u).entries()) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch (error) {
      parseErrors.push({ line: index + 1, error: error.message });
      continue;
    }
    if (!event || typeof event !== "object" || !DOCUMENTED_EVENT_TYPES.has(event.type)) continue;
    eventTypes.push(event.type);
    if (event.type === "result") {
      terminalResult = { subtype: typeof event.subtype === "string" ? event.subtype : null };
    }
    if (MATCHABLE_EVENT_TYPES.has(event.type)) collectStrings(event, matchableText);
  }

  const haystack = matchableText.join("\n");
  const observations = components
    .map((component) => ({
      id: component.id,
      kind: component.kind,
      observed: componentNamePattern(component.id).test(haystack),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  const byKind = {};
  for (const observation of observations) {
    const bucket = byKind[observation.kind] ?? { expected: 0, observed: 0 };
    bucket.expected += 1;
    if (observation.observed) bucket.observed += 1;
    byKind[observation.kind] = bucket;
  }

  const required = observations.filter((observation) => REQUIRED_KINDS.includes(observation.kind));
  return {
    eventTypes,
    parseErrors,
    hasTerminalResult: terminalResult !== null,
    terminalResult,
    observations,
    byKind,
    missingRequired: required.filter((observation) => !observation.observed).map((observation) => observation.id),
    allRequiredObserved: required.length > 0 && required.every((observation) => observation.observed),
  };
}

export function assertStreamProvesLoading(analysis, processResult) {
  invariant(!processResult.timedOut, "Cursor CLI invocation timed out before a terminal result event");
  invariant(
    processResult.exitCode === 0,
    `Cursor CLI exited ${processResult.exitCode}: ${processResult.stderr.trim().slice(0, 500)}`,
  );
  invariant(
    analysis.parseErrors.length === 0,
    `stream-json output contained ${analysis.parseErrors.length} unparsable line(s); the stream is not trustworthy evidence`,
  );
  invariant(analysis.hasTerminalResult, "stream-json output ended without a documented result event");
  invariant(
    analysis.terminalResult.subtype !== "error",
    "stream-json terminal result reported subtype=error",
  );
  invariant(
    analysis.allRequiredObserved,
    `the stream never named these plugin components: ${analysis.missingRequired.join(", ")}. ` +
      "The CLI accepted --plugin-dir but the plugin's agents and rules are not observable in the stream.",
  );
}

// --sandbox is enforcement; the prompt's "do not read, edit, or execute
// anything" is only instruction, and an instruction is not a control. Every
// other authenticated invocation in this repository passes it
// (benchmark/lib/adapters.mjs).
// Contract: https://cursor.com/docs/reference/sandbox
export function buildInvocationArguments(pluginDir) {
  return [
    "--print",
    "--output-format",
    "stream-json",
    "--sandbox",
    "enabled",
    "--plugin-dir",
    pluginDir,
    PROMPT,
  ];
}

export const CLEANUP_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"];

// A `finally` block does not unwind when the process dies from a
// default-disposition signal. This is a long-running interactive operator
// script, so Ctrl-C is routine — without this, an interrupted run leaves a copy
// of the authenticated credentials in the temp root indefinitely.
//
// Cleanup must be synchronous: an awaited rm() would not finish before the
// process terminates. After cleaning up we drop our listeners, which restores
// the signal's default disposition, then re-raise so the exit status reflects
// the signal rather than a normal exit.
export function installSignalCleanup(temporaryRoot) {
  const handlers = new Map();
  const release = () => {
    for (const [signal, handler] of handlers) process.removeListener(signal, handler);
    handlers.clear();
  };
  for (const signal of CLEANUP_SIGNALS) {
    const handler = () => {
      release();
      try {
        rmSync(temporaryRoot, { recursive: true, force: true });
      } finally {
        process.kill(process.pid, signal);
      }
    };
    handlers.set(signal, handler);
    process.on(signal, handler);
  }
  return release;
}

export async function verifyCliPluginLoading(options) {
  const inventory = JSON.parse(await readFile(inventoryPath, "utf8"));
  const components = inventory.components.filter((component) => OBSERVED_KINDS.includes(component.kind));
  invariant(components.length > 0, "inventory lists no observable components");

  const cli = probeCursorCli(options.binary);
  invariant(cli.installed, `Cursor CLI '${options.binary}' is not installed or not on PATH`);
  invariant(
    cli.capabilities.pluginDir === true,
    `Cursor CLI ${cli.version ?? "(unknown version)"} does not expose --plugin-dir. ` +
      "Live plugin loading cannot be verified with this CLI; upgrade it and re-run. " +
      "Reporting success here would be indistinguishable from a CLI that silently ignored the flag.",
  );
  invariant(
    cli.capabilities.print === true && cli.capabilities.streamJson === true,
    "Cursor CLI must expose --print and --output-format stream-json",
  );

  // An expired or malformed config template otherwise surfaces as an opaque
  // "Cursor CLI exited 1" from the main invocation. The preflight names the
  // real fault, matching benchmark/run.mjs.
  await runCursorAuthenticationPreflight({
    binary: options.binary,
    cursorConfigTemplatePath: options.cursorConfigTemplatePath,
  });

  const temporaryRoot = await mkdtemp(join(tmpdir(), "cursor-harness-cli-plugin-"));
  const releaseSignalCleanup = installSignalCleanup(temporaryRoot);
  try {
    const cursorHomePath = join(temporaryRoot, "cursor-home");
    const workspacePath = join(temporaryRoot, "workspace");
    // This directory receives a copy of the authenticated credentials.
    await mkdir(cursorHomePath, { mode: 0o700 });
    await mkdir(workspacePath);

    const template = await validateCursorConfigTemplate(options.cursorConfigTemplatePath, { workspacePath });
    invariant(
      !isInside(repositoryRoot, template.realPath),
      "Cursor config template must live outside this repository",
    );
    await copyTree(template.realPath, cursorHomePath);

    const argv = buildInvocationArguments(options.pluginDir);
    const processResult = await spawnCaptured({
      executable: options.binary,
      arguments: argv,
      cwd: workspacePath,
      env: buildCursorChildEnvironment({ cursorHomePath }),
      timeoutMs: options.timeoutMs,
      stdoutPath: join(temporaryRoot, "stdout.log"),
      stderrPath: join(temporaryRoot, "stderr.log"),
    });

    const analysis = matchComponentsInStream(processResult.stdout, components);
    assertStreamProvesLoading(analysis, processResult);
    return {
      schemaVersion: SCHEMA_VERSION,
      artifact: ARTIFACT_KIND,
      capturedAt: new Date().toISOString(),
      command: "npm run plugin:cli:verify",
      cli: { binary: options.binary, version: cli.version ?? null, capabilities: cli.capabilities },
      invocation: {
        arguments: argv.slice(0, -1),
        promptSha256: sha256(PROMPT),
        exitCode: processResult.exitCode,
        durationMs: Math.round(processResult.durationMs),
      },
      // Binds this artifact to the exact plugin bytes loaded at capture time, so
      // a consumer can reject evidence describing a different plugin revision.
      pluginSourceSha256: await hashTree(options.pluginDir),
      inventorySha256: sha256(await readFile(inventoryPath)),
      plugin: { id: inventory.plugin.id, version: inventory.plugin.version },
      streamSha256: sha256(processResult.stdout),
      stream: {
        eventTypes: analysis.eventTypes,
        parseErrors: analysis.parseErrors,
        hasTerminalResult: analysis.hasTerminalResult,
        terminalResult: analysis.terminalResult,
      },
      observations: analysis.observations,
      summary: { byKind: analysis.byKind, missingRequired: analysis.missingRequired },
      claims: {
        cliPluginLoading: {
          status: "observed",
          source: "documented stream-json events from an authenticated --plugin-dir invocation",
          scope: "Names every inventory agent and rule appearing in the stream. It does not prove hook enforcement or Editor loading.",
        },
      },
    };
  } finally {
    releaseSignalCleanup();
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function main(argv) {
  const options = parseArguments(argv);
  const evidence = await verifyCliPluginLoading(options);
  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  if (options.evidencePath) {
    await mkdir(dirname(options.evidencePath), { recursive: true });
    await writeFile(options.evidencePath, serialized, { mode: 0o600 });
  }
  process.stdout.write(serialized);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`CLI plugin loading verification failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
