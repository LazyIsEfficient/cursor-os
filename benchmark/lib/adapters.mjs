import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

import { spawnCaptured } from "./process.mjs";
import { normalizeCliNdjson } from "./telemetry.mjs";
import { invariant, listFiles, sha256, unavailable } from "./util.mjs";
import {
  SANDBOX_POLICY_BYTES,
  SANDBOX_POLICY_SOURCE,
} from "./workspace.mjs";

const OVERLAY_COMPONENTS = [
  ["agents", "agents"],
  ["rules", "rules"],
  ["skills", "skills"],
];
const HOST_ENVIRONMENT_ALLOWLIST = [
  "PATH",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TERM",
  "COLORTERM",
  "NO_COLOR",
  "FORCE_COLOR",
  "TZ",
  "TMPDIR",
  "SHELL",
];
const SENSITIVE_ENVIRONMENT_NAME = /(?:API[_-]?KEY|TOKEN|SECRET|CREDENTIAL|PASSWORD|AUTH|AWS_|AZURE_|GOOGLE_|GITHUB_|CI_JOB_JWT)/iu;

export function buildCursorChildEnvironment({
  cursorHomePath,
  environment = {},
  sourceEnvironment = process.env,
}) {
  invariant(
    typeof cursorHomePath === "string" && cursorHomePath.length > 0,
    "cursorHomePath is required",
  );
  const result = {};
  for (const name of HOST_ENVIRONMENT_ALLOWLIST) {
    if (typeof sourceEnvironment[name] === "string") result[name] = sourceEnvironment[name];
  }
  for (const [name, value] of Object.entries(environment)) {
    if (
      /^CURSOR_HARNESS_[A-Z0-9_]+$/u.test(name) &&
      !SENSITIVE_ENVIRONMENT_NAME.test(name) &&
      typeof value === "string"
    ) {
      result[name] = value;
    }
  }
  return {
    ...result,
    HOME: cursorHomePath,
    XDG_CONFIG_HOME: cursorHomePath,
    CURSOR_CONFIG_DIR: cursorHomePath,
  };
}

async function installProjectOverlay(pluginRoot, workspacePath) {
  const files = [];
  for (const [sourceName, destinationName] of OVERLAY_COMPONENTS) {
    const sourceRoot = join(pluginRoot, sourceName);
    for (const sourcePath of await listFiles(sourceRoot)) {
      const relativePath = relative(sourceRoot, sourcePath);
      const destinationPath = join(workspacePath, ".cursor", destinationName, relativePath);
      const bytes = await readFile(sourcePath);
      await mkdir(dirname(destinationPath), { recursive: true });
      await writeFile(destinationPath, bytes, { flag: "wx", mode: 0o600 });
      files.push({
        source: relative(pluginRoot, sourcePath).split(sep).join("/"),
        destination: relative(workspacePath, destinationPath).split(sep).join("/"),
        bytes: bytes.length,
        sha256: sha256(bytes),
      });
    }
  }
  files.sort((left, right) => left.destination.localeCompare(right.destination));
  return {
    mode: "project-overlay-harness",
    files,
    omittedCapabilities: [
      {
        capability: "command-hooks",
        reason: "Executable plugin hooks are omitted because project-overlay path semantics are not proven safe.",
      },
      {
        capability: "live-plugin-loading",
        reason: "This fallback uses project component discovery, not --plugin-dir.",
      },
    ],
  };
}

export function createProjectOverlayAdapter({ pluginRoot, agentAdapter }) {
  invariant(agentAdapter && typeof agentAdapter.run === "function", "agentAdapter.run is required");
  return {
    adapterKind: "project-overlay",
    async run(context) {
      const harnessEnabled = context.harnessEnabled ?? true;
      if (!harnessEnabled) return agentAdapter.run(context);
      const overlay = await installProjectOverlay(pluginRoot, context.workspacePath);
      const result = await agentAdapter.run({ ...context, overlay });
      return {
        ...result,
        adapterKind: "project-overlay",
        overlay,
        capabilityLimitations: [
          ...(result.capabilityLimitations ?? []),
          ...overlay.omittedCapabilities,
        ],
      };
    },
  };
}

export function createCursorCliAdapter({
  binary = process.env.CURSOR_AGENT_BIN ?? "agent",
  prefixArguments = [],
  capabilities,
  timeoutMs = 15 * 60_000,
}) {
  invariant(
    capabilities?.print === true && capabilities?.streamJson === true && capabilities?.sandbox === true,
    "Cursor CLI must support --print, stream-json, and --sandbox",
  );
  return {
    adapterKind: "cursor-cli",
    async run(context) {
      if (context.livePluginRoot && !capabilities.pluginDir) {
        throw new Error("Live plugin loading is unavailable: the local Cursor CLI capability matrix does not expose --plugin-dir");
      }
      const stdoutPath = join(context.artifactPath, "stdout.log");
      const stderrPath = join(context.artifactPath, "stderr.log");
      const ndjsonPath = join(context.artifactPath, "stream.ndjson");
      const inspectSandboxPolicy = async () => {
        try {
          const bytes = await readFile(context.sandboxPolicy.path);
          const actualSha256 = sha256(bytes);
          return {
            exact: bytes.equals(Buffer.from(SANDBOX_POLICY_BYTES)) &&
              context.sandboxPolicy.sha256 === actualSha256 &&
              context.sandboxPolicy.source === SANDBOX_POLICY_SOURCE,
            actualSha256,
          };
        } catch (error) {
          return { exact: false, actualSha256: null, error: error.message };
        }
      };
      const beforeSandbox = await inspectSandboxPolicy();
      invariant(beforeSandbox.exact, "exact per-trial Cursor sandbox policy must exist before execution");
      const argv = [
        ...prefixArguments,
        "--print",
        "--output-format",
        "stream-json",
        "--sandbox",
        "enabled",
      ];
      if (context.livePluginRoot) argv.push("--plugin-dir", context.livePluginRoot);
      argv.push(context.prompt);
      await context.captureWorkspaceBaseline();
      // Contracts:
      // https://cursor.com/docs/reference/sandbox
      // https://cursor.com/docs/cli/reference/configuration
      const environment = buildCursorChildEnvironment({
        cursorHomePath: context.cursorHomePath,
        environment: context.environment,
      });
      const processResult = await spawnCaptured({
        executable: binary,
        arguments: argv,
        cwd: context.workspacePath,
        env: environment,
        timeoutMs: context.timeoutMs ?? timeoutMs,
        stdoutPath,
        stderrPath,
        stdoutMirrorPath: ndjsonPath,
      });
      const normalized = normalizeCliNdjson(processResult.stdout);
      const afterSandbox = await inspectSandboxPolicy();
      const networkEnforcement = afterSandbox.exact &&
        afterSandbox.actualSha256 === beforeSandbox.actualSha256
        ? {
            status: "enforced",
            policySha256Before: beforeSandbox.actualSha256,
            policySha256After: afterSandbox.actualSha256,
            source: SANDBOX_POLICY_SOURCE,
            sandboxMode: "enabled",
            cliSandboxArgument: "--sandbox=enabled",
          }
        : {
            status: "error",
            policySha256Before: beforeSandbox.actualSha256,
            policySha256After: afterSandbox.actualSha256,
            source: SANDBOX_POLICY_SOURCE,
            sandboxMode: "enabled",
            cliSandboxArgument: "--sandbox=enabled",
            reason: afterSandbox.error ?? "sandbox policy changed during agent execution",
          };
      let status = "completed";
      if (processResult.timedOut) status = "timed-out";
      else if (processResult.exitCode !== 0 || normalized.terminalResult?.subtype === "error") status = "failed";
      else if (
        !normalized.hasTerminalResult ||
        normalized.parseErrors.length > 0 ||
        normalized.unmatchedToolCallIds.length > 0 ||
        processResult.stdoutTruncated
      ) status = "invalid";

      return {
        adapterKind: context.livePluginRoot ? "cursor-cli-live-plugin" : "cursor-cli",
        status,
        exitCode: processResult.exitCode,
        signal: processResult.signal,
        metrics: {
          wallDurationMs: { status: "observed", value: processResult.durationMs, source: "monotonic-clock" },
          toolCalls: { status: "observed", value: normalized.toolCallCount, source: "documented-stream-json" },
          subagentCalls: unavailable("correlation-unavailable"),
          maxConcurrentSubagents: unavailable("correlation-unavailable"),
          inputTokens: unavailable("not-emitted"),
          outputTokens: unavailable("not-emitted"),
          totalTokens: unavailable("not-emitted"),
        },
        telemetry: normalized,
        networkAttempts: normalized.networkAttempts,
        networkEnforcement,
        artifacts: { stdout: stdoutPath, stderr: stderrPath, ndjson: ndjsonPath },
        findings: [],
        capabilityLimitations: [
          ...(networkEnforcement.status === "enforced" ? [] : [{
            capability: "network-denial",
            reason: networkEnforcement.reason,
          }]),
          {
            capability: "token-usage",
            reason: "The documented stream-json output does not emit verified token counts.",
          },
          {
            capability: "subagent-correlation",
            reason: "Subagent calls and concurrency cannot be deterministically correlated.",
          },
        ],
      };
    },
  };
}
