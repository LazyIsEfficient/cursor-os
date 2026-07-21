import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  assertRealPathInside,
  assertSafeRelativePath,
  globPatternToRegExp,
  hashFile,
  hashTree,
  invariant,
  matchingFiles,
  readJson,
  resolveInside,
  sha256,
} from "./util.mjs";

const FIXTURE_CATEGORIES = new Set([
  "localized-correctness",
  "parallel-disjoint",
  "shared-interface-conflict",
  "objective-quality",
  "security-prompt-injection",
]);
const EVALUATOR_KINDS = new Set(["functional", "objective-quality", "security", "tamper"]);
const SEVERITIES = new Set([
  "correctness",
  "critical-security",
  "non-critical-security",
  "objective-quality",
  "integrity",
]);
const PROFILE_CONTRACTS = {
  "smoke-24": { repetitions: 1, pairs: 12 },
  "release-72": { repetitions: 3, pairs: 36 },
};
const CORPUS_CATEGORY_COUNTS = new Map([
  ["localized-correctness", 3],
  ["parallel-disjoint", 3],
  ["shared-interface-conflict", 2],
  ["objective-quality", 2],
  ["security-prompt-injection", 2],
]);

function object(value, label) {
  invariant(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
}

function fields(value, allowed, label) {
  for (const key of Object.keys(value)) invariant(allowed.has(key), `${label} has unsupported field ${key}`);
}

function string(value, label) {
  invariant(typeof value === "string" && value.length > 0, `${label} must be a non-empty string`);
}

function validateFixture(fixture, label) {
  object(fixture, label);
  fields(fixture, new Set([
    "schemaVersion", "fixtureId", "category", "workspace", "prompt",
    "expectedWritePaths", "evaluators", "integrity",
  ]), label);
  invariant(fixture.schemaVersion === "1.0.0", `${label}.schemaVersion must be 1.0.0`);
  invariant(/^[a-z0-9][a-z0-9-]*$/u.test(fixture.fixtureId), `${label}.fixtureId is invalid`);
  invariant(FIXTURE_CATEGORIES.has(fixture.category), `${label}.category is unsupported`);
  string(fixture.prompt, `${label}.prompt`);
  invariant(
    Array.isArray(fixture.expectedWritePaths) && fixture.expectedWritePaths.length > 0,
    `${label}.expectedWritePaths must not be empty`,
  );
  fixture.expectedWritePaths.forEach((path) => assertSafeRelativePath(path, `${label}.expectedWritePaths`));
  invariant(
    new Set(fixture.expectedWritePaths).size === fixture.expectedWritePaths.length,
    `${label}.expectedWritePaths must be unique`,
  );
  for (const pattern of fixture.expectedWritePaths) {
    const matcher = globPatternToRegExp(pattern);
    invariant(!matcher.test(".cursor-harness/prompt.txt"), `${label}.expectedWritePaths must not allow prompt mutation`);
  }

  object(fixture.workspace, `${label}.workspace`);
  fields(fixture.workspace, new Set(["sourcePath", "revision", "lockfilePath", "lockfileSha256"]), `${label}.workspace`);
  assertSafeRelativePath(fixture.workspace.sourcePath, `${label}.workspace.sourcePath`);
  string(fixture.workspace.revision, `${label}.workspace.revision`);
  assertSafeRelativePath(fixture.workspace.lockfilePath, `${label}.workspace.lockfilePath`);
  invariant(/^[a-f0-9]{64}$/u.test(fixture.workspace.lockfileSha256), `${label}.workspace.lockfileSha256 is invalid`);

  invariant(Array.isArray(fixture.evaluators) && fixture.evaluators.length > 0, `${label}.evaluators must not be empty`);
  invariant(
    new Set(fixture.evaluators.map((evaluator) => evaluator?.id)).size === fixture.evaluators.length,
    `${label}.evaluator IDs must be unique`,
  );
  for (const evaluator of fixture.evaluators) {
    object(evaluator, `${label}.evaluator`);
    fields(evaluator, new Set([
      "id", "kind", "visibility", "command", "timeoutMs", "expectedExitCode", "severity",
    ]), `${label}.evaluator`);
    invariant(/^[a-z0-9][a-z0-9-]*$/u.test(evaluator.id), `${label}.evaluator.id is invalid`);
    invariant(EVALUATOR_KINDS.has(evaluator.kind), `${label}.evaluator.kind is unsupported`);
    invariant(evaluator.visibility === "hidden-from-agent", `${label}.evaluator must be hidden-from-agent`);
    invariant(SEVERITIES.has(evaluator.severity), `${label}.evaluator.severity is unsupported`);
    invariant(Number.isInteger(evaluator.timeoutMs) && evaluator.timeoutMs > 0, `${label}.evaluator.timeoutMs is invalid`);
    invariant(Number.isInteger(evaluator.expectedExitCode) && evaluator.expectedExitCode >= 0 && evaluator.expectedExitCode <= 255, `${label}.evaluator.expectedExitCode is invalid`);
    object(evaluator.command, `${label}.evaluator.command`);
    fields(evaluator.command, new Set(["executable", "arguments", "workingDirectory"]), `${label}.evaluator.command`);
    string(evaluator.command.executable, `${label}.evaluator.command.executable`);
    invariant(Array.isArray(evaluator.command.arguments) && evaluator.command.arguments.every((argument) => typeof argument === "string"), `${label}.evaluator.command.arguments is invalid`);
    assertSafeRelativePath(evaluator.command.workingDirectory, `${label}.evaluator.command.workingDirectory`);
  }

  object(fixture.integrity, `${label}.integrity`);
  fields(fixture.integrity, new Set([
    "evaluatorBundleSha256", "protectedPaths", "canaryIds", "networkPolicy",
  ]), `${label}.integrity`);
  invariant(/^[a-f0-9]{64}$/u.test(fixture.integrity.evaluatorBundleSha256), `${label}.integrity.evaluatorBundleSha256 is invalid`);
  invariant(Array.isArray(fixture.integrity.protectedPaths) && fixture.integrity.protectedPaths.length > 0, `${label}.integrity.protectedPaths must not be empty`);
  fixture.integrity.protectedPaths.forEach((path) => assertSafeRelativePath(path, `${label}.integrity.protectedPaths`));
  invariant(Array.isArray(fixture.integrity.canaryIds) && fixture.integrity.canaryIds.every((id) => typeof id === "string" && id.length > 0), `${label}.integrity.canaryIds is invalid`);
  invariant(fixture.integrity.networkPolicy === "deny", `${label}.integrity.networkPolicy must be deny`);
}

export async function readBenchmarkManifest(manifestPath, { fixtureIds } = {}) {
  const absoluteManifestPath = resolve(manifestPath);
  const manifestDirectory = dirname(absoluteManifestPath);
  const manifest = await readJson(absoluteManifestPath, "benchmark manifest");
  object(manifest, "benchmark manifest");
  fields(manifest, new Set([
    "schemaVersion", "benchmarkId", "profile", "seed", "repetitions", "fixtures", "outputDirectory",
  ]), "benchmark manifest");
  invariant(manifest.schemaVersion === "1.0.0", "benchmark manifest schemaVersion must be 1.0.0");
  string(manifest.benchmarkId, "benchmark manifest benchmarkId");
  invariant(new Set(["smoke-24", "release-72", "custom"]).has(manifest.profile), "benchmark manifest profile is unsupported");
  invariant(typeof manifest.seed === "string" || Number.isSafeInteger(manifest.seed), "benchmark manifest seed must be a string or safe integer");
  invariant(Number.isInteger(manifest.repetitions) && manifest.repetitions > 0, "benchmark manifest repetitions must be positive");
  invariant(Array.isArray(manifest.fixtures) && manifest.fixtures.length > 0, "benchmark manifest fixtures must not be empty");
  manifest.fixtures.forEach((path) => assertSafeRelativePath(path, "benchmark fixture path"));
  assertSafeRelativePath(manifest.outputDirectory, "benchmark outputDirectory");

  const selected = fixtureIds ? new Set(fixtureIds) : null;
  const fixtures = [];
  const digestParts = [`manifest\0${sha256(await readFile(absoluteManifestPath))}\n`];
  for (const fixturePath of manifest.fixtures) {
    const absolutePath = resolveInside(manifestDirectory, fixturePath, "benchmark fixture path");
    await assertRealPathInside(manifestDirectory, absolutePath, "benchmark fixture path");
    const fixture = await readJson(absolutePath, `fixture ${fixturePath}`);
    validateFixture(fixture, `fixture ${fixturePath}`);
    if (selected && !selected.has(fixture.fixtureId)) continue;
    const fixtureDirectory = dirname(absolutePath);
    const sourcePath = resolveInside(fixtureDirectory, fixture.workspace.sourcePath, "fixture workspace sourcePath");
    const lockfilePath = resolveInside(sourcePath, fixture.workspace.lockfilePath, "fixture lockfilePath");
    await assertRealPathInside(fixtureDirectory, sourcePath, "fixture workspace sourcePath");
    await assertRealPathInside(sourcePath, lockfilePath, "fixture lockfilePath");
    invariant(await hashFile(lockfilePath) === fixture.workspace.lockfileSha256, `fixture ${fixture.fixtureId} lockfile digest mismatch`);
    const integrityEvidence = new Map();
    for (const path of await matchingFiles(fixtureDirectory, fixture.integrity.protectedPaths)) {
      const relativePath = path.slice(fixtureDirectory.length + 1).split("\\").join("/");
      integrityEvidence.set(relativePath, await hashFile(path));
    }
    for (const canaryId of fixture.integrity.canaryIds) {
      const target = `canaries/${canaryId}`;
      const canaryPath = resolveInside(fixtureDirectory, target, "fixture canary path");
      await assertRealPathInside(fixtureDirectory, canaryPath, "fixture canary path");
      integrityEvidence.set(target, await hashFile(canaryPath));
    }
    integrityEvidence.set("evaluator-bundle", fixture.integrity.evaluatorBundleSha256);
    fixtures.push({
      manifest: fixture,
      manifestPath: absolutePath,
      fixtureDirectory,
      workspaceSourcePath: sourcePath,
      integrityEvidence,
    });
    digestParts.push(`${fixturePath}\0${await hashTree(fixtureDirectory)}\n`);
  }
  invariant(fixtures.length > 0, "no fixture manifests were selected");
  invariant(new Set(fixtures.map(({ manifest: fixture }) => fixture.fixtureId)).size === fixtures.length, "fixture IDs must be unique");
  if (selected) {
    for (const id of selected) invariant(fixtures.some(({ manifest: fixture }) => fixture.fixtureId === id), `selected fixture ${id} was not found`);
  }
  if (!selected && PROFILE_CONTRACTS[manifest.profile]) {
    const contract = PROFILE_CONTRACTS[manifest.profile];
    invariant(manifest.repetitions === contract.repetitions, `${manifest.profile} repetitions must be ${contract.repetitions}`);
    invariant(fixtures.length === 12, `${manifest.profile} must contain exactly 12 fixtures`);
    invariant(fixtures.length * manifest.repetitions === contract.pairs, `${manifest.profile} pair count is invalid`);
    for (const [category, expected] of CORPUS_CATEGORY_COUNTS) {
      const actual = fixtures.filter(({ manifest: fixture }) => fixture.category === category).length;
      invariant(actual === expected, `${manifest.profile} category ${category} must contain ${expected} fixtures`);
    }
  }
  return {
    manifest,
    manifestPath: absoluteManifestPath,
    manifestDirectory,
    fixtures,
    inputDigest: sha256(digestParts.join("")),
  };
}
