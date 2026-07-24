import { rmSync } from "node:fs";
import { lstat, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  copyTree,
  globPatternToRegExp,
  hashFile,
  invariant,
  listFiles,
  sha256,
} from "./util.mjs";
import { terminateActiveCapturedChildrenSync } from "./process.mjs";

const PROMPT_PATH = ".cursor-harness/prompt.txt";
export const SANDBOX_PATH = ".cursor/sandbox.json";
export const SANDBOX_POLICY_SOURCE = "workspace:.cursor/sandbox.json";
export const SANDBOX_POLICY = {
  type: "workspace_readwrite",
  additionalReadwritePaths: [],
  additionalReadonlyPaths: [],
  disableTmpWrite: true,
  networkPolicy: {
    default: "deny",
    allow: [],
    deny: ["0.0.0.0/0", "::/0"],
  },
};
export const SANDBOX_POLICY_BYTES = `${JSON.stringify(SANDBOX_POLICY, null, 2)}\n`;

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (
    path !== ".." &&
    !path.startsWith(`..${sep}`) &&
    !isAbsolute(path)
  );
}

export async function validateCursorConfigTemplate(templatePath, { workspacePath } = {}) {
  invariant(
    typeof templatePath === "string" && templatePath.length > 0,
    "authenticated benchmark requires --cursor-config-template",
  );
  invariant(isAbsolute(templatePath), "Cursor config template path must be absolute");
  const metadata = await lstat(templatePath);
  invariant(
    metadata.isDirectory() && !metadata.isSymbolicLink(),
    "Cursor config template must be a real directory, not a symbolic link",
  );
  const realTemplate = await realpath(templatePath);
  if (workspacePath) {
    const realWorkspace = await realpath(workspacePath);
    invariant(
      !isInside(realWorkspace, realTemplate),
      "Cursor config template must be outside the agent workspace",
    );
  }
  const files = await listFiles(realTemplate);
  invariant(files.length > 0, "Cursor config template must not be empty");
  return { path: resolve(templatePath), realPath: realTemplate, files };
}

export async function writeTrialSandboxPolicy(workspacePath) {
  // Contract: https://cursor.com/docs/reference/sandbox
  const sandboxPath = join(workspacePath, SANDBOX_PATH);
  await mkdir(join(workspacePath, ".cursor"), { recursive: true });
  await writeFile(sandboxPath, SANDBOX_POLICY_BYTES, { flag: "wx", mode: 0o400 });
  return {
    path: sandboxPath,
    relativePath: SANDBOX_PATH,
    sha256: sha256(SANDBOX_POLICY_BYTES),
    source: SANDBOX_POLICY_SOURCE,
  };
}

// Config homes that exist on disk right now. A signal handler needs this because the async
// `finally` in the engine never runs when the process dies on a default-disposition signal.
const activeCursorHomePaths = new Set();
const CREDENTIAL_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"];
let installedSignalHandlers = null;
let signalHandlerDepth = 0;

function removeActiveCursorHomesSync() {
  const removed = [];
  // Match the telemetry probe: kill in-flight detached CLI children before rm so a
  // signal mid-call cannot leave credential trees behind on busy runners.
  terminateActiveCapturedChildrenSync();
  for (const cursorHomePath of activeCursorHomePaths) {
    try {
      // Synchronous by necessity: the process is about to terminate, so an awaited rm would
      // not finish before the default disposition kills us.
      rmSync(cursorHomePath, { recursive: true, force: true, maxRetries: 10, retryDelay: 10 });
      removed.push(cursorHomePath);
    } catch (error) {
      process.stderr.write(`failed to remove Cursor config home ${cursorHomePath}: ${error.message}\n`);
    }
  }
  activeCursorHomePaths.clear();
  return removed;
}

// Removes credential copies on Ctrl-C or runner cancellation, then re-raises with the default
// disposition so the exit code CI observes is the signal's, not ours.
export function installCredentialSignalHandlers() {
  signalHandlerDepth += 1;
  if (installedSignalHandlers === null) {
    installedSignalHandlers = new Map();
    for (const signal of CREDENTIAL_SIGNALS) {
      const handler = () => {
        removeActiveCursorHomesSync();
        uninstallCredentialSignalHandlers({ force: true });
        process.kill(process.pid, signal);
      };
      installedSignalHandlers.set(signal, handler);
      process.on(signal, handler);
    }
  }
  return () => uninstallCredentialSignalHandlers();
}

function uninstallCredentialSignalHandlers({ force = false } = {}) {
  signalHandlerDepth = force ? 0 : Math.max(0, signalHandlerDepth - 1);
  if (signalHandlerDepth > 0 || installedSignalHandlers === null) return;
  for (const [signal, handler] of installedSignalHandlers) process.removeListener(signal, handler);
  installedSignalHandlers = null;
}

// Fail closed: a credential copy that cannot be removed stays loud. But when an error was already
// in flight, keep it — the adapter's diagnostic is the more useful of the two.
export async function removeCursorHome(cursorHomePath, { cause } = {}) {
  activeCursorHomePaths.delete(cursorHomePath);
  try {
    await rm(cursorHomePath, { recursive: true, force: true });
  } catch (error) {
    const message = `failed to remove Cursor config home ${cursorHomePath}`;
    if (cause === undefined) throw new Error(message, { cause: error });
    throw new AggregateError([cause, error], message);
  }
}

export async function prepareTrialWorkspace({
  fixtureEntry,
  fixture,
  runRoot,
  trialId,
  cursorConfigTemplatePath,
}) {
  const trialRoot = join(runRoot, "trials", trialId);
  const workspacePath = join(trialRoot, "workspace");
  const cursorHomePath = join(trialRoot, "cursor-home");
  const artifactPath = join(trialRoot, "artifacts");
  invariant(!cursorHomePath.startsWith(`${workspacePath}/`), "Cursor config home must be outside the agent workspace");
  await mkdir(join(runRoot, "trials"), { recursive: true });
  await mkdir(trialRoot);
  await Promise.all([
    mkdir(cursorHomePath),
    mkdir(artifactPath),
  ]);
  activeCursorHomePaths.add(cursorHomePath);

  let sandboxPolicy;
  try {
    // Fixture workspaces carry no credentials, but the harness runs them as the invoking user
    // and the corpus has no executable files, so owner-only is the correct floor here too.
    await copyTree(fixtureEntry.workspaceSourcePath, workspacePath, { mode: 0o600 });
    if (cursorConfigTemplatePath !== undefined) {
      const template = await validateCursorConfigTemplate(cursorConfigTemplatePath, { workspacePath });
      await copyTree(template.realPath, cursorHomePath, { mode: 0o600 });
    }
    const promptDirectory = join(workspacePath, ".cursor-harness");
    await mkdir(promptDirectory);
    [, sandboxPolicy] = await Promise.all([
      writeFile(join(promptDirectory, "prompt.txt"), `${fixture.prompt}\n`, { flag: "wx", mode: 0o600 }),
      writeTrialSandboxPolicy(workspacePath),
    ]);
  } catch (error) {
    // A partially prepared trial must not leave copied credentials behind. Preserve the
    // preparation failure: a failing rm must not swallow the error that caused it.
    await removeCursorHome(cursorHomePath, { cause: error });
    throw error;
  }

  return {
    trialRoot,
    workspacePath,
    cursorHomePath,
    artifactPath,
    sandboxPolicy,
  };
}

export async function captureWorkspaceSnapshot(workspacePath) {
  const snapshot = new Map();
  for (const path of await listFiles(workspacePath)) {
    const relativePath = relative(workspacePath, path).split(sep).join("/");
    snapshot.set(relativePath, await hashFile(path));
  }
  return snapshot;
}

export function compareWorkspaceSnapshot({
  fixture,
  before,
  after,
  overlayFiles = [],
}) {
  const expectedMatchers = fixture.expectedWritePaths.map(globPatternToRegExp);
  const overlay = new Map(overlayFiles.map((file) => [file.destination, file.sha256]));
  const outcomes = [];
  const paths = new Set([...before.keys(), ...after.keys()]);
  for (const path of [...paths].sort()) {
    const expectedSha256 = before.get(path) ?? null;
    const actualSha256 = after.get(path) ?? null;
    if (expectedSha256 === actualSha256) continue;

    const overlaySha256 = overlay.get(path);
    const overlayIsIntact = overlaySha256 !== undefined && actualSha256 === overlaySha256;
    const expectedWrite = expectedMatchers.some((matcher) => matcher.test(path));
    const immutable = path === PROMPT_PATH || path === SANDBOX_PATH;
    if (!immutable && overlayIsIntact) continue;
    if (!immutable && overlaySha256 === undefined && expectedWrite) continue;

    outcomes.push({
      target: `workspace/${path}`,
      outcome: actualSha256 === null
        ? "missing"
        : (expectedSha256 === null ? "unexpected" : "modified"),
      expectedSha256,
      actualSha256,
    });
  }
  return outcomes;
}
