import { lstat, mkdir, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  copyTree,
  globPatternToRegExp,
  hashFile,
  invariant,
  listFiles,
  sha256,
} from "./util.mjs";

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
  await mkdir(join(runRoot, "trials"), { recursive: true });
  await mkdir(trialRoot);
  await Promise.all([
    mkdir(cursorHomePath),
    mkdir(artifactPath),
  ]);

  await copyTree(fixtureEntry.workspaceSourcePath, workspacePath);
  if (cursorConfigTemplatePath !== undefined) {
    const template = await validateCursorConfigTemplate(cursorConfigTemplatePath, { workspacePath });
    await copyTree(template.realPath, cursorHomePath);
  }
  const promptDirectory = join(workspacePath, ".cursor-harness");
  await mkdir(promptDirectory);
  const [, sandboxPolicy] = await Promise.all([
    writeFile(join(promptDirectory, "prompt.txt"), `${fixture.prompt}\n`, { flag: "wx", mode: 0o600 }),
    writeTrialSandboxPolicy(workspacePath),
  ]);

  invariant(!cursorHomePath.startsWith(`${workspacePath}/`), "Cursor config home must be outside the agent workspace");
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
