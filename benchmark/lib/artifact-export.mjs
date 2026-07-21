import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { hashFile, invariant, sha256 } from "./util.mjs";

const ROOT_EVIDENCE_FILES = new Set([
  "plugin-lifecycle.json",
  "results.ndjson",
  "report.json",
  "report.md",
]);
const ARTIFACT_EVIDENCE_FILE = /^(?:stdout|stderr)\.log$|^(?:stream|telemetry)\.ndjson$|^evaluator-[a-z0-9-]+\.(?:stdout|stderr)\.log$/u;
const HIGH_CONFIDENCE_CREDENTIALS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /\b(?:CURSOR_API_KEY|AWS_SECRET_ACCESS_KEY|AZURE_CLIENT_SECRET|GOOGLE_APPLICATION_CREDENTIALS|GITHUB_TOKEN)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{16,}/iu,
  /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16})\b/u,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/iu,
];

function isInside(parent, child) {
  const path = relative(resolve(parent), resolve(child));
  return path === "" || (
    path !== ".." &&
    !path.startsWith(`..${sep}`) &&
    !isAbsolute(path)
  );
}

async function optionalRegularFile(path, label) {
  try {
    const metadata = await lstat(path);
    invariant(metadata.isFile() && !metadata.isSymbolicLink(), `${label} must be a regular file`);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function selectedEvidenceFiles(runRoot) {
  const selected = [];
  for (const name of ROOT_EVIDENCE_FILES) {
    const path = join(runRoot, name);
    if (await optionalRegularFile(path, name)) selected.push({ path, relativePath: name });
  }
  const trialsRoot = join(runRoot, "trials");
  let trials;
  try {
    trials = await readdir(trialsRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return selected;
    throw error;
  }
  for (const trial of trials.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!trial.isDirectory() || trial.isSymbolicLink()) continue;
    const artifactRoot = join(trialsRoot, trial.name, "artifacts");
    let artifacts;
    try {
      artifacts = await readdir(artifactRoot, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    for (const artifact of artifacts.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!ARTIFACT_EVIDENCE_FILE.test(artifact.name)) continue;
      invariant(
        artifact.isFile() && !artifact.isSymbolicLink(),
        `selected artifact ${artifact.name} must be a regular file`,
      );
      selected.push({
        path: join(artifactRoot, artifact.name),
        relativePath: `trials/${trial.name}/artifacts/${artifact.name}`,
      });
    }
  }
  return selected.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

async function loadSecretCanaries(secretCanaryFiles, runRoot, exportRoot) {
  const canaries = [];
  for (const path of secretCanaryFiles) {
    invariant(typeof path === "string" && isAbsolute(path), "secret canary file paths must be absolute");
    invariant(
      !isInside(runRoot, path) && !isInside(exportRoot, path),
      "secret canary files must be outside raw and sanitized artifact roots",
    );
    const metadata = await lstat(path);
    invariant(metadata.isFile() && !metadata.isSymbolicLink(), "secret canary must be a regular file");
    const bytes = await readFile(path);
    invariant(bytes.length > 0, "secret canary must not be empty");
    canaries.push(bytes);
  }
  return canaries;
}

function assertNoCredentials(bytes, canaries, path) {
  for (const canary of canaries) {
    invariant(!bytes.includes(canary), `selected artifact ${path} contains an exact secret canary`);
  }
  const text = bytes.toString("utf8");
  for (const pattern of HIGH_CONFIDENCE_CREDENTIALS) {
    invariant(!pattern.test(text), `selected artifact ${path} contains a high-confidence credential pattern`);
  }
}

export async function exportSanitizedArtifacts({
  runRoot,
  exportRoot,
  secretCanaryFiles = [],
}) {
  const raw = resolve(runRoot);
  const destination = resolve(exportRoot);
  invariant(raw !== destination, "sanitized export root must differ from raw run root");
  invariant(
    !isInside(raw, destination) && !isInside(destination, raw),
    "sanitized export root and raw run root must not contain each other",
  );
  const rawMetadata = await lstat(raw);
  invariant(rawMetadata.isDirectory() && !rawMetadata.isSymbolicLink(), "raw run root must be a real directory");
  const selected = await selectedEvidenceFiles(raw);
  invariant(selected.some(({ relativePath }) => relativePath === "results.ndjson"), "raw run root is missing results.ndjson");
  const canaries = await loadSecretCanaries(secretCanaryFiles, raw, destination);
  const evidence = [];
  for (const file of selected) {
    const bytes = await readFile(file.path);
    assertNoCredentials(bytes, canaries, file.relativePath);
    evidence.push({ ...file, bytes });
  }

  const staging = join(dirname(destination), `.${basename(destination)}-staging-${process.pid}`);
  await rm(staging, { recursive: true, force: true });
  try {
    await mkdir(staging, { recursive: true });
    const files = [];
    for (const file of evidence) {
      const target = join(staging, file.relativePath);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.bytes, { flag: "wx", mode: 0o600 });
      files.push({
        path: file.relativePath,
        bytes: file.bytes.length,
        sha256: sha256(file.bytes),
      });
    }
    const manifest = {
      schemaVersion: "1.0.0",
      sourceRunId: basename(raw),
      files,
    };
    await writeFile(
      join(staging, "export-manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { flag: "wx", mode: 0o600 },
    );
    await mkdir(dirname(destination), { recursive: true });
    invariant(!(await optionalRegularFile(destination, "sanitized export root")), "sanitized export root already exists");
    try {
      await lstat(destination);
      throw new Error("sanitized export root already exists");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await rename(staging, destination);
    for (const file of manifest.files) {
      invariant(file.sha256 === await hashFile(join(destination, file.path)), `export hash mismatch for ${file.path}`);
    }
    return manifest;
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}
