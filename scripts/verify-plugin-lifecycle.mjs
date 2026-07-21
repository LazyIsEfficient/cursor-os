import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { readBenchmarkManifest } from "../benchmark/lib/manifest.mjs";
import { hashTree } from "../benchmark/lib/util.mjs";
import {
  installLocalPlugin,
  uninstallLocalPlugin,
} from "./lib/local-install-adapter.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePlugin = join(repositoryRoot, "plugin");

// The consumer gate in benchmark/report.mjs re-derives this sequence and the plugin
// digest independently; both sides must read the same constants and the same helper.
const EXPECTED_LIFECYCLE_STATUSES = ["installed", "unchanged", "repaired", "uninstalled"];

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function isInside(root, candidate) {
  const [realRoot, realCandidate] = await Promise.all([realpath(root), realpath(candidate)]);
  const rel = relative(realRoot, realCandidate);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

const USAGE =
  "usage: npm run plugin:lifecycle:verify -- [--evidence <path>]" +
  " [--input-digest <sha256> | --benchmark-manifest <path>]";

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index + 1];
    invariant(value !== undefined, USAGE);
    if (argv[index] === "--evidence") options.evidencePath = resolve(value);
    else if (argv[index] === "--input-digest") options.inputDigest = value;
    else if (argv[index] === "--benchmark-manifest") options.benchmarkManifestPath = resolve(value);
    else invariant(false, USAGE);
    index += 1;
  }
  invariant(
    options.inputDigest === undefined || options.benchmarkManifestPath === undefined,
    "--input-digest and --benchmark-manifest are mutually exclusive",
  );
  if (options.inputDigest !== undefined) {
    invariant(
      /^[a-f0-9]{64}$/u.test(options.inputDigest),
      "--input-digest must be a lowercase SHA-256 digest",
    );
  }
  return options;
}

// benchmark/report.mjs requires inputDigest, so CI needs a way to bind evidence to the
// corpus it is about to benchmark without shelling the digest out of the reporter.
async function resolveInputDigest(options) {
  if (options.inputDigest !== undefined) return options.inputDigest;
  if (options.benchmarkManifestPath === undefined) return undefined;
  const { inputDigest } = await readBenchmarkManifest(options.benchmarkManifestPath);
  return inputDigest;
}

const options = parseArguments(process.argv.slice(2));
const temporaryRoot = await mkdtemp(join(tmpdir(), "cursor-harness-lifecycle-"));
try {
  const cursorRoot = join(temporaryRoot, "cursor");
  await mkdir(cursorRoot);
  const installed = await installLocalPlugin({ cursorRoot, sourcePlugin });
  const unchanged = await installLocalPlugin({ cursorRoot, sourcePlugin });

  const configPath = join(cursorRoot, "plugins.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  config.plugins.concurrent = {
    path: "plugins/concurrent",
    version: "7.0.0",
  };
  delete config.plugins["cursor-harness"];
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  const repaired = await installLocalPlugin({ cursorRoot, sourcePlugin });
  const removed = await uninstallLocalPlugin({ cursorRoot, pluginId: "cursor-harness" });

  const lifecycleStatuses = [
    installed.status,
    unchanged.status,
    repaired.status,
    removed.status,
  ];
  invariant(
    JSON.stringify(lifecycleStatuses) === JSON.stringify(EXPECTED_LIFECYCLE_STATUSES),
    `lifecycle statuses were ${JSON.stringify(lifecycleStatuses)}, expected ${JSON.stringify(EXPECTED_LIFECYCLE_STATUSES)}`,
  );

  // These three are reported as observed rather than asserted first: an artifact that
  // records a false observation is what makes the consumer's check on it able to fire.
  // The invariants below still fail the standalone run, after the evidence is emitted.
  const temporaryCursorRoot = await isInside(tmpdir(), cursorRoot);
  const remainingConfig = JSON.parse(await readFile(configPath, "utf8"));
  const removalVerified =
    !(await pathExists(join(cursorRoot, "plugins/cursor-harness"))) &&
    remainingConfig.plugins?.["cursor-harness"] === undefined &&
    !(await pathExists(join(cursorRoot, ".cursor-harness-installs")));
  const unrelatedRegistrationPreserved =
    remainingConfig.plugins?.concurrent?.path === "plugins/concurrent" &&
    remainingConfig.plugins.concurrent.version === "7.0.0";

  const inputDigest = await resolveInputDigest(options);
  const evidence = {
    schemaVersion: "1.0.0",
    command: "npm run plugin:lifecycle:verify",
    temporaryCursorRoot,
    pluginSourceSha256: await hashTree(sourcePlugin),
    lifecycleStatuses,
    removalVerified,
    unrelatedRegistrationPreserved,
    ...(inputDigest === undefined ? {} : { inputDigest }),
  };
  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  if (options.evidencePath) {
    await mkdir(dirname(options.evidencePath), { recursive: true });
    await writeFile(options.evidencePath, serialized);
  }
  process.stdout.write(serialized);

  invariant(temporaryCursorRoot, "cursor root under verification is not inside the system temporary directory");
  invariant(removalVerified, "managed plugin directory, registry, or install state remains after removal");
  invariant(unrelatedRegistrationPreserved, "unrelated plugin registry was lost during repair and removal");
} catch (error) {
  process.stderr.write(`Plugin lifecycle verification failed: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
